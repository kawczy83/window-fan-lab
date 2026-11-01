import { HIST_MAX } from "./model.js?v=2.6.0";

function resetHistory(sim){
  sim.hist=[sim.st.indoor];
  sim.histTimes=[0];
  sim.histT=0;sim.lastHist=0;
}
function recordHistory(sim,dt){
  sim.histT+=dt;
  if(sim.histT-sim.lastHist<0.1)return;
  sim.hist.push(sim.st.indoor);
  sim.histTimes.push(sim.histT);
  if(sim.hist.length>HIST_MAX){sim.hist.shift();sim.histTimes.shift();}
  sim.lastHist=sim.histT;
}
export { resetHistory, recordHistory };
