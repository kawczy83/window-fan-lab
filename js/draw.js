import { DEFAULT_INDOOR, WIND, WINDOW_IDS, isWindowOpen, winOf } from "./model.js?v=2.5.0";

const lerp=(a,b,t)=>a+(b-a)*t;

const DPR=typeof window!=="undefined"&&window.devicePixelRatio?Math.min(3,window.devicePixelRatio):1;
function prepCanvas(cv){
  // Scale the backing store for hi-DPI displays; callers keep drawing in the original logical size.
  const W=cv.width,H=cv.height;
  if(DPR!==1){cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);}
  const ctx=cv.getContext("2d");
  ctx.setTransform(DPR,0,0,DPR,0,0);
  return {cv,ctx,W,H};
}

function tempColor(st,t){
  // Cyan↔red mapped over the scenario's own range, so warming rooms redden instead of staying cyan.
  const start=Number.isFinite(st.startIndoor)?st.startIndoor:DEFAULT_INDOOR;
  const lo=Math.min(start,st.outdoor), hi=Math.max(start,st.outdoor);
  const k=Math.max(0,Math.min(1,(t-lo)/Math.max(1,hi-lo)));
  const c=[34,211,238], w=[251,113,133];
  return `rgb(${lerp(c[0],w[0],k)|0},${lerp(c[1],w[1],k)|0},${lerp(c[2],w[2],k)|0})`;
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function arrow(ctx,x1,y1,x2,y2){
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1),h=8;
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-h*Math.cos(a-0.4),y2-h*Math.sin(a-0.4));
  ctx.lineTo(x2-h*Math.cos(a+0.4),y2-h*Math.sin(a+0.4));
  ctx.closePath();
  ctx.fill();
}

function drawFan(ctx,w,ang,r){
  ctx.save();ctx.translate(w.x,w.y);
  ctx.shadowColor="rgba(49,216,244,.72)";ctx.shadowBlur=16;
  ctx.fillStyle="rgba(5,13,21,.96)";ctx.beginPath();ctx.arc(0,0,r+6,0,7);ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle="rgba(132,239,255,.92)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r+6,0,7);ctx.stroke();
  ctx.strokeStyle="rgba(132,239,255,.20)";ctx.lineWidth=1;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    ctx.beginPath();ctx.moveTo(Math.cos(a)*4,Math.sin(a)*4);ctx.lineTo(Math.cos(a)*(r+3),Math.sin(a)*(r+3));ctx.stroke();
  }
  ctx.rotate(ang);ctx.fillStyle="#31d8f4";
  for(let i=0;i<4;i++){
    ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(0,0);
    ctx.quadraticCurveTo(r*.64,-r*.42,r,0);ctx.quadraticCurveTo(r*.72,r*.22,0,0);ctx.fill();
  }
  ctx.fillStyle="#07131d";ctx.beginPath();ctx.arc(0,0,4,0,7);ctx.fill();
  ctx.strokeStyle="#84efff";ctx.lineWidth=1;ctx.stroke();ctx.restore();
}

function drawWindow(ctx,g,w,isOpen,hasFan){
  const half=w.len/2; let x1,y1,x2,y2;
  if(w.wall==="N"||w.wall==="S"){x1=w.x-half;y1=w.y;x2=w.x+half;y2=w.y;} else {x1=w.x;y1=w.y-half;x2=w.x;y2=w.y+half;}
  ctx.save();ctx.lineCap="round";
  ctx.strokeStyle="#050a10";ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.shadowColor=hasFan?"rgba(49,216,244,.78)":(isOpen?"rgba(132,239,255,.25)":"transparent");
  ctx.shadowBlur=hasFan?14:(isOpen?6:0);
  ctx.lineWidth=5;ctx.strokeStyle=hasFan?"#84efff":(isOpen?"#63748e":"#273349");
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.shadowBlur=0;
  if(isOpen&&!hasFan){ctx.strokeStyle="rgba(132,239,255,.22)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  if(!isOpen&&!hasFan){ctx.strokeStyle="#3b4860";ctx.lineWidth=2;for(let t=.18;t<1;t+=.22){const mx=lerp(x1,x2,t),my=lerp(y1,y2,t);ctx.beginPath();if(w.wall==="N"||w.wall==="S"){ctx.moveTo(mx-5,my-6);ctx.lineTo(mx+5,my+6);}else{ctx.moveTo(mx-6,my-5);ctx.lineTo(mx+6,my+5);}ctx.stroke();}}
  ctx.restore();
}

function drawBackdrop(ctx,g){
  const bg=ctx.createLinearGradient(0,0,g.W,g.H);
  bg.addColorStop(0,"#070c13");bg.addColorStop(.58,"#0a111b");bg.addColorStop(1,"#060a10");
  ctx.fillStyle=bg;ctx.fillRect(0,0,g.W,g.H);
  ctx.strokeStyle="rgba(124,143,170,.055)";ctx.lineWidth=1;
  for(let x=18;x<g.W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,g.H);ctx.stroke();}
  for(let y=18;y<g.H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(g.W,y);ctx.stroke();}
  const glow=ctx.createRadialGradient(g.W*.52,g.H*.46,0,g.W*.52,g.H*.46,Math.max(g.W,g.H)*.56);
  glow.addColorStop(0,"rgba(49,216,244,.045)");glow.addColorStop(1,"rgba(0,0,0,.18)");
  ctx.fillStyle=glow;ctx.fillRect(0,0,g.W,g.H);
}

function compassMark(ctx,text,x,y){
  ctx.fillStyle="rgba(7,13,21,.82)";ctx.beginPath();ctx.arc(x,y,11,0,7);ctx.fill();
  ctx.strokeStyle="rgba(132,239,255,.12)";ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle="#71829a";ctx.font="700 10px 'JetBrains Mono'";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,x,y+.5);
}

function drawRoom(ctx,g,sim,opts){
  opts=opts||{};
  const st=sim.st;
  ctx.clearRect(0,0,g.W,g.H);drawBackdrop(ctx,g);

  ctx.save();ctx.shadowColor="rgba(0,0,0,.72)";ctx.shadowBlur=26;ctx.shadowOffsetY=12;
  ctx.fillStyle="#101927";roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,16);ctx.fill();ctx.restore();
  const room=ctx.createLinearGradient(g.R.x,g.R.y,g.R.x+g.R.w,g.R.y+g.R.h);
  room.addColorStop(0,"#172334");room.addColorStop(1,"#111a27");
  ctx.fillStyle=room;roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,16);ctx.fill();
  ctx.save();roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,16);ctx.clip();
  ctx.globalAlpha=.11;ctx.fillStyle=tempColor(st,st.indoor);ctx.fillRect(g.R.x,g.R.y,g.R.w,g.R.h);ctx.globalAlpha=1;
  ctx.strokeStyle="rgba(148,163,184,.045)";ctx.lineWidth=1;
  for(let x=g.R.x+22;x<g.R.x+g.R.w;x+=28){ctx.beginPath();ctx.moveTo(x,g.R.y);ctx.lineTo(x,g.R.y+g.R.h);ctx.stroke();}
  for(let y=g.R.y+22;y<g.R.y+g.R.h;y+=28){ctx.beginPath();ctx.moveTo(g.R.x,y);ctx.lineTo(g.R.x+g.R.w,y);ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle="#35445e";ctx.lineWidth=6;roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,16);ctx.stroke();
  ctx.strokeStyle="rgba(132,239,255,.10)";ctx.lineWidth=1;roundRect(ctx,g.R.x+4,g.R.y+4,g.R.w-8,g.R.h-8,12);ctx.stroke();

  compassMark(ctx,"N",g.R.x+g.R.w/2,g.R.y-g.M*.32);compassMark(ctx,"S",g.R.x+g.R.w/2,g.R.y+g.R.h+g.M*.32);
  compassMark(ctx,"W",g.R.x-g.M*.32,g.R.y+g.R.h/2);compassMark(ctx,"E",g.R.x+g.R.w+g.M*.32,g.R.y+g.R.h/2);

  const ws=st.windSpeed/10;
  if(ws>0){
    const alpha=Math.min(.72,.18+ws*.17);
    ctx.strokeStyle=`rgba(113,130,154,${alpha})`;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.5+Math.min(3,ws)*.72;
    const L=g.M*0.42+ws*g.M*0.3, off=g.M*0.7, wind=WIND[st.windDir]||WIND.S, lanes=[-0.28,0,0.28];
    const cx=g.R.x+g.R.w/2,cy=g.R.y+g.R.h/2,back=Math.abs(wind.x)*g.R.w/2+Math.abs(wind.y)*g.R.h/2+off;
    const laneSpan=Math.abs(wind.y)*g.R.w+Math.abs(wind.x)*g.R.h, px=-wind.y,py=wind.x;
    for(const ln of lanes){let sx,sy,ex,ey;
      sx=cx-wind.x*back+px*ln*laneSpan;sy=cy-wind.y*back+py*ln*laneSpan;
      ex=sx+wind.x*L;ey=sy+wind.y*L;
      arrow(ctx,sx,sy,ex,ey);
    }
  }

  for(const p of sim.particles){
    ctx.fillStyle=p.cool?"rgba(49,216,244,.92)":"rgba(255,120,146,.9)";
    ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,7);ctx.fill();
    ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(p.x,p.y,6,0,7);ctx.fill();ctx.globalAlpha=1;
  }

  const wins=WINDOW_IDS.map(name=>[name,winOf(g,name)]);
  for(const [name,w] of wins){
    const hasFan=st.fanLoc===name&&st.fanMode!=="off";
    drawWindow(ctx,g,w,isWindowOpen(st,name),hasFan);
  }
  const fr=Math.min(20,g.WIN*0.24);
  for(const [name,w] of wins)if(st.fanLoc===name&&st.fanMode!=="off")drawFan(ctx,w,sim.fanAngle,fr);
  const centerX=g.R.x+g.R.w/2,centerY=g.R.y+g.R.h/2;
  if(!opts.small){
    const setup=st.fanMode==="off"?"NATURAL VENTILATION":`${st.fanLoc.toUpperCase()} FAN · ${st.fanMode.toUpperCase()}`;
    ctx.font="700 9px 'JetBrains Mono'";
    ctx.fillStyle="rgba(6,12,19,.52)";roundRect(ctx,g.R.x+14,g.R.y+14,ctx.measureText(setup).width+18,23,6);ctx.fill();
    ctx.fillStyle="#8190a6";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(setup,g.R.x+23,g.R.y+25.5);
  }
  ctx.save();ctx.shadowColor=tempColor(st,st.indoor);ctx.shadowBlur=18;
  ctx.fillStyle=tempColor(st,st.indoor);ctx.font=`800 ${g.WIN*(opts.small?.78:.92)|0}px 'Archivo'`;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText(st.indoor.toFixed(1)+"°",centerX,centerY-(opts.small?3:7));ctx.restore();
  ctx.font="700 9px 'JetBrains Mono'";const label="INDOOR AIR",tw=ctx.measureText(label).width;
  ctx.fillStyle="rgba(5,11,18,.52)";roundRect(ctx,centerX-tw/2-8,centerY+g.WIN*.48-10,tw+16,20,6);ctx.fill();
  ctx.fillStyle="#75859b";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,centerX,centerY+g.WIN*.48);
}

export { prepCanvas, tempColor, drawRoom };
