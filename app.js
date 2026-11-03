/* Browser-side playback of original CSV results. No model/solver is executed here. */
'use strict';
const $=id=>document.getElementById(id);
const configs={
 preview:{file:'tracking_250m_preview.csv',title:'Curvature-Based Path Following',info:'Recorded curvature-preview guidance (250 m preview) with vessel-model response. Original experiment parameters are fixed.',progress:'travelled_m',sigma:'sigma_m',ref:'kappa_ref',cmd:'kappa_cmd',actual:'kappa_actual'},
 ship:{file:'ship_model_closed_loop_tracking.csv',title:'Ship-model curvature tracking',info:'Recorded closed-loop ship-model response with curvature governor and rudder actuation. This is not a LOS run.',progress:'travelled_m',sigma:'sigma_projection_m',ref:'kappa_reference_1pm',cmd:'kappa_command_1pm',actual:'kappa_actual_1pm'},
 waypoint:{file:'closed_loop_tracking.csv',title:'Waypoint curvature tracking',info:'Recorded curvature-based waypoint-tracking path from the reference-generation and tracking study.',progress:'travelled_m',sigma:'sigma_projection_m',ref:'kappa_reference_1pm',cmd:'kappa_command_1pm',actual:null}
};
let experiments={},current='preview',cursor=0,playing=false,frame=0,lastFrame=0,fitBounds=null;
// Nominal route points are defined identically in the three supplied Python examples.
// They are not necessarily points on the curvature-smoothed reference itself.
const waypoints=[{x_m:0,y_m:0},{x_m:2200,y_m:0},{x_m:2200,y_m:1200},{x_m:0,y_m:2200}];
const finite=v=>Number.isFinite(v),num=v=>{const n=Number(v);return v===''?NaN:n;};
function parseCSV(raw){const lines=raw.trim().split(/\r?\n/),keys=lines.shift().split(',');return lines.map(line=>{const cells=line.split(','),row={};keys.forEach((key,i)=>row[key]=key==='saturated'?cells[i]==='True':num(cells[i]));return row;}).filter(r=>finite(r.x_m)&&finite(r.y_m));}
const fmt=(v,n=2)=>finite(v)?v.toFixed(n):'—';
function getCanvas(id){const canvas=$(id),box=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.round(box.width*dpr));canvas.height=Math.max(1,Math.round(box.height*dpr));const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);return {c,w:box.width,h:box.height};}
function boundsOf(rows){let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;for(const r of rows){minx=Math.min(minx,r.x_m);maxx=Math.max(maxx,r.x_m);miny=Math.min(miny,r.y_m);maxy=Math.max(maxy,r.y_m);}const span=Math.max(maxx-minx,maxy-miny,100);return {cx:(maxx+minx)/2,cy:(maxy+miny)/2,span:span*1.18};}
function line(c,points,col,width=2){if(points.length<2)return;c.strokeStyle=col;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function drawMap(){const {c,w,h}=getCanvas('map'),data=experiments[current]||[];c.fillStyle='#0c1727';c.fillRect(0,0,w,h);if(!data.length)return;const pad=28,b=fitBounds||boundsOf([...data,...waypoints]),scale=Math.min((w-2*pad)/b.span,(h-2*pad)/b.span),center=$('follow').checked?data[Math.min(cursor,data.length-1)]:{x_m:b.cx,y_m:b.cy};const xy=r=>[w/2+(r.x_m-center.x_m)*scale,h/2-(r.y_m-center.y_m)*scale];
 c.strokeStyle='#1c3146';c.lineWidth=.7;const step=Math.pow(10,Math.floor(Math.log10(b.span/7||1)));for(let d=-15;d<=15;d++){const off=d*step*scale;if(Math.abs(off)>Math.max(w,h))continue;c.beginPath();c.moveTo(w/2+off,0);c.lineTo(w/2+off,h);c.moveTo(0,h/2+off);c.lineTo(w,h/2+off);c.stroke();}
 if($('compare').checked)for(const [key,other] of Object.entries(experiments)){
   if(key!==current&&other.length){
     const end=Math.floor(cursor/Math.max(1,data.length-1)*(other.length-1));
     line(c,other.slice(0,end+1).filter((_,i)=>i%Math.max(1,Math.floor(other.length/1500))===0).map(xy),'#8065b3',1.15);
   }
 }
 if($('trace').checked)line(c,data.slice(0,cursor+1).map(xy),'#42e5d0',2.8);
 if($('waypoints').checked){
   line(c,waypoints.map(xy),'#94703d',1);
   c.font='bold 11px ui-monospace, monospace';
   for(const [i,wp] of waypoints.entries()){
     const [px,py]=xy(wp);if(px<0||px>w||py<0||py>h)continue;
     c.fillStyle='#f7c174';c.strokeStyle='#0c1727';c.lineWidth=2;
     c.beginPath();c.arc(px,py,5,0,Math.PI*2);c.fill();c.stroke();
     c.fillText(`WP${i+1}`,px+9,py-9);
   }
 }
 const r=data[Math.min(cursor,data.length-1)],[x,y]=xy(r),a=r.chi_rad||0;
 // The bow follows chi: +X = sin(chi), +Y = cos(chi); canvas Y is inverted.
 const fx=Math.sin(a),fy=-Math.cos(a),sx=Math.cos(a),sy=Math.sin(a);
 const hull=[[15,0],[5,7],[-13,7],[-16,4],[-16,-4],[-13,-7],[5,-7]];
 c.beginPath();hull.forEach(([along,across],i)=>{
   const px=x+fx*along+sx*across,py=y+fy*along+sy*across;
   if(i===0)c.moveTo(px,py);else c.lineTo(px,py);
 });c.closePath();c.fillStyle='#1b8c94';c.strokeStyle='#ddfff8';c.lineWidth=2;c.fill();c.stroke();
 c.strokeStyle='#d3fff2';c.lineWidth=1;c.beginPath();c.moveTo(x-fx*6,y-fy*6);c.lineTo(x+fx*10,y+fy*10);c.stroke();
 $('mapBounds').textContent=`X ${fmt(r.x_m,1)} m · Y ${fmt(r.y_m,1)} m · Heading ${fmt(a*180/Math.PI,1)}°`;
}
function chart(id,series){const {c,w,h}=getCanvas(id),data=experiments[current]||[];c.fillStyle='#121e30';c.fillRect(0,0,w,h);if(!data.length)return;const pad={l:52,r:15,t:15,b:29},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;let min=Infinity,max=-Infinity;for(const s of series)for(const r of data){const v=s.f(r);if(finite(v)){min=Math.min(min,v);max=Math.max(max,v);}}if(!finite(min))return;const range=Math.max(max-min,Math.abs(max)*.04,1e-7),lo=min-range*.10,hi=max+range*.10;
 const yy=v=>pad.t+ph-(v-lo)/(hi-lo)*ph;c.strokeStyle='#273d54';c.fillStyle='#8da5be';c.font='10px monospace';for(let i=0;i<=4;i++){const y=pad.t+i*ph/4;c.beginPath();c.moveTo(pad.l,y);c.lineTo(w-pad.r,y);c.stroke();const value=hi-i*(hi-lo)/4;c.fillText(Math.abs(value)<.01?value.toExponential(1):fmt(value,1),3,y+3);}c.fillText('Progress',w/2-23,h-6);
 const stride=Math.max(1,Math.floor(data.length/1000));for(const s of series){const pts=[];for(let i=0;i<=cursor;i+=stride){const v=s.f(data[i]);if(finite(v))pts.push([pad.l+pw*i/(data.length-1||1),yy(v)]);}if(cursor%stride!==0){const v=s.f(data[cursor]);if(finite(v))pts.push([pad.l+pw*cursor/(data.length-1||1),yy(v)]);}line(c,pts,s.color,1.65);}
 const x=pad.l+pw*cursor/(data.length-1||1);c.strokeStyle='#bdc9d5';c.setLineDash([4,4]);c.beginPath();c.moveTo(x,pad.t);c.lineTo(x,pad.t+ph);c.stroke();c.setLineDash([]);let dx=pad.l;for(const s of series){c.fillStyle=s.color;c.fillRect(dx,h-17,10,2);dx+=15;c.fillStyle='#aebed0';c.fillText(s.label,dx,h-12);dx+=c.measureText(s.label).width+13;}
}
function render(){const data=experiments[current]||[],cfg=configs[current];if(!data.length)return;cursor=Math.max(0,Math.min(data.length-1,Math.round(cursor)));const r=data[cursor];$('seek').max=String(data.length-1);$('seek').value=String(cursor);$('progressLabel').textContent=`${fmt(100*cursor/Math.max(1,data.length-1),1)}%`;$('distance').textContent=`${fmt(r[cfg.progress]/1000,2)} km`;$('error').textContent=`${fmt(r.e_y_m,2)} m`;$('heading').textContent=`${fmt(r.e_chi_rad*180/Math.PI,2)}°`;$('vesselSpeed').textContent=finite(r.speed_mps)?`${fmt(r.speed_mps,2)} m/s`:'—';$('status').textContent=playing?'● REPLAYING':'● RECORDED DATA';
 drawMap();chart('errorChart',[{label:'Cross-track',color:'#40e8c7',f:r=>r.e_y_m}]);chart('headingChart',[{label:'Heading error',color:'#66afea',f:r=>r.e_chi_rad*180/Math.PI}]);chart('curvatureChart',[{label:'Reference',color:'#f7b369',f:r=>r[cfg.ref]},{label:'Command',color:'#42e6cb',f:r=>r[cfg.cmd]},{label:'Actual',color:'#9781ef',f:r=>cfg.actual?r[cfg.actual]:NaN}]);chart('rudderChart',[{label:'Rudder',color:'#e5a5ff',f:r=>r.rudder_deg}]);}
function setStudy(key){current=key;cursor=0;playing=false;$('play').textContent='▶ Play';fitBounds=null;$('studyTitle').textContent='/ '+configs[key].title;$('studyInfo').textContent=configs[key].info;render();}
function tick(now){if(playing){const data=experiments[current]||[];if(data.length){const step=(now-lastFrame)/1000*Number($('speed').value)*8;frame+=step;const next=Math.floor(frame);if(next>cursor){cursor=Math.min(data.length-1,next);render();}if(cursor>=data.length-1){playing=false;$('play').textContent='▶ Play';render();}}}lastFrame=now;requestAnimationFrame(tick);}
$('study').addEventListener('change',e=>setStudy(e.target.value));$('speed').addEventListener('input',()=>{$('speedValue').textContent=$('speed').value+'×';});$('play').addEventListener('click',()=>{playing=!playing;frame=cursor;$('play').textContent=playing?'Ⅱ Pause':'▶ Play';render();});$('reset').addEventListener('click',()=>{playing=false;cursor=frame=0;$('play').textContent='▶ Play';render();});$('seek').addEventListener('input',()=>{cursor=frame=Number($('seek').value);render();});for(const id of ['trace','waypoints','compare','follow'])$(id).addEventListener('change',render);$('fit').addEventListener('click',()=>{$('follow').checked=false;fitBounds=null;render();});addEventListener('resize',render);
try{
  experiments=window.__recordedExperiments||{};
  for(const key of Object.keys(configs)){
    if(!Array.isArray(experiments[key])||experiments[key].length===0)
      throw new Error(`Missing bundled data for ${key}. Check recorded-data.js.`);
  }
  setStudy('preview');
  requestAnimationFrame(tick);
}catch(err){
  $('status').textContent='● DATA LOADING ERROR';
  $('studyInfo').textContent=err.message;
  console.error(err);
}
