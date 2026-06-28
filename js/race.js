import {
  windowState,
  onlyOpen,
  applyConfig,
  resetSim,
  FLOW_MAX,
  flowModel,
  spawn,
  stepParticles,
} from "./model.js";
import { drawRoom } from "./draw.js";
import { drawChartRace } from "./charts.js";
import { setLeadingText } from "./dom.js";

const EPS=0.08;
const PRESETS={
  outin:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"in",openWindows:windowState(true)}},
  sealed:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"out",openWindows:onlyOpen("south")}},
  exch:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"exchange",openWindows:onlyOpen("south")}},
  ws:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"west",fanMode:"out",openWindows:windowState(true)}},
  ns:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"north",fanMode:"out",openWindows:windowState(true)}},
  we:{A:{fanLoc:"west",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"east",fanMode:"out",openWindows:windowState(true)}},
};

function createRaceController({A,B,refs,geos,contexts,chart,setSegActive,renderWindowControls,openWindowSummary,integrate,getSpeed}){
  let raceStartIndoor=74, raceRunning=false, winner=null, raceTie=false;
  const simRows=[
    [A,geos.A,contexts.A,refs.timerA,refs.flowA,refs.runnerA,refs.labelA],
    [B,geos.B,contexts.B,refs.timerB,refs.flowB,refs.runnerB,refs.labelB],
  ];

  function resetRace(){
    resetSim(A,raceStartIndoor);resetSim(B,raceStartIndoor);
    raceRunning=false;winner=null;raceTie=false;refs.winbar.className="winbar";
    const warming=A.st.outdoor>raceStartIndoor;
    refs.winbar.textContent=warming?"Last to reach outdoor temp wins (best insulation) in relative simulation time. Press Start.":"First to reach outdoor temp wins in relative simulation time. Press Start.";
    refs.runnerA.classList.remove("win");refs.runnerB.classList.remove("win");
  }

  function tick(now,dt){
    const speed=getSpeed();
    simRows.forEach(([sim,g,ctx,timerEl,flowEl,runnerEl,labelEl])=>{
      let rate=flowModel(sim.st);
      if(raceRunning && !sim.doneAt){
        rate=integrate(sim,dt); sim.t+=dt;
        if(Math.abs(sim.st.indoor-sim.st.outdoor)<EPS){ sim.doneAt=sim.t; }
      }
      spawn(sim,g,raceRunning?rate:rate*0.4); stepParticles(sim,g);
      sim.fanAngle += (sim.st.fanMode==="off"?0:(raceRunning?0.06+rate*0.22:0.05))*(sim.st.fanMode==="in"?-1:1)*speed;
      drawRoom(ctx,g,sim,{small:true});
      if(raceRunning && now-sim.lastHist>100){sim.hist.push(sim.st.indoor);if(sim.hist.length>240)sim.hist.shift();sim.lastHist=now;}
      setLeadingText(timerEl,sim.doneAt?sim.doneAt.toFixed(1):sim.t.toFixed(1));
      flowEl.textContent=Math.round(Math.min(1,rate/FLOW_MAX)*100)+"%";
      labelEl.textContent=`${sim.st.fanLoc} · ${sim.st.fanMode} · open ${openWindowSummary(sim.st)}`;
      runnerEl.classList.toggle("win", winner===sim||raceTie);
    });
    drawChartRace(chart,A,B);

    if(raceRunning && !winner && !raceTie){
      const warming = A.st.outdoor > raceStartIndoor;
      if(A.doneAt && B.doneAt){
        if(Math.abs(A.doneAt-B.doneAt)<1e-9){
          raceTie=true;
          refs.winbar.className="winbar winner";
          refs.winbar.textContent=`🏁 Dead heat — both configs reach outdoor temp in ${A.doneAt.toFixed(1)} relative units`;
        } else {
          winner = warming ? (A.doneAt>=B.doneAt?A:B) : (A.doneAt<=B.doneAt?A:B);
          const wname=winner===A?"A":"B", wt=winner.doneAt.toFixed(1);
          refs.winbar.className="winbar winner";
          refs.winbar.textContent = warming
            ? `🏁 Config ${wname} resists warming the longest — last to reach outdoor temp at ${wt} relative units`
            : `🏁 Config ${wname} reaches outdoor temp first — ${wt} relative units`;
        }
      } else if(!warming && (A.doneAt || B.doneAt)){
        winner = A.doneAt ? A : B;
        const wname=winner===A?"A":"B", wt=winner.doneAt.toFixed(1);
        refs.winbar.className="winbar winner";
        refs.winbar.textContent=`🏁 Config ${wname} reaches outdoor temp first — ${wt} relative units`;
      }
    }
    if(raceRunning && A.doneAt && B.doneAt){ raceRunning=false; }
  }

  function setWind(toward,speed){
    A.st.windDir=B.st.windDir=toward; setSegActive("ENV","windDir",toward);
    if(Number.isFinite(speed)){A.st.windSpeed=B.st.windSpeed=speed;refs.raWs.value=speed;refs.raWsVal.textContent=speed;}
  }

  refs.raWs.addEventListener("input",e=>{A.st.windSpeed=B.st.windSpeed=+e.target.value;refs.raWsVal.textContent=e.target.value;});
  refs.raIt.addEventListener("input",e=>{raceStartIndoor=+e.target.value;refs.raItVal.textContent=e.target.value+"°F";resetRace();});
  refs.raOt.addEventListener("input",e=>{A.st.outdoor=B.st.outdoor=+e.target.value;refs.raOtVal.textContent=e.target.value+"°F";});
  refs.raReset.addEventListener("click",resetRace);
  refs.raStart.addEventListener("click",()=>{resetRace();raceRunning=true;refs.winbar.textContent="Racing…";});

  document.querySelectorAll(".presets button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const p=PRESETS[btn.dataset.preset]; if(!p)return;
      applyConfig(A.st,p.A);applyConfig(B.st,p.B);
      ["A","B"].forEach(side=>{
        const cfg=p[side];
        setSegActive(side,"fanLoc",cfg.fanLoc);
        setSegActive(side,"fanMode",cfg.fanMode);
        renderWindowControls(side);
      });
      resetRace();
    });
  });

  return {tick,reset:resetRace,setWind};
}

export { createRaceController };
