'use strict';
// Browser-only version of wind-v2, verified against the Java implementation.
// scripts/check-prototype-model.mjs compares this prototype with the running Java API.
window.GolfPrototype = (() => {
  const round = n => Math.round(n * 10) / 10;
  const density = (temp, humidity, pressure) => {
    const vapor = humidity / 100 * 610.94 * Math.exp(17.625 * temp / (temp + 243.04));
    return (pressure * 100 - vapor) / (287.05 * (temp + 273.15)) + vapor / (461.495 * (temp + 273.15));
  };
  function calculate(shot) {
    const w = shot.weather;
    const distance = shot.distance ?? geoDistance(shot.ball, shot.target);
    const bearing = shot.bearing ?? geoBearing(shot.ball, shot.target);
    if (!Number.isFinite(distance) || distance < 10 || distance > 350) throw new Error('Carryavstånd måste ligga mellan 10 och 350 meter.');
    if (w.gusts < w.windSpeed) throw new Error('Vindbyar måste vara minst medelvinden.');
    const flight = { low: .75, normal: 1, high: 1.25 }[shot.trajectory];
    const lieFactor = { fairway: 0, tee: 0, rough: .08, flyer: -.07, sand: .20 }[shot.lie];
    if (!flight || lieFactor === undefined) throw new Error('Ogiltig bollbana eller bolläge.');
    const angle = (w.windFrom - bearing) * Math.PI / 180;
    const headwind = w.windSpeed * Math.cos(angle), crosswind = w.windSpeed * Math.sin(angle);
    const wind = distance * headwind * (headwind >= 0 ? .012 : .008) * flight;
    const height = shot.elevationChange * { low: 1.2, normal: 1, high: .75 }[shot.trajectory];
    const airDensity = density(w.temperature, w.humidity, w.pressure);
    const air = distance * .25 * (airDensity / density(20, 50, 1013.25) - 1);
    const raw = distance + wind + height + air + distance * lieFactor;
    const playsLike = Math.max(1, raw);
    const uncertainty = distance * .035 + Math.max(0, w.gusts - w.windSpeed) * distance * .012 * flight + distance * Math.abs(lieFactor) * .75 + (shot.wetBall ? distance * .04 : 0);
    const time = shot.flightTime ?? Math.max(1, Math.sqrt(2 * distance * Math.tan(35 * Math.PI / 180) / 9.80665) * 1.15 * flight);
    if (!Number.isFinite(time) || time < 1 || time > 15) throw new Error('Flygtid måste ligga mellan 1 och 15 sekunder.');
    const area = Math.PI * .04267 ** 2 / 4;
    const airspeed = Math.max(8, Math.hypot(distance / time + headwind, crosswind));
    const tau = 2 * .04593 / (airDensity * .25 * area * airspeed);
    const response = time + tau * Math.expm1(-time / tau);
    const drift = -crosswind * response;
    const sideMargin = Math.max(3, distance * .04) + Math.abs(drift) * .30 + Math.max(0, w.gusts - w.windSpeed) * Math.abs(Math.sin(angle)) * response;
    const aimBearing = (bearing + Math.atan2(-drift, distance) * 180 / Math.PI + 360) % 360;
    const warnings = ['Öppningsbar prototyp med samma startmodell som Java-servern. Inte validerad mot dina egna slag; carry utan rull.'];
    if (lieFactor !== 0) warnings.push('Bolläget ger stor osäkerhet. Kontrollera gräs, kontakt och risk för flyer.');
    if (shot.wetBall) warnings.push('Våt boll eller vått gräs kan ändra kontakt och spinn. Ingen fast meterjustering används; marginalen ökas.');
    if (Math.abs(crosswind) > 2) warnings.push('Sidovind beräknas för ett rakt slag. Egen skruv, spinn och vind på olika höjder kan ändra både drift och siktråd.');
    if (w.windSpeed >= 8) warnings.push('Stark vind: den förenklade modellen blir mindre tillförlitlig.');
    if (Math.abs(shot.elevationChange) > 20) warnings.push('Stor höjdskillnad: kontrollera att detta fortfarande är ett rimligt slag.');
    if (raw < 1) warnings.push('Extrema förhållanden: använd inte modellen för klubbval.');
    if (Math.abs(drift) > distance * .3) warnings.push('Mycket stor sidovindsdrift. Modellen är osäker; överväg ett annat slag eller en lägre bollbana.');
    return {
      distance: round(distance), bearing: round(bearing), playsLike: round(playsLike), rangeLow: round(Math.max(1, playsLike - uncertainty)), rangeHigh: round(playsLike + uncertainty),
      headwind: round(headwind), crosswind: round(crosswind), airDensity: Math.round(airDensity * 1000) / 1000,
      flightTime: round(time), flightTimeMeasured: shot.flightTime != null, lateralDrift: round(drift), lateralLow: round(drift-sideMargin), lateralHigh: round(drift+sideMargin), aimOffset: round(-drift), aimBearing: round(aimBearing),
      adjustments: [
        { label: 'Vind', meters: round(wind), explanation: 'Motvind ökar spelavståndet; medvind minskar det. Hög bollbana påverkas mer.' },
        { label: 'Höjd', meters: round(height), explanation: 'Mål över bollen ökar spelavståndet. Förenklad modell för höjd och bollbana.' },
        { label: 'Luft', meters: round(air), explanation: 'Luftdensitet utifrån temperatur, relativ fuktighet och lokalt lufttryck. Fuktig luft är något lättare.' },
        { label: 'Bolläge', meters: round(distance * lieFactor), explanation: 'Ruff och sand kan minska carry. Ett flyerläge kan ge extra längd och mindre spinn.' }
      ], warnings
    };
  }
  async function provider(url) {
    if (!navigator.onLine) throw new Error('Du är offline. Ange väder och höjd manuellt; beräkningen fungerar på telefonen.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Väder- eller höjddata kunde inte hämtas. Ange värden manuellt.');
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Väderförfrågan tog för lång tid. Ange värden manuellt eller försök igen.');
      if (error instanceof TypeError) throw new Error('Väder- eller höjdtjänsten kunde inte nås. Ange värden manuellt.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function api(path, options) {
    if (path === '/api/shot') return calculate(JSON.parse(options.body));
    if (path === '/api/course') return window.GOLF_BUNDLED_DATA.geometry || window.GOLF_BUNDLED_DATA.boundary;
    const q = new URL('https://prototype.invalid' + path).searchParams;
    if (path.startsWith('/api/weather?')) {
      const params = new URLSearchParams({ latitude: q.get('lat'), longitude: q.get('lon'),
        current: 'temperature_2m,relative_humidity_2m,surface_pressure,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability', wind_speed_unit: 'ms', forecast_days: '2', timezone: 'auto' });
      return provider('https://api.open-meteo.com/v1/forecast?' + params);
    }
    if (path.startsWith('/api/elevation?')) return provider('https://api.open-meteo.com/v1/elevation?' + new URLSearchParams({ latitude: q.get('lat') + ',' + q.get('targetLat'), longitude: q.get('lon') + ',' + q.get('targetLon') }));
    throw new Error('Denna funktion finns inte i den öppningsbara prototypen.');
  }
  return { calculate, api };
})();
