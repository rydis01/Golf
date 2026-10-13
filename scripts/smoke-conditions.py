#!/usr/bin/env python3
"""Verify automatic conditions, manual overrides and stale-response rejection with explicit fixtures."""
from playwright.sync_api import sync_playwright

WEATHER={'timezone':'Europe/Stockholm','current':{'time':'2026-10-13T12:00','temperature_2m':20,'relative_humidity_2m':50,'surface_pressure':1013.25,'wind_speed_10m':5,'wind_direction_10m':0,'wind_gusts_10m':5,'precipitation':0}}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    counts={'weather':0,'height':0}
    def weather(route):
        counts['weather']+=1;route.fulfill(json=WEATHER)
    def height(route):
        counts['height']+=1;route.fulfill(json={'elevation':[20,30]})
    context.route('https://**/*',lambda r:r.abort())
    context.route('https://api.open-meteo.com/v1/forecast?*',weather)
    context.route('https://api.open-meteo.com/v1/elevation?*',height)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8091/iphone/',wait_until='domcontentloaded');page.locator('#start-round').tap()
    page.evaluate("setBall({lat:55.569,lon:13.188});setTarget({lat:55.569+160/6371000*180/Math.PI,lon:13.188})")
    page.wait_for_function("document.querySelector('#elevation').value==='10' && document.querySelector('#wind').value==='5' && !document.querySelector('#quick-result').hidden")
    page.wait_for_function("Number(document.querySelector('#quick-distance').textContent)>180")
    assert counts=={'weather':1,'height':1},counts
    assert 'Hämtat väder' in page.locator('#quick-weather').inner_text()
    page.locator('#shot-options-open').tap();page.locator('.weather-fields summary').tap()
    page.locator('#wind').fill('0');page.locator('#gusts').fill('0');page.locator('#elevation').fill('0')
    page.wait_for_function("document.querySelector('#quick-distance').textContent==='160'")
    assert not page.locator('#auto-weather').is_checked() and not page.locator('#auto-elevation').is_checked()
    page.evaluate("setTarget({lat:55.569+180/6371000*180/Math.PI,lon:13.188})")
    page.wait_for_function("document.querySelector('#quick-distance').textContent==='180'")
    assert counts=={'weather':1,'height':1}
    # Use deferred provider fixtures to resolve a response after a manual override.
    page.locator('#auto-weather').check();page.locator('#auto-elevation').check()
    page.wait_for_timeout(600)
    page.evaluate('''() => {
      const original=GolfPrototype.api;
      window.pendingConditions=[];
      GolfPrototype.api=(path,options)=>path.startsWith('/api/weather?')||path.startsWith('/api/elevation?')?new Promise(resolve=>pendingConditions.push({path,resolve})):original(path,options);
      weatherAttempt=null;elevationAttempt=null;
      setBall({lat:55.58,lon:13.19});setTarget({lat:55.58+160/6371000*180/Math.PI,lon:13.19});
    }''')
    page.wait_for_function("pendingConditions.length===2")
    page.locator('#wind').fill('2');page.locator('#gusts').fill('2');page.locator('#elevation').fill('4')
    page.evaluate('''fixture=>{for(const request of pendingConditions)request.resolve(request.path.startsWith('/api/weather')?fixture:{elevation:[20,50]});}''',WEATHER)
    page.wait_for_timeout(400)
    assert page.locator('#wind').input_value()=='2' and page.locator('#elevation').input_value()=='4'
    # Late weather/height for a previous ball or flag may not overwrite the current pair.
    page.evaluate('''() => { pendingConditions=[];automaticWeather=true;automaticElevation=true;weatherAttempt=null;elevationAttempt=null;elevationPair=null;ensureWeather();ensureElevation(); }''')
    page.wait_for_function('pendingConditions.length===2')
    page.evaluate("setBall({lat:55.60,lon:13.20});setTarget({lat:55.60+160/6371000*180/Math.PI,lon:13.20})")
    page.evaluate('''fixture=>{for(const request of pendingConditions.slice(0,2))request.resolve(request.path.startsWith('/api/weather')?fixture:{elevation:[20,80]});}''',WEATHER)
    page.wait_for_function('pendingConditions.length===4')
    assert page.locator('#wind').input_value()=='0' and page.locator('#elevation').input_value()!='60'
    page.evaluate('''fixture=>{for(const request of pendingConditions.slice(2))request.resolve(request.path.startsWith('/api/weather')?fixture:{elevation:[20,25]});}''',WEATHER)
    page.wait_for_function("document.querySelector('#wind').value==='5' && document.querySelector('#elevation').value==='5'")
    page.wait_for_function("!document.querySelector('#quick-result').hidden")
    assert not errors,errors
    print('PASS: automatic weather/height and recalculation, no repeated requests after manual override, and late condition responses rejected after editing or moving the shot.')
    browser.close()
