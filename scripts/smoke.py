#!/usr/bin/env python3
"""Exercise the running Java API and UI. Browser GPS uses a labeled test location."""
import json
import os
from urllib.parse import urlsplit
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

BASE = os.environ.get('GOLF_TEST_URL', 'http://127.0.0.1:8080')
opener = build_opener(ProxyHandler({})) if BASE.startswith(('http://127.0.0.1:', 'http://localhost:')) else build_opener()

def request(path, body=None, method=None):
    req = Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                  headers={'Content-Type': 'application/json'}, method=method)
    try:
        with opener.open(req, timeout=70) as r:
            return r.status, json.load(r)
    except HTTPError as e:
        return e.code, json.load(e)

assert request('/api/health')[1]['status'] == 'ok'
shot = {'ball': None, 'target': None, 'distance': 160, 'bearing': 0, 'elevationChange': 0,
        'lie': 'fairway', 'trajectory': 'normal', 'wetBall': False,
        'weather': {'temperature': 20, 'humidity': 50, 'pressure': 1013.25,
                    'windSpeed': 5, 'windFrom': 0, 'gusts': 7}}
status, head = request('/api/shot', shot)
assert status == 200 and head['playsLike'] > 160, (status, head)
shot['weather']['windFrom'] = 180
status, tail = request('/api/shot', shot)
assert status == 200 and tail['playsLike'] < 160, (status, tail)
shot['distance'] = 0
assert request('/api/shot', shot)[0] == 400
assert request('/api/shot', method='GET')[0] == 405
assert request('/api/weather?lat=200&lon=13')[0] == 400
print('PASS: Java HTTP API, wind signs, input rejection and method handling')

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    launch = {'executable_path': '/usr/bin/chromium', 'headless': True, 'args': ['--no-sandbox']}
    proxy = os.environ.get('HTTPS_PROXY')
    if proxy and not urlsplit(proxy).username:
        launch['proxy'] = {'server': proxy, 'bypass': 'localhost,127.0.0.1'}
    browser = p.chromium.launch(**launch)
    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, device_scale_factor=1,
                                  geolocation={'latitude': 55.57, 'longitude': 13.18, 'accuracy': 10},
                                  permissions=['geolocation'], locale='sv-SE')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='domcontentloaded')
    assert page.title() == 'Golf Caddie'
    page.wait_for_function("document.querySelector('#hole').options.length === 18")
    assert 'par 4' in page.locator('#hole-info').inner_text()
    page.locator('#calculate').click()
    page.locator('#result').wait_for(state='visible')
    assert int(page.locator('#plays-like').inner_text()) > 160
    page.locator('.weather-fields summary').click()
    page.locator('#wind-from').fill('180')
    page.locator('#calculate').click()
    page.locator('#result').wait_for(state='visible')
    assert int(page.locator('#plays-like').inner_text()) < 160
    page.locator('[data-lie="rough"]').click()
    assert page.locator('#result').is_hidden(), 'Old recommendation must be hidden after input changes'
    page.locator('#calculate').click()
    page.locator('#result').wait_for(state='visible')
    assert int(page.locator('#plays-like').inner_text()) > 160
    page.locator('#location').click()
    page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS aktiv')")
    assert '10 m' in page.locator('#gps-status').inner_text()
    page.wait_for_timeout(1500)  # Let the 1.2-second GPS camera movement finish before tapping.
    page.locator('#gps-ball').check()
    page.wait_for_function("document.querySelectorAll('.point-marker').length === 1")
    page.locator('#map').click(position={'x': 220, 'y': 110})
    page.wait_for_function("document.querySelectorAll('.point-marker').length === 2")
    assert not page.locator('#use-manual').is_checked()
    assert page.locator('#distance').is_disabled()
    page.locator('[data-course="lakes"]').click()
    assert page.locator('[data-course="lakes"]').get_attribute('aria-pressed') == 'true'
    page.locator('#stop-gps').click()
    assert page.locator('#stop-gps').is_hidden()
    assert page.locator('.gps-marker').count() == 0
    print('PASS: browser shot calculation, stale result handling, GPS test position, map selection and course switch')

    # Explicit fixture verifies weather rendering only; it is not a live-provider test.
    fixture = {
        'timezone': 'Europe/Stockholm',
        'current': {'time': '2026-10-12T12:00', 'temperature_2m': 8, 'relative_humidity_2m': 82,
                    'surface_pressure': 1008, 'wind_speed_10m': 4, 'wind_direction_10m': 225,
                    'wind_gusts_10m': 7, 'precipitation': 0},
        'hourly': {'time': [f'2026-10-12T{h}:00' for h in range(12, 18)],
                   'wind_speed_10m': [4, 5, 5, 6, 4, 3], 'wind_gusts_10m': [7, 8, 8, 9, 6, 5]}}
    page.route('**/api/weather?*', lambda route: route.fulfill(json=fixture))
    page.locator('#fetch-weather').click()
    page.locator('#forecast').wait_for(state='visible')
    assert page.locator('.forecast-column').count() == 6
    assert page.locator('#temperature').input_value() == '8'
    page.locator('#temperature').fill('9')
    assert page.locator('#forecast').is_hidden()
    assert 'Manuella' in page.locator('#weather-status').inner_text()
    print('PASS: weather fixture chart, source labeling and manual override')

    page.locator('#settings-open').click()
    page.locator('#api-base').fill('http://unsafe.example')
    page.locator('#save-settings').click()
    assert page.locator('#settings-error').is_visible()
    page.locator('#api-base').fill('')
    page.locator('#save-settings').click()
    assert not page.locator('#settings').is_visible()
    page.locator('#reset-map').click()
    page.locator('#distance').fill('160')
    page.locator('#bearing').fill('0')
    page.locator('[data-lie="fairway"]').click()
    page.locator('#calculate').click()
    page.locator('#result').wait_for(state='visible')
    runtime = Path('.runtime'); runtime.mkdir(exist_ok=True)
    page.screenshot(path=str(runtime/'desktop-preview.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(runtime/'mobile-preview.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile layout overflows'
    page.locator('a[href="privacy.html"]').click()
    page.wait_for_url('**/privacy.html')
    assert page.locator('h1').inner_text() == 'Integritet & datakällor'
    assert not errors, errors
    print('PASS: HTTPS settings, mobile width, privacy page and no JavaScript exceptions')
    browser.close()
