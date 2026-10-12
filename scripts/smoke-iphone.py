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
    page.locator('#start-round').click()
    page.locator('#try-demo').tap()
    page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#actual-distance').inner_text() == '160'
    online_result = page.locator('#plays-like').inner_text()
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#offline-state').textContent.includes('Offline')")
    page.locator('#resume-round').tap()
    page.locator('#try-demo').tap()
    page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#plays-like').inner_text() == online_result
    page.locator('[data-position-mode="gps"]').tap()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS aktiv')")
    page.locator('[data-position-mode="manual"]').tap()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS avstängd')")
    page.locator('#change-course').tap()
    page.locator('[data-course="lakes"]').tap()
    page.locator('#start-round').tap()
    page.locator('#try-demo').tap()
    assert 'par 5' in page.locator('#hole-info').inner_text()
    page.wait_for_function("document.querySelector('#hole-guide').complete && document.querySelector('#hole-guide').naturalWidth > 0")
    assert 'lakes-01' in page.locator('#hole-guide').get_attribute('src')
    assert page.locator('#previous-hole').is_disabled()
    # Laser replaces the map distance; slope must not receive height correction twice.
    page.locator('.weather-fields summary').tap()
    for field, value in {'wind':'0','gusts':'0','temperature':'20','humidity':'50','pressure':'1013'}.items():
        page.locator('#'+field).fill(value)
    page.locator('#elevation').fill('10')
    page.locator('#use-rangefinder').check()
    page.locator('#rangefinder-distance').fill('150')
    page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#actual-distance').inner_text() == '150'
    assert page.locator('#plays-like').inner_text() == '160'
    page.locator('#rangefinder-type').select_option('slope')
    page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    assert page.locator('#plays-like').inner_text() == '150'
    # Set a known shot bearing, then verify opposite winds produce opposite advice.
    page.locator('#reset-map').tap()
    page.locator('#distance').fill('160')
    page.locator('#bearing').fill('0')
    page.locator('#wind').fill('5')
    page.locator('#gusts').fill('7')
    for wind_from, drift, aim in [('90','vänster','höger'),('270','höger','vänster')]:
        page.locator('#wind-from').fill(wind_from)
        page.locator('#calculate').tap()
        page.locator('#result').wait_for(state='visible')
        assert drift in page.locator('#lateral-drift').inner_text()
        assert aim in page.locator('#aim-advice').inner_text()
    # Explicit synthetic map fixture tests accepting a safer target without moving the flag.
    page.evaluate('''() => {
      const origin={lat:55.57,lon:13.18};
      const point=(x,y)=>[origin.lon+x/(111195*Math.cos(origin.lat*Math.PI/180)),origin.lat+y/111195];
      const polygon=(tags,vertices)=>({properties:{tags},geometry:{type:'Polygon',coordinates:[vertices.map(([x,y])=>point(x,y))]}});
      state.courseData={features:[polygon({golf:'green'},[[-3,-15],[35,-15],[35,15],[-3,15],[-3,-15]]),polygon({golf:'bunker'},[[-10,-10],[-4,-10],[-4,10],[-10,10],[-10,-10]])]};
      setBall({lat:origin.lat-150/111195,lon:origin.lon});setTarget(origin);
    }''')
    page.locator('#wind').fill('0')
    page.locator('#gusts').fill('0')
    page.locator('#use-rangefinder').check()
    page.locator('#rangefinder-distance').fill('150')
    page.locator('#calculate').tap()
    page.locator('#choose-safe-landing').wait_for(state='visible')
    assert 'bunker' in page.locator('#landing-message').inner_text()
    page.locator('#choose-safe-landing').tap()
    page.locator('#result').wait_for(state='visible')
    assert 'vald landningsyta' in page.locator('#result-target').inner_text()
    assert page.locator('#actual-distance').inner_text() == '150'
    assert page.evaluate('state.flag.lat === 55.57 && state.flag.lon === 13.18 && state.target.lon !== state.flag.lon')
    assert page.locator('.point-marker.target').count() == 1
    print('PASS: synthetic bunker fixture suggests a landing area; accepting preserves the measured flag and rangefinder reference.')
    page.locator('#next-hole').tap()
    assert page.locator('#result').is_hidden()
    assert page.locator('#distance').input_value() == ''
    assert page.locator('#rangefinder-distance').input_value() == ''
    assert not page.locator('#use-rangefinder').is_checked()
    for _ in range(16):
        page.locator('#next-hole').tap()
    assert '18' in page.locator('#hole-title').inner_text()
    assert page.locator('#next-hole').is_disabled()
    page.wait_for_function("document.querySelector('#hole-guide').complete && document.querySelector('#hole-guide').naturalWidth > 0")
    assert 'lakes-18' in page.locator('#hole-guide').get_attribute('src')
    page.reload(wait_until='domcontentloaded')
    page.locator('#resume-round').tap()
    assert '18' in page.locator('#hole-title').inner_text()
    print('PASS: offline guides, laser/slope height handling, opposite sidewind advice, clean hole transitions and resume at hole 18.')
    page.locator('#try-demo').tap()
    page.locator('#fetch-weather').tap()
    page.wait_for_function("document.querySelector('#toast').textContent.includes('offline')")
    assert not errors, errors
    page.screenshot(path=str(root/'.runtime/iphone-offline-preview.png'), full_page=True)
    print('PASS: iPhone-size touch UI; PWA cached at subpath, actual offline reload, local calculation, simulated offline GPS, manual mode, course facts and offline weather message.')
    browser.close()
