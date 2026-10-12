'use strict';
const $ = id => document.getElementById(id);
const isNative = () => Boolean(window.Capacitor?.isNativePlatform());
const state = { ball: null, target: null, flag: null, safetyCandidate: null, safeLanding: null, lie: 'fairway', course: 'links', roundStarted: false, rangefinderBall: null, gpsAccuracy: 0, positionMode: 'manual', placePoint: 'ball', watchId: null, gps: null, weather: null, courseData: null, layer: null, apiBase: '' };
try { state.apiBase = localStorage.getItem('golf-api-base') ?? window.GOLF_CONFIG?.apiBase ?? ''; } catch { state.apiBase = window.GOLF_CONFIG?.apiBase ?? ''; }
if (window.GOLF_LOCAL_ONLY) { state.apiBase = ''; $('settings-open').hidden = true; }
let map, ballMarker, targetMarker, shotLine, gpsMarker, gpsCircle, courseLayer, courseRequest = 0, weatherRequest = 0, elevationRequest = 0, calculationRequest = 0;
let toastTimer, autoCalculationTimer;
let areaMapAllowed = false, mapOrientationKey = null;
let aimMarker, aimLine, suggestionMarker, landingMarker;
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
  calculationRequest++; clearTimeout(autoCalculationTimer);
  $('quick-result').hidden = true; $('quick-empty').hidden = false; $('quick-empty').textContent = 'Placera bollen och flaggan.';
  $('result').hidden = true; $('result-empty').hidden = false; $('calculation-error').hidden = true;
  $('warnings').replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = 'En caddie, inte en garanti.';
  const p = document.createElement('p'); p.textContent = 'Modellen är en uppskattning. Räkna alltid med variation i bollflykt och vind.';
  $('warnings').append(heading, p);
  [aimMarker,aimLine,suggestionMarker].forEach(layer=>layer&&map?.removeLayer(layer));
  aimMarker=aimLine=suggestionMarker=null; state.safetyCandidate=null;
  $('choose-safe-landing').hidden=true;
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
  if (state.rangefinderBall && geoDistance(state.rangefinderBall, p) > (state.positionMode === 'gps' ? Math.max(5, state.gpsAccuracy) : 1)) clearRangefinder('Bollens plats har ändrats. Mät avståndet till flaggan igen.');
  state.ball = p;
  if (!ballMarker) { ballMarker = L.marker(ll(p), { icon: markerIcon(), draggable: true }).addTo(map); ballMarker.on('dragend', () => { setPositionMode('manual', false).catch(e => notify(e.message)); setBall(point(ballMarker.getLatLng())); }); }
  else ballMarker.setLatLng(ll(p));
  pointsChanged();
}
function setTarget(p) {
  if(state.rangefinderBall && state.flag && geoDistance(state.flag,p)>1) clearRangefinder('Flaggans målpunkt har ändrats. Kontrollera kikaravståndet igen.');
  state.target = state.flag = p; state.safeLanding=null;
  if(landingMarker) map.removeLayer(landingMarker); landingMarker=null;
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
  scheduleCalculation();
}
function scheduleCalculation() {
  clearTimeout(autoCalculationTimer);
  if (!state.roundStarted) return;
  const laser = $('use-rangefinder').checked;
  const ready = laser ? $('rangefinder-distance').checkValidity() && $('rangefinder-distance').value.trim() && (state.ball && state.target || $('bearing').value.trim()) : state.ball && state.target || $('use-manual').checked && $('distance').value.trim() && $('bearing').value.trim();
  if (ready) { $('quick-empty').textContent = 'Räknar spelavstånd…'; autoCalculationTimer = setTimeout(calculate, 180); }
}
function syncManual() {
  const laser = $('use-rangefinder').checked;
  $('rangefinder-fields').hidden = !laser;
  $('use-manual').disabled = laser;
  $('distance').disabled = laser || !$('use-manual').checked;
  $('bearing').disabled = laser ? Boolean(state.ball && state.target) : !$('use-manual').checked;
  $('rangefinder-help').textContent = $('rangefinder-type').value === 'slope' ? 'Kikarens slope-värde innehåller höjdjusteringen. Vi justerar därefter för vind, luft och bolläge och räknar inte höjden en gång till.' : 'Avståndet används till den flagga du har mätt. Markera riktningen på kartan eller ange slagriktning nedan. Flyttar du dig behöver du mäta igen.';
}
function clearRangefinder(message = '') {
  $('rangefinder-distance').value = ''; $('use-rangefinder').checked = false;
  state.rangefinderBall = null; $('rangefinder-status').textContent = message;
  syncManual(); invalidate();
}
function clearShot() {
  [ballMarker, targetMarker, shotLine,landingMarker].forEach(layer => layer && map?.removeLayer(layer));
  ballMarker = targetMarker = shotLine = landingMarker = null; state.ball = state.target = state.flag = state.safeLanding = null;
  clearRangefinder(); $('rangefinder-type').value = 'raw';
  $('distance').value = ''; $('bearing').value = ''; $('use-manual').checked = true;
  $('elevation').value = 0; $('elevation-status').textContent = 'Manuellt värde för detta hål. Plus = uppför, minus = nedför.';
  $('map-distance').textContent = 'Välj boll och mål';
  state.lie = 'fairway';
  document.querySelectorAll('[data-lie]').forEach(button => { const selected = button.dataset.lie === 'fairway'; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  $('lie-help').textContent = 'Ren kontakt från kortklippt gräs.';
  $('trajectory').value = 'normal'; $('wet').checked = false; $('flight-time').value='';
  weatherRequest++; elevationRequest++; syncManual(); invalidate(); choosePoint(state.positionMode === 'gps' ? 'target' : 'ball');
  if (state.positionMode === 'gps' && state.gps) setBall(state.gps);
}
function saveRound() {
  if (!state.roundStarted) return;
  try { localStorage.setItem('golf-round', JSON.stringify({ course: state.course, hole: Number($('hole').value), tee: $('tee').value })); } catch { /* Storage is optional. */ }
}
function savedRound() {
  try {
    const round = JSON.parse(localStorage.getItem('golf-round'));
    const course = nationalMetadata?.courses.find(course => course.id === round?.course);
    return course && Number.isInteger(round.hole) && round.hole >= 1 && round.hole <= 18 && Object.hasOwn(course.holes[0].tees, round.tee) ? round : null;
  } catch { return null; }
}
function startRound(resume = false) {
  const saved = resume ? savedRound() : null;
  if (saved) { state.course = saved.course; selectCourseMetadata(); $('tee').value = saved.tee; $('hole').value = saved.hole; }
  else { $('tee').value = $('setup-tee').value; $('hole').value = '1'; }
  state.roundStarted = true; document.body.classList.add('playing'); areaMapAllowed = false;
  $('round-setup').hidden = true; $('round-header').hidden = false; $('round-workspace').hidden = false;
  map?.invalidateSize();
  clearShot(); showHoleInfo(); changeMap(false); focusHole();
  requestAnimationFrame(() => map?.invalidateSize());
}
function changeHole(number) {
  if (!Number.isInteger(number) || number < 1 || number > 18) return;
  $('hole').value = String(number); areaMapAllowed = false; changeMap(false); $('shot-options').close(); clearShot(); focusHole();
  $('round-header').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function setupMap() {
  if (!window.L) { $('map-error').hidden = false; return; }
  // Verified National center from OSM way 34563422 / Nominatim.
  map = L.map('map', { zoomControl: true }).setView([55.5690857, 13.1887799], 15);
  map.attributionControl.addAttribution('© OpenStreetMap contributors');
  changeMap(false);
  map.on('click', e => {
    if (state.positionMode === 'manual' && state.placePoint === 'ball') { setBall(point(e.latlng)); choosePoint('target'); }
    else setTarget(point(e.latlng));
  });
}
function choosePoint(which) {
  state.placePoint = which;
  document.querySelectorAll('[data-place-point]').forEach(button => { const selected = button.dataset.placePoint === which; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  $('map-hint').textContent = which === 'ball' ? 'Tryck där du vill placera bollen' : 'Tryck där dagens flagga står';
}
async function setPositionMode(mode, focus = true) {
  if (mode === 'gps' && !window.HoleView.select(state.courseData?.features || [],state.course,$('hole').value).line) { areaMapAllowed = true; changeMap(false); map.invalidateSize(); }
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
  if (!window.HoleView.select(state.courseData?.features || [],state.course,$('hole').value).line) { areaMapAllowed = true; changeMap(false); map.invalidateSize(); }
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
  if (satellite && !window.HoleView.select(state.courseData?.features || [],state.course,$('hole').value).line) areaMapAllowed = true;
  if (state.layer) map.removeLayer(state.layer); state.layer = null;
  ['satellite', 'street'].forEach(id => { const selected = (id === 'satellite') === satellite; $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', selected); });
  if (satellite || areaMapAllowed) orientMap(null);
  if (satellite || areaMapAllowed) state.layer = L.tileLayer(satellite ? 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: satellite ? 19 : 19,
    attribution: satellite ? 'Tiles © Esri — Esri, Maxar, Earthstar Geographics & contributors' : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    opacity: satellite ? 1 : 0.65
  });
  if (state.layer) { state.layer.on('tileerror', () => $('map-error').hidden = false);
  state.layer.on('tileload', () => $('map-error').hidden = true);
  state.layer.addTo(map); }
  if (!state.layer) $('map-error').hidden = true;
  ['satellite', 'street'].forEach(id => { const selected = (id === 'satellite') === satellite; $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', selected); });
  drawCourse(false);
}
function orientMap(line) {
  const isolated = line && !areaMapAllowed && !$('satellite').classList.contains('selected');
  const key = isolated ? `${state.course}/${$('hole').value}` : 'north';
  if (mapOrientationKey === key) return;
  mapOrientationKey = key;
  let bearing = 0;
  if (isolated) {
    const coordinates=line.geometry.coordinates;
    const a=coordinates[0],b=coordinates.at(-1);
    bearing=geoBearing({lat:a[1],lon:a[0]},{lat:b[1],lon:b[0]});
    const projection=L.CRS.EPSG3857.projection;
    const origin=projection.project(L.latLng(a[1],a[0]));
    const angle=bearing*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    map.options.crs=L.extend({},L.CRS.EPSG3857,{projection:{
      bounds:projection.bounds,
      project(latlng) {const p=projection.project(latlng),x=p.x-origin.x,y=p.y-origin.y;return L.point(origin.x+cos*x-sin*y,origin.y+sin*x+cos*y);},
      unproject(p) {const x=p.x-origin.x,y=p.y-origin.y;return projection.unproject(L.point(origin.x+cos*x+sin*y,origin.y-sin*x+cos*y));}
    }});
  } else map.options.crs=L.CRS.EPSG3857;
  map.setView(map.getCenter(),map.getZoom(),{reset:true});
  $('north-arrow').style.transform=`rotate(${-bearing}deg)`;
}
const courseStyle = feature => {
  const tags = feature.properties.tags, type = tags.golf;
  const colors = { fairway: '#bdca73', green: '#b8d35e', bunker: '#fff9e6', rough: '#c6bd78', tee: '#d8df95', water_hazard: '#8bb8b5', lateral_water_hazard: '#8bb8b5' };
  if (type === 'hole') return { color: '#466742', weight: 1.5, dashArray: '4 6', opacity: 0.5 };
  const satellite = $('satellite').classList.contains('selected');
  if (tags.leisure === 'golf_course') return { color: '#8b9060', weight: 1, fillColor: '#c6c480', fillOpacity: satellite ? 0 : .45 };
  const forest = tags.natural === 'wood' || tags.landuse === 'forest';
  return { color: type === 'bunker' ? '#c9bb8d' : tags.natural === 'water' ? '#699e9e' : forest ? '#60784d' : '#8b9c5b', weight: 1, fillColor: tags.natural === 'water' ? '#8bb8b5' : forest ? '#748650' : colors[type] || '#c6c480', fillOpacity: satellite ? .12 : .95 };
};
function drawCourse(focus = true) {
  if (!map || !state.courseData) return;
  if (courseLayer) map.removeLayer(courseLayer);
  const selection = window.HoleView.select(state.courseData.features, state.course, $('hole').value);
  orientMap(selection.line);
  const fallback = state.roundStarted && !selection.line && !areaMapAllowed;
  $('hole-fallback').hidden = !fallback; $('hole-map-shell').hidden = fallback; $('hole-map-footer').hidden = fallback; $('position-controls').hidden = fallback;
  const features = (selection.line && !areaMapAllowed ? selection.features : areaMapAllowed ? state.courseData.features.filter(feature => feature.properties.course === 'unassigned' || feature.properties.course === state.course) : []).sort((a,b) => {
    const priority = f => ({ golf_course:0, rough:1, fairway:3, tee:4, green:5, bunker:6, hole:7 }[f.properties.tags.golf || f.properties.tags.leisure] ?? 2);
    return priority(a)-priority(b);
  });
  courseLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style: courseStyle,
    interactive: false,
    onEachFeature: (feature, layer) => {
      const tags = feature.properties.tags, popup = document.createElement('div');
      popup.textContent = (tags.name || (tags.golf === 'hole' ? 'Hål ' + (tags.ref || '?') : tags.golf || 'Bana')) + (tags.par ? ' · par ' + tags.par : '') + ' · OpenStreetMap';
      layer.bindPopup(popup);
    }
  }).addTo(map);
  if (!areaMapAllowed && !$('satellite').classList.contains('selected')) {
    const svg = map.getPanes().overlayPane.querySelector('svg');
    if (svg && !svg.querySelector('#fairway-grass')) {
      const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
      defs.innerHTML='<linearGradient id="fairway-grass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#cbd784"/><stop offset=".48" stop-color="#a9bf56"/><stop offset="1" stop-color="#c5ce77"/></linearGradient><linearGradient id="green-grass"><stop stop-color="#cce28a"/><stop offset="1" stop-color="#a7c458"/></linearGradient><filter id="terrain-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="3" stdDeviation="3" flood-color="#465828" flood-opacity=".22"/></filter>';
      svg.prepend(defs);
    }
    courseLayer.eachLayer(layer=>{
      const type=layer.feature.properties.tags.golf;
      if (layer._path && ['fairway','green','tee','bunker'].includes(type)) {
        layer._path.setAttribute('filter','url(#terrain-shadow)');
        if(type==='fairway'||type==='green') layer._path.setAttribute('fill',`url(#${type==='fairway'?'fairway-grass':'green-grass'})`);
      }
    });
  }
  const exact = features.filter(feature => feature.properties.course === state.course);
  if (focus && exact.length) {
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: exact }).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [25, 25], maxZoom: 17, animate: true });
  } else if (focus && !state.gps && state.courseData.center) map.flyTo(state.courseData.center, 15, { duration: 1 });
  const holes = exact.filter(feature => feature.properties.tags.golf === 'hole').length;
  $('course-status').textContent = `${state.courseData.features.length} geografiska banformer · ` + (holes ? `${holes} identifierade hållinjer på ${state.course === 'links' ? 'Links' : 'Lakes'}. GPS använder samma skala som banvyn.` : 'Hålpositioner för Links saknas i källan; placera boll och mål på banvyn.');
}
function showHoleInfo() {
  const course = nationalMetadata?.courses.find(course => course.id === state.course);
  if (!course) return;
  const hole = course.holes.find(hole => hole.number === Number($('hole').value)) || course.holes[0];
  $('hole-info').textContent = `Hål ${hole.number} · par ${hole.par} · HCP ${hole.hcp} · tee ${$('tee').value}: ${hole.tees[$('tee').value]} m`;
  $('official-guide').href = course.source;
  $('round-course').textContent = course.name;
  $('hole-title').replaceChildren(document.createTextNode('Hål ' + hole.number + ' '), Object.assign(document.createElement('small'), { textContent: '/ 18' }));
  $('round-hole-info').textContent = `Par ${hole.par} · HCP ${hole.hcp} · tee ${$('tee').value}: ${hole.tees[$('tee').value]} m`;
  $('hole-progress').textContent = `${hole.number} / 18`;
  $('previous-hole').disabled = hole.number === 1; $('next-hole').disabled = hole.number === 18;
  $('next-hole').textContent = '→'; $('next-hole').setAttribute('aria-label',hole.number === 18 ? 'Sista hålet' : 'Nästa hål');
  $('map-hole-title').textContent = `${course.name} · hål ${hole.number}`;
  $('guide-title').textContent = `${course.name} · hål ${hole.number}`;
  const guide = hole.guide;
  $('hole-guide').hidden = !guide;
  if (guide) {
    const assetBase = window.GOLF_ASSET_BASE;
    const source = window.GOLF_LOCAL_ONLY ? guide.localPath : assetBase ? assetBase + guide.localPath : window.GOLF_PROTOTYPE ? guide.sourceUrl : guide.localPath;
    $('focused-hole-guide').src = source; $('focused-hole-guide').alt = `${course.name} · hål ${hole.number}`;
    $('hole-guide').src = source; $('hole-guide').alt = `${course.name}, hål ${hole.number}, officiell banguide`;
    $('guide-source').href = guide.sourceUrl;
  }
  saveRound();
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
  $('setup-tee').replaceChildren(...Array.from($('tee').options, option => option.cloneNode(true)));
  $('setup-tee').value = $('tee').value;
  showHoleInfo();
}
function focusHole() {
  showHoleInfo(); drawCourse(false);
  const features = state.courseData?.features.filter(feature => feature.properties.course === state.course && feature.properties.tags.golf === 'hole' && feature.properties.tags.ref === $('hole').value) || [];
  if (map && features.length) {
    const selection = window.HoleView.select(state.courseData.features,state.course,$('hole').value);
    const bounds = L.geoJSON({ type:'FeatureCollection',features:selection.features }).getBounds();
    map.invalidateSize();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 18, animate: false });
  } else $('course-status').textContent = 'Hållinjen för detta Links-hål saknas. Banguide och verkliga banformer finns; placera boll och mål manuellt.';
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
    $('start-round').disabled = false;
    const saved = savedRound();
    if (saved) { $('resume-round').hidden = false; $('resume-round').textContent = `Fortsätt ${saved.course === 'links' ? 'Links' : 'Lakes'} · hål ${saved.hole}`; }
  } catch { $('hole-info').textContent = 'Håldata kunde inte läsas. Kartans boll och mål kan fortfarande väljas.'; }
  try {
    if (window.GOLF_BUNDLED_DATA) state.courseData = window.GOLF_BUNDLED_DATA.geometry || window.GOLF_BUNDLED_DATA.boundary;
    else {
      const response = await fetch('data/national-geometry.json');
      if (response.ok) state.courseData = await response.json();
    }
    if (state.courseData) { drawCourse(false); if(state.roundStarted) focusHole(); }
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
    updateWeatherStatus(); weatherVisuals(); showForecast(data); invalidate(); scheduleCalculation();
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
    invalidate(); scheduleCalculation();
  } catch (e) { notify(e.message); }
  finally { $('fetch-elevation').disabled = false; }
}
function geoPlugin() { return window.Capacitor.registerPlugin('Geolocation'); }
function updatePosition(position) {
  const p = { lat: position.coords.latitude, lon: position.coords.longitude }, accuracy = position.coords.accuracy;
  const first = !state.gps; state.gps = p; state.gpsAccuracy = accuracy;
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
function destination(p,bearing,distance) {
  const a=distance/6371000,b=bearing*Math.PI/180,lat=p.lat*Math.PI/180,lon=p.lon*Math.PI/180;
  const nextLat=Math.asin(Math.sin(lat)*Math.cos(a)+Math.cos(lat)*Math.sin(a)*Math.cos(b));
  const nextLon=lon+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat),Math.cos(a)-Math.sin(lat)*Math.sin(nextLat));
  return {lat:nextLat*180/Math.PI,lon:((nextLon*180/Math.PI+540)%360)-180};
}
function showLateralAndLanding(result) {
  const drift=Math.abs(result.lateralDrift),offset=Math.abs(result.aimOffset);
  $('lateral-drift').textContent=drift<.5?'Ingen tydlig riktad sidodrift':`Bollen uppskattas driva ${f(drift)} m åt ${result.lateralDrift>0?'höger':'vänster'}`;
  $('aim-advice').textContent=offset<.5?'Ingen riktad vindkompensation i sidled.':`Sikta cirka ${f(offset)} m ${result.aimOffset>0?'höger':'vänster'} om ${state.safeLanding?'landningsytan':'flaggan'} för ett rakt slag.`;
  const margin=Math.max(result.lateralHigh-result.lateralDrift,result.lateralDrift-result.lateralLow);
  $('flight-info').textContent=`${result.flightTimeMeasured?'Angiven':'Uppskattad'} flygtid ${f(result.flightTime)} s · sidomarginal cirka ±${f(margin)} m. Modellmarginal, ingen statistisk garanti.`;
  [aimMarker,aimLine,suggestionMarker].forEach(layer=>layer&&map?.removeLayer(layer));aimMarker=aimLine=suggestionMarker=null;
  if(map&&state.ball&&state.target) {
    const aim=destination(state.target,result.bearing+(result.aimOffset>=0?90:-90),offset);
    aimMarker=L.circleMarker(ll(aim),{radius:7,color:'#3188bd',weight:2,fillColor:'#d9f0ff',fillOpacity:1}).addTo(map).bindTooltip('Sikte med sidovind',{direction:'top'});
    aimLine=L.polyline([ll(state.ball),ll(aim)],{color:'#3188bd',weight:2,dashArray:'4 7',interactive:false}).addTo(map);
  }
  $('choose-safe-landing').hidden=true;state.safetyCandidate=null;
  if(!state.flag||!state.courseData) {$('landing-message').textContent='Sätt dagens flagga på den geografiska banvyn för att bedöma landningsytan.';return;}
  const advice=window.LandingAdvisor.analyze(state.flag,state.courseData.features,result,state.positionMode==='gps'?state.gpsAccuracy:0);
  let message=advice.message;
  if(advice.candidate) {
    state.safetyCandidate=advice.candidate;
    message+=` En rymligare yta finns cirka ${Math.round(advice.candidate.flagOffset)} m från flaggan.`;
    if(!advice.candidate.fullMargin)message+=' Hela modellmarginalen ryms fortfarande inte där; ett upplägg kan vara ett bättre val.';
    if(map)suggestionMarker=L.circleMarker(ll(advice.candidate),{radius:9,color:'#658f49',weight:2,fillColor:'#d8ee94',fillOpacity:.8}).addTo(map).bindTooltip('Rymligare landningsyta',{direction:'top'});
    $('choose-safe-landing').hidden=false;
  }
  $('landing-message').textContent=message;
}
$('choose-safe-landing').addEventListener('click',()=>{
  const point=state.safetyCandidate;if(!point)return;
  state.safeLanding=state.target={lat:point.lat,lon:point.lon};
  if(landingMarker)map.removeLayer(landingMarker);
  if(map)landingMarker=L.circleMarker(ll(state.target),{radius:7,color:'#658f49',fillColor:'#d8ee94',fillOpacity:1}).addTo(map).bindTooltip('Vald landningsyta',{direction:'top'});
  pointsChanged();calculate();
});
async function calculate() {
  clearTimeout(autoCalculationTimer);
  $('calculation-error').hidden = true;
  let payload, shotContext;
  try {
    const manual = $('use-manual').checked;
    const laser = $('use-rangefinder').checked, slope = laser && $('rangefinder-type').value === 'slope';
    if (!laser && !manual && (!state.ball || !state.target)) throw new Error('Välj boll och mål på kartan eller använd manuellt avstånd.');
    if (state.weather && Date.now() - state.weather.fetchedAt > 30 * 60000) throw new Error('Vädret är äldre än 30 minuter. Hämta nytt väder eller justera till manuella värden.');
    if (state.weather && state.ball && geoDistance(state.ball, state.weather.point) > 500) throw new Error('Bollens position har ändrats. Hämta nytt väder för den nya platsen eller använd manuella vädervärden.');
    const measured = laser ? num('rangefinder-distance') : null;
    const elevation = slope ? 0 : num('elevation');
    if (laser && !slope && Math.abs(elevation) >= measured) throw new Error('Höjdskillnaden måste vara mindre än kikarens uppmätta avstånd.');
    const mapOffset = state.safeLanding && state.ball && state.flag ? geoDistance(state.ball,state.target)-geoDistance(state.ball,state.flag) : 0;
    const distance = laser ? (slope ? measured : Math.sqrt(measured * measured - elevation * elevation))+mapOffset : manual ? num('distance') : null;
    const bearing = laser ? state.ball && state.target ? geoBearing(state.ball, state.target) : num('bearing') : manual ? num('bearing') : null;
    shotContext = { laser, slope, measured, mapOffset, safeLanding:Boolean(state.safeLanding), course: nationalMetadata.courses.find(course => course.id === state.course).name, hole: Number($('hole').value) };
    payload = { ball: state.ball, target: state.target, distance, bearing, elevationChange: elevation, lie: state.lie, trajectory: $('trajectory').value, wetBall: $('wet').checked,
      weather: { temperature: num('temperature'), humidity: num('humidity'), pressure: num('pressure'), windSpeed: num('wind'), windFrom: num('wind-from'), gusts: num('gusts') }, flightTime:$('flight-time').value.trim()===''?null:num('flight-time') };
  } catch (e) { $('calculation-error').textContent = e.message; $('calculation-error').hidden = false; return; }
  const id = ++calculationRequest; $('calculate').disabled = true;
  try {
    const result = await api('/api/shot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (id !== calculationRequest) return;
    $('plays-like').textContent = meters(result.playsLike); $('actual-distance').textContent = meters(shotContext.laser ? shotContext.measured : result.distance);
    $('result-target').textContent = shotContext.safeLanding ? 'Spela mot vald landningsyta som' : 'Spela mot flaggan som';
    $('distance-source').textContent = shotContext.laser ? shotContext.slope ? ' m från kikaren · slope ingår' : ' m till flaggan · uppmätt med kikare' : ' m till valt mål';
    $('result-context').textContent = `${shotContext.course} · hål ${shotContext.hole}`+(shotContext.safeLanding ? ` · landningsytan uppskattas ${shotContext.mapOffset>=0?'+':''}${f(shotContext.mapOffset)} m i längd från ${shotContext.laser?'den mätta ':''}flaggan`:'');
    const difference = meters(result.playsLike - result.distance);
    $('difference').textContent = (difference > 0 ? '+' : '') + difference + ' m justering';
    $('result-range').textContent = `${meters(result.rangeLow)}–${meters(result.rangeHigh)} m`;
    $('adjustments').replaceChildren();
    result.adjustments.forEach(adjustment => {
      const row = document.createElement('div'); row.className = 'adjustment';
      const label = document.createElement('button'); label.textContent = adjustment.label + (shotContext.slope && adjustment.label === 'Höjd' ? ' (ingår)' : '') + ' ⓘ'; label.addEventListener('click', () => notify(shotContext.slope && adjustment.label === 'Höjd' ? 'Höjdjusteringen ingår i kikarens slope-avstånd och läggs inte på igen.' : adjustment.explanation));
      const value = document.createElement('strong'); value.textContent = (adjustment.meters > 0 ? '+' : '') + f(adjustment.meters) + ' m';
      row.append(label, value); $('adjustments').append(row);
    });
    $('crosswind').textContent = Math.abs(result.crosswind) < .5 ? 'Ingen betydande sidvind i slagriktningen.' : `Sidvind ${f(Math.abs(result.crosswind))} m/s från ${result.crosswind > 0 ? 'höger' : 'vänster'} · anpassa sikte efter bollbana.`;
    showLateralAndLanding(result);
    const list = document.createElement('ul');
    result.warnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; list.append(item); });
    if (!state.weather) { const item = document.createElement('li'); item.textContent = 'Beräknat från manuella vädervärden, inte hämtat lokalt väder.'; list.append(item); }
    if (shotContext.laser) { const item = document.createElement('li'); item.textContent = shotContext.slope ? 'Utgår från kikarens höjdkorrigerade spelavstånd. Vind, luft och bolläge justeras separat.' : 'Utgår från ditt uppmätta avstånd till flaggan. Riktning, höjd och slagets variation behöver fortfarande stämma.'; list.append(item); }
    if(shotContext.safeLanding) {const item=document.createElement('li');item.textContent='Landningsytans avstånd är uppskattat från kartan, med kikaravståndet som referens om det används. Höjden antas vara samma som vid flaggan; kontrollera den.';list.append(item);}
    $('warnings').replaceChildren(list); $('result-empty').hidden = true; $('result').hidden = false;
    $('quick-distance').textContent = meters(result.playsLike);
    const adjustments = result.adjustments.filter(a=>Math.abs(a.meters)>=.5).sort((a,b)=>Math.abs(b.meters)-Math.abs(a.meters)).slice(0,2);
    $('quick-reason').textContent = `${meters(result.distance)} m till målet` + (adjustments.length ? ' · '+adjustments.map(a=>`${a.label==='Vind'?(result.headwind>=0?'Motvind':'Medvind'):a.label==='Höjd'?(Number($('elevation').value)>=0?'Uppför':'Nedför'):a.label} ${a.meters>0?'+':''}${meters(a.meters)} m`).join(' · ') : ' · ingen större justering');
    $('quick-weather').textContent = state.weather ? 'Hämtat väder' : 'Manuellt väder · ändra i Options';
    $('quick-aim').textContent = Math.abs(result.aimOffset)>=.5 ? `Sikta ${f(Math.abs(result.aimOffset))} m åt ${result.aimOffset>0?'höger':'vänster'}` : '';
    $('quick-empty').hidden = true; $('quick-result').hidden = false;
  } catch (e) { if (id === calculationRequest) { $('calculation-error').textContent = e.message; $('calculation-error').hidden = false; } }
  finally { $('calculate').disabled = false; }
}
$('satellite').addEventListener('click', () => changeMap(true)); $('street').addEventListener('click', () => changeMap(false));
$('reset-map').addEventListener('click', () => {
  clearShot();
});
document.querySelectorAll('[data-lie]').forEach(button => button.addEventListener('click', () => {
  state.lie = button.dataset.lie;
  document.querySelectorAll('[data-lie]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
  $('lie-help').textContent = { fairway: 'Ren kontakt från kortklippt gräs.', rough: 'Gräs bakom bollen kan minska carry. Stor variation.', flyer: 'Lite gräs mellan boll och klubba kan ge mindre spinn och extra längd. Kan inte avgöras av GPS.', sand: 'Fairwaybunker: rådet är osäkert och förutsätter bollträff först. Gäller inte ett greenbunkerslag.' }[state.lie];
  invalidate(); scheduleCalculation();
}));
document.querySelectorAll('[data-course]').forEach(button => button.addEventListener('click', () => {
  state.course = button.dataset.course;
  document.querySelectorAll('[data-course]').forEach(b => { const selected = b.dataset.course === state.course; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
  $('hole').value = '1'; selectCourseMetadata(); drawCourse(false); invalidate();
}));
$('start-round').addEventListener('click', () => startRound()); $('resume-round').addEventListener('click', () => startRound(true));
$('setup-tee').addEventListener('change', () => { $('tee').value = $('setup-tee').value; showHoleInfo(); });
$('previous-hole').addEventListener('click', () => changeHole(Number($('hole').value) - 1));
$('next-hole').addEventListener('click', () => changeHole(Number($('hole').value) + 1));
$('change-course').addEventListener('click', async () => { state.roundStarted = false; document.body.classList.remove('playing'); $('shot-options').close(); await setPositionMode('manual', false); clearShot(); $('round-workspace').hidden = true; $('round-header').hidden = true; $('round-setup').hidden = false; $('round-setup').scrollIntoView(); });
$('hole').addEventListener('change', () => changeHole(Number($('hole').value))); $('tee').addEventListener('change', showHoleInfo);
$('use-rangefinder').addEventListener('change', () => { syncManual(); invalidate(); scheduleCalculation(); });
$('rangefinder-type').addEventListener('change', () => { syncManual(); invalidate(); scheduleCalculation(); });
$('rangefinder-distance').addEventListener('input', () => { state.rangefinderBall = state.ball ? { ...state.ball } : null; $('rangefinder-status').textContent = 'Mätning för detta inspel. Mät igen om du flyttar dig eller byter mål.'; invalidate(); scheduleCalculation(); });
['distance', 'bearing', 'elevation', 'trajectory', 'wet','flight-time'].forEach(id => $(id).addEventListener('input', () => { if (id === 'elevation') { elevationRequest++; $('elevation-status').textContent = 'Manuellt värde.'; } invalidate(); scheduleCalculation(); }));
['temperature', 'humidity', 'pressure', 'wind', 'wind-from', 'gusts'].forEach(id => $(id).addEventListener('input', () => { weatherRequest++; state.weather = null; $('forecast').hidden = true; $('weather-title').textContent = 'Dina förhållanden'; updateWeatherStatus(); weatherVisuals(); invalidate(); scheduleCalculation(); }));
$('use-manual').addEventListener('change', () => { syncManual(); invalidate(); scheduleCalculation(); });
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
$('shot-options-open').addEventListener('click', () => $('shot-options').showModal());
$('result-details').addEventListener('click', () => $('shot-options').showModal());
$('shot-options-close').addEventListener('click', () => { $('shot-options').close(); scheduleCalculation(); });
$('show-area-map').addEventListener('click', () => { areaMapAllowed = true; changeMap(false); map.invalidateSize(); map.setView([55.5690857,13.1887799],15); });
setupMap(); syncManual(); weatherVisuals(); loadMetadata();
setInterval(updateWeatherStatus, 60000);
document.addEventListener('visibilitychange', () => { if (document.hidden && state.watchId !== null) setPositionMode('manual', false).catch(e => notify(e.message)); });
// Course retrieval is explicit: no hidden GPS permissions or fabricated demo holes.
