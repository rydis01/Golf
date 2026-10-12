'use strict';
const $ = id => document.getElementById(id);
const isNative = () => Boolean(window.Capacitor?.isNativePlatform());
const state = { ball: null, target: null, lie: 'fairway', course: 'links', positionMode: 'manual', placePoint: 'ball', watchId: null, gps: null, weather: null, courseData: null, layer: null, apiBase: '' };
try { state.apiBase = localStorage.getItem('golf-api-base') ?? window.GOLF_CONFIG?.apiBase ?? ''; } catch { state.apiBase = window.GOLF_CONFIG?.apiBase ?? ''; }
if (window.GOLF_LOCAL_ONLY) { state.apiBase = ''; $('settings-open').hidden = true; }
let map, ballMarker, targetMarker, shotLine, gpsMarker, gpsCircle, courseLayer, courseRequest = 0, weatherRequest = 0, elevationRequest = 0, calculationRequest = 0;
let toastTimer;
let nationalMetadata;
const f = n => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n);
const meters = n => Math.round(n);
const point = latlng => ({ lat: latlng.lat, lon: latlng.lng });
const ll = p => [p.lat, p.lon];
const num = id => {
  const input = $(id), value = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(value) || !input.checkValidity()) throw new Error('Kontrollera värdet i fältet ' + (input.closest('label')?.childNodes[0]?.textContent.trim() || id) + '.');
  return value;
};
function notify(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function invalidate() {
  calculationRequest++;
  $('result').hidden = true; $('result-empty').hidden = false; $('calculation-error').hidden = true;
  $('warnings').replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = 'En caddie, inte en garanti.';
  const p = document.createElement('p'); p.textContent = 'Modellen är en uppskattning. Räkna alltid med variation i bollflykt och vind.';
  $('warnings').append(heading, p);
}
async function api(path, options = {}) {
  if (window.GOLF_PROTOTYPE && !state.apiBase) return window.GolfPrototype.api(path, options);
  if (isNative() && !state.apiBase) throw new Error('Ange Java-serverns HTTPS-adress under kugghjulet för att ansluta mobilappen.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), path.startsWith('/api/course') ? 65000 : 18000);
  try {
    const response = await fetch(state.apiBase + path, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Servern kunde inte slutföra begäran.');
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Servern svarade inte i tid. Försök igen eller använd manuella värden.');
    if (e instanceof TypeError || e instanceof SyntaxError) throw new Error('Java-servern kunde inte nås. Kontrollera anslutningen i inställningarna.');
    throw e;
  } finally { clearTimeout(timer); }
}
function geoDistance(a, b) {
  const rad = n => n * Math.PI / 180, dlat = rad(b.lat - a.lat), dlon = rad(b.lon - a.lon);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function geoBearing(a, b) {
  const rad = n => n * Math.PI / 180, dl = rad(b.lon - a.lon), la = rad(a.lat), lb = rad(b.lat);
  return (Math.atan2(Math.sin(dl) * Math.cos(lb), Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
}
function markerIcon(target = false) { return L.divIcon({ className: '', html: `<span class="point-marker ${target ? 'target' : ''}">${target ? '⚑' : '●'}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }); }
function setBall(p) {
  state.ball = p;
  if (!ballMarker) { ballMarker = L.marker(ll(p), { icon: markerIcon(), draggable: true }).addTo(map); ballMarker.on('dragend', () => { setPositionMode('manual', false).catch(e => notify(e.message)); setBall(point(ballMarker.getLatLng())); }); }
  else ballMarker.setLatLng(ll(p));
  pointsChanged();
}
function setTarget(p) {
  state.target = p;
  if (!targetMarker) { targetMarker = L.marker(ll(p), { icon: markerIcon(true), draggable: true }).addTo(map); targetMarker.on('dragend', () => setTarget(point(targetMarker.getLatLng()))); }
  else targetMarker.setLatLng(ll(p));
  pointsChanged();
}
function pointsChanged() {
  weatherRequest++; elevationRequest++;
  invalidate();
  $('elevation-status').textContent = 'Manuellt värde. Hämta höjd igen efter byte av boll eller mål.';
  if (state.ball && state.target) {
    const distance = geoDistance(state.ball, state.target), bearing = geoBearing(state.ball, state.target);
    $('use-manual').checked = false;
    $('distance').value = meters(distance); $('bearing').value = meters(bearing) % 360;
    $('map-distance').textContent = meters(distance) + ' m · ' + meters(bearing) + '°';
    if (shotLine) shotLine.setLatLngs([ll(state.ball), ll(state.target)]);
    else shotLine = L.polyline([ll(state.ball), ll(state.target)], { color: '#ecf4ce', weight: 3, dashArray: '7 9', className: 'animated-shot', interactive: false }).addTo(map);
    $('map-hint').textContent = 'Dra markörerna för att finjustera boll och mål';
  } else $('map-hint').textContent = '2. Tryck på kartan för att välja ditt mål';
  syncManual();
  updateWeatherStatus();
}
function syncManual() { $('distance').disabled = !$('use-manual').checked; $('bearing').disabled = !$('use-manual').checked; }
function setupMap() {
  if (!window.L) { $('map-error').hidden = false; return; }
  // Verified National center from OSM way 34563422 / Nominatim.
  map = L.map('map', { zoomControl: true }).setView([55.5690857, 13.1887799], 15);
  changeMap(false);
  map.on('click', e => {
    if (state.positionMode === 'manual' && state.placePoint === 'ball') { setBall(point(e.latlng)); choosePoint('target'); }
    else setTarget(point(e.latlng));
  });
}
function choosePoint(which) {
  state.placePoint = which;
  document.querySelectorAll('[data-place-point]').forEach(button => { const selected = button.dataset.placePoint === which; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  $('map-hint').textContent = which === 'ball' ? 'Tryck där du vill placera bollen' : 'Tryck där du vill att bollen ska landa';
}
async function setPositionMode(mode, focus = true) {
  const previousMode = state.positionMode;
  state.positionMode = mode;
  document.querySelectorAll('[data-position-mode]').forEach(button => { const selected = button.dataset.positionMode === mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  const gps = mode === 'gps';
  document.querySelector('.point-placement').hidden = gps;
  $('gps-ball').checked = gps;
  $('position-help').textContent = gps ? 'Din GPS-position blir bollens plats. Tryck på kartan för att välja mål.' : 'Prova hemifrån: placera bollen och målet på kartan. GPS behövs inte.';
  if (gps) {
    choosePoint('target');
    await startGps();
    if (state.gps) setBall(state.gps);
  } else {
    await stopGps(); choosePoint(previousMode === 'gps' ? 'ball' : state.ball ? 'target' : 'ball');
    if (focus && map) {
      if (previousMode === 'gps') map.flyTo([55.5690857, 13.1887799], 15, { duration: .8 });
      else if (state.ball && state.target) map.fitBounds([ll(state.ball), ll(state.target)], { padding: [45, 45], maxZoom: 18, animate: true });
      else map.flyTo([55.5690857, 13.1887799], 15, { duration: .8 });
    }
  }
}
async function tryDemo() {
  await setPositionMode('manual', false);
  const ball = { lat: 55.5690857, lon: 13.1887799 };
  const target = { lat: ball.lat + 160 / 6371000 * 180 / Math.PI, lon: ball.lon };
  if (map) { setBall(ball); setTarget(target); map.fitBounds([ll(ball), ll(target)], { padding: [55, 55], maxZoom: 18, animate: true }); }
  else { $('use-manual').checked = true; $('distance').value = 160; $('bearing').value = 0; syncManual(); invalidate(); }
  choosePoint('target');
  $('position-help').textContent = 'Exempel: 160 m mellan två valda punkter på området. Inte ett officiellt hål eller en flaggplacering. Dra punkterna eller välj en ny bollplats.';
}
function changeMap(satellite) {
  if (!map) return;
  if (state.layer) map.removeLayer(state.layer);
  state.layer = L.tileLayer(satellite ? 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: satellite ? 19 : 19,
    attribution: satellite ? 'Tiles © Esri — Esri, Maxar, Earthstar Geographics & contributors' : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    opacity: satellite ? 1 : 0.65
  });
  state.layer.on('tileerror', () => $('map-error').hidden = false);
  state.layer.on('tileload', () => $('map-error').hidden = true);
  state.layer.addTo(map);
  ['satellite', 'street'].forEach(id => { const selected = (id === 'satellite') === satellite; $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', selected); });
  drawCourse(false);
}
const courseStyle = feature => {
  const tags = feature.properties.tags, type = tags.golf;
  const colors = { fairway: '#b6d184', green: '#8fb855', bunker: '#eee0a6', rough: '#c9d7a6', tee: '#a0ba77', water_hazard: '#9dcbd2', lateral_water_hazard: '#9dcbd2' };
  if (type === 'hole') return { color: '#466742', weight: 1.5, dashArray: '4 6', opacity: 0.5 };
  if (tags.leisure === 'golf_course') return { color: '#446e3b', weight: 2, fillOpacity: 0.06, dashArray: '5 6' };
  return { color: type === 'bunker' ? '#d6c78f' : tags.natural === 'water' ? '#76afb9' : '#8da56c', weight: 1, fillColor: tags.natural === 'water' ? '#9dcbd2' : colors[type] || '#d0dbb6', fillOpacity: 0.85 };
};
function drawCourse(focus = true) {
  if (!map || !state.courseData) return;
  if (courseLayer) map.removeLayer(courseLayer);
  const features = state.courseData.features.filter(feature => feature.properties.course === 'unassigned' || feature.properties.course === state.course);
  courseLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style: courseStyle,
    interactive: false,
    onEachFeature: (feature, layer) => {
      const tags = feature.properties.tags, popup = document.createElement('div');
      popup.textContent = (tags.name || (tags.golf === 'hole' ? 'Hål ' + (tags.ref || '?') : tags.golf || 'Bana')) + (tags.par ? ' · par ' + tags.par : '') + ' · OpenStreetMap';
      layer.bindPopup(popup);
    }
  }).addTo(map);
  const exact = features.filter(feature => feature.properties.course === state.course);
  if (focus && exact.length) {
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: exact }).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [25, 25], maxZoom: 17, animate: true });
  } else if (focus && !state.gps && state.courseData.center) map.flyTo(state.courseData.center, 15, { duration: 1 });
  const holes = exact.filter(feature => feature.properties.tags.golf === 'hole').length;
  $('course-status').textContent = exact.length ? `${state.course === 'links' ? 'Links' : 'Lakes'} · ${holes} namngivna hållinjer i OSM · kontrollera mot banans skyltar` : 'National-data från OSM · Links/Lakes-tillhörighet saknas. Banvalet flyttar inte till obekräftade hål.';
}
function showHoleInfo() {
  const course = nationalMetadata?.courses.find(course => course.id === state.course);
  if (!course) return;
  const hole = course.holes.find(hole => hole.number === Number($('hole').value)) || course.holes[0];
  $('hole-info').textContent = `Hål ${hole.number} · par ${hole.par} · HCP ${hole.hcp} · tee ${$('tee').value}: ${hole.tees[$('tee').value]} m`;
  $('official-guide').href = course.source;
}
function selectCourseMetadata() {
  const course = nationalMetadata?.courses.find(course => course.id === state.course);
  if (!course) return;
  const previousHole = $('hole').value, previousTee = $('tee').value;
  $('hole').replaceChildren(...course.holes.map(hole => Object.assign(document.createElement('option'), { value: hole.number, textContent: 'Hål ' + hole.number })));
  $('tee').replaceChildren(...Object.keys(course.holes[0].tees).sort((a, b) => Number(b) - Number(a)).map(tee => Object.assign(document.createElement('option'), { value: tee, textContent: 'Tee ' + tee })));
  if (previousHole) $('hole').value = previousHole;
  const tees = Object.keys(course.holes[0].tees);
  $('tee').value = tees.includes(previousTee) ? previousTee : state.course === 'links' ? '58' : '59';
  showHoleInfo();
}
function focusHole() {
  showHoleInfo();
  const features = state.courseData?.features.filter(feature => feature.properties.course === state.course && feature.properties.tags.golf === 'hole' && feature.properties.tags.ref === $('hole').value) || [];
  if (map && features.length) {
    const bounds = L.geoJSON({ type: 'FeatureCollection', features }).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18, animate: true });
  } else notify('Par och teeavstånd finns från banans webbplats. Verifierad kartposition för detta hål saknas ännu; välj boll och mål manuellt.');
  // Hole length is not the current shot's carry. Never replace shot distance or guess a flag.
}
async function loadMetadata() {
  try {
    if (window.GOLF_BUNDLED_DATA) nationalMetadata = window.GOLF_BUNDLED_DATA.metadata;
    else {
      const response = await fetch('data/national.json');
      if (!response.ok) throw new Error();
      nationalMetadata = await response.json();
    }
    selectCourseMetadata();
  } catch { $('hole-info').textContent = 'Håldata kunde inte läsas. Kartans boll och mål kan fortfarande väljas.'; }
  try {
    if (window.GOLF_BUNDLED_DATA) state.courseData = window.GOLF_BUNDLED_DATA.boundary;
    else {
      const response = await fetch('data/national-boundary.json');
      if (response.ok) state.courseData = await response.json();
    }
    if (state.courseData) drawCourse(false);
  } catch { /* The base map and manual inputs remain usable without the bundled boundary. */ }
}
async function fetchCourse() {
  const id = ++courseRequest; $('fetch-course').disabled = true; $('course-status').textContent = 'Hämtar verkliga banformer från OpenStreetMap…';
  try {
    const data = await api('/api/course');
    if (id !== courseRequest) return;
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Banleverantören skickade ett ogiltigt svar.');
    state.courseData = data; drawCourse();
  } catch (e) { if (id === courseRequest) { $('course-status').textContent = 'Banformer kunde inte hämtas. Inga hål har lagts in som exempeldata.'; notify(e.message); } }
  finally { $('fetch-course').disabled = false; }
}
function updateWeatherStatus() {
  const data = state.weather, status = $('weather-status');
  status.classList.toggle('live', Boolean(data));
  if (!data) { status.textContent = 'Manuella värden · inte hämtat väder'; return; }
  const age = Math.floor((Date.now() - data.fetchedAt) / 60000);
  const distance = state.ball ? geoDistance(state.ball, data.point) : 0;
  status.textContent = `Open-Meteo · modelltid ${data.time.replace('T', ' ')} (${data.timezone}) · hämtat ${age} min sedan` + (distance > 500 ? ' · platsen har ändrats, hämta nytt väder' : '') + (age > 30 ? ' · uppdatera vädret' : '');
}
function weatherVisuals() {
  const wind = Number($('wind').value), temperature = Number($('temperature').value), humidity = Number($('humidity').value), from = Number($('wind-from').value);
  $('wind-display').replaceChildren(document.createTextNode(f(wind) + ' '), Object.assign(document.createElement('small'), { textContent: 'm/s' }));
  $('temp-display').replaceChildren(document.createTextNode(f(temperature)), Object.assign(document.createElement('small'), { textContent: '°C' }));
  $('humidity-display').replaceChildren(document.createTextNode(f(humidity)), Object.assign(document.createElement('small'), { textContent: '%' }));
  $('wind-arrow').setAttribute('transform', `rotate(${from + 180},80,80)`);
  const direction = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'][Math.round(from / 45) % 8];
  $('wind-description').textContent = `Från ${direction} · pilen visar flödet`;
}
function showForecast(data) {
  const hourly = data.hourly;
  if (!hourly?.time || !data.current?.time) { $('forecast').hidden = true; return; }
  const start = hourly.time.findIndex(time => time >= data.current.time);
  if (start < 0) { $('forecast').hidden = true; return; }
  const indexes = Array.from({ length: Math.min(6, hourly.time.length - start) }, (_, i) => start + i);
  const max = Math.max(1, ...indexes.map(i => hourly.wind_gusts_10m[i] ?? hourly.wind_speed_10m[i]));
  $('forecast-bars').replaceChildren();
  indexes.forEach(i => {
    const col = document.createElement('div'); col.className = 'forecast-column';
    const speed = hourly.wind_speed_10m[i], gust = hourly.wind_gusts_10m[i];
    const value = document.createElement('span'); value.className = 'forecast-value'; value.textContent = `${f(speed)} / ${f(gust)}`;
    const track = document.createElement('div'); track.className = 'forecast-track';
    const bar = document.createElement('div'); bar.className = 'forecast-bar'; bar.style.height = `${Math.max(2, speed / max * 100)}%`;
    const gustBar = document.createElement('div'); gustBar.className = 'gust-bar'; gustBar.style.height = `${Math.max(2, gust / max * 100)}%`;
    track.append(gustBar, bar);
    const time = document.createElement('span'); time.className = 'forecast-time'; time.textContent = hourly.time[i].slice(11, 16);
    col.append(value, track, time); $('forecast-bars').append(col);
  });
  $('forecast').hidden = false;
}
async function fetchWeather() {
  const p = state.ball || state.gps;
  if (!p) { notify('Välj bollens position på kartan eller starta GPS för lokalt väder.'); return; }
  const id = ++weatherRequest; $('fetch-weather').disabled = true; $('weather-status').textContent = 'Hämtar väder för bollens koordinater…';
  try {
    const data = await api(`/api/weather?lat=${p.lat}&lon=${p.lon}`);
    if (id !== weatherRequest) return;
    const c = data.current;
    if (!c || ['temperature_2m', 'relative_humidity_2m', 'surface_pressure', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'].some(key => typeof c[key] !== 'number' || !Number.isFinite(c[key]))) throw new Error('Väderleverantören saknade värden. Tidigare värden behålls.');
    const values = { temperature: c.temperature_2m, humidity: c.relative_humidity_2m, pressure: c.surface_pressure, wind: c.wind_speed_10m, 'wind-from': c.wind_direction_10m, gusts: Math.max(c.wind_gusts_10m, c.wind_speed_10m) };
    Object.entries(values).forEach(([id, value]) => $(id).value = value);
    state.weather = { point: { ...p }, fetchedAt: Date.now(), time: c.time, timezone: data.timezone || 'leverantörens tidszon' };
    $('weather-title').textContent = c.precipitation > 0 ? 'Nederbörd på banan' : 'Väder vid bollen';
    updateWeatherStatus(); weatherVisuals(); showForecast(data); invalidate();
  } catch (e) { if (id === weatherRequest) { updateWeatherStatus(); notify(e.message + ' Vädervärdena har inte ersatts.'); } }
  finally { $('fetch-weather').disabled = false; }
}
async function fetchElevation() {
  if (!state.ball || !state.target) { notify('Välj boll och mål på kartan först.'); return; }
  const id = ++elevationRequest, ball = { ...state.ball }, target = { ...state.target };
  $('fetch-elevation').disabled = true;
  try {
    const data = await api(`/api/elevation?lat=${ball.lat}&lon=${ball.lon}&targetLat=${target.lat}&targetLon=${target.lon}`);
    if (id !== elevationRequest) return;
    if (!Array.isArray(data.elevation) || data.elevation.length !== 2 || data.elevation.some(x => !Number.isFinite(x))) throw new Error('Höjddata saknas. Ange höjdskillnaden manuellt.');
    $('elevation').value = Math.round((data.elevation[1] - data.elevation[0]) * 10) / 10;
    $('elevation-status').textContent = `Open-Meteo: boll ${f(data.elevation[0])} m, mål ${f(data.elevation[1])} m. Grov terrängmodell; kontrollera värdet.`;
    invalidate();
  } catch (e) { notify(e.message); }
  finally { $('fetch-elevation').disabled = false; }
}
function geoPlugin() { return window.Capacitor.registerPlugin('Geolocation'); }
function updatePosition(position) {
  const p = { lat: position.coords.latitude, lon: position.coords.longitude }, accuracy = position.coords.accuracy;
  const first = !state.gps; state.gps = p;
  $('gps-status').textContent = `GPS aktiv · noggrannhet cirka ±${meters(accuracy)} m` + (accuracy > 20 ? ' · placera bollen manuellt för bättre precision' : '');
  if (!map) return;
  if (!gpsMarker) {
    gpsMarker = L.marker(ll(p), { icon: L.divIcon({ className: '', html: '<span class="gps-marker"><i></i></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(map);
    gpsCircle = L.circle(ll(p), { radius: accuracy, color: '#4786bb', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
  } else { gpsMarker.setLatLng(ll(p)); gpsCircle.setLatLng(ll(p)).setRadius(accuracy); }
  if (first) map.flyTo(ll(p), 17, { duration: 1.2 });
  if ($('gps-ball').checked && (!state.ball || geoDistance(state.ball, p) > 3)) setBall(p);
}
function gpsError(error) { notify(error.message || 'GPS kunde inte läsas. Kontrollera platsbehörigheten.'); $('gps-status').textContent = 'GPS saknar position. Kontrollera platsbehörighet och signal.'; }
async function startGps() {
  if (state.watchId !== null) { if (state.gps && map) map.flyTo(ll(state.gps), 17); return; }
  $('location').disabled = true;
  try {
    if (isNative()) {
      const plugin = geoPlugin(), permissions = await plugin.requestPermissions();
      if (!['granted', 'limited'].includes(permissions.location) && permissions.coarseLocation !== 'granted') throw new Error('Platsbehörighet saknas. Godkänn den i telefonens inställningar.');
      state.watchId = await plugin.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }, (position, error) => error ? gpsError(error) : position && updatePosition(position));
    } else {
      if (!navigator.geolocation) throw new Error('Den här enheten saknar GPS-stöd.');
      state.watchId = navigator.geolocation.watchPosition(updatePosition, gpsError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    }
    $('stop-gps').hidden = false; $('location').textContent = '⌖ Visa mig';
    if (!state.gps) $('gps-status').textContent = 'GPS startar · väntar på position…';
  } catch (e) { gpsError(e); }
  finally { $('location').disabled = false; }
}
async function stopGps() {
  if (state.watchId !== null) {
    if (isNative()) await geoPlugin().clearWatch({ id: state.watchId });
    else navigator.geolocation.clearWatch(state.watchId);
  }
  state.watchId = null; state.gps = null; $('gps-ball').checked = false;
  if (gpsMarker) map.removeLayer(gpsMarker); if (gpsCircle) map.removeLayer(gpsCircle); gpsMarker = gpsCircle = null;
  $('stop-gps').hidden = true; $('location').textContent = '⌖ Min position'; $('gps-status').textContent = 'GPS avstängd. Bollens valda position behålls.';
}
async function calculate() {
  $('calculation-error').hidden = true;
  let payload;
  try {
    const manual = $('use-manual').checked;
    if (!manual && (!state.ball || !state.target)) throw new Error('Välj boll och mål på kartan eller använd manuellt avstånd.');
    if (state.weather && Date.now() - state.weather.fetchedAt > 30 * 60000) throw new Error('Vädret är äldre än 30 minuter. Hämta nytt väder eller justera till manuella värden.');
    if (state.weather && state.ball && geoDistance(state.ball, state.weather.point) > 500) throw new Error('Bollens position har ändrats. Hämta nytt väder för den nya platsen eller använd manuella vädervärden.');
    payload = { ball: state.ball, target: state.target, distance: manual ? num('distance') : null, bearing: manual ? num('bearing') : null, elevationChange: num('elevation'), lie: state.lie, trajectory: $('trajectory').value, wetBall: $('wet').checked,
      weather: { temperature: num('temperature'), humidity: num('humidity'), pressure: num('pressure'), windSpeed: num('wind'), windFrom: num('wind-from'), gusts: num('gusts') } };
  } catch (e) { $('calculation-error').textContent = e.message; $('calculation-error').hidden = false; return; }
  const id = ++calculationRequest; $('calculate').disabled = true;
  try {
    const result = await api('/api/shot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (id !== calculationRequest) return;
    $('plays-like').textContent = meters(result.playsLike); $('actual-distance').textContent = meters(result.distance);
    const difference = meters(result.playsLike - result.distance);
    $('difference').textContent = (difference > 0 ? '+' : '') + difference + ' m justering';
    $('result-range').textContent = `${meters(result.rangeLow)}–${meters(result.rangeHigh)} m`;
    $('adjustments').replaceChildren();
    result.adjustments.forEach(adjustment => {
      const row = document.createElement('div'); row.className = 'adjustment';
      const label = document.createElement('button'); label.textContent = adjustment.label + ' ⓘ'; label.addEventListener('click', () => notify(adjustment.explanation));
      const value = document.createElement('strong'); value.textContent = (adjustment.meters > 0 ? '+' : '') + f(adjustment.meters) + ' m';
      row.append(label, value); $('adjustments').append(row);
    });
    $('crosswind').textContent = Math.abs(result.crosswind) < .5 ? 'Ingen betydande sidvind i slagriktningen.' : `Sidvind ${f(Math.abs(result.crosswind))} m/s från ${result.crosswind > 0 ? 'höger' : 'vänster'} · anpassa sikte efter bollbana.`;
    const list = document.createElement('ul');
    result.warnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; list.append(item); });
    if (!state.weather) { const item = document.createElement('li'); item.textContent = 'Beräknat från manuella vädervärden, inte hämtat lokalt väder.'; list.append(item); }
    $('warnings').replaceChildren(list); $('result-empty').hidden = true; $('result').hidden = false;
    if (window.innerWidth < 651) $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  } catch (e) { if (id === calculationRequest) { $('calculation-error').textContent = e.message; $('calculation-error').hidden = false; } }
  finally { $('calculate').disabled = false; }
}
$('satellite').addEventListener('click', () => changeMap(true)); $('street').addEventListener('click', () => changeMap(false));
$('reset-map').addEventListener('click', () => {
  [ballMarker, targetMarker, shotLine].forEach(layer => layer && map.removeLayer(layer)); ballMarker = targetMarker = shotLine = null;
  state.ball = state.target = null; $('gps-ball').checked = false; $('use-manual').checked = true; $('map-distance').textContent = 'Välj två punkter'; $('map-hint').textContent = '1. Tryck där bollen ligger · 2. Välj ditt mål';
  weatherRequest++; elevationRequest++; choosePoint(state.positionMode === 'gps' ? 'target' : 'ball'); syncManual(); invalidate();
});
document.querySelectorAll('[data-lie]').forEach(button => button.addEventListener('click', () => {
  state.lie = button.dataset.lie;
  document.querySelectorAll('[data-lie]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
  $('lie-help').textContent = { fairway: 'Ren kontakt från kortklippt gräs.', rough: 'Gräs bakom bollen kan minska carry. Stor variation.', flyer: 'Lite gräs mellan boll och klubba kan ge mindre spinn och extra längd. Kan inte avgöras av GPS.', sand: 'Fairwaybunker: rådet är osäkert och förutsätter bollträff först. Gäller inte ett greenbunkerslag.' }[state.lie];
  invalidate();
}));
document.querySelectorAll('[data-course]').forEach(button => button.addEventListener('click', () => {
  state.course = button.dataset.course;
  document.querySelectorAll('[data-course]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
  selectCourseMetadata(); drawCourse(); invalidate();
}));
$('hole').addEventListener('change', focusHole); $('tee').addEventListener('change', showHoleInfo);
['distance', 'bearing', 'elevation', 'trajectory', 'wet'].forEach(id => $(id).addEventListener('input', () => { if (id === 'elevation') { elevationRequest++; $('elevation-status').textContent = 'Manuellt värde.'; } invalidate(); }));
['temperature', 'humidity', 'pressure', 'wind', 'wind-from', 'gusts'].forEach(id => $(id).addEventListener('input', () => { weatherRequest++; state.weather = null; $('forecast').hidden = true; $('weather-title').textContent = 'Dina förhållanden'; updateWeatherStatus(); weatherVisuals(); invalidate(); }));
$('use-manual').addEventListener('change', () => { syncManual(); invalidate(); });
$('gps-ball').addEventListener('change', () => { if ($('gps-ball').checked && state.gps) setBall(state.gps); else if ($('gps-ball').checked) notify('Starta GPS med Min position för att följa bollen.'); });
$('calculate').addEventListener('click', calculate); $('fetch-weather').addEventListener('click', fetchWeather); $('fetch-elevation').addEventListener('click', fetchElevation); $('fetch-course').addEventListener('click', fetchCourse);
$('location').addEventListener('click', startGps); $('stop-gps').addEventListener('click', () => setPositionMode('manual').catch(e => notify(e.message)));
document.querySelectorAll('[data-position-mode]').forEach(button => button.addEventListener('click', () => setPositionMode(button.dataset.positionMode).catch(e => notify(e.message))));
document.querySelectorAll('[data-place-point]').forEach(button => button.addEventListener('click', () => choosePoint(button.dataset.placePoint)));
$('try-demo').addEventListener('click', () => tryDemo().catch(e => notify(e.message)));
$('settings-open').addEventListener('click', () => { $('api-base').value = state.apiBase; $('settings-error').hidden = true; $('settings').showModal(); });
$('save-settings').addEventListener('click', () => {
  const value = $('api-base').value.trim().replace(/\/+$/, '');
  try {
    if (value) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Använd en HTTPS-adress utan lösenord, parametrar eller fragment.'); }
    state.apiBase = value; localStorage.setItem('golf-api-base', value);
    weatherRequest++; elevationRequest++; courseRequest++; state.weather = null; $('forecast').hidden = true; updateWeatherStatus(); invalidate();
    $('settings').close(); notify('Anslutningen sparad. Hämta väder och banformer från den valda servern.');
  } catch (e) { $('settings-error').textContent = e.message; $('settings-error').hidden = false; }
});
setupMap(); syncManual(); weatherVisuals(); loadMetadata();
setInterval(updateWeatherStatus, 60000);
document.addEventListener('visibilitychange', () => { if (document.hidden && state.watchId !== null) setPositionMode('manual', false).catch(e => notify(e.message)); });
// Course retrieval is explicit: no hidden GPS permissions or fabricated demo holes.
