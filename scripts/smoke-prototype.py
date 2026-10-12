#!/usr/bin/env python3
"""Render the exported HTML in an isolated browser fixture; no backend/network required."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
html = (root/'.runtime/golf-caddie-prototyp.html').read_text()
# The managed cloud browser disallows file://. Fulfill only the test document locally;
# reject all real network requests. This URL is a test origin, never a public preview.
origin = 'https://golf-prototype.test/'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1280, 'height': 900},
                                  geolocation={'latitude': 59.33, 'longitude': 18.06, 'accuracy': 8},
                                  permissions=['geolocation'])
    context.route('**/*', lambda route: route.fulfill(body=html, content_type='text/html') if route.request.url == origin else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(origin, wait_until='domcontentloaded')
    assert page.locator('#hole option').count() == 18
    page.locator('#start-round').click()
    page.locator('#try-demo').click()
    page.locator('#calculate').click()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#actual-distance').inner_text() == '160'
    assert int(page.locator('#plays-like').inner_text()) > 160
    page.wait_for_timeout(1500)
    page.locator('[data-place-point="ball"]').click()
    page.locator('#map').click(position={'x': 170, 'y': 190})
    assert page.locator('[data-place-point="target"]').get_attribute('aria-pressed') == 'true'
    assert page.locator('#result').is_hidden()
    page.locator('[data-position-mode="gps"]').click()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS aktiv')")
    page.locator('[data-position-mode="manual"]').click()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS avstängd')")
    page.wait_for_timeout(1200)
    assert page.evaluate('Math.abs(map.getCenter().lat - 55.5690857) < .001')
    assert page.locator('[data-place-point="ball"]').get_attribute('aria-pressed') == 'true'
    page.locator('#try-demo').click()
    page.locator('#calculate').click()
    page.locator('#result').wait_for(state='visible')
    assert not errors, errors
    page.screenshot(path=str(root/'.runtime/prototype-preview.png'), full_page=True)
    print('PASS: standalone prototype with all network/backend requests blocked; calculations, manual placement, simulated home GPS and return to National.')
    browser.close()
