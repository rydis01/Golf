#!/usr/bin/env python3
"""Verify the installable phone app, service-worker scope and real offline reload."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root/'iphone/manifest.webmanifest').read_text())
assert manifest['display'] == 'standalone' and manifest['scope'] == './'
assert manifest['start_url'] == './'
for icon in manifest['icons']:
    assert (root/'iphone'/icon['src']).is_file()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1,
                                  is_mobile=True, has_touch=True,
                                  geolocation={'latitude': 55.5690857, 'longitude': 13.1887799, 'accuracy': 8},
                                  permissions=['geolocation'])
    # External services are unavailable in this test; only the local PWA is reachable.
    context.route('https://**/*', lambda route: route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8091/iphone/', wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#offline-state').textContent.includes('Sparad på telefonen')")
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    assert page.locator('#settings-open').is_hidden(), 'No Java server setting is needed on iPhone'
    assert page.locator('#hole option').count() == 18
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('#try-demo').tap()
    page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#actual-distance').inner_text() == '160'
    online_result = page.locator('#plays-like').inner_text()
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#offline-state').textContent.includes('Offline')")
    page.locator('#try-demo').tap()
    page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#plays-like').inner_text() == online_result
    page.locator('[data-position-mode="gps"]').tap()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS aktiv')")
    page.locator('[data-position-mode="manual"]').tap()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS avstängd')")
    page.locator('[data-course="lakes"]').tap()
    assert 'par 5' in page.locator('#hole-info').inner_text()
    page.locator('#fetch-weather').tap()
    page.wait_for_function("document.querySelector('#toast').textContent.includes('offline')")
    assert not errors, errors
    page.screenshot(path=str(root/'.runtime/iphone-offline-preview.png'), full_page=True)
    print('PASS: iPhone-size touch UI; PWA cached at subpath, actual offline reload, local calculation, simulated offline GPS, manual mode, course facts and offline weather message.')
    browser.close()
