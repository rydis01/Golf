#!/usr/bin/env python3
"""Exercise the focused phone UI, automatic recommendations and real PWA offline reload."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root/'iphone/manifest.webmanifest').read_text())
assert manifest['display'] == 'standalone' and manifest['scope'] == './'
for icon in manifest['icons']: assert (root/'iphone'/icon['src']).is_file()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,
        geolocation={'latitude':55.5690857,'longitude':13.1887799,'accuracy':8},permissions=['geolocation'])
    context.route('https://**/*',lambda route:route.abort())
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8091/iphone/',wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#offline-state').textContent.includes('Sparad på telefonen')")
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    page.locator('[data-course="lakes"]').tap();page.locator('#start-round').tap()
    assert page.locator('#shot-options').is_hidden()
    assert page.locator('#hole-fallback').is_hidden()
    assert page.locator('#wind').is_hidden() and page.locator('#hole-guide').is_hidden()
    assert page.evaluate('state.layer === null'), 'The isolated view must not show tiles of surrounding holes'
    assert page.evaluate("courseLayer.toGeoJSON().features.filter(f=>f.properties.tags.golf==='hole').every(f=>f.properties.tags.ref==='1')")
    assert page.evaluate("courseLayer.toGeoJSON().features.some(f=>f.properties.tags.golf==='fairway')")
    # Place ball and flag through actual map taps, using two points on the real hole.
    page.wait_for_timeout(300)
    for fraction in [.45,.75]:
        xy=page.evaluate('''fraction=>{const line=HoleView.select(state.courseData.features,'lakes',1).line.geometry.coordinates;const a=line[0],b=line[line.length-1];const p=map.latLngToContainerPoint([a[1]+(b[1]-a[1])*fraction,a[0]+(b[0]-a[0])*fraction]);return {x:p.x,y:p.y};}''',fraction)
        page.locator('#map').tap(position=xy)
    page.locator('#quick-result').wait_for(state='visible')
    assert int(page.locator('#quick-distance').inner_text()) > 0
    assert 'm till målet' in page.locator('#quick-reason').inner_text()
    assert page.locator('#shot-options').is_hidden(), 'Automatic advice should not open a sheet'
    assert not page.locator('#calculation-error').is_visible()
    page.locator('#shot-options-open').tap()
    assert page.locator('#shot-options').is_visible()
    page.locator('#satellite').tap()
    assert page.evaluate('map.options.crs === L.CRS.EPSG3857'), 'Satellite view must use the standard map projection'
    page.locator('#street').tap()
    assert page.evaluate('map.options.crs.projection !== L.CRS.EPSG3857.projection'), 'The isolated hole view should restore its orientation'
    page.locator('.weather-fields summary').tap()
    for field,value in {'wind':'0','gusts':'0','temperature':'20','humidity':'50','pressure':'1013'}.items():page.locator('#'+field).fill(value)
    page.locator('#elevation').fill('10');page.locator('#use-rangefinder').check();page.locator('#rangefinder-distance').fill('150')
    page.wait_for_function("document.querySelector('#quick-distance').textContent==='160'")
    page.locator('#rangefinder-type').select_option('slope')
    page.wait_for_function("document.querySelector('#quick-distance').textContent==='150'")
    page.locator('#shot-options-close').tap()
    assert page.locator('#quick-distance').inner_text()=='150'
    # A new hole removes the old shot and updates the isolated geometry.
    page.locator('#next-hole').tap()
    assert page.locator('#quick-result').is_hidden()
    assert page.locator('#rangefinder-distance').input_value()==''
    assert page.evaluate("courseLayer.toGeoJSON().features.filter(f=>f.properties.tags.golf==='hole').every(f=>f.properties.tags.ref==='2')")
    page.locator('#shot-options-open').tap()
    page.locator('#try-demo').tap()
    page.locator('#calculate').tap();page.locator('#result').wait_for(state='visible')
    page.locator('#shot-options-close').tap()
    context.set_offline(True);page.reload(wait_until='domcontentloaded');page.locator('#resume-round').tap()
    assert '2' in page.locator('#hole-title').inner_text()
    page.locator('#shot-options-open').tap();page.locator('#try-demo').tap();page.locator('#calculate').tap()
    page.locator('#result').wait_for(state='visible')
    # Weather resets to defaults after reload, so compare with a fresh default shot.
    assert int(page.locator('#quick-distance').inner_text())>0
    page.locator('details.guide-panel summary').tap()
    page.wait_for_function("document.querySelector('#hole-guide').complete && document.querySelector('#hole-guide').naturalWidth>0")
    assert 'lakes-02' in page.locator('#hole-guide').get_attribute('src')
    page.locator('#fetch-weather').tap();page.wait_for_function("document.querySelector('#toast').textContent.includes('offline')")
    page.locator('#shot-options-close').tap()
    page.locator('[data-position-mode="gps"]').tap();page.wait_for_function("document.querySelector('#gps-status').textContent.includes('GPS aktiv')")
    page.locator('[data-position-mode="manual"]').tap()
    page.locator('#next-hole').tap()
    for _ in range(15):page.locator('#next-hole').tap()
    assert '18' in page.locator('#hole-title').inner_text() and page.locator('#next-hole').is_disabled()
    page.locator('#change-course').tap();page.locator('[data-course="links"]').tap();page.locator('#start-round').tap()
    page.wait_for_function("document.querySelector('#focused-hole-guide').complete && document.querySelector('#focused-hole-guide').naturalWidth>0")
    assert page.locator('#hole-fallback').is_visible() and page.locator('#hole-map-shell').is_hidden()
    assert 'links-01' in page.locator('#focused-hole-guide').get_attribute('src')
    page.locator('#show-area-map').tap();assert page.locator('#hole-map-shell').is_visible()
    page.locator('#next-hole').tap();assert page.locator('#hole-fallback').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    page.screenshot(path=str(root/'.runtime/iphone-focused-preview.png'),full_page=True)
    print('PASS: focused hole geometry, hidden options, actual map taps with automatic advice, laser/slope automatic updates, clean hole changes, cached guide images, real offline reload, simulated GPS, hole 18 boundary, and explicit Links guide/GPS fallback.')
    browser.close()
