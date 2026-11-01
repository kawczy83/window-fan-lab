import {
  windowState,
  onlyOpen,
  DEFAULT_INDOOR,
  applyConfig,
  resetSim,
  FLOW_MAX,
  flowModel,
  spawn,
  stepParticles,
} from "./model.js?v=2.6.0";
import { drawRoom } from "./draw.js?v=2.6.0";
import { drawChartRace } from "./charts.js?v=2.6.0";
import { setLeadingText, setPressed } from "./dom.js?v=2.6.0";
import { resetHistory, recordHistory } from "./history.js?v=2.6.0";
import { fromUnit, labelTempSlider, syncTempSlider } from "./units.js?v=2.6.0";

const EPS=0.08;
const PRESETS={
  outin:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"in",openWindows:windowState(true)}},
  sealed:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"out",openWindows:onlyOpen("south")}},
  exch:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"exchange",openWindows:onlyOpen("south")}},
  ws:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"west",fanMode:"out",openWindows:windowState(true)}},
  ns:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"north",fanMode:"out",openWindows:windowState(true)}},
  we:{A:{fanLoc:"west",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"east",fanMode:"out",openWindows:windowState(true)}},
};

function raceVerdict(aDoneAt,bDoneAt,warming){
  // Cooling: first to reach outdoor temp wins — call it as soon as one room finishes.
  // Warming: last to reach outdoor temp wins, so both must finish before judging.
  if(aDoneAt!=null&&bDoneAt!=null){
    if(Math.abs(aDoneAt-bDoneAt)<1e-9)return {result:"tie",time:aDoneAt};
    const aWins=warming?aDoneAt>bDoneAt:aDoneAt<bDoneAt;
    return {result:aWins?"A":"B",time:aWins?aDoneAt:bDoneAt};
  }
  if(!warming&&aDoneAt!=null)return {result:"A",time:aDoneAt};
  if(!warming&&bDoneAt!=null)return {result:"B",time:bDoneAt};
  return null;
}

function createRaceController({A,B,refs,geos,contexts,chart,setSegActive,renderWindowControls,openWindowSummary,integrate,getSpeed,reducedMotion,getUnit=()=>"F"}){
  let raceStartIndoor=DEFAULT_INDOOR, raceRunning=false, winner=null, raceTie=false;
  const simRows=[
    [A,geos.A,contexts.A,refs.timerA,refs.flowA,refs.runnerA,refs.labelA],
    [B,geos.B,contexts.B,refs.timerB,refs.flowB,refs.runnerB,refs.labelB],
  ];

  function resetRace(){
    resetSim(A,raceStartIndoor);resetSim(B,raceStartIndoor);
    resetHistory(A);resetHistory(B);
    refs.raceView.dataset.raceState="ready";
    refs.raStart.textContent="Start race";
    setLeadingText(refs.timerA,"0.0");setLeadingText(refs.timerB,"0.0");
    document.querySelectorAll(".presets button").forEach(button=>setPressed(button,false));
    raceRunning=false;winner=null;raceTie=false;refs.winbar.className="winbar";
    const warming=A.st.outdoor>raceStartIndoor;
    refs.winbar.textContent=warming?"Last to approach outdoor temperature wins. Press Start race.":"First to approach outdoor temperature wins. Press Start race.";
    refs.runnerA.classList.remove("win");refs.runnerB.classList.remove("win");
  }

  function tick(now,dt,fscale){
    const speed=getSpeed();
    simRows.forEach(([sim,g,ctx,timerEl,flowEl,runnerEl,labelEl])=>{
      let rate=flowModel(sim.st);
      if(raceRunning && !sim.doneAt){
        rate=integrate(sim,dt); sim.t+=dt;
        if(Math.abs(sim.st.indoor-sim.st.outdoor)<EPS){ sim.doneAt=sim.t; }
      }
      if(!reducedMotion){
        spawn(sim,g,raceRunning?rate:rate*0.4,fscale); stepParticles(sim,g,fscale);
        sim.fanAngle += (sim.st.fanMode==="off"?0:(raceRunning?0.06+rate*0.22:0.05))*(sim.st.fanMode==="in"?-1:1)*speed*fscale;
      }
      drawRoom(ctx,g,sim,{small:true,unit:getUnit()});
      if(raceRunning)recordHistory(sim,dt);
      setLeadingText(timerEl,sim.doneAt?sim.doneAt.toFixed(1):sim.t.toFixed(1));
      flowEl.textContent=Math.round(Math.min(1,rate/FLOW_MAX)*100)+"%";
      labelEl.textContent=`${sim.st.fanLoc} · ${{out:"exhaust",in:"intake",exchange:"exchange",off:"off"}[sim.st.fanMode]} · open ${openWindowSummary(sim.st)}`;
      runnerEl.classList.toggle("win", winner===sim||raceTie);
    });
    drawChartRace(chart,A,B,getUnit());

    if(raceRunning && !winner && !raceTie){
      const warming = A.st.outdoor > raceStartIndoor;
      const v=raceVerdict(A.doneAt,B.doneAt,warming);
      if(v&&v.result==="tie"){
        raceTie=true;
        refs.winbar.className="winbar winner";
        refs.winbar.textContent=`🏁 Dead heat — both configs reach outdoor temp in ${v.time.toFixed(1)} relative units`;
      } else if(v){
        winner = v.result==="A"?A:B;
        const wt=v.time.toFixed(1);
        refs.winbar.className="winbar winner";
        refs.winbar.textContent = warming
          ? `🏁 Config ${v.result} resists warming the longest — last to reach outdoor temp at ${wt} relative units`
          : `🏁 Config ${v.result} reaches outdoor temp first — ${wt} relative units`;
      }
    }
    if(raceRunning && A.doneAt && B.doneAt){raceRunning=false;refs.raceView.dataset.raceState="finished";}
  }

  function setWind(toward,speed){
    A.st.windDir=B.st.windDir=toward;
    if(Number.isFinite(speed))A.st.windSpeed=B.st.windSpeed=speed;
    resetRace();
  }

  // Sliders show the chosen unit; the race itself always runs in °F.
  refs.raIt.addEventListener("input",e=>{raceStartIndoor=fromUnit(+e.target.value,getUnit());labelTempSlider(refs.raIt,refs.raItVal,raceStartIndoor,getUnit());resetRace();});
  // Changing the outdoor target mid-race would move the finish line, so it resets like the indoor slider.
  refs.raOt.addEventListener("input",e=>{A.st.outdoor=B.st.outdoor=fromUnit(+e.target.value,getUnit());labelTempSlider(refs.raOt,refs.raOtVal,A.st.outdoor,getUnit());resetRace();});
  refs.raReset.addEventListener("click",resetRace);
  refs.raStart.addEventListener("click",()=>{resetRace();raceRunning=true;refs.raceView.dataset.raceState="running";refs.raStart.textContent="Restart race";refs.winbar.textContent="Racing… Times are relative simulation units.";});

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
      setPressed(btn,true);
    });
  });

  function renderUnits(){
    syncTempSlider(refs.raIt,refs.raItVal,raceStartIndoor,getUnit());
    syncTempSlider(refs.raOt,refs.raOtVal,A.st.outdoor,getUnit());
  }

  resetRace();
  return {tick,reset:resetRace,setWind,renderUnits};
}

export { createRaceController, raceVerdict };
