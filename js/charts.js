import { toUnit, unitSymbol, formatTempWithUnit } from "./units.js?v=2.6.0";

function fitChart(ch){
  const width=ch.cv.clientWidth,height=ch.cv.clientHeight;
  if(!width||!height)return;
  const ratio=Math.min(3,window.devicePixelRatio||1);
  if(ch.W===width&&ch.H===height&&ch.ratio===ratio)return;
  ch.W=width;ch.H=height;ch.ratio=ratio;
  ch.cv.width=Math.round(width*ratio);ch.cv.height=Math.round(height*ratio);
  ch.ctx.setTransform(ratio,0,0,ratio,0,0);
}
function chartDomain(sims,unit="F"){
  // Temperature bounds are in the display unit so the axis pads and labels in whole degrees of it.
  const temperatures=sims.flatMap(sim=>[sim.st.outdoor,...sim.hist]).map(temperature=>toUnit(temperature,unit));
  const times=sims.flatMap(sim=>sim.histTimes);
  const first=Math.min(...times),last=Math.max(...times);
  return {minTemp:Math.floor(Math.min(...temperatures)-1),maxTemp:Math.ceil(Math.max(...temperatures)+1),minTime:first,maxTime:Math.max(first+5,last)};
}
function drawAxes(ch,sims,unit){
  fitChart(ch);
  const cx=ch.ctx,{W,H}=ch;
  const domain=chartDomain(sims,unit);
  const left=42,right=W-16,top=30,bottom=H-58;
  const yAt=value=>bottom-(value-domain.minTemp)/(domain.maxTemp-domain.minTemp)*(bottom-top); // display unit
  const yOf=fahrenheit=>yAt(toUnit(fahrenheit,unit));
  const xOf=value=>left+(value-domain.minTime)/(domain.maxTime-domain.minTime)*(right-left);
  cx.clearRect(0,0,W,H);
  cx.font='12px "Archivo", sans-serif';cx.fillStyle="#a5b2c5";cx.textAlign="left";
  cx.fillText(`Temperature (${unitSymbol(unit)})`,left,17);
  cx.textAlign="right";cx.strokeStyle="rgba(148,163,184,.15)";cx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const temperature=domain.minTemp+(domain.maxTemp-domain.minTemp)*i/4,y=yAt(temperature);
    cx.beginPath();cx.moveTo(left,y);cx.lineTo(right,y);cx.stroke();
    cx.fillText(Number(temperature.toFixed(1)).toString(),left-8,y+4);
  }
  const ticks=W<480?2:4;
  for(let i=0;i<=ticks;i++){
    const time=domain.minTime+(domain.maxTime-domain.minTime)*i/ticks;
    cx.textAlign=i===0?"left":i===ticks?"right":"center";
    cx.fillText(time.toFixed(1),xOf(time),bottom+20);
  }
  cx.textAlign="center";cx.fillText("Simulation time (relative units)",(left+right)/2,H-12);
  const outdoor=sims[0].st.outdoor;
  cx.strokeStyle="#84efff80";cx.setLineDash([5,5]);
  cx.beginPath();cx.moveTo(left,yOf(outdoor));cx.lineTo(right,yOf(outdoor));cx.stroke();cx.setLineDash([]);
  cx.textAlign="right";cx.fillStyle="#84efff";
  cx.fillText(`Outdoor ${formatTempWithUnit(outdoor,unit)}`,right,Math.max(top+12,yOf(outdoor)-7));
  return {xOf,yOf}; // yOf takes °F, like the simulation's history
}
function drawLine(cx,sim,axes,color){
  if(!sim.hist.length)return;
  cx.save();cx.strokeStyle=color;cx.lineWidth=2.5;cx.lineJoin="round";cx.lineCap="round";
  cx.beginPath();
  sim.hist.forEach((temperature,index)=>{
    const x=axes.xOf(sim.histTimes[index]),y=axes.yOf(temperature);
    if(index)cx.lineTo(x,y);else cx.moveTo(x,y);
  });
  cx.stroke();
  const end=sim.hist.length-1;
  cx.fillStyle=color;cx.beginPath();cx.arc(axes.xOf(sim.histTimes[end]),axes.yOf(sim.hist[end]),3,0,Math.PI*2);cx.fill();cx.restore();
}
function drawChartSingle(ch,sim,unit){
  const axes=drawAxes(ch,[sim],unit);
  drawLine(ch.ctx,sim,axes,"#ff7892");
}
function drawChartRace(ch,a,b,unit){
  const axes=drawAxes(ch,[a,b],unit);
  drawLine(ch.ctx,a,axes,"#ffc247");drawLine(ch.ctx,b,axes,"#31d8f4");
}
export { drawChartSingle, drawChartRace, chartDomain };
