import {
  WINDOWS,
  WINDOW_IDS,
  DEFAULT_INDOOR,
  windowLabel,
  ensureFanWindow,
  isWindowOpen,
  availableWindows,
  applyConfig,
  FLOW_MAX,
  flowModel,
  bestConfigFor,
  geomFor,
  makeSim,
  resetSim,
  spawn,
  stepParticles,
} from "./model.js?v=2.6.0";
import { getDomRefs, setLeadingText, setPressed } from "./dom.js?v=2.6.0";
import { prepCanvas, tempColor, drawRoom } from "./draw.js?v=2.6.0";
import { drawChartSingle, drawChartRace } from "./charts.js?v=2.6.0";
import { createRaceController } from "./race.js?v=2.6.0";
import { createWindRose } from "./wind-rose.js?v=2.6.0";
import { statusText } from "./status.js?v=2.6.0";
import { createWindControls } from "./environment.js?v=2.6.0";
import { resetHistory, recordHistory } from "./history.js?v=2.6.0";
import { normalizeUnit, fromUnit, unitSymbol, unitName, formatTemp, formatTempWithUnit, labelTempSlider, syncTempSlider, loadUnit, saveUnit } from "./units.js?v=2.6.0";

  /* =================== STATE & LOOP =================== */
  let mode="sandbox", SPEED=1, sandboxStartIndoor=DEFAULT_INDOOR;
  const unitStore=(()=>{try{return window.localStorage;}catch(err){return null;}})(); // access itself can throw
  let unit=loadUnit(unitStore); // display only: temperatures stay in °F inside the simulation
  const REDUCED_MOTION=Boolean(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const sandbox=makeSim();
  const A=makeSim({fanLoc:"south",fanMode:"out"});
  const B=makeSim({fanLoc:"south",fanMode:"in"});
  let race;

  const K=0.16;
  function integrate(sim,dt){
    const rate=flowModel(sim.st);
    sim.st.indoor += -K*rate*(sim.st.indoor-sim.st.outdoor)*dt;
    if(Math.abs(sim.st.indoor-sim.st.outdoor)<0.02) sim.st.indoor=sim.st.outdoor;
    return rate;
  }

  const refs=getDomRefs();
  const {
    sbRoom,sbChart,raRoom,rbRoom,raChart,sbIn,sbOut,sbFlowBar,sbFlowPct,sbStatus,legendIn,legendOut,
    sbIt,sbItVal,sbOt,sbOtVal,sbReset,sbBest,
    modeSwitch,sandboxView,raceView,speedSeg,unitSeg,
  }=refs;
  const sbP=prepCanvas(sbRoom), sbCtx=sbP.ctx, sbGeo=geomFor(sbP.W,sbP.H);
  const raP=prepCanvas(raRoom), raCtx=raP.ctx, raGeo=geomFor(raP.W,raP.H);
  const rbP=prepCanvas(rbRoom), rbCtx=rbP.ctx, rbGeo=geomFor(rbP.W,rbP.H);
  const sbChartP=prepCanvas(sbChart), raChartP=prepCanvas(raChart);

  let legendWarmIn=null;
  function renderLegend(){
    const warmIn=sandbox.st.outdoor>sandbox.st.indoor;
    if(warmIn===legendWarmIn)return;
    legendWarmIn=warmIn;
    legendIn.querySelector(".dot").style.background=warmIn?"var(--warm)":"var(--cool)";
    legendOut.querySelector(".dot").style.background=warmIn?"var(--cool)":"var(--warm)";
    legendIn.lastChild.nodeValue=warmIn?"warm outdoor air in":"cool outdoor air in";
    legendOut.lastChild.nodeValue=warmIn?"cool indoor air out":"warm indoor air out";
  }

  resetHistory(sandbox);
  let lastStatus="";
  let last=performance.now();
  function tick(now){
    const realDt=Math.min(0.05,(now-last)/1000); last=now;
    const dt=realDt*SPEED, fscale=realDt*60; // fscale: animation step in 60 Hz frame units, refresh-rate independent

    if(mode==="sandbox"){
      const rate=integrate(sandbox,dt);
      if(!REDUCED_MOTION){
        spawn(sandbox,sbGeo,rate,fscale); stepParticles(sandbox,sbGeo,fscale);
        sandbox.fanAngle += (sandbox.st.fanMode==="off"?0:0.06+rate*0.22)*(sandbox.st.fanMode==="in"?-1:1)*SPEED*fscale;
      }
      drawRoom(sbCtx,sbGeo,sandbox,{unit});
      recordHistory(sandbox,dt);
      drawChartSingle(sbChartP,sandbox,unit);
      setLeadingText(sbIn,formatTemp(sandbox.st.indoor,unit,1));
      sbIn.style.color=tempColor(sandbox.st,sandbox.st.indoor);
      setLeadingText(sbOut,formatTemp(sandbox.st.outdoor,unit));
      sbOut.style.color=tempColor(sandbox.st,sandbox.st.outdoor);
      renderLegend();
      const pct=Math.round(Math.min(1,rate/FLOW_MAX)*100);
      sbFlowBar.style.width=pct+"%";sbFlowPct.textContent=pct+"%";
      refs.sbFlowMeter.setAttribute("aria-valuenow",pct);
      const status=statusText(sandbox.st);
      if(status!==lastStatus){sbStatus.innerHTML=status;lastStatus=status;}
    } else race.tick(now,dt,fscale);
    requestAnimationFrame(tick);
  }

  /* =================== UI WIRING =================== */
  const simByKey={sb:sandbox,A:A,B:B};
  function applySeg(target,key,val){
    const sim=simByKey[target];
    sim.st[key]=val;
    ensureFanWindow(sim.st);
    renderWindowControls(target);
    if(target!=="sb")race.reset();
  }
  const segmentBoxes=new Map();
  const windowBoxes=new Map();
  // delegate mutually exclusive segmented controls
  document.querySelectorAll(".seg[data-sim][data-key]").forEach(box=>{
    segmentBoxes.set(`${box.dataset.sim}:${box.dataset.key}`,box);
    box.addEventListener("click",e=>{
      const b=e.target.closest("button"); if(!b)return;
      [...box.children].forEach(c=>setPressed(c,c===b));
      applySeg(box.dataset.sim, box.dataset.key, b.dataset.v);
      // warm styling for "off"
      if(box.dataset.key==="fanMode") box.classList.toggle("warm", b.dataset.v==="off");
      if(box.dataset.sim==="sb")renderBestButton();
    });
  });
  function setSegActive(target,key,val){const box=segmentBoxes.get(`${target}:${key}`);if(!box)return;[...box.children].forEach(c=>setPressed(c,c.dataset.v===val));box.classList.toggle("warm", key==="fanMode"&&val==="off");}
  function openWindowSummary(st){
    const names=availableWindows(st);
    return names.length?names.map(name=>WINDOWS[name].wall).join("/"):"none";
  }
  function renderWindowControls(target){
    const sim=simByKey[target], box=windowBoxes.get(target);
    if(!sim||!box)return;
    for(const b of box.children){
      const name=b.dataset.window, forced=sim.st.fanMode!=="off"&&sim.st.fanLoc===name, open=isWindowOpen(sim.st,name);
      setPressed(b,open);b.disabled=forced;
      b.textContent=`${target==="sb"?windowLabel(name):WINDOWS[name].wall} · ${forced?"fan":(open?"open":"closed")}`;
    }
  }
  function renderAllWindowControls(){for(const target of Object.keys(simByKey))renderWindowControls(target);}
  document.querySelectorAll(".window-seg[data-sim]").forEach(box=>{
    windowBoxes.set(box.dataset.sim,box);
    box.addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b||b.disabled)return;
      const sim=simByKey[box.dataset.sim],name=b.dataset.window;
      sim.st.openWindows[name]=!sim.st.openWindows[name];
      renderWindowControls(box.dataset.sim);
      if(box.dataset.sim==="sb")renderBestButton();
      else race.reset();
    });
  });

  function sandboxBestConfig(){return bestConfigFor(Object.assign({},sandbox.st,{indoor:sandboxStartIndoor}));}
  function renderBestButton(){
    const cfg=sandboxBestConfig(), modeLabel={out:"Exhaust",in:"Intake",exchange:"Exchange"};
    const opens=WINDOW_IDS.filter(name=>cfg.openWindows[name]&&!sandbox.st.openWindows[name]);
    let text;
    if(opens.length) text=`Open ${opens.map(windowLabel).join(" + ")} · fan ${cfg.fanMode==="off"?"off":`${modeLabel[cfg.fanMode]} at ${windowLabel(cfg.fanLoc)}`}`;
    else if(cfg.fanMode==="off") text=WINDOW_IDS.some(name=>cfg.openWindows[name])?"Fan off · keep windows open":"Fan off · all closed";
    else text=`${windowLabel(cfg.fanLoc)} · ${modeLabel[cfg.fanMode]}`;
    sbBest.textContent="Load best: "+text;
  }

  function resetSandbox(){resetSim(sandbox,sandboxStartIndoor);resetHistory(sandbox);}

  // sandbox sliders/buttons
  function renderResetLabel(){sbReset.textContent="Reset room → "+formatTempWithUnit(sandboxStartIndoor,unit);}
  sbIt.addEventListener("input",e=>{sandboxStartIndoor=fromUnit(+e.target.value,unit);labelTempSlider(sbIt,sbItVal,sandboxStartIndoor,unit);renderResetLabel();resetSandbox();renderBestButton();});
  sbOt.addEventListener("input",e=>{sandbox.st.outdoor=fromUnit(+e.target.value,unit);labelTempSlider(sbOt,sbOtVal,sandbox.st.outdoor,unit);renderBestButton();});
  sbReset.addEventListener("click",()=>resetSandbox());
  sbBest.addEventListener("click",()=>{
    const cfg=sandboxBestConfig();applyConfig(sandbox.st,cfg);resetSandbox();
    setSegActive("sb","fanLoc",cfg.fanLoc);setSegActive("sb","fanMode",cfg.fanMode);
    renderWindowControls("sb");
    renderBestButton(); // applying a pair suggestion opens windows, which changes what "best" reads as
  });

  race=createRaceController({
    A,B,refs,
    geos:{A:raGeo,B:rbGeo},
    contexts:{A:raCtx,B:rbCtx},
    chart:raChartP,
    setSegActive,
    renderWindowControls,
    openWindowSummary,
    integrate,
    getSpeed:()=>SPEED,
    getUnit:()=>unit,
    reducedMotion:REDUCED_MOTION,
  });

  // mode switch
  modeSwitch.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>setPressed(c,c===b));
    mode=b.dataset.m;
    sandboxView.hidden=mode!=="sandbox";
    raceView.hidden=mode!=="race";
  });
  // speed
  speedSeg.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>setPressed(c,c===b));SPEED=+b.dataset.s;
  });

  // temperature unit: switching only changes what is shown, never the simulated temperatures
  function applyUnit(next){
    unit=normalizeUnit(next);
    [...unitSeg.children].forEach(c=>setPressed(c,c.dataset.u===unit));
    for(const el of [sbIn,sbOut])el.querySelector(".u").textContent=unitSymbol(unit);
    setLeadingText(sbIn,formatTemp(sandbox.st.indoor,unit,1));
    setLeadingText(sbOut,formatTemp(sandbox.st.outdoor,unit));
    sbRoom.setAttribute("aria-label",`Animated room view with indoor temperature in ${unitName(unit)}`);
    raRoom.setAttribute("aria-label",`Config A room with indoor temperature in ${unitName(unit)}`);
    rbRoom.setAttribute("aria-label",`Config B room with indoor temperature in ${unitName(unit)}`);
    syncTempSlider(sbIt,sbItVal,sandboxStartIndoor,unit);
    syncTempSlider(sbOt,sbOtVal,sandbox.st.outdoor,unit);
    renderResetLabel();
    sbChart.setAttribute("aria-label",`Indoor temperature in ${unitName(unit)} over relative simulation time`);
    raChart.setAttribute("aria-label",`Temperatures for configs A and B in ${unitName(unit)} over relative simulation time`);
    race.renderUnits();
    // Redraw immediately, including the inactive view, without stepping either simulation.
    drawRoom(sbCtx,sbGeo,sandbox,{unit});
    drawRoom(raCtx,raGeo,A,{small:true,unit});
    drawRoom(rbCtx,rbGeo,B,{small:true,unit});
    drawChartSingle(sbChartP,sandbox,unit);
    drawChartRace(raChartP,A,B,unit);
  }
  unitSeg.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    applyUnit(b.dataset.u);saveUnit(unitStore,unit);
  });

  // A single wind input keeps both views under the same weather.
  function applySharedWind(toward,speed){
    sandbox.st.windDir=toward;sandbox.st.windSpeed=speed;
    race.setWind(toward,speed);
    renderBestButton();
  }
  const windControls=createWindControls({refs,onChange:applySharedWind});

  // boot
  document.querySelectorAll(".seg button, .switch button").forEach(b=>b.setAttribute("aria-pressed",b.classList.contains("active")?"true":"false"));
  createWindRose({refs,applyWindToActive:(toward,source)=>windControls.apply(toward,undefined,source)}).init();
  renderAllWindowControls();
  renderBestButton();
  applyUnit(unit);
  document.documentElement.dataset.appReady="true";
  window.dispatchEvent(new Event("window-fan-lab-ready"));
  requestAnimationFrame(tick);
