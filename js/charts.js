import { HIST_MAX } from "./model.js?v=2.4.1";
import { tempColor } from "./draw.js?v=2.4.1";

function drawChartSingle(ch,sim){
  const cx=ch.ctx,CW=ch.W,CH=ch.H,st=sim.st;
  cx.clearRect(0,0,CW,CH);
  const top=14,bot=CH-22,left=34,right=CW-10;
  const tMin=Math.min(st.outdoor-2,...sim.hist,60), tMax=Math.max(78,st.outdoor,...sim.hist);
  const yOf=t=>bot-((t-tMin)/(tMax-tMin))*(bot-top);
  cx.strokeStyle="#1f2734";cx.lineWidth=1;cx.fillStyle="#5b6b86";cx.font="9px 'JetBrains Mono'";cx.textAlign="right";
  for(let k=0;k<=4;k++){const tv=tMin+(tMax-tMin)*k/4,y=yOf(tv);cx.beginPath();cx.moveTo(left,y);cx.lineTo(right,y);cx.stroke();cx.fillText(tv.toFixed(0),left-5,y+3);}
  cx.strokeStyle="rgba(34,211,238,.5)";cx.setLineDash([5,4]);cx.lineWidth=1.5;cx.beginPath();cx.moveTo(left,yOf(st.outdoor));cx.lineTo(right,yOf(st.outdoor));cx.stroke();cx.setLineDash([]);
  cx.fillStyle="rgba(34,211,238,.8)";cx.textAlign="left";cx.fillText("outdoor "+st.outdoor+"°",left+4,yOf(st.outdoor)-4);
  plotLine(cx,sim.hist,left,right,yOf,"#fb7185",tempColor(st,st.indoor));
}

function plotLine(cx,hist,left,right,yOf,c0,c1){
  if(hist.length<2)return;
  cx.lineWidth=2.4;const g=cx.createLinearGradient(left,0,right,0);g.addColorStop(0,c0);g.addColorStop(1,c1);cx.strokeStyle=g;cx.beginPath();
  hist.forEach((t,i)=>{const x=left+(right-left)*(i/(HIST_MAX-1)),y=yOf(t);i?cx.lineTo(x,y):cx.moveTo(x,y);});cx.stroke();
  const hx=left+(right-left)*((hist.length-1)/(HIST_MAX-1)),hy=yOf(hist[hist.length-1]);cx.fillStyle=c1;cx.beginPath();cx.arc(hx,hy,3.5,0,7);cx.fill();
}

function drawChartRace(ch,a,b){
  const cx=ch.ctx,CW=ch.W,CH=ch.H,out=a.st.outdoor;
  cx.clearRect(0,0,CW,CH);
  const top=14,bot=CH-22,left=34,right=CW-10;
  const all=a.hist.concat(b.hist);
  const tMin=Math.min(out-2,...all,60), tMax=Math.max(78,out,...all);
  const yOf=t=>bot-((t-tMin)/(tMax-tMin))*(bot-top);
  cx.strokeStyle="#1f2734";cx.lineWidth=1;cx.fillStyle="#5b6b86";cx.font="9px 'JetBrains Mono'";cx.textAlign="right";
  for(let k=0;k<=4;k++){const tv=tMin+(tMax-tMin)*k/4,y=yOf(tv);cx.beginPath();cx.moveTo(left,y);cx.lineTo(right,y);cx.stroke();cx.fillText(tv.toFixed(0),left-5,y+3);}
  cx.strokeStyle="rgba(255,255,255,.25)";cx.setLineDash([5,4]);cx.lineWidth=1.5;cx.beginPath();cx.moveTo(left,yOf(out));cx.lineTo(right,yOf(out));cx.stroke();cx.setLineDash([]);
  cx.fillStyle="rgba(255,255,255,.5)";cx.textAlign="left";cx.fillText("outdoor "+out+"°",left+4,yOf(out)-4);
  plotLineSolid(cx,a.hist,left,right,yOf,"#fbbf24");
  plotLineSolid(cx,b.hist,left,right,yOf,"#22d3ee");
  cx.font="700 10px 'JetBrains Mono'";cx.textAlign="right";
  cx.fillStyle="#fbbf24";cx.fillText("A",right-2,top+10);
  cx.fillStyle="#22d3ee";cx.fillText("B",right-2,top+24);
}

function plotLineSolid(cx,hist,left,right,yOf,c){
  if(hist.length<2)return;cx.lineWidth=2.4;cx.strokeStyle=c;cx.beginPath();
  hist.forEach((t,i)=>{const x=left+(right-left)*(i/(HIST_MAX-1)),y=yOf(t);i?cx.lineTo(x,y):cx.moveTo(x,y);});cx.stroke();
  const hx=left+(right-left)*((hist.length-1)/(HIST_MAX-1)),hy=yOf(hist[hist.length-1]);cx.fillStyle=c;cx.beginPath();cx.arc(hx,hy,3.5,0,7);cx.fill();
}

export { drawChartSingle, drawChartRace };
