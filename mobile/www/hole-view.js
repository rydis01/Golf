'use strict';
// Geometry stays in GPS coordinates. Nearest holdline is a display heuristic,
// not an official assignment of unnumbered bunkers/fairways to a hole.
window.HoleView = (() => {
  function select(features, course, number) {
    const lines = features.filter(f => f.properties.course === course && f.properties.tags.golf === 'hole' && f.geometry.type === 'LineString');
    const line = lines.find(f => String(f.properties.tags.ref) === String(number));
    if (!line) return { line: null, features: [] };
    const origin = line.geometry.coordinates[0];
    const scale = Math.cos(origin[1] * Math.PI / 180);
    const project = p => [(p[0]-origin[0])*111195*scale, (p[1]-origin[1])*111195];
    const paths = lines.map(f => ({ feature: f, points: f.geometry.coordinates.map(project) }));
    const distance = (p, path) => {
      let best = Infinity;
      for (let i=1; i<path.length; i++) {
        const a=path[i-1], b=path[i], dx=b[0]-a[0], dy=b[1]-a[1];
        const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
        best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));
      }
      return best;
    };
    const selected = features.filter(f => {
      if (f.geometry.type !== 'Polygon') return false;
      const tags=f.properties.tags;
      if (!['fairway','green','tee','bunker','water_hazard','lateral_water_hazard'].includes(tags.golf) && tags.natural !== 'water') return false;
      if (f.properties.course && !['unassigned',course].includes(f.properties.course)) return false;
      const ring=f.geometry.coordinates[0].slice(0,-1).map(project);
      if (!ring.length) return false;
      const center=ring.reduce((sum,p)=>[sum[0]+p[0]/ring.length,sum[1]+p[1]/ring.length],[0,0]);
      const endpoints=line.geometry.coordinates.map(project);
      if (tags.golf==='green' && Math.hypot(center[0]-endpoints.at(-1)[0],center[1]-endpoints.at(-1)[1])>45) return false;
      if (tags.golf==='tee' && Math.hypot(center[0]-endpoints[0][0],center[1]-endpoints[0][1])>120) return false;
      const nearest=paths.map(path=>({path,distance:distance(center,path.points)})).sort((a,b)=>a.distance-b.distance)[0];
      return nearest.path.feature === line && nearest.distance < 65;
    });
    return { line, features: [...selected,line] };
  }
  return { select };
})();
