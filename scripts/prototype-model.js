'use strict';
// Browser-only prototype of empirical-v1. The installed app's authoritative model is Java.
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
    const warnings = ['Öppningsbar prototyp med samma startmodell som Java-servern. Inte validerad mot dina egna slag; carry utan rull.'];
    if (lieFactor !== 0) warnings.push('Bolläget ger stor osäkerhet. Kontrollera gräs, kontakt och risk för flyer.');
    if (shot.wetBall) warnings.push('Våt boll eller vått gräs kan ändra kontakt och spinn. Ingen fast meterjustering används; marginalen ökas.');
    if (Math.abs(crosswind) > 2) warnings.push('Sidvind visas separat. Exakt siktkompensation beräknas inte.');
    if (w.windSpeed >= 8) warnings.push('Stark vind: den förenklade modellen blir mindre tillförlitlig.');
    if (Math.abs(shot.elevationChange) > 20) warnings.push('Stor höjdskillnad: kontrollera att detta fortfarande är ett rimligt slag.');
    if (raw < 1) warnings.push('Extrema förhållanden: använd inte modellen för klubbval.');
    return {
      distance: round(distance), bearing: round(bearing), playsLike: round(playsLike), rangeLow: round(Math.max(1, playsLike - uncertainty)), rangeHigh: round(playsLike + uncertainty),
      headwind: round(headwind), crosswind: round(crosswind), airDensity: Math.round(airDensity * 1000) / 1000,
      adjustments: [
        { label: 'Vind', meters: round(wind), explanation: 'Motvind ökar spelavståndet; medvind minskar det. Hög bollbana påverkas mer.' },
        { label: 'Höjd', meters: round(height), explanation: 'Mål över bollen ökar spelavståndet. Förenklad modell för höjd och bollbana.' },
        { label: 'Luft', meters: round(air), explanation: 'Luftdensitet utifrån temperatur, relativ fuktighet och lokalt lufttryck. Fuktig luft är något lättare.' },
        { label: 'Bolläge', meters: round(distance * lieFactor), explanation: 'Ruff och sand kan minska carry. Ett flyerläge kan ge extra längd och mindre spinn.' }
      ], warnings
    };
  }
  async function provider(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
    if (!response.ok) throw new Error('Väder- eller höjddata kunde inte hämtas. Ange värden manuellt.');
    return response.json();
  }
  async function api(path, options) {
    if (path === '/api/shot') return calculate(JSON.parse(options.body));
    if (path === '/api/course') return window.GOLF_BUNDLED_DATA.boundary;
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
