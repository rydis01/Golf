'use strict';
// Browser-only version of wind-v3, verified against the Java implementation.
// scripts/check-prototype-model.mjs compares this prototype with the running Java API.
window.GolfPrototype = (() => {
  const round = n => Math.round(n * 10) / 10;
  const density = (temp, humidity, pressure) => {
    const vapor = humidity / 100 * 610.94 * Math.exp(17.625 * temp / (temp + 243.04));
    return (pressure * 100 - vapor) / (287.05 * (temp + 273.15)) + vapor / (461.495 * (temp + 273.15));
  };
  const normalize = angle => (angle % 360 + 360) % 360;
  const range = (value, min, max, label) => {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} måste ligga mellan ${min} och ${max}.`);
  };
  const normalTime = carry => Math.sqrt(2 * carry / 9.80665);
  function levelCarry(distance, height, descent) {
    const tangent = Math.tan(descent * Math.PI / 180);
    if (height >= distance * tangent / 2) throw new Error('Målet ligger för högt för den valda bollbanan. Kontrollera höjd eller välj en högre bollbana.');
    return distance * distance / (distance - height / tangent);
  }
  function directed(distance,bearing,height,descent,flight,lieGain,airGain,airDensity,weather,measuredTime,delta) {
    const along=distance*Math.cos(delta), level=levelCarry(along,height,descent);
    const angle=(weather.windFrom-bearing)*Math.PI/180-delta;
    const head=weather.windSpeed*Math.cos(angle),cross=weather.windSpeed*Math.sin(angle);
    let reference=level/airGain/lieGain,converged=false;
    for(let i=0;i<100;i++) {
      const exposure=measuredTime==null?flight:measuredTime/(normalTime(reference)*along/level);
      const gain=Math.exp(-head*(head>=0?.012:.008)*exposure);
      const next=level/(airGain*lieGain*gain);
      if(!Number.isFinite(next)||next<1||next>2000)throw new Error('Förhållandena ligger utanför modellens användbara område.');
      if(Math.abs(next-reference)<.000001){reference=next;converged=true;break;}
      reference=(reference+next)/2;
    }
    if(!converged)throw new Error('Modellen kunde inte hitta ett stabilt spelavstånd.');
    const estimatedTime=normalTime(reference)*flight*along/level;
    if(measuredTime==null&&estimatedTime>15)throw new Error('Bollbanans uppskattade flygtid överstiger modellens gräns. Välj ett annat slag eller en lägre bollbana.');
    const time=measuredTime??Math.max(1,estimatedTime);
    const airspeed=Math.max(8,Math.hypot(along/time+head,cross));
    const tau=2*.04593/(airDensity*.25*(Math.PI*.04267*.04267/4)*airspeed);
    const drift=-cross*(time+tau*Math.expm1(-time/tau));
    return {reference,time,drift,delta};
  }
  function solve(distance,bearing,height,descent,flight,lieGain,airGain,airDensity,weather,measuredTime) {
    let delta=0;
    for(let i=0;i<100;i++){
      const p=directed(distance,bearing,height,descent,flight,lieGain,airGain,airDensity,weather,measuredTime,delta);
      if(Math.abs(p.drift)>=distance*.5)throw new Error('Sidodriften är för stor för ett tillförlitligt siktråd. Välj ett annat slag eller en lägre bollbana.');
      const next=Math.asin(-p.drift/distance);
      if(Math.abs(next-delta)<.00000001)return p;
      delta=(delta+next)/2;
    }
    throw new Error('Modellen kunde inte hitta ett stabilt siktråd.');
  }
  function point(p) {range(p.lat,-90,90,'latitud');range(p.lon,-180,180,'longitud');}
  function geoDistance(a,b) {
    const rad=n=>n*Math.PI/180,dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon);
    const h=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;
    return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
  }
  function geoBearing(a,b) {
    const rad=n=>n*Math.PI/180,d=rad(b.lon-a.lon),la=rad(a.lat),lb=rad(b.lat);
    return normalize(Math.atan2(Math.sin(d)*Math.cos(lb),Math.cos(la)*Math.sin(lb)-Math.sin(la)*Math.cos(lb)*Math.cos(d))*180/Math.PI);
  }
  function calculate(shot) {
    if(!shot?.weather)throw new Error('Väder krävs.');
    const w=shot.weather;
    for(const [key,min,max,label] of [['temperature',-60,60,'temperatur'],['humidity',0,100,'luftfuktighet'],['pressure',500,1100,'lufttryck'],['windSpeed',0,60,'vindstyrka'],['windFrom',0,360,'vindriktning'],['gusts',0,80,'vindbyar']])range(w[key],min,max,label);
    if(w.gusts<w.windSpeed)throw new Error('Vindbyar måste vara minst medelvinden.');
    if(shot.ball!=null)point(shot.ball);if(shot.target!=null)point(shot.target);
    let distance,bearing;
    if(shot.distance!=null) {
      distance=shot.distance;range(distance,10,350,'carryavstånd');
      if(shot.bearing==null)throw new Error('Slagriktning krävs för manuellt avstånd.');
      range(shot.bearing,0,360,'slagriktning');bearing=shot.bearing%360;
    } else {
      if(!shot.ball||!shot.target)throw new Error('Välj boll och mål på kartan.');
      distance=geoDistance(shot.ball,shot.target);bearing=geoBearing(shot.ball,shot.target);range(distance,10,350,'carryavstånd');
    }
    range(shot.elevationChange,-100,100,'höjdskillnad');
    if(shot.flightTime!=null)range(shot.flightTime,1,15,'flygtid');
    if(shot.descentAngle!=null)range(shot.descentAngle,15,75,'landningsvinkel');
    const trajectory=shot.trajectory??'normal',estimatedDescent={low:35,normal:45,high:55}[trajectory];
    if(!estimatedDescent)throw new Error('Ogiltig bollbana.');
    const descent=shot.descentAngle??estimatedDescent,flight=Math.sqrt(Math.tan(descent*Math.PI/180));
    const lie=shot.lie??'fairway',lieGain={fairway:1,tee:1,rough:.92,flyer:1.07,sand:.80}[lie];
    if(!lieGain)throw new Error('Ogiltigt bolläge.');
    if(w.windSpeed>15)throw new Error('Medelvind över 15 m/s ligger utanför modellen. Ge inget exakt klubbval i dessa förhållanden.');
    const airDensity=density(w.temperature,w.humidity,w.pressure),airGain=(density(20,50,1013.25)/airDensity)**.25;
    const args=[distance,bearing,shot.elevationChange,descent,flight,lieGain,airGain,airDensity,w,shot.flightTime];
    const straight=directed(...args,0),aimed=solve(...args),level=levelCarry(distance,shot.elevationChange,descent);
    const u=shot.uncertainty;
    const distanceError=u?.distance??3,heightError=u?.elevation??1,directionError=u?.windDirection??15;
    range(distanceError,0,100,'avståndsmarginal');range(heightError,0,30,'höjdmarginal');range(directionError,0,90,'vindriktningsmarginal');
    let low=aimed.reference,high=aimed.reference,driftError=0,limited=false;
    const gustExtra=w.gusts-w.windSpeed;
    const directions=[w.windFrom-directionError,w.windFrom,w.windFrom+directionError];
    for(const cardinal of [bearing,bearing+90,bearing+180,bearing+270])if(Math.abs(normalize(cardinal-w.windFrom+180)-180)<=directionError)directions.push(normalize(cardinal));
    for(const speed of [Math.max(0,w.windSpeed-gustExtra),w.windSpeed,w.gusts])for(const direction of directions) {
      const scenario={...w,windSpeed:speed,windFrom:normalize(direction),gusts:Math.max(speed,w.gusts)};
      for(const height of [shot.elevationChange-heightError,shot.elevationChange,shot.elevationChange+heightError])try{
        if(speed>15)throw new Error('scenario');
        const p=solve(distance,bearing,height,descent,flight,lieGain,airGain,airDensity,scenario,shot.flightTime);
        low=Math.min(low,p.reference);high=Math.max(high,p.reference);
        const direct=directed(distance,bearing,height,descent,flight,lieGain,airGain,airDensity,scenario,shot.flightTime,0);
        driftError=Math.max(driftError,Math.abs(direct.drift-straight.drift));
      }catch{limited=true;}
    }
    const derivative=(solve(distance+.05,...args.slice(1)).reference-solve(distance-.05,...args.slice(1)).reference)/.1;
    if(!Number.isFinite(derivative)||derivative<=.05)limited=true;
    const baseSpread=aimed.reference*(.035+Math.abs(1-lieGain)*.75+(shot.wetBall ? .04 : 0));
    const carryMargin=(Math.max(aimed.reference-low,high-aimed.reference)+baseSpread)/Math.max(.05,derivative);
    const sideMargin=Math.max(3,distance*.04)+Math.abs(straight.drift)*.30+driftError+distance*(Math.abs(1-lieGain)*.5+(shot.wetBall ? .04 : 0));
    const warnings=['Modellbaserat carryråd, inte uppmätt bollflykt. Vindkoefficienter, spinn och egen skruv behöver valideras på banan; rull ingår inte.'];
    if(lieGain!==1)warnings.push('Bolläget ger stor osäkerhet. Gräs, kontakt och flyer kan inte avgöras från GPS.');
    if(shot.wetBall)warnings.push('Våt boll eller vått gräs kan ändra kontakt och spinn. Ingen fast meterjustering används; marginalerna ökas.');
    if(w.windSpeed>=8)warnings.push('Stark vind: modellens antaganden om konstant vind och bollbana blir mindre tillförlitliga.');
    const angle=(w.windFrom-bearing)*Math.PI/180;
    if(Math.abs(w.windSpeed*Math.sin(angle))>2)warnings.push('Sidovind och sikte beräknas för ett rakt slag utan egen skruv. Vind längs bollbanan kan avvika.');
    if(shot.descentAngle==null)warnings.push('Landningsvinkeln är uppskattad från låg/normal/hög bollbana. En uppmätt vinkel kan anges i Options.');
    if(aimed.reference>350)warnings.push('Spelavståndet överstiger 350 m. Överväg ett upplägg i stället för ett slag till målet.');
    if(distanceError>distance*.2){limited=true;warnings.push('Avståndsmarginalen är stor i förhållande till slaget. Mät med kikare eller placera bollen mer exakt.');}
    if(limited)warnings.push('Alla osäkerhetsscenarier ryms inte i modellen. Intervallet är ofullständigt; kontrollera höjd, vind och mål innan klubbval.');
    const measurement=Math.abs(derivative)*distanceError;
    return {
      distance:round(distance),bearing:round(bearing),playsLike:round(aimed.reference),rangeLow:round(Math.max(1,low-baseSpread-measurement)),rangeHigh:round(high+baseSpread+measurement),
      headwind:round(w.windSpeed*Math.cos(angle)),crosswind:round(w.windSpeed*Math.sin(angle)),airDensity:Math.round(airDensity*1000)/1000,
      flightTime:round(aimed.time),flightTimeMeasured:shot.flightTime!=null,lateralDrift:round(straight.drift),lateralLow:round(straight.drift-sideMargin),lateralHigh:round(straight.drift+sideMargin),
      aimOffset:round(distance*Math.tan(aimed.delta)),aimBearing:round(normalize(bearing+aimed.delta*180/Math.PI)),descentAngle:round(descent),carryMargin:round(carryMargin),lateralMargin:round(sideMargin),distanceUncertainty:round(distanceError),uncertaintyLimited:limited,
      adjustments:[
        {label:'Vind',meters:round(straight.reference-level/airGain/lieGain),explanation:'Vindförlusten räknas baklänges till carry i lugnt väder. Angiven flygtid påverkar både längd och sidodrift.'},
        {label:'Höjd',meters:round(level-distance),explanation:'Höjd räknas från en förenklad böjd bollbana och dess landningsvinkel, inte ett fast antal meter per höjdmeter.'},
        {label:'Luft',meters:round(level/airGain-level),explanation:'Luftdensitet från temperatur, fuktighet och lokalt lufttryck. Fuktig luft är något lättare. Kall boll och spinn är inte uppmätta.'},
        {label:'Bolläge',meters:round(level/airGain/lieGain-level/airGain),explanation:'En carryförlust måste inverteras: 20 % förlust kräver 25 % extra referenscarry. Ruff, flyer och sand är fortfarande uppskattningar.'},
        {label:'Sikte',meters:round(aimed.reference-straight.reference),explanation:'Siktet mot sidvinden ändrar också mot-/medvindskomponenten. Längd, flygtid och sikte löses tillsammans.'}
      ],warnings
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
