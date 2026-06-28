import { WIND, WINDOW_IDS, isWindowOpen, winOf } from "./model.js";

const lerp=(a,b,t)=>a+(b-a)*t;

function tempColor(st,t){
  const span=Math.max(1,(74-st.outdoor));
  const k=Math.max(0,Math.min(1,(t-st.outdoor)/span));
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
  ctx.fillStyle="rgba(12,18,26,.92)";ctx.beginPath();ctx.arc(0,0,r+4,0,7);ctx.fill();
  ctx.strokeStyle="#6ee7f5";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r+4,0,7);ctx.stroke();
  ctx.rotate(ang);ctx.fillStyle="#22d3ee";
  for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(r*0.7,-r*0.35,r,0);ctx.quadraticCurveTo(r*0.7,r*0.18,0,0);ctx.fill();}
  ctx.fillStyle="#06121a";ctx.beginPath();ctx.arc(0,0,3.5,0,7);ctx.fill();ctx.restore();
}

function drawWindow(ctx,g,w,isOpen,hasFan){
  const half=w.len/2; let x1,y1,x2,y2;
  if(w.wall==="N"||w.wall==="S"){x1=w.x-half;y1=w.y;x2=w.x+half;y2=w.y;} else {x1=w.x;y1=w.y-half;x2=w.x;y2=w.y+half;}
  ctx.lineCap="round";
  ctx.strokeStyle="#0a0d12";ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.lineWidth=5;ctx.strokeStyle=hasFan?"#6ee7f5":(isOpen?"#4b5870":"#243044");
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  if(!isOpen&&!hasFan){ctx.strokeStyle="#33405a";ctx.lineWidth=2;for(let t=0.18;t<1;t+=0.22){const mx=lerp(x1,x2,t),my=lerp(y1,y2,t);ctx.beginPath();if(w.wall==="N"||w.wall==="S"){ctx.moveTo(mx-5,my-6);ctx.lineTo(mx+5,my+6);}else{ctx.moveTo(mx-6,my-5);ctx.lineTo(mx+6,my+5);}ctx.stroke();}}
  if(hasFan)drawFan(ctx,w,0,Math.min(20,w.len*0.24));
}

function drawRoom(ctx,g,sim,opts){
  opts=opts||{};
  const st=sim.st;
  ctx.clearRect(0,0,g.W,g.H);
  ctx.fillStyle="rgba(20,26,38,.9)";roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,14);ctx.fill();
  ctx.globalAlpha=0.10;ctx.fillStyle=tempColor(st,st.indoor);roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,14);ctx.fill();ctx.globalAlpha=1;
  ctx.strokeStyle="#33405a";ctx.lineWidth=6;roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,14);ctx.stroke();
  ctx.fillStyle="#5b6b86";ctx.font="700 12px 'JetBrains Mono'";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText("N",g.R.x+g.R.w/2,g.R.y-g.M*0.32);ctx.fillText("S",g.R.x+g.R.w/2,g.R.y+g.R.h+g.M*0.32);
  ctx.fillText("W",g.R.x-g.M*0.32,g.R.y+g.R.h/2);ctx.fillText("E",g.R.x+g.R.w+g.M*0.32,g.R.y+g.R.h/2);

  const ws=st.windSpeed/10;
  if(ws>0){
    ctx.strokeStyle=`rgba(91,107,134,${0.22+ws*0.5})`;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2+ws*1.6;
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
    ctx.fillStyle=p.cool?"rgba(34,211,238,.85)":"rgba(251,113,133,.85)";
    ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,7);ctx.fill();
    ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(p.x,p.y,5,0,7);ctx.fill();ctx.globalAlpha=1;
  }

  const wins=WINDOW_IDS.map(name=>[name,winOf(g,name)]);
  for(const [name,w] of wins){
    const hasFan=st.fanLoc===name&&st.fanMode!=="off";
    drawWindow(ctx,g,w,isWindowOpen(st,name),hasFan);
  }
  const fr=Math.min(20,g.WIN*0.24);
  for(const [name,w] of wins)if(st.fanLoc===name&&st.fanMode!=="off")drawFan(ctx,w,sim.fanAngle,fr);
  ctx.fillStyle=tempColor(st,st.indoor);ctx.font=`800 ${g.WIN*0.95|0}px 'Archivo'`;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText(st.indoor.toFixed(1)+"°",g.R.x+g.R.w/2,g.R.y+g.R.h/2-(opts.small?3:6));
  ctx.fillStyle="#6b7790";ctx.font="11px 'JetBrains Mono'";ctx.fillText("INDOOR",g.R.x+g.R.w/2,g.R.y+g.R.h/2+g.WIN*0.55);
}

export { tempColor, drawRoom };
