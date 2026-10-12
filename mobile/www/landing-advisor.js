'use strict';
// GPS-aligned geometry only. Advice is a heuristic buffer, never a success probability.
window.LandingAdvisor = (() => {
  const R = 6371000;
  function contains(ring, point) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
    }
    return inside;
  }
  function segmentDistance(point, a, b) {
    const dx = b[0]-a[0], dy = b[1]-a[1], denominator = dx*dx+dy*dy;
    const t = denominator ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/denominator)) : 0;
    return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
  }
  function boundaryDistance(ring, point) {
    let distance = Infinity;
    for (let i=1;i<ring.length;i++) distance=Math.min(distance,segmentDistance(point,ring[i-1],ring[i]));
    return distance;
  }
  function analyze(flag, features, result, gpsAccuracy = 0) {
    const scale = Math.cos(flag.lat*Math.PI/180), project = p => [(p[0]-flag.lon)*Math.PI/180*R*scale,(p[1]-flag.lat)*Math.PI/180*R];
    const unproject = p => ({lat:flag.lat+p[1]/R*180/Math.PI,lon:flag.lon+p[0]/(R*scale)*180/Math.PI});
    const origin = [0,0];
    const polygons = features.filter(f=>f.geometry.type==='Polygon').map(f=>({feature:f,rings:f.geometry.coordinates.map(ring=>ring.map(project))}));
    const inside = (polygon,p) => contains(polygon.rings[0],p) && !polygon.rings.slice(1).some(ring=>contains(ring,p));
    const green = polygons.find(p=>p.feature.properties.tags.golf==='green' && inside(p,origin));
    if (!green) return { available:false, message:'Sätt flaggan på en kartlagd green för att bedöma bunker- och vattenrisk kring landningen.' };
    const side = Math.max(result.lateralHigh-result.lateralDrift,result.lateralDrift-result.lateralLow);
    const carry = Math.max(result.rangeHigh-result.playsLike,result.playsLike-result.rangeLow);
    const margin = Math.max(4,side,carry)+(Number.isFinite(gpsAccuracy)?Math.max(0,gpsAccuracy):0);
    const hazards = polygons.filter(p=>['bunker','water_hazard','lateral_water_hazard'].includes(p.feature.properties.tags.golf) || p.feature.properties.tags.natural==='water')
      .map(p=>({...p,kind:p.feature.properties.tags.golf==='bunker'?'bunker':'vatten'}))
      .filter(p=>inside(p,origin)||boundaryDistance(p.rings[0],origin)<150+margin);
    const hazardDistance = (hazard,p) => inside(hazard,p)?0:boundaryDistance(hazard.rings[0],p);
    const nearest = hazards.map(h=>({kind:h.kind,distance:hazardDistance(h,origin)})).sort((a,b)=>a.distance-b.distance)[0];
    const greenClearance = p => Math.min(...green.rings.map(ring=>boundaryDistance(ring,p)));
    const clearance = p => Math.min(greenClearance(p),...hazards.map(h=>hazardDistance(h,p)));
    const flagClearance = clearance(origin);
    if (flagClearance >= margin) return { available:true,margin,nearest,message:'Flaggan har utrymme för modellens marginal i de kartlagda formerna. Det garanterar inte ett riskfritt slag.',candidate:null };
    const ring = green.rings[0], xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
    let best;
    const step = Math.max(3,(Math.max(...xs)-Math.min(...xs))/25,(Math.max(...ys)-Math.min(...ys))/25);
    for(let x=Math.min(...xs);x<=Math.max(...xs);x+=step) for(let y=Math.min(...ys);y<=Math.max(...ys);y+=step) {
      const p=[x,y]; if(!inside(green,p)) continue;
      const room=clearance(p), offset=Math.hypot(x,y);
      const score=room-offset*.15;
      if(!best || score>best.score) best={point:p,room,offset,score};
    }
    const candidate = best && best.room > flagClearance+2 ? { ...unproject(best.point),clearance:best.room,flagOffset:best.offset,fullMargin:best.room>=margin } : null;
    return {available:true,margin,nearest,candidate,message:nearest && nearest.distance<margin ? `Flaggan ligger cirka ${Math.round(nearest.distance)} m från ${nearest.kind}. Slagets marginal kan nå riskområdet.` : 'Flaggan ligger nära greenkanten i förhållande till slagets marginal.'};
  }
  return { analyze };
})();
