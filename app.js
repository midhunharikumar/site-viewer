// ---------- timeline helpers ----------
const Q=["Q1","Q2","Q3","Q4"];
function tLabel(idx){const yr=2019+Math.floor(idx/4);const q=Q[idx%4];return yr+" "+q;}
function combined(loc){return loc.series.concat(loc.proj);} // 41 points, idx0..40
const ACTUAL_MAX=29; // idx<=28 is actual (2026 Q2), >28 projected
function priceAt(loc,idx){const c=combined(loc);return c[Math.min(idx,c.length-1)].price;}
function fmt(n){return "₹"+n.toLocaleString('en-IN');}
function fmtK(n){return n>=1000?"₹"+(n/1000).toFixed(1)+"k":"₹"+n;}

// ---------- color scale ----------
const STOPS=[[3500,'#1a9850'],[6000,'#91cf60'],[8000,'#d9ef8b'],[10000,'#fee08b'],[13000,'#fc8d59'],[17000,'#d73027'],[27500,'#7a0177']];
function lerp(a,b,t){return a+(b-a)*t;}
function hex2rgb(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function priceColor(p){
  if(p<=STOPS[0][0])return STOPS[0][1];
  if(p>=STOPS[STOPS.length-1][0])return STOPS[STOPS.length-1][1];
  for(let i=0;i<STOPS.length-1;i++){
    if(p>=STOPS[i][0]&&p<=STOPS[i+1][0]){
      const t=(p-STOPS[i][0])/(STOPS[i+1][0]-STOPS[i][0]);
      const a=hex2rgb(STOPS[i][1]),b=hex2rgb(STOPS[i+1][1]);
      return `rgb(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))})`;
    }
  }
  return '#888';
}
const CAGR_STOPS=[[5,'#91cf60'],[9,'#fee08b'],[13,'#fc8d59'],[18,'#d73027']];
function cagrColor(c){if(c<=5)return '#1a9850';if(c>=18)return '#7a0177';for(let i=0;i<CAGR_STOPS.length-1;i++){if(c>=CAGR_STOPS[i][0]&&c<=CAGR_STOPS[i+1][0]){const t=(c-CAGR_STOPS[i][0])/(CAGR_STOPS[i+1][0]-CAGR_STOPS[i][0]);const a=hex2rgb(CAGR_STOPS[i][1]),b=hex2rgb(CAGR_STOPS[i+1][1]);return `rgb(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))})`;}}return '#888';}
const YIELD_STOPS=[[2.5,'#d73027'],[3.2,'#fee08b'],[4,'#91cf60'],[5,'#1a9850']];
function tierGood(v){return ['#d73027','#fc8d59','#fee08b','#a6d96a','#1a9850'][Math.max(0,Math.min(4,v-1))];}
function tierRisk(v){return ['#1a9850','#a6d96a','#fee08b','#fc8d59','#d73027'][Math.max(0,Math.min(4,v-1))];}
function jetColor(t){t=Math.max(0,Math.min(1,t));const r=Math.max(0,Math.min(1,1.5-Math.abs(4*t-3))),g=Math.max(0,Math.min(1,1.5-Math.abs(4*t-2))),b=Math.max(0,Math.min(1,1.5-Math.abs(4*t-1)));return 'rgb('+(r*255|0)+','+(g*255|0)+','+(b*255|0)+')';}
function jetGradient(){let s=[];for(let i=0;i<=10;i++)s.push(jetColor(i/10));return 'linear-gradient(90deg,'+s.join(',')+')';}
const CAUV_COLOR={connected:'#22c55e',stageV:'#fde047',delayed:'#fb923c',none:'#ef4444'};const CAUV_RANK={connected:4,stageV:3,delayed:2,none:1};const CAUV_SHORT={connected:'Piped',stageV:'Stage V',delayed:'Delayed',none:'None'};
function cauvOf(loc){return CAUVERY[loc.name].st;}
const PROJ_RANGE=(function(){let mn=1e9,mx=-1e9;DATA.localities.forEach(l=>{if(l.projCagr<mn)mn=l.projCagr;if(l.projCagr>mx)mx=l.projCagr;});return [mn,mx];})();
function jetNorm(v){return (v-PROJ_RANGE[0])/((PROJ_RANGE[1]-PROJ_RANGE[0])||1);}
function yieldColor(y){if(y<=2.5)return '#d73027';if(y>=5)return '#1a9850';for(let i=0;i<YIELD_STOPS.length-1;i++){if(y>=YIELD_STOPS[i][0]&&y<=YIELD_STOPS[i+1][0]){const t=(y-YIELD_STOPS[i][0])/(YIELD_STOPS[i+1][0]-YIELD_STOPS[i][0]);const a=hex2rgb(YIELD_STOPS[i][1]),b=hex2rgb(YIELD_STOPS[i+1][1]);return `rgb(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))})`;}}return '#888';}

// ---------- state ----------
let timeIdx=29, metric='price', zoneFilter='All', searchTxt='', selected=null, sortDir=-1;
const ZONES=['All','East','South','North','Central','West'];

// ---------- map ----------
const map=L.map('map',{zoomControl:true,attributionControl:true}).setView([12.9716,77.5946],11);
map.createPane('localityPane');map.getPane('localityPane').style.zIndex=500;
map.zoomControl.setPosition('bottomright');
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'© OpenStreetMap, © CARTO',subdomains:'abcd',maxZoom:19
}).addTo(map);
const markers={};
DATA.localities.forEach(loc=>{
  const m=L.circleMarker([loc.lat,loc.lng],{pane:'localityPane',radius:8,weight:1.4,color:'#0b0f14',fillOpacity:.92,fillColor:'#888'});
  m.on('click',()=>openDetail(loc.name));
  m.on('mouseover',()=>m.setStyle({weight:2.6,color:'#fff'}));
  m.on('mouseout',()=>m.setStyle({weight:1.4,color:'#0b0f14'}));
  m.addTo(map);
  markers[loc.name]=m;
});

function metricVal(loc){
  if(metric==='price')return priceAt(loc,timeIdx);
  if(metric==='cagr')return loc.cagr;
  if(metric==='pcagr')return loc.projCagr;
  if(metric==='sch'||metric==='saf'||metric==='wat')return LIVE[loc.name][metric];
  if(metric==='cauv')return CAUV_RANK[cauvOf(loc)];
  return loc.yield;
}
function metricColorVal(v){if(metric==='sch'||metric==='saf')return tierGood(Math.round(v));if(metric==='wat')return tierRisk(Math.round(v));if(metric==='cauv'){const r=Math.max(1,Math.min(4,Math.round(v))),mp={4:'connected',3:'stageV',2:'delayed',1:'none'};return CAUV_COLOR[mp[r]];}if(metric==='pcagr')return jetColor(jetNorm(v));return metric==='price'?priceColor(v):metric==='cagr'?cagrColor(v):yieldColor(v);}
function metricColor(loc){return metricColorVal(metricVal(loc));}
function metricRadius(loc){
  if(metric==='price'){const p=priceAt(loc,timeIdx);return 5+Math.min(11,(p-3000)/2400);}
  if(metric==='cagr'||metric==='pcagr'){const c=metricVal(loc);return 5+Math.min(11,c/2.2);}
  if(metric==='sch'||metric==='saf'||metric==='wat')return 5+metricVal(loc)*1.5;
  if(metric==='cauv')return 5+CAUV_RANK[cauvOf(loc)]*1.4;
  return 5+Math.min(11,(loc.yield-2)*3.2);
}
function visible(loc){
  if(zoneFilter!=='All'&&loc.zone!==zoneFilter)return false;
  if(searchTxt&&!loc.name.toLowerCase().includes(searchTxt))return false;
  return true;
}
function fmtMetric(loc){
  if(metric==='price')return fmt(priceAt(loc,timeIdx));
  if(metric==='cagr')return loc.cagr+"%";
  if(metric==='pcagr')return loc.projCagr+"%";
  if(metric==='sch'||metric==='saf'||metric==='wat')return metricVal(loc)+'/5';
  if(metric==='cauv')return CAUV_SHORT[cauvOf(loc)];
  return loc.yield+"%";
}
function refreshMap(){
  DATA.localities.forEach(loc=>{
    const m=markers[loc.name];
    if(!visible(loc)){m.setStyle({opacity:0,fillOpacity:0});m._path&&(m._path.style.pointerEvents='none');return;}
    m._path&&(m._path.style.pointerEvents='auto');
    const sel=selected===loc.name;
    m.setStyle({opacity:1,fillOpacity:heatmapOn?.10:.82,fillColor:metricColor(loc),radius:metricRadius(loc)+(sel?3:0),weight:sel?3:(heatmapOn?.5:1.2),color:sel?'#fff':(heatmapOn?'#e6edf3':'#0b0f14')});
    m.bindTooltip(`<b>${loc.name}</b><br>${fmtMetric(loc)} · ${loc.zone}`,{className:'pin',direction:'top',offset:[0,-4]});
  });
}

// ---------- legend ----------
function refreshLegend(){
  const t=document.getElementById('legendTitle'),g=document.getElementById('legendGrad'),l=document.getElementById('legendLbls');
  if(metric==='price'){t.textContent='Price ₹/sqft';g.style.background='linear-gradient(90deg,#1a9850,#91cf60,#d9ef8b,#fee08b,#fc8d59,#d73027,#7a0177)';l.innerHTML='<span>₹4k</span><span>₹10k</span><span>₹27k+</span>';}
  else if(metric==='cagr'){t.textContent='Hist. growth %/yr 19–26';g.style.background='linear-gradient(90deg,#1a9850,#91cf60,#fee08b,#fc8d59,#d73027,#7a0177)';l.innerHTML='<span>5%</span><span>11%</span><span>18%+</span>';}
  else if(metric==='pcagr'){t.textContent='Proj. growth %/yr 26–29 (jet)';g.style.background=jetGradient();const a=PROJ_RANGE[0],b=PROJ_RANGE[1];l.innerHTML='<span>'+a.toFixed(1)+'%</span><span>'+((a+b)/2).toFixed(1)+'%</span><span>'+b.toFixed(1)+'%</span>';}
  else if(metric==='yield'){t.textContent='Rental yield %';g.style.background='linear-gradient(90deg,#d73027,#fee08b,#91cf60,#1a9850)';l.innerHTML='<span>2.5%</span><span>3.5%</span><span>5%+</span>';}
  else if(metric==='sch'){t.textContent='Schools (1–5)';g.style.background='linear-gradient(90deg,#d73027,#fc8d59,#fee08b,#a6d96a,#1a9850)';l.innerHTML='<span>basic</span><span>good</span><span>excellent</span>';}
  else if(metric==='saf'){t.textContent='Relative safety (1–5)';g.style.background='linear-gradient(90deg,#d73027,#fc8d59,#fee08b,#a6d96a,#1a9850)';l.innerHTML='<span>lower</span><span></span><span>safest</span>';}
  else if(metric==='wat'){t.textContent='Water stress (1–5)';g.style.background='linear-gradient(90deg,#1a9850,#a6d96a,#fee08b,#fc8d59,#d73027)';l.innerHTML='<span>reliable</span><span></span><span>severe</span>';}
  else{t.textContent='Cauvery piped water';g.style.background='linear-gradient(90deg,#ef4444 0 25%,#fb923c 25% 50%,#fde047 50% 75%,#22c55e 75% 100%)';l.innerHTML='<span>None</span><span>Delayed</span><span>Stage V</span><span>Piped</span>';}
}

// ---------- list ----------
function refreshList(){
  const list=document.getElementById('list');
  let rows=DATA.localities.filter(visible);
  const keyOf=l=>metric==='yield'?l.yield:metric==='cagr'?l.cagr:metric==='pcagr'?l.projCagr:(metric==='sch'||metric==='saf'||metric==='wat')?LIVE[l.name][metric]:metric==='cauv'?CAUV_RANK[CAUVERY[l.name].st]:priceAt(l,timeIdx);
  rows.sort((a,b)=>(keyOf(a)-keyOf(b))*sortDir);
  document.getElementById('listCount').textContent=rows.length+" localities";
  const ML={price:'price',cagr:'hist. growth',pcagr:'proj. growth',yield:'yield',sch:'schools',saf:'safety',wat:'water risk',cauv:'Cauvery'};document.getElementById('sortLbl').textContent='sorted by '+(ML[metric]||metric)+(sortDir===-1?' ▾':' ▴');
  if(rows.length===0){list.innerHTML=emptyStateHtml(searchTxt);return;}
  list.innerHTML=rows.map(loc=>{
    const p=priceAt(loc,timeIdx);
    const chg=((p/loc.price2019-1)*100);
    const chgTxt=timeIdx===0?'':(chg>=0?'+':'')+chg.toFixed(0)+'% since ’19';
    const esc=loc.name.replace(/'/g,"\\'");
    return `<div class="item ${selected===loc.name?'sel':''}" onclick="openDetail('${esc}')">
      <div class="dot" style="background:${metricColor(loc)}"></div>
      <div style="min-width:0"><div class="nm">${loc.name}</div><div class="zn">${loc.zone} · ${loc.confidence} confidence</div></div>
      <div class="pr"><div class="p">${fmtMetric(loc)}</div>${metric==='price'?`<div class="c ${chg>=0?'up':'down'}">${chgTxt}</div>`:''}</div>
      <button class="pinbtn ${isPinned(loc.name)?'on':''}" title="Add to compare" onclick="event.stopPropagation();togglePin('${esc}')">⇄</button>
    </div>`;
  }).join('');
}

// ---------- KPIs ----------
function refreshKPI(){
  const vis=DATA.localities.filter(visible);
  document.getElementById('kpiCount').textContent=vis.length;
  document.getElementById('kpiNow').textContent=tLabel(timeIdx);
  const avg=vis.reduce((s,l)=>s+priceAt(l,timeIdx),0)/(vis.length||1);
  document.getElementById('kpiAvg').textContent=fmt(Math.round(avg));
  const ac=vis.reduce((s,l)=>s+l.cagr,0)/(vis.length||1);
  document.getElementById('kpiCagr').textContent=ac.toFixed(1)+"%";
}

// ---------- time bar ----------
function refreshTime(){
  document.getElementById('tNow').textContent=tLabel(timeIdx);
  const proj=timeIdx>ACTUAL_MAX;
  const b=document.getElementById('tBadge');
  b.textContent=proj?'projected':'actual';
  b.className='badge '+(proj?'projected':'actual');
}

// ---------- detail panel + chart ----------
let chart=null;
var isMobile=()=>window.matchMedia('(max-width:860px)').matches;
function toggleSidebar(open){
  const sb=document.getElementById('sidebar'),sc=document.getElementById('scrim');
  const willOpen=(open===undefined)?!sb.classList.contains('open'):open;
  sb.classList.toggle('open',willOpen);
  sc.classList.toggle('show',willOpen);
}
function openDetail(name){
  const loc=DATA.localities.find(l=>l.name===name);if(!loc)return;
  selected=name;
  if(isMobile())toggleSidebar(false);
  document.getElementById('detail').classList.add('open');
  document.getElementById('dName').textContent=loc.name;
  document.getElementById('dSub').textContent=`${loc.zone} Bengaluru · ${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`;
  const cur=loc.price2026, p19=loc.price2019, p29=loc.projPrice2029;
  const body=document.getElementById('dBody');
  body.innerHTML=`
    <div class="statgrid">
      <div class="stat"><div class="l">Current ₹/sqft (2026)</div><div class="v">${fmt(cur)}</div></div>
      <div class="stat"><div class="l">Proj. 2029 ₹/sqft</div><div class="v">${fmt(p29)} <span class="up" style="font-size:12px">+${(((p29/cur)-1)*100).toFixed(0)}%</span></div></div>
      <div class="stat"><div class="l">CAGR 2019–26</div><div class="v">${loc.cagr}%</div></div>
      <div class="stat"><div class="l">Proj. CAGR 26–29</div><div class="v">${loc.projCagr}%</div></div>
      <div class="stat"><div class="l">Rental yield</div><div class="v">${loc.yield}%</div></div>
      <div class="stat"><div class="l">Since 2019</div><div class="v up">+${(((cur/p19)-1)*100).toFixed(0)}%</div></div>
    </div>
    <div class="chartbox"><canvas id="chart" height="180"></canvas></div>
    ${alertCtaHtml(loc)}
    <div class="drivers">
      <span class="conf ${loc.confidence}">${loc.confidence} confidence</span> &nbsp;
      <span class="muted">infra boost +${loc.infraBoost}%/yr</span>
      <div style="margin-top:8px">${loc.drivers}</div>
    </div>
    ${livabilityHtml(loc)}
    ${nearbySchoolsHtml(loc.lat,loc.lng)}
    ${sunWindHtml(loc.lat,loc.lng)}
    ${metroSummaryHtml(loc)}
    <div class="muted">Solid line = interpolated actuals (2019–2026). Dashed = projection (2026–2029) from fading trend growth + locality infrastructure boost. A modeled index, not transaction-grade valuation.</div>
  `;
  const c=combined(loc);
  const labels=c.map((p,i)=>tLabel(i));
  const actualData=c.map((p,i)=>i<=ACTUAL_MAX?p.price:null);
  const projData=c.map((p,i)=>i>=ACTUAL_MAX?p.price:null);
  if(chart)chart.destroy();
  chart=new Chart(document.getElementById('chart'),{
    type:'line',
    data:{labels,datasets:[
      {label:'Actual',data:actualData,borderColor:'#4f9dff',backgroundColor:'rgba(79,157,255,.12)',fill:true,tension:.3,pointRadius:0,borderWidth:2.5},
      {label:'Projected',data:projData,borderColor:'#ffce7a',borderDash:[6,4],fill:false,tension:.3,pointRadius:0,borderWidth:2.5}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#8b97a7',boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:ctx=>ctx.parsed.y?ctx.dataset.label+': '+fmt(ctx.parsed.y):''}}},
      scales:{
        x:{ticks:{color:'#6b7787',maxTicksLimit:9,font:{size:10}},grid:{color:'#222b35'}},
        y:{ticks:{color:'#6b7787',font:{size:10},callback:v=>fmtK(v)},grid:{color:'#222b35'}}
      }}
  });
  refreshMap();refreshList();
  map.flyTo([loc.lat,loc.lng],13,{duration:.6});
  dismissCoach();syncDetailActions();updateHash();
}
function closeDetail(){document.getElementById('detail').classList.remove('open');selected=null;refreshMap();refreshList();updateHash();}

// ---------- controls wiring ----------
const zc=document.getElementById('zoneChips');
ZONES.forEach(z=>{const el=document.createElement('div');el.className='chip'+(z==='All'?' active':'');el.textContent=z;el.onclick=()=>{zoneFilter=z;[...zc.children].forEach(c=>c.classList.toggle('active',c.textContent===z));renderAll();};zc.appendChild(el);});
document.querySelectorAll('#metricSeg button,#livSeg button').forEach(b=>b.onclick=()=>{metric=b.dataset.m;document.querySelectorAll('#metricSeg button,#livSeg button').forEach(x=>x.classList.toggle('active',x===b));renderAll();updateHash();});
document.getElementById('search').oninput=e=>{searchTxt=e.target.value.toLowerCase().trim();renderAll();};
document.getElementById('sortLbl').onclick=()=>{sortDir=-sortDir;refreshList();};
document.getElementById('time').oninput=e=>{timeIdx=+e.target.value;renderAll();updateHash();};

// ---------- play/animate ----------
let playing=null;
document.getElementById('play').onclick=function(){
  if(playing){clearInterval(playing);playing=null;this.textContent='▶';return;}
  this.textContent='⏸';
  playing=setInterval(()=>{
    timeIdx=timeIdx>=43?0:timeIdx+1;
    document.getElementById('time').value=timeIdx;renderAll();
    if(timeIdx>=43){clearInterval(playing);playing=null;document.getElementById('play').textContent='▶';}
  },560);
};

// ---------- metro overlay ----------
map.createPane('metroLines');map.getPane('metroLines').style.zIndex=410;
map.createPane('metroStations');map.getPane('metroStations').style.zIndex=440;
let metroOn=true, metroFuture=true;
const metroLineLayers=[], metroStationLayers=[], metroP4=[];
function selYearF(){return 2019+timeIdx/4;}
function haversine(a,b,c,d){const R=6371,toR=x=>x*Math.PI/180;const dLat=toR(c-a),dLng=toR(d-b);const x=Math.sin(dLat/2)**2+Math.cos(toR(a))*Math.cos(toR(c))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function statusWord(s,line){const y=selYearF();if(s.yr<=y)return 'open ('+s.yr+')';if(line.status==='approved')return 'planned ~'+s.yr;return 'under construction (~'+s.yr+')';}
METRO.lines.forEach(line=>{
  const pts=line.stations.map(s=>[s.lat,s.lng]);
  const poly=L.polyline(pts,{pane:'metroLines',color:line.color,weight:4,opacity:.8});
  metroLineLayers.push({poly,line});
  line.stations.forEach(s=>{
    const mk=L.circleMarker([s.lat,s.lng],{pane:'metroStations',radius:3.6,weight:1.2,color:'#fff',fillColor:line.color,fillOpacity:.95});
    mk.bindTooltip('<b>'+s.n+'</b><br>'+line.short+' Line',{className:'pin',direction:'top',offset:[0,-3]});
    mk.on('click',e=>{L.DomEvent.stop(e);showStation(s,line);});
    metroStationLayers.push({mk,line,st:s.st,yr:s.yr});
  });
});
METRO.phase4.forEach(pp=>{const poly=L.polyline([pp.from,pp.to],{pane:'metroLines',color:pp.color,weight:2,opacity:.35,dashArray:'2 7'});poly.bindTooltip(pp.name,{className:'pin'});metroP4.push(poly);});
function showStation(s,line){
  document.getElementById('detail').classList.add('open');
  document.getElementById('dName').textContent=s.n;
  document.getElementById('dSub').textContent='🚇 '+line.name;
  selected=null;
  document.getElementById('dBody').innerHTML=
   '<div class="statgrid">'+
   '<div class="stat"><div class="l">Line</div><div class="v" style="color:'+line.color+'">'+line.short+'</div></div>'+
   '<div class="stat"><div class="l">Status</div><div class="v" style="font-size:14px">'+statusWord(s,line)+'</div></div>'+
   '<div class="stat"><div class="l">Announced</div><div class="v" style="font-size:13px">'+line.announced+'</div></div>'+
   '<div class="stat"><div class="l">Line completion</div><div class="v" style="font-size:13px">'+line.completion+'</div></div>'+
   '</div>'+
   '<div class="drivers">'+line.note+'</div>'+
   '<div class="muted">'+(line.status==='approved'?'Planned alignment — station coordinates approximate.':'Station coordinates from official metro data.')+'</div>';
  refreshMap();refreshList();syncDetailActions();
}
function refreshMetro(){
  const y=selYearF();
  metroLineLayers.forEach(o=>{const poly=o.poly,line=o.line;
    if(!metroOn||(line.status==='approved'&&!metroFuture)){if(map.hasLayer(poly))poly.remove();return;}
    if(!map.hasLayer(poly))poly.addTo(map);
    const open=line.status==='op'||line.projYear<=y;
    poly.setStyle({dashArray:open?null:'7 7',opacity:open?.85:.5,weight:open?4:3});
  });
  metroStationLayers.forEach(o=>{const mk=o.mk,line=o.line;
    if(!metroOn||(line.status==='approved'&&!metroFuture)){if(map.hasLayer(mk))mk.remove();return;}
    if(!map.hasLayer(mk))mk.addTo(map);
    const open=o.yr<=y;
    mk.setStyle(open?{radius:3.8,fillColor:line.color,fillOpacity:.95,color:'#fff',weight:1.2}:{radius:3.2,fillColor:'#10161e',fillOpacity:.9,color:line.color,weight:1.5});
  });
  metroP4.forEach(poly=>{if(!metroOn||!metroFuture){if(map.hasLayer(poly))poly.remove();}else if(!map.hasLayer(poly))poly.addTo(map);});
}
function nearestStations(loc,k){
  const arr=[];METRO.lines.forEach(line=>line.stations.forEach(s=>arr.push({s,line,d:haversine(loc.lat,loc.lng,s.lat,s.lng)})));
  arr.sort((a,b)=>a.d-b.d);const seen={},out=[];
  for(const it of arr){if(seen[it.s.n])continue;seen[it.s.n]=1;out.push(it);if(out.length>=k)break;}return out;
}
function metroSummaryHtml(loc){
  const near=nearestStations(loc,3),y=selYearF();
  const rows=near.map(o=>{const s=o.s,line=o.line,open=s.yr<=y;
    const cls=open?'High':(line.status==='approved'?'Low':'Medium');
    const tag=open?'open '+s.yr:(line.status==='approved'?'~'+s.yr:'UC '+s.yr);
    return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'+
      '<span style="width:9px;height:9px;border-radius:50%;background:'+line.color+';flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.1)"></span>'+
      '<span style="flex:1">'+s.n+' <span class="muted">· '+line.short+'</span></span>'+
      '<span class="muted">'+o.d.toFixed(o.d<10?1:0)+' km</span>'+
      '<span class="conf '+cls+'" style="margin-left:6px">'+tag+'</span></div>';}).join('');
  return '<div class="drivers"><div style="font-weight:700;margin-bottom:6px">🚇 Nearest metro</div>'+rows+'</div>';
}
function buildMetroLegend(){
  document.getElementById('metroLegend').innerHTML='<div class="lt">Namma Metro</div>'+
   METRO.lines.map(l=>'<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:10px"><span style="width:14px;height:3px;background:'+l.color+';display:inline-block;flex:none"></span><span>'+l.short+'</span><span class="muted" style="margin-left:auto">'+(l.status==='op'?'open':l.status==='uc'?'~26-27':'~30-33')+'</span></div>').join('')+
   '<div class="muted" style="margin-top:5px">● open  ○ not yet open<br>scrub time to watch it grow</div>';
}
document.getElementById('metroToggle').onclick=function(){metroOn=!metroOn;this.classList.toggle('active',metroOn);document.getElementById('metroLegend').style.display=metroOn?'block':'none';refreshMetro();};
document.getElementById('futureToggle').onclick=function(){metroFuture=!metroFuture;this.classList.toggle('active',metroFuture);refreshMetro();};
buildMetroLegend();

// ---------- livability detail ----------
function livMeter(v,risk){let s='';for(let i=1;i<=5;i++){const on=i<=v;const col=on?(risk?tierRisk(v):tierGood(v)):'#2a3441';s+='<span style="width:8px;height:8px;border-radius:50%;background:'+col+';display:inline-block;margin-right:2px"></span>';}return s;}
function cauvRowHtml(loc){const cv=CAUVERY[loc.name];if(!cv)return '';const cm=CAUVERY._meta[cv.st],col=CAUV_COLOR[cv.st];return '<div style="margin:7px 0 2px;border-top:1px solid var(--line);padding-top:7px"><div style="display:flex;align-items:center;gap:8px"><span style="flex:1;font-size:12px">🚰 Cauvery water</span><span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:'+col+'22;color:'+col+'">'+cm.label+'</span></div><div class="muted" style="font-size:10.5px;margin-top:2px">'+cm.note+' · ETA '+cm.eta+(cv.conf==='Modeled'?' (modeled)':'')+'</div></div>';}
function livabilityHtml(loc){const Lv=LIVE[loc.name];if(!Lv)return '';
  const row=(lab,v,note,risk)=>'<div style="margin:5px 0"><div style="display:flex;align-items:center;gap:8px"><span style="flex:1;font-size:12px">'+lab+'</span>'+livMeter(v,risk)+'<span class="muted" style="margin-left:4px">'+v+'/5</span></div><div class="muted" style="font-size:10.5px;margin-top:1px">'+note+'</div></div>';
  return '<div class="drivers"><div style="font-weight:700;margin-bottom:4px">🏘️ Livability <span class="muted" style="font-weight:400">· '+(Lv.conf==='High'?'researched':'modeled from zone')+'</span></div>'+
    row('🎓 Schools',Lv.sch,Lv.schN,false)+row('🛡️ Safety',Lv.saf,Lv.safN,false)+
    row('💧 Water stress',Lv.wat,Lv.watN,true)+row('🌊 Flood risk',Lv.fld,Lv.fldN,true)+cauvRowHtml(loc)+
    '<div class="muted" style="font-size:10px;margin-top:5px">Schools/Safety: higher=better. Water/Flood: higher=worse. Relative research-based ratings, not official stats.</div></div>';
}
// ---------- builder projects overlay ----------
map.createPane('projectPane');map.getPane('projectPane').style.zIndex=520;
let projectsOn=false;
const projectLayers=[];
PROJECTS.projects.forEach(pr=>{
  const icon=L.divIcon({className:'projpin',iconSize:[12,12],html:'<div style="width:11px;height:11px;background:'+pr.color+';border:1.5px solid #fff;transform:rotate(45deg);box-shadow:0 0 0 1px rgba(0,0,0,.55)"></div>'});
  const mk=L.marker([pr.lat,pr.lng],{pane:'projectPane',icon});
  mk.bindTooltip('<b>'+pr.name+'</b><br>'+pr.builder+' · '+pr.status,{className:'pin',direction:'top',offset:[0,-6]});
  mk.on('click',()=>showProject(pr));
  projectLayers.push(mk);
});
function showProject(pr){
  document.getElementById('detail').classList.add('open');
  document.getElementById('dName').textContent=pr.name;
  document.getElementById('dSub').textContent='🏗️ '+pr.builder+' · '+pr.loc;
  selected=null;
  document.getElementById('dBody').innerHTML=
   '<div class="statgrid">'+
   '<div class="stat"><div class="l">Builder</div><div class="v" style="color:'+pr.color+';font-size:15px">'+pr.builder+'</div></div>'+
   '<div class="stat"><div class="l">Status</div><div class="v" style="font-size:14px">'+pr.status+'</div></div>'+
   '<div class="stat"><div class="l">Type</div><div class="v" style="font-size:12.5px">'+pr.type+'</div></div>'+
   '<div class="stat"><div class="l">Price</div><div class="v" style="font-size:14px">'+(pr.price&&pr.price!=='–'?pr.price:'NA')+'</div></div>'+
   '</div>'+
   '<div class="drivers"><div style="font-weight:700;margin-bottom:4px">📍 '+pr.loc+'</div>'+pr.note+'</div>'+
   '<div id="prRoutes"></div>'+
   nearbySchoolsHtml(pr.lat,pr.lng)+
   sunWindHtml(pr.lat,pr.lng)+
   '<div class="muted">A-tier builder project · location approximate (locality/landmark). Compiled May 2026.</div>';
  refreshMap();refreshList();syncDetailActions();
  showProjectRoutes(pr);
}
function refreshProjects(){projectLayers.forEach(mk=>{if(projectsOn){if(!map.hasLayer(mk))mk.addTo(map);}else if(map.hasLayer(mk))mk.remove();});}
function buildProjectsLegend(){
  const b=PROJECTS.builders;
  document.getElementById('projLegend').innerHTML='<div class="lt">🏗️ New builds — '+PROJECTS.projects.length+' projects</div>'+
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 8px">'+
   Object.keys(b).map(k=>'<span style="display:flex;align-items:center;gap:5px;font-size:9px;line-height:1.4"><span style="width:8px;height:8px;background:'+b[k]+';transform:rotate(45deg);display:inline-block;flex:none"></span>'+k+'</span>').join('')+
   '</div><div class="muted" style="margin-top:4px">◆ click a diamond for details</div>';
}
document.getElementById('buildsToggle').onclick=function(){projectsOn=!projectsOn;this.classList.toggle('active',projectsOn);document.getElementById('projLegend').style.display=projectsOn?'block':'none';refreshProjects();};
buildProjectsLegend();refreshProjects();

// ---------- schools overlay ----------


// great-circle distance in km
function kmBetween(lat1,lng1,lat2,lng2){
  const R=6371,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function nearestSchools(lat,lng,n){
  return SCHOOLS.schools.map(s=>({s,d:kmBetween(lat,lng,s.lat,s.lng)})).sort((a,b)=>a.d-b.d).slice(0,n||5);
}
function nearbySchoolsHtml(lat,lng){
  const bc=SCHOOLS.boardColors;
  const rows=nearestSchools(lat,lng,5).map(({s,d})=>
    '<div style="display:flex;align-items:center;gap:7px;padding:3px 0">'+
    '<span style="width:8px;height:8px;border-radius:50%;background:'+(bc[s.b]||'#888')+';flex:none"></span>'+
    '<span style="flex:1;font-size:12px">'+s.n+' <span class="muted" style="font-size:10px">· '+s.b+'</span></span>'+
    '<span style="font-size:12px;font-weight:700">'+d.toFixed(1)+' km</span></div>').join('');
  return '<div class="drivers"><div style="font-weight:700;margin-bottom:4px">🏫 Nearest schools</div>'+rows+
    '<div class="muted" style="font-size:10px;margin-top:4px">Straight-line distance to curated reputed schools. Approximate coordinates.</div></div>';
}

map.createPane('schoolPane');map.getPane('schoolPane').style.zIndex=515;
let schoolsOn=false;
const schoolLayers=[];
SCHOOLS.schools.forEach(s=>{
  const col=SCHOOLS.boardColors[s.b]||'#888';
  const icon=L.divIcon({className:'schoolpin',iconSize:[10,10],html:'<div style="width:9px;height:9px;border-radius:50%;background:'+col+';border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.5)"></div>'});
  const mk=L.marker([s.lat,s.lng],{pane:'schoolPane',icon});
  mk.bindTooltip('<b>'+s.n+'</b><br>'+s.b+' · '+s.loc,{className:'pin',direction:'top',offset:[0,-5]});
  schoolLayers.push(mk);
});
function refreshSchools(){schoolLayers.forEach(mk=>{if(schoolsOn){if(!map.hasLayer(mk))mk.addTo(map);}else if(map.hasLayer(mk))mk.remove();});}
function buildSchoolsLegend(){
  const bc=SCHOOLS.boardColors;
  document.getElementById('schoolLegend').innerHTML='<div class="lt">🏫 Schools — '+SCHOOLS.schools.length+'</div>'+
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 8px">'+
   Object.keys(bc).map(k=>'<span style="display:flex;align-items:center;gap:5px;font-size:9px;line-height:1.4"><span style="width:8px;height:8px;border-radius:50%;background:'+bc[k]+';display:inline-block;flex:none"></span>'+k+'</span>').join('')+
   '</div><div class="muted" style="margin-top:4px">hover a dot for name · distances in detail panel</div>';
}
document.getElementById('schoolsToggle').onclick=function(){schoolsOn=!schoolsOn;this.classList.toggle('active',schoolsOn);document.getElementById('schoolLegend').style.display=schoolsOn?'block':'none';refreshSchools();};
buildSchoolsLegend();refreshSchools();

// ---------- planner concept lines ----------
map.createPane('conceptPane');map.getPane('conceptPane').style.zIndex=405;
let conceptOn=false;
const conceptLayers=[];
CONCEPT.lines.forEach(line=>{
  const pts=line.stations.map(s=>[s[1],s[2]]);
  const poly=L.polyline(pts,{pane:'conceptPane',color:line.color,weight:3.5,opacity:.8,dashArray:'1 8',lineCap:'round'});
  poly.on('click',()=>showConcept(line));
  poly.bindTooltip(line.name,{className:'pin'});
  conceptLayers.push(poly);
  line.stations.forEach(s=>{
    const mk=L.circleMarker([s[1],s[2]],{pane:'conceptPane',radius:3,weight:1.4,color:line.color,fillColor:'#10161e',fillOpacity:.9});
    mk.bindTooltip('<b>'+s[0]+'</b><br>'+line.short+' (concept)',{className:'pin',direction:'top',offset:[0,-3]});
    mk.on('click',()=>showConcept(line));
    conceptLayers.push(mk);
  });
});
function showConcept(line){
  document.getElementById('detail').classList.add('open');
  document.getElementById('dName').textContent=line.short+' Line';
  document.getElementById('dSub').textContent='🧭 Planner concept · '+line.name;
  selected=null;
  const stops=line.stations.map(s=>s[0]).filter((v,i,a)=>a.indexOf(v)===i).join(' → ');
  document.getElementById('dBody').innerHTML=
   '<div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">'+
   '<span style="background:'+line.color+';color:#04130d;font-weight:800;padding:4px 12px;border-radius:8px;font-size:13px">'+line.priority+'</span>'+
   '<span class="muted">'+line.horizon+'</span></div>'+
   '<div class="drivers"><div style="font-weight:700;margin-bottom:4px">Why this line</div>'+line.rationale+'</div>'+
   '<div class="drivers"><div style="font-weight:700;margin-bottom:4px">Alignment ('+line.stations.length+' nodes)</div><div style="font-size:12px;line-height:1.6">'+stops+'</div></div>'+
   '<div class="muted">Conceptual planner proposal — not an official BMRCL plan. Indicative alignment & coordinates.</div>';
  refreshMap();refreshList();syncDetailActions();
}
function refreshConcept(){conceptLayers.forEach(o=>{if(conceptOn){if(!map.hasLayer(o))o.addTo(map);}else if(map.hasLayer(o))o.remove();});}
document.getElementById('conceptToggle').onclick=function(){conceptOn=!conceptOn;this.classList.toggle('active',conceptOn);refreshConcept();};
refreshConcept();

// ---------- city-wide IDW heatmap surface ----------
map.createPane('heatPane');map.getPane('heatPane').style.zIndex=250;
let heatmapOn=false, heatOverlay=null, heatCanvas=null, HEAT_W=150, HEAT_H=186, HEAT_BOUNDS=null, _hLat=null,_hLng=null,_hPlat=null,_hPlng=null;
function parseColor(s){if(s[0]==='#')return [parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)];const m=s.match(/\d+/g);return [+m[0],+m[1],+m[2]];}
function heatInit(){
  let mnLa=1e9,mxLa=-1e9,mnLo=1e9,mxLo=-1e9;
  DATA.localities.forEach(l=>{if(l.lat<mnLa)mnLa=l.lat;if(l.lat>mxLa)mxLa=l.lat;if(l.lng<mnLo)mnLo=l.lng;if(l.lng>mxLo)mxLo=l.lng;});
  const pLa=(mxLa-mnLa)*0.05,pLo=(mxLo-mnLo)*0.05;mnLa-=pLa;mxLa+=pLa;mnLo-=pLo;mxLo+=pLo;
  HEAT_BOUNDS=[[mnLa,mnLo],[mxLa,mxLo]];
  _hLat=new Float64Array(HEAT_H);for(let r=0;r<HEAT_H;r++)_hLat[r]=mxLa-(r+0.5)/HEAT_H*(mxLa-mnLa);
  _hLng=new Float64Array(HEAT_W);for(let c=0;c<HEAT_W;c++)_hLng[c]=mnLo+(c+0.5)/HEAT_W*(mxLo-mnLo);
  const N=DATA.localities.length;_hPlat=new Float64Array(N);_hPlng=new Float64Array(N);
  for(let i=0;i<N;i++){_hPlat[i]=DATA.localities[i].lat;_hPlng[i]=DATA.localities[i].lng;}
  heatCanvas=document.createElement('canvas');heatCanvas.width=HEAT_W;heatCanvas.height=HEAT_H;
}
function refreshHeatmap(){
  if(!heatmapOn){if(heatOverlay&&map.hasLayer(heatOverlay))map.removeLayer(heatOverlay);return;}
  if(!heatCanvas)heatInit();
  const N=DATA.localities.length, pval=new Float64Array(N);
  for(let i=0;i<N;i++)pval[i]=metricVal(DATA.localities[i]);   // IDW source = current metric value at each center
  const ctx=heatCanvas.getContext('2d'),img=ctx.createImageData(HEAT_W,HEAT_H),D=img.data;
  for(let r=0;r<HEAT_H;r++){const la=_hLat[r];
    for(let c=0;c<HEAT_W;c++){const lo=_hLng[c];let num=0,den=0,ex=-1;
      for(let i=0;i<N;i++){const dla=la-_hPlat[i],dlo=lo-_hPlng[i],d2=dla*dla+dlo*dlo;
        if(d2<6e-7){ex=i;break;}const w=1/d2;num+=w*pval[i];den+=w;}   // power=2 ⇒ w=1/d²
      const v=ex>=0?pval[ex]:num/den,rgb=parseColor(metricColorVal(v)),idx=(r*HEAT_W+c)*4;
      D[idx]=rgb[0];D[idx+1]=rgb[1];D[idx+2]=rgb[2];D[idx+3]=200;}}
  ctx.putImageData(img,0,0);const url=heatCanvas.toDataURL();
  if(!heatOverlay){heatOverlay=L.imageOverlay(url,HEAT_BOUNDS,{opacity:.74,interactive:false,pane:'heatPane'});heatOverlay.addTo(map);}
  else{heatOverlay.setUrl(url);if(!map.hasLayer(heatOverlay))heatOverlay.addTo(map);}
}
document.getElementById('heatToggle').onclick=function(){heatmapOn=!heatmapOn;this.classList.toggle('active',heatmapOn);refreshHeatmap();refreshMap();};

// ---------- sun & wind simulation ----------
// Sun = exact solar geometry (NOAA-style) for Bengaluru's latitude; Wind = IMD/NASA-POWER
// monthly climatology (prevailing "from" direction °N & mean speed m/s). The bottom timeline
// slider is dual-purpose: its quarter sets the season (Q1→winter, Q2→pre-monsoon, Q3→SW monsoon, Q4→NE monsoon).
const D2R=Math.PI/180, R2D=180/Math.PI, IST_LSTM=82.5, CITY=[12.9716,77.5946];
function solDecl(N){return 23.45*Math.sin(D2R*(360/365*(284+N)));}                         // declination °
function eqTime(N){const B=D2R*(360/364*(N-81));return 9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B);} // min
function sunPos(lat,lng,N,hour){
  const dec=solDecl(N)*D2R, phi=lat*D2R;
  const tc=4*(lng-IST_LSTM)+eqTime(N), lst=hour+tc/60, H=15*(lst-12)*D2R;
  const el=Math.asin(Math.sin(dec)*Math.sin(phi)+Math.cos(dec)*Math.cos(phi)*Math.cos(H));
  let ca=(Math.sin(dec)-Math.sin(el)*Math.sin(phi))/(Math.cos(el)*Math.cos(phi));
  ca=Math.max(-1,Math.min(1,ca));let az=Math.acos(ca)*R2D;if(H>0)az=360-az;
  return {az,el:el*R2D};
}
function sunTimes(lat,lng,N){
  const dec=solDecl(N)*D2R, phi=lat*D2R, tc=4*(lng-IST_LSTM)+eqTime(N);
  let ch=-Math.tan(phi)*Math.tan(dec);ch=Math.max(-1,Math.min(1,ch));
  const H0=Math.acos(ch)*R2D, noon=12-tc/60;
  return {rise:noon-H0/15, set:noon+H0/15, noon, noonEl:sunPos(lat,lng,N,noon).el};
}
const DIRS=['N','NE','E','SE','S','SW','W','NW'];
function dir8(az){return DIRS[Math.round((((az%360)+360)%360)/45)%8];}
function hhmm(h){h=((h%24)+24)%24;let H=Math.floor(h),mm=Math.round((h-H)*60);if(mm===60){mm=0;H=(H+1)%24;}const ap=H<12?'am':'pm';let h12=H%12;if(h12===0)h12=12;return h12+':'+(mm<10?'0':'')+mm+ap;}
const WIND={monthly:[
 {d:65,s:2.1},{d:90,s:2.3},{d:110,s:2.6},{d:140,s:2.9},{d:250,s:3.2},{d:270,s:4.6},
 {d:270,s:5.0},{d:265,s:4.5},{d:250,s:3.6},{d:60,s:2.6},{d:45,s:2.3},{d:60,s:2.0}]};
const SEASONS=[
 {m:1, name:'Winter (Dec–Feb)', N:46},
 {m:4, name:'Pre-monsoon (Mar–May)', N:135},
 {m:7, name:'SW Monsoon (Jun–Sep)', N:227},
 {m:10,name:'NE Monsoon (Oct–Nov)', N:319}];
const SEASON_COLORS=['#60a5fa','#fbbf24','#34d399','#f472b6'];
function curSeason(){return SEASONS[timeIdx%4];}

let sunwindOn=false, todHour=12, swCanvas=null, swCtx=null, swRAF=null, swParticles=[], swDPR=1, skyCtx=null, todPlaying=null;
let sunAz=120, sunEl=45, windToRad=0, windSpd=3;

function swResize(){
  if(!swCanvas)return;
  const w=document.getElementById('mapwrap');
  swDPR=Math.min(1.5,window.devicePixelRatio||1);
  swCanvas.width=w.clientWidth*swDPR;swCanvas.height=w.clientHeight*swDPR;
  swCanvas.style.width=w.clientWidth+'px';swCanvas.style.height=w.clientHeight+'px';
  swCtx.setTransform(swDPR,0,0,swDPR,0,0);
  swSeedParticles();
}
function swSeedParticles(){
  const w=parseFloat(swCanvas.style.width)||swCanvas.width, h=parseFloat(swCanvas.style.height)||swCanvas.height;
  const n=Math.round(Math.max(80,Math.min(360,90+windSpd*40)));
  swParticles=[];for(let i=0;i<n;i++)swParticles.push({x:Math.random()*w,y:Math.random()*h,a:Math.random()*120|0,life:60+(Math.random()*90|0)});
}
function drawSunTint(w,h){
  const tx=Math.sin(sunAz*D2R), ty=-Math.cos(sunAz*D2R), cx=w/2, cy=h/2, R=Math.hypot(w,h)/2;
  if(sunEl>0){
    const inten=Math.max(.05,Math.min(.9,Math.sin(sunEl*D2R)));
    const x0=cx-tx*R,y0=cy-ty*R,x1=cx+tx*R,y1=cy+ty*R;
    const g=swCtx.createLinearGradient(x1,y1,x0,y0), warm=sunEl<12?'255,150,70':'255,225,160';
    g.addColorStop(0,'rgba('+warm+','+(0.16*inten+0.04).toFixed(3)+')');
    g.addColorStop(0.5,'rgba('+warm+',0.03)');
    g.addColorStop(1,'rgba(10,20,40,0.10)');
    swCtx.fillStyle=g;swCtx.fillRect(0,0,w,h);
  }else{swCtx.fillStyle='rgba(20,40,80,0.14)';swCtx.fillRect(0,0,w,h);}
}
function swFrame(){
  if(!sunwindOn){swRAF=null;return;}
  const w=parseFloat(swCanvas.style.width), h=parseFloat(swCanvas.style.height);
  swCtx.clearRect(0,0,w,h);
  drawSunTint(w,h);
  const sp=0.5+windSpd*0.55, vx=Math.sin(windToRad)*sp, vy=-Math.cos(windToRad)*sp;
  swCtx.lineWidth=1.1;swCtx.strokeStyle='rgba(150,210,255,.5)';swCtx.lineCap='round';swCtx.beginPath();
  for(const p of swParticles){
    const ox=p.x,oy=p.y;p.x+=vx;p.y+=vy;p.a++;
    if(p.a>p.life||p.x<-5||p.x>w+5||p.y<-5||p.y>h+5){p.x=Math.random()*w;p.y=Math.random()*h;p.a=0;continue;}
    swCtx.moveTo(ox,oy);swCtx.lineTo(p.x,p.y);
  }
  swCtx.stroke();
  swRAF=requestAnimationFrame(swFrame);
}
function drawSkyDome(){
  if(!skyCtx)return;
  const W=170,H=150,cx=85,cy=92,R=66, s=curSeason(), t=sunTimes(CITY[0],CITY[1],s.N);
  skyCtx.clearRect(0,0,W,H);
  skyCtx.strokeStyle='#2b3543';skyCtx.lineWidth=1;
  [1,0.66,0.33].forEach(f=>{skyCtx.beginPath();skyCtx.arc(cx,cy,R*f,0,Math.PI*2);skyCtx.stroke();});
  skyCtx.beginPath();skyCtx.moveTo(cx-R,cy);skyCtx.lineTo(cx+R,cy);skyCtx.moveTo(cx,cy-R);skyCtx.lineTo(cx,cy+R);skyCtx.stroke();
  skyCtx.fillStyle='#6b7787';skyCtx.font='9px sans-serif';skyCtx.textAlign='center';
  skyCtx.fillText('N',cx,cy-R-3);skyCtx.fillText('S',cx,cy+R+9);skyCtx.fillText('E',cx+R+6,cy+3);skyCtx.fillText('W',cx-R-6,cy+3);
  skyCtx.strokeStyle='#f5c451';skyCtx.lineWidth=1.6;skyCtx.beginPath();let started=false;
  for(let h=t.rise;h<=t.set+1e-3;h+=(t.set-t.rise)/80){const p=sunPos(CITY[0],CITY[1],s.N,h);if(p.el<0)continue;const r=(90-p.el)/90*R,x=cx+r*Math.sin(p.az*D2R),y=cy-r*Math.cos(p.az*D2R);if(!started){skyCtx.moveTo(x,y);started=true;}else skyCtx.lineTo(x,y);}
  skyCtx.stroke();
  const cur=sunPos(CITY[0],CITY[1],s.N,todHour);
  if(cur.el>0){const r=(90-cur.el)/90*R,x=cx+r*Math.sin(cur.az*D2R),y=cy-r*Math.cos(cur.az*D2R);
    skyCtx.strokeStyle='rgba(255,213,74,.4)';skyCtx.lineWidth=2;skyCtx.beginPath();skyCtx.arc(x,y,8,0,Math.PI*2);skyCtx.stroke();
    skyCtx.fillStyle='#ffd54a';skyCtx.beginPath();skyCtx.arc(x,y,5,0,Math.PI*2);skyCtx.fill();
  }else{const x=cx+R*Math.sin(cur.az*D2R),y=cy-R*Math.cos(cur.az*D2R);skyCtx.fillStyle='#3a4554';skyCtx.beginPath();skyCtx.arc(x,y,4,0,Math.PI*2);skyCtx.fill();}
}
function updateSWPanelText(sp,s,wm){
  const t=sunTimes(CITY[0],CITY[1],s.N), shadow=(sp.az+180)%360;
  document.getElementById('swSeason').textContent='· '+s.name.replace(/ \(.*/,'');
  document.getElementById('swSun').innerHTML=(sp.el>0
    ? '☀️ Sun '+dir8(sp.az)+' · '+Math.round(sp.el)+'°↑ · shadows '+dir8(shadow)
    : '🌙 Below horizon (night)')+
    '<br><span class="muted" style="font-size:10px">↑'+hhmm(t.rise)+' · noon '+Math.round(t.noonEl)+'°↑ · ↓'+hhmm(t.set)+'</span>';
  var rd=document.getElementById('todReadout');if(rd)rd.textContent=hhmm(todHour)+(sp.el>0?' · sun '+dir8(sp.az)+' '+Math.round(sp.el)+'°':' · night');
  document.getElementById('swWind').innerHTML='🌬️ Wind from <b>'+dir8(wm.d)+'</b> ('+wm.d+'°) · '+wm.s.toFixed(1)+' m/s';
}
function updateSunWind(){
  const s=curSeason(), wm=WIND.monthly[s.m], sp=sunPos(CITY[0],CITY[1],s.N,todHour);
  sunAz=sp.az;sunEl=sp.el;windToRad=((wm.d+180)%360)*D2R;windSpd=wm.s;
  if(swCanvas){const want=Math.round(Math.max(80,Math.min(360,90+windSpd*40)));if(Math.abs(want-swParticles.length)>50)swSeedParticles();}
  drawSkyDome();updateSWPanelText(sp,s,wm);
}
function buildSunWindPanel(){
  const el=document.getElementById('sunwindPanel');
  el.innerHTML=
   '<div class="lt">☀️ Sun &amp; wind <span id="swSeason" class="muted" style="font-weight:400"></span></div>'+
   '<canvas id="skyDome" width="170" height="150" style="width:170px;height:150px;display:block;margin:2px auto 3px"></canvas>'+
   '<div id="swSun" style="font-size:11px;line-height:1.5;margin-bottom:3px"></div>'+
   '<div id="swWind" style="font-size:11px;line-height:1.5"></div>'+
   '<div class="muted" style="font-size:9px;margin-top:4px">Sun path = exact astronomy for the season set by the bottom timeline. Wind = typical year-round climatology.</div>';
  skyCtx=document.getElementById('skyDome').getContext('2d');
}
function ensureSwCanvas(){
  if(swCanvas)return;
  swCanvas=document.createElement('canvas');swCanvas.id='swCanvas';
  swCanvas.style.cssText='position:absolute;inset:0;z-index:400;pointer-events:none';
  document.getElementById('mapwrap').appendChild(swCanvas);
  swCtx=swCanvas.getContext('2d');
  buildSunWindPanel();swResize();
}
function refreshSunWind(){if(sunwindOn)updateSunWind();}
document.getElementById('sunwindToggle').onclick=function(){
  sunwindOn=!sunwindOn;this.classList.toggle('active',sunwindOn);
  document.getElementById('sunwindPanel').style.display=sunwindOn?'block':'none';var tb=document.getElementById('todBar');if(tb)tb.classList.toggle('show',sunwindOn);
  if(sunwindOn){ensureSwCanvas();swCanvas.style.display='block';updateSunWind();if(!swRAF)swRAF=requestAnimationFrame(swFrame);}
  else{if(swRAF){cancelAnimationFrame(swRAF);swRAF=null;}if(swCanvas){swCtx.clearRect(0,0,swCanvas.width,swCanvas.height);swCanvas.style.display='none';}if(todPlaying){clearInterval(todPlaying);todPlaying=null;document.getElementById('todPlay').textContent='▶';}}
};
window.addEventListener('resize',()=>{if(sunwindOn)swResize();});
// time-of-day control (lives in the bottom timebar)
(function(){var sl=document.getElementById('todSlider'),pb=document.getElementById('todPlay');if(sl)sl.oninput=function(e){todHour=+e.target.value;updateSunWind();};if(pb)pb.onclick=function(){if(todPlaying){clearInterval(todPlaying);todPlaying=null;this.textContent='▶';return;}this.textContent='⏸';todPlaying=setInterval(function(){todHour=todHour>=20?4:todHour+0.25;document.getElementById('todSlider').value=todHour;updateSunWind();},90);};})();

// ---- per-property sun & wind (inline SVG, no canvas) ----
function sunPathSvg(lat,lng,sz){
  const cx=sz/2,cy=sz*0.6,R=sz*0.4, s=curSeason(), t=sunTimes(lat,lng,s.N);
  let g='<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="#2b3543"/>'+
        '<line x1="'+(cx-R)+'" y1="'+cy+'" x2="'+(cx+R)+'" y2="'+cy+'" stroke="#2b3543"/>'+
        '<line x1="'+cx+'" y1="'+(cy-R)+'" x2="'+cx+'" y2="'+(cy+R)+'" stroke="#2b3543"/>'+
        '<text x="'+cx+'" y="'+(cy-R-2)+'" fill="#6b7787" font-size="8" text-anchor="middle">N</text>'+
        '<text x="'+(cx+R+5)+'" y="'+(cy+3)+'" fill="#6b7787" font-size="8" text-anchor="middle">E</text>'+
        '<text x="'+(cx-R-5)+'" y="'+(cy+3)+'" fill="#6b7787" font-size="8" text-anchor="middle">W</text>';
  let pts=[];
  for(let h=t.rise;h<=t.set+1e-3;h+=(t.set-t.rise)/60){const p=sunPos(lat,lng,s.N,h);if(p.el<0)continue;const r=(90-p.el)/90*R;pts.push((cx+r*Math.sin(p.az*D2R)).toFixed(1)+','+(cy-r*Math.cos(p.az*D2R)).toFixed(1));}
  if(pts.length)g+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="#f5c451" stroke-width="1.6"/>';
  const cur=sunPos(lat,lng,s.N,todHour);
  if(cur.el>0){const r=(90-cur.el)/90*R,x=cx+r*Math.sin(cur.az*D2R),y=cy-r*Math.cos(cur.az*D2R);g+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="4.5" fill="#ffd54a"/>';}
  return '<svg width="'+sz+'" height="'+sz+'" style="flex:none">'+g+'</svg>';
}
function windRoseSvg(sz){
  const cx=sz/2,cy=sz/2,R=sz*0.4;
  let g='<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="#2b3543"/>'+
        '<text x="'+cx+'" y="'+(cy-R-1)+'" fill="#6b7787" font-size="8" text-anchor="middle">N</text>';
  SEASONS.forEach((s,i)=>{const wm=WIND.monthly[s.m],to=(wm.d+180)%360,len=R*(0.42+wm.s/7);
    const ux=Math.sin(to*D2R),uy=-Math.cos(to*D2R);
    const tipx=cx+len*ux,tipy=cy+len*uy,bx=tipx-ux*6,by=tipy-uy*6,px=-uy*3.2,py=ux*3.2,cur=(timeIdx%4)===i;
    g+='<line x1="'+cx+'" y1="'+cy+'" x2="'+tipx.toFixed(1)+'" y2="'+tipy.toFixed(1)+'" stroke="'+SEASON_COLORS[i]+'" stroke-width="'+(cur?3:1.6)+'" opacity="'+(cur?1:.55)+'"/>'+
       '<polygon points="'+tipx.toFixed(1)+','+tipy.toFixed(1)+' '+(bx+px).toFixed(1)+','+(by+py).toFixed(1)+' '+(bx-px).toFixed(1)+','+(by-py).toFixed(1)+'" fill="'+SEASON_COLORS[i]+'" opacity="'+(cur?1:.55)+'"/>';});
  return '<svg width="'+sz+'" height="'+sz+'" style="flex:none">'+g+'</svg>';
}
function seasonWindRows(){
  return SEASONS.map((s,i)=>{const wm=WIND.monthly[s.m],cur=(timeIdx%4)===i;
    return '<div style="'+(cur?'font-weight:700;':'')+'white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+SEASON_COLORS[i]+';margin-right:5px"></span>'+s.name.replace(/ \(.*/,'')+': '+dir8(wm.d)+' '+wm.s.toFixed(1)+'m/s</div>';}).join('');
}
function sunWindHtml(lat,lng){
  const s=curSeason(), t=sunTimes(lat,lng,s.N), sp=sunPos(lat,lng,s.N,todHour), shadow=(sp.az+180)%360;
  return '<div class="drivers">'+
    '<div style="font-weight:700;margin-bottom:4px">☀️ Sun &amp; wind <span class="muted" style="font-weight:400;font-size:10px">· '+s.name+'</span></div>'+
    '<div style="display:flex;gap:10px;align-items:center">'+sunPathSvg(lat,lng,116)+
      '<div style="font-size:11.5px;line-height:1.6">🌅 '+hhmm(t.rise)+' &nbsp; 🌇 '+hhmm(t.set)+'<br>noon sun '+Math.round(t.noonEl)+'° high<br>'+
      (sp.el>0?('at '+hhmm(todHour)+': sun '+dir8(sp.az)+' '+Math.round(sp.el)+'°↑<br>shadows fall '+dir8(shadow)):('at '+hhmm(todHour)+': night'))+'</div></div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin-top:8px">'+windRoseSvg(108)+
      '<div style="font-size:10.5px;line-height:1.55">'+seasonWindRows()+'</div></div>'+
    '<div class="muted" style="font-size:10px;margin-top:5px">Westerlies dominate the SW monsoon (Jun–Sep); calmer easterly/NE winds otherwise — a W/SW aspect catches the monsoon breeze &amp; rain. Drag the bottom timeline to change season; toggle ☀️ Sun &amp; wind for the live map sim.</div>'+
  '</div>';
}

function renderAll(){refreshMap();refreshLegend();refreshList();refreshKPI();refreshTime();refreshMetro();refreshHeatmap();refreshSunWind();}
// ================= v2: audit features =================
const LEAD_ENDPOINT="/api/lead"; // Vercel function -> Google Apps Script webhook -> Google Sheet. "" = localStorage only
function $(id){return document.getElementById(id);}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2600);}
function isEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function slugify(s){return s.toLowerCase().replace(/[^\w]+/g,'-').replace(/^-|-$/g,'');}

// ---- C1/H4: lead capture ----
function saveLeadLocal(rec){try{const a=JSON.parse(localStorage.getItem('bv_leads')||'[]');a.push(rec);localStorage.setItem('bv_leads',JSON.stringify(a));}catch(e){}}
function submitLead(kind,inputEl,btnEl,msgEl,meta){
  const email=(inputEl.value||'').trim();
  if(msgEl)msgEl.innerHTML='';
  if(!isEmail(email)){if(msgEl)msgEl.innerHTML='<div class="caperr">Please enter a valid email.</div>';inputEl.focus();return;}
  const rec={kind,email,meta:meta||null,when:new Date().toISOString()};
  saveLeadLocal(rec);
  const done=()=>{if(msgEl)msgEl.innerHTML='<div class="capok">✓ You\'re in — confirmation on the way.</div>';inputEl.value='';btnEl&&btnEl.classList.remove('busy');toast('Subscribed ✓');};
  if(LEAD_ENDPOINT){btnEl&&btnEl.classList.add('busy');
    fetch(LEAD_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)}).then(r=>{if(!r.ok)throw new Error('http '+r.status);return done();}).catch(()=>{if(msgEl)msgEl.innerHTML='<div class="capok">✓ Saved locally.</div>';btnEl&&btnEl.classList.remove('busy');});
  }else{done();}
}
function alertCtaHtml(loc){
  const slug=slugify(loc.name), p=loc.price2026, sug=Math.round(p*1.1/100)*100, esc=loc.name.replace(/'/g,"\\'");
  return '<div class="cta">'+
    '<h4>🔔 Price alert · '+escapeHtml(loc.name)+'</h4>'+
    '<p>Email me when '+escapeHtml(loc.name)+' crosses a ₹/sqft threshold — plus the monthly Bangalore market report.</p>'+
    '<div class="capform"><input type="email" id="ae_'+slug+'" placeholder="you@email.com" autocomplete="email"/>'+
    '<input type="number" class="thr" id="at_'+slug+'" value="'+sug+'" aria-label="threshold rupees per sqft"/></div>'+
    '<div class="alertrow"><button class="btn" id="ab_'+slug+'" onclick="submitAlert(\''+esc+'\')">Set alert</button>'+
    '<span class="muted" style="font-size:10.5px">now '+fmt(p)+'/sqft · <a href="#" onclick="event.preventDefault();openReport()">just the monthly report ↗</a></span></div>'+
    '<div id="am_'+slug+'"></div></div>';
}
function submitAlert(name){const slug=slugify(name);submitLead('price-alert',$('ae_'+slug),$('ab_'+slug),$('am_'+slug),{locality:name,threshold:+$('at_'+slug).value});}
function openReport(){$('reportModal').style.display='flex';setTimeout(()=>{var e=$('reportEmail');e&&e.focus();},50);}
function emptyStateHtml(q){
  const ql=q.toLowerCase();
  const sugg=DATA.localities.filter(l=>{const n=l.name.toLowerCase();return n.split(/[\s,]+/).some(tok=>tok.startsWith(ql.slice(0,3)))||(ql.length>=4&&n.includes(ql.slice(0,4)));}).slice(0,4);
  const chips=sugg.map(l=>'<span class="near" onclick="pickLocality(\''+l.name.replace(/'/g,"\\'")+'\')">'+escapeHtml(l.name)+'</span>').join(' · ');
  return '<div class="empty">'+
    '<div class="big">No tracked locality matches “'+escapeHtml(q)+'”.</div>'+
    (chips?('<div style="margin:6px 0 12px">Did you mean: '+chips+'</div>'):'<div style="margin:6px 0 12px">We track 127 Bengaluru localities.</div>')+
    '<div class="cta" style="text-align:left"><h4>Want “'+escapeHtml(q)+'” added?</h4><p>Drop your email — we\'ll notify you when we add it (and send the monthly report).</p>'+
    '<div class="capform"><input type="email" id="ne_email" placeholder="you@email.com"/><button class="btn" id="ne_btn" onclick="submitAreaRequest()">Notify me</button></div><div id="ne_msg"></div></div></div>';
}
function submitAreaRequest(){submitLead('request-area',$('ne_email'),$('ne_btn'),$('ne_msg'),{query:searchTxt});}
function pickLocality(n){$('search').value='';searchTxt='';renderAll();openDetail(n);}

// ---- H1: deep links + share ----
let _hashLock=false;
function updateHash(){
  if(_hashLock)return;
  const parts=[];
  if(selected)parts.push('a='+encodeURIComponent(selected));
  if(timeIdx!==29)parts.push('t='+timeIdx);
  if(metric!=='price')parts.push('m='+metric);
  const h=parts.join('&');
  try{history.replaceState(null,'',h?('#'+h):(location.pathname+location.search));}catch(e){if(h)location.hash=h;}
}
function parseHash(){const h=location.hash.replace(/^#/,'');const o={};if(h)h.split('&').forEach(kv=>{const i=kv.indexOf('=');if(i>0)o[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1));});return o;}
function applyHash(){
  const o=parseHash();let opened=false;_hashLock=true;
  if(o.m&&document.querySelector('#metricSeg button[data-m="'+o.m+'"],#livSeg button[data-m="'+o.m+'"]')){metric=o.m;document.querySelectorAll('#metricSeg button,#livSeg button').forEach(x=>x.classList.toggle('active',x.dataset.m===metric));}
  if(o.t!==undefined&&o.t!==''){const ti=Math.max(0,Math.min(43,parseInt(o.t,10)||0));timeIdx=ti;$('time').value=ti;}
  renderAll();
  if(o.a){const loc=DATA.localities.find(l=>l.name===o.a);if(loc){_hashLock=false;openDetail(o.a);opened=true;}}
  _hashLock=false;
  return opened;
}
function copyShareLink(){updateHash();const url=location.href;const ok=()=>toast('Link copied ✓');
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(ok).catch(()=>prompt('Copy this link:',url));
  else prompt('Copy this link:',url);
}
window.addEventListener('hashchange',()=>{if(!_hashLock)applyHash();});

// ---- H2: compare ----
let COMPARE=[], cmpChart=null; const CMP_COLORS=['#4f9dff','#21c198','#f59e0b'];
function loadCompare(){try{COMPARE=JSON.parse(localStorage.getItem('bv_compare')||'[]').filter(n=>DATA.localities.find(l=>l.name===n)).slice(0,3);}catch(e){COMPARE=[];}}
function saveCompare(){try{localStorage.setItem('bv_compare',JSON.stringify(COMPARE));}catch(e){}}
function isPinned(n){return COMPARE.indexOf(n)>=0;}
function togglePin(n){
  if(isPinned(n))COMPARE=COMPARE.filter(x=>x!==n);
  else{if(COMPARE.length>=3){toast('Compare holds 3 — remove one first');return;}COMPARE.push(n);toast(n+' added to compare');}
  saveCompare();renderCompareTray();refreshList();syncDetailActions();
}
function toggleCompareCurrent(){if(!selected){toast('Open a locality first');return;}togglePin(selected);}
function clearCompare(){COMPARE=[];saveCompare();renderCompareTray();refreshList();syncDetailActions();}
function syncDetailActions(){const b=$('dCompare');if(!b)return;const on=!!selected;b.style.opacity=on?'1':'.4';b.classList.toggle('on',on&&isPinned(selected));b.title=on?(isPinned(selected)?'Remove from compare':'Add to compare'):'Open a locality to compare';}
function renderCompareTray(){
  const tray=$('compareTray');
  if(!COMPARE.length){tray.classList.remove('show');if(cmpChart){cmpChart.destroy();cmpChart=null;}return;}
  tray.classList.add('show');
  $('cmpChips').innerHTML=COMPARE.map((n,i)=>'<span class="cmpchip"><span style="width:9px;height:9px;border-radius:50%;background:'+CMP_COLORS[i]+';display:inline-block"></span>'+escapeHtml(n)+'<span class="rm" title="remove" onclick="togglePin(\''+n.replace(/'/g,"\\'")+'\')">×</span></span>').join('');
  const rows=COMPARE.map(n=>DATA.localities.find(l=>l.name===n));
  $('cmpTableWrap').innerHTML='<table class="cmptable"><tr><th></th>'+rows.map(l=>'<th>'+escapeHtml(l.name.split(' ')[0])+'</th>').join('')+'</tr>'+
    '<tr><th>₹/sqft now</th>'+rows.map(l=>'<td>'+fmt(priceAt(l,timeIdx))+'</td>').join('')+'</tr>'+
    '<tr><th>2029 proj.</th>'+rows.map(l=>'<td>'+fmt(l.projPrice2029)+'</td>').join('')+'</tr>'+
    '<tr><th>CAGR 19–26</th>'+rows.map(l=>'<td>'+l.cagr+'%</td>').join('')+'</tr>'+
    '<tr><th>Yield</th>'+rows.map(l=>'<td>'+l.yield+'%</td>').join('')+'</tr></table>';
  const labels=combined(rows[0]).map((p,i)=>tLabel(i));
  const ds=rows.map((l,i)=>({label:l.name,data:combined(l).map(p=>p.price),borderColor:CMP_COLORS[i],backgroundColor:'transparent',tension:.3,pointRadius:0,borderWidth:2.4}));
  if(cmpChart)cmpChart.destroy();
  cmpChart=new Chart($('cmpChart'),{type:'line',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+fmt(ctx.parsed.y)}}},scales:{x:{ticks:{color:'#6b7787',maxTicksLimit:8,font:{size:9}},grid:{color:'#222b35'}},y:{ticks:{color:'#6b7787',font:{size:9},callback:v=>fmtK(v)},grid:{color:'#222b35'}}}}});
}

// ---- H3: coach + pulse ----
let interacted=false;
function clearPulse(){document.querySelectorAll('.leaflet-localityPane-pane path.pulse').forEach(p=>p.classList.remove('pulse'));}
function dismissCoach(){interacted=true;const c=$('coachTip');if(c)c.remove();clearPulse();}
function applyPulse(){[...DATA.localities].sort((a,b)=>b.projCagr-a.projCagr).slice(0,3).forEach(l=>{const m=markers[l.name];if(m&&m._path)m._path.classList.add('pulse');});}
function createCoach(){const d=document.createElement('div');d.className='coach';d.id='coachTip';d.innerHTML='👆 Tap any area for its 10-yr price trajectory<span class="cx" onclick="dismissCoach()">×</span>';$('mapwrap').appendChild(d);}

// ---- H5: scrubber axis ----
function buildScrubAxis(){
  const ax=$('taxis');if(!ax)return;const max=43, splitPct=ACTUAL_MAX/max*100;
  $('time').style.setProperty('--split',splitPct.toFixed(1)+'%');
  let html='<div class="proj" style="left:'+splitPct.toFixed(1)+'%;right:0"></div><div class="nowm" style="left:'+splitPct.toFixed(1)+'%">now ’26</div>';
  for(let y=2019;y<=2029;y+=2){const pct=((y-2019)*4)/max*100;html+='<div class="tk" style="left:'+pct.toFixed(1)+'%">’'+String(y).slice(2)+'</div>';}
  ax.innerHTML=html;
}

// ---- C4: legend collapse ----
$('legendCollapse').onclick=function(){$('legendStack').classList.toggle('collapsed');};

// ---- N4: mobile layers popover ----
function placeOverlays(){
  const block=$('overlaysBlock'),pop=$('layersPop'),controls=document.querySelector('#sidebar .controls');
  if(isMobile()){if(block.parentElement!==pop)pop.appendChild(block);}
  else if(block.parentElement!==controls){controls.appendChild(block);pop.classList.remove('show');}
}
function toggleLayersPop(){placeOverlays();$('layersPop').classList.toggle('show');}
window.addEventListener('resize',placeOverlays);

// ---- init ----
buildScrubAxis();
loadCompare();
placeOverlays();
const _opened=applyHash();
renderCompareTray();
applyPulse();
if(!_opened){ if(!isMobile()) setTimeout(()=>openDetail('Whitefield'),300); else createCoach(); }

// ---------- market heat (overheating) panel ----------
(function(){
  function med(a){const s=a.slice().sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;}
  const OH_SCORE={green:15,amber:55,red:90}, OH_DOT={green:'#1a9850',amber:'#f5a623',red:'#d73027'};
  const el=document.getElementById('ohBody');
  if(!el||!window.OVERHEAT)return;
  const L=DATA.localities, rate=OVERHEAT.mortgageRate||8.5;
  const medY=med(L.map(l=>l.yield));
  const carry=rate-medY;
  const mom=med(L.map(l=>{const s=l.series;return (s[s.length-2].price/s[s.length-6].price-1)*100;}));
  const doubled=L.filter(l=>l.price2026/l.price2019>=2).length;
  const top=L.slice().sort((a,b)=>b.price2026/b.price2019-a.price2026/a.price2019).slice(0,10);
  const zc={};top.forEach(l=>zc[l.zone]=(zc[l.zone]||0)+1);
  const zmax=Object.entries(zc).sort((a,b)=>b[1]-a[1])[0];
  const internal=[
    {name:'Rental yield (price-to-rent)',value:medY.toFixed(1)+'% · '+Math.round(100/medY)+'× rent',
     status:medY>=4?'green':medY>=3?'amber':'red',
     note:'Median across '+L.length+' localities. Owning costs roughly 3× renting; that gap is the speculative premium in prices.',
     src:'computed live from this dataset'},
    {name:'Negative carry vs home loan',value:'−'+carry.toFixed(1)+' pp',
     status:carry<2?'green':carry<4?'amber':'red',
     note:'Median yield '+medY.toFixed(1)+'% vs ~'+rate+'% loan rate — appreciation must cover a '+carry.toFixed(1)+'-point annual shortfall for buying to beat renting.',
     src:'computed live from this dataset'},
    {name:'Price momentum (last 4 actual quarters)',value:'+'+mom.toFixed(1)+'%/yr',
     status:mom<6?'green':mom<12?'amber':'red',
     note:'Decelerating from the 2021–24 surge but still above typical income growth.',
     src:'computed live from this dataset'},
    {name:'Boom concentration',value:doubled+' of '+L.length+' doubled since 2019',
     status:zmax[1]>=7?'red':zmax[1]>=5?'amber':'green',
     note:zmax[1]+' of the 10 fastest-appreciating localities are in the '+zmax[0]+' zone (tech corridor) — single-industry demand risk.',
     src:'computed live from this dataset'}
  ];
  const all=internal.concat(OVERHEAT.indicators||[]);
  const score=Math.round(all.reduce((s,i)=>s+(OH_SCORE[i.status]||55),0)/all.length);
  const band=score<35?['Cool','#1a9850']:score<55?['Warm','#fee08b']:score<75?['Overheating watch','#fc8d59']:['Bubble risk','#d73027'];
  el.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted" style="font-size:12px">Composite of '+all.length+' indicators</span><b style="color:'+band[1]+';font-size:15px">'+score+'/100 · '+band[0]+'</b></div>'+
    '<div class="oh-gauge"><div class="oh-needle" style="left:'+score+'%"></div></div>'+
    '<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted);margin-bottom:8px"><span>cool</span><span>warm</span><span>hot</span><span>bubble</span></div>'+
    '<div style="font-size:12px;line-height:1.55;margin-bottom:4px">'+(OVERHEAT.verdict||'')+'</div>'+
    all.map(i=>'<div class="oh-row"><span class="oh-dot" style="background:'+(OH_DOT[i.status]||OH_DOT.amber)+'"></span><div style="flex:1"><div style="display:flex;gap:8px;align-items:baseline"><b>'+i.name+'</b><span class="oh-val">'+i.value+'</span></div><div class="oh-note">'+i.note+'</div><div class="oh-src">'+(i.url?'<a href="'+i.url+'" target="_blank" rel="noopener">'+i.src+'</a>':i.src)+'</div></div></div>').join('')+
    '<div class="muted" style="font-size:10px;margin-top:10px">Updated '+(OVERHEAT.updated||'—')+' · thresholds are heuristics, not financial advice. Locality-level loan-default data is not public; the NPA reading is RBI system-level.</div>';
  if(/[?&]heat=1/.test(location.search))document.getElementById('overheatModal').style.display='flex';
})();

// ---------- project routes: nearest school & metro, walking + driving (parity with 3D view) ----------
map.createPane('routePane');map.getPane('routePane').style.zIndex=530;
const routeGroup=L.layerGroup();
let routeSeq=0;
function clearProjectRoutes(){routeGroup.clearLayers();if(map.hasLayer(routeGroup))map.removeLayer(routeGroup);routeSeq++;}
const _origOpenDetail=openDetail;openDetail=function(n){clearProjectRoutes();return _origOpenDetail(n);};
const _origCloseDetail=closeDetail;closeDetail=function(){clearProjectRoutes();return _origCloseDetail();};
async function osrmRoute2D(profile,a,b){ // a,b=[lat,lng]; profile 'foot'|'car'
  try{
    const u='https://routing.openstreetmap.de/routed-'+profile+'/route/v1/driving/'+a[1]+','+a[0]+';'+b[1]+','+b[0]+
      '?geometries=geojson&overview='+(profile==='foot'?'full':'false');
    const r=await fetch(u,{signal:AbortSignal.timeout(6000)});if(!r.ok)throw 0;
    const j=await r.json();if(!j.routes||!j.routes[0])throw 0;
    const rt=j.routes[0];
    return {coords:rt.geometry?rt.geometry.coordinates.map(c=>[c[1],c[0]]):[a,b],km:rt.distance/1000,min:rt.duration/60,exact:true};
  }catch(e){
    const km=haversine(a[0],a[1],b[0],b[1])*1.35;
    return {coords:[a,b],km,min:profile==='foot'?km/4.8*60:km/22*60,exact:false};
  }
}
async function showProjectRoutes(pr){
  const seq=++routeSeq;
  const box=document.getElementById('prRoutes');
  if(box)box.innerHTML='<div class="drivers"><div style="font-weight:700;margin-bottom:4px">🧭 Nearest school &amp; metro</div><div class="muted" style="font-size:11px">Finding walking &amp; driving routes…</div></div>';
  const sch=nearestSchools(pr.lat,pr.lng,1)[0];
  let met=null;METRO.lines.forEach(line=>line.stations.forEach(s=>{const d=haversine(pr.lat,pr.lng,s.lat,s.lng);if(!met||d<met.d)met={s,line,d};}));
  const pt=[pr.lat,pr.lng],schLL=[sch.s.lat,sch.s.lng],metLL=[met.s.lat,met.s.lng];
  const [w1,w2,d1,d2]=await Promise.all([
    osrmRoute2D('foot',pt,schLL),osrmRoute2D('foot',pt,metLL),
    osrmRoute2D('car',pt,schLL),osrmRoute2D('car',pt,metLL)]);
  if(seq!==routeSeq)return; // selection changed while fetching
  routeGroup.clearLayers();
  L.polyline(w1.coords,{pane:'routePane',color:'#21c198',weight:3.5,dashArray:'7,7',opacity:.9}).addTo(routeGroup);
  L.polyline(w2.coords,{pane:'routePane',color:met.line.color,weight:3.5,dashArray:'7,7',opacity:.9}).addTo(routeGroup);
  [[schLL,'#21c198'],[metLL,met.line.color]].forEach(p=>
    L.circleMarker(p[0],{pane:'routePane',radius:6,color:'#fff',weight:1.5,fillColor:p[1],fillOpacity:1}).addTo(routeGroup));
  routeGroup.addTo(map);
  const stSt=met.s.st==='op'?'open':met.s.st==='uc'?'under construction':'planned';
  const fr=(w,d)=>'🚶 '+w.km.toFixed(1)+' km · ~'+Math.round(w.min)+' min'+(w.exact?'':'*')+' &nbsp;·&nbsp; 🚗 '+d.km.toFixed(1)+' km · ~'+Math.round(d.min)+' min'+(d.exact?'':'*');
  const box2=document.getElementById('prRoutes');
  if(box2)box2.innerHTML='<div class="drivers"><div style="font-weight:700;margin-bottom:4px">🧭 Nearest school &amp; metro</div>'+
    '<div style="padding:3px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#21c198;margin-right:6px"></span><b style="font-size:12px">'+sch.s.n+'</b> <span class="muted" style="font-size:10px">· '+sch.s.b+'</span><div style="font-size:11.5px;margin:2px 0 0 14px">'+fr(w1,d1)+'</div></div>'+
    '<div style="padding:3px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+met.line.color+';margin-right:6px"></span><b style="font-size:12px">'+met.s.n+'</b> <span class="muted" style="font-size:10px">· '+met.line.name+' ('+stSt+')</span><div style="font-size:11.5px;margin:2px 0 0 14px">'+fr(w2,d2)+'</div></div>'+
    ((w1.exact&&w2.exact&&d1.exact&&d2.exact)?'':'<div class="muted" style="font-size:10px;margin-top:3px">* router unreachable — straight-line estimate</div>')+
    '<div class="muted" style="font-size:10px;margin-top:4px">Routes drawn on map · OSRM walking/driving profiles</div></div>';
  map.fitBounds(L.latLngBounds(w1.coords.concat(w2.coords)),{padding:[70,70],maxZoom:15});
}

// ---------- 2D <-> 3D view handoff: carry camera position across ----------
(function(){
  const l3=document.querySelector('a[href^="3d.html"]');
  if(l3)l3.addEventListener('click',function(){
    const c=map.getCenter(),z=map.getZoom();
    // MapLibre zoom is one level lower than Leaflet for the same scale (512px vs 256px tiles)
    this.href='3d.html#'+Math.max(8,z-1)+'/'+c.lat.toFixed(5)+'/'+c.lng.toFixed(5)+'/-15/58';
  });
  const mll=/[?&]ll=(-?[0-9.]+),(-?[0-9.]+),([0-9.]+)/.exec(location.search);
  if(mll)map.setView([+mll[1],+mll[2]],Math.round(+mll[3]));
})();

// deep link: index.html?proj=<name> opens a project with its routes (used by share links & tests)
(function(){
  const mp=/[?&]proj=([^&]+)/.exec(location.search);
  if(!mp)return;
  const name=decodeURIComponent(mp[1].replace(/\+/g,' ')).toLowerCase();
  const pr=PROJECTS.projects.find(p=>p.name.toLowerCase()===name);
  if(!pr)return;
  if(!projectsOn)document.getElementById('buildsToggle').click();
  setTimeout(()=>showProject(pr),400);
})();
