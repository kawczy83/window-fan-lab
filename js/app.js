import {
  WIND,
  WINDOWS,
  WINDOW_IDS,
  windowLabel,
  ensureFanWindow,
  isWindowOpen,
  availableWindows,
  applyConfig,
  windBoost,
  windDominated,
  FLOW_MAX,
  flowModel,
  airPath,
  bestConfigFor,
  otherWindows,
  geomFor,
  makeSim,
  resetSim,
  spawn,
  stepParticles,
} from "./model.js";
import { getDomRefs, setLeadingText } from "./dom.js";
import { tempColor, drawRoom } from "./draw.js";
import { drawChartSingle } from "./charts.js";
import { createRaceController } from "./race.js";
import { createWindRose } from "./wind-rose.js";
import { createTrialsController } from "./trials.js";

  /* =================== STATUS TEXT (sandbox) =================== */
  function statusText(st){
    const path=airPath(st), openings=availableWindows(st), others=availableWindows(st,otherWindows(st.fanLoc));
    const stalled=(st.fanMode==="in"||st.fanMode==="out")&&!others.length, off=st.fanMode==="off";
    const dirName=(WIND[st.windDir]||WIND.S).name;
    let msg;
    if(off) msg=openings.length>1?`Fan is <b>off</b> — the room drifts through gentle natural exchange between open windows.`:`Fan is <b>off</b> with fewer than two open windows — barely any exchange.`;
    else if(stalled) msg=`Fan ${st.fanMode==="out"?"exhausting":"drawing"} without another open window. One-in/one-out rule kicks in — it stalls. Open a second window.`;
    else if(windDominated(st)) msg=`Wind toward ${dirName} <b>overpowers the fan</b>: air streams in via <b>${windowLabel(path.intake)}</b> and out via <b>${windowLabel(path.exhaust)}</b> at the natural cross-vent rate.`;
    else if(st.fanMode==="exchange") msg=`<b>Exchange</b> mode: one blade in, one out, through a single window. Works, but a fan + other open windows moves more air.`;
    else {const intake=windowLabel(path.intake), exhaust=windowLabel(path.exhaust), boost=windBoost(st);
      const windNote=boost>0.05?"<b>helping</b>":(boost<-0.05?"working against the fan":"a minor factor");
      msg=`Clear through-path: cool air in via <b>${intake}</b>, warm out via <b>${exhaust}</b>. Wind toward ${dirName} is ${windNote} here.`;}
    if(Math.abs(st.indoor-st.outdoor)<0.15&&!off) msg+=` <b style="color:var(--good)">Stabilised at outdoor temp.</b>`;
    return msg;
  }

  /* =================== STATE & LOOP =================== */
  let mode="sandbox", SPEED=1, sandboxStartIndoor=74;
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
    sbRoom,sbChart,raRoom,rbRoom,raChart,sbIn,sbOut,sbFlowBar,sbFlowPct,sbStatus,
    sbWs,sbWsVal,sbIt,sbItVal,sbOt,sbOtVal,sbReset,sbBest,
    modeSwitch,sandboxView,raceView,speedSeg,currentWindDir,currentWs,currentWsVal,applyCurrentWind,
  }=refs;
  const sbCtx=sbRoom.getContext("2d"), sbGeo=geomFor(sbRoom.width,sbRoom.height);
  const raCtx=raRoom.getContext("2d"), raGeo=geomFor(raRoom.width,raRoom.height);
  const rbCtx=rbRoom.getContext("2d"), rbGeo=geomFor(rbRoom.width,rbRoom.height);

  let last=performance.now();
  function tick(now){
    let dt=Math.min(0.05,(now-last)/1000)*SPEED; last=now;

    if(mode==="sandbox"){
      const rate=integrate(sandbox,dt);
      spawn(sandbox,sbGeo,rate); stepParticles(sandbox,sbGeo);
      sandbox.fanAngle += (sandbox.st.fanMode==="off"?0:0.06+rate*0.22)*(sandbox.st.fanMode==="in"?-1:1)*SPEED;
      drawRoom(sbCtx,sbGeo,sandbox);
      if(now-sandbox.lastHist>100){sandbox.hist.push(sandbox.st.indoor);if(sandbox.hist.length>240)sandbox.hist.shift();sandbox.lastHist=now;}
      drawChartSingle(sbChart,sandbox);
      setLeadingText(sbIn,sandbox.st.indoor.toFixed(1));
      sbIn.style.color=tempColor(sandbox.st,sandbox.st.indoor);
      setLeadingText(sbOut,String(sandbox.st.outdoor));
      const pct=Math.round(Math.min(1,rate/FLOW_MAX)*100);
      sbFlowBar.style.width=pct+"%";sbFlowPct.textContent=pct+"%";
      sbStatus.innerHTML=statusText(sandbox.st);
    } else race.tick(now,dt);
    requestAnimationFrame(tick);
  }

  /* =================== UI WIRING =================== */
  const simByKey={sb:sandbox,A:A,B:B};
  function applySeg(target,key,val){
    if(target==="ENV"){ A.st[key]=val; B.st[key]=val; if(key==="windDir"){/*nothing else*/} return; }
    const sim=simByKey[target];
    sim.st[key]=val;
    ensureFanWindow(sim.st);
    renderWindowControls(target);
  }
  const segmentBoxes=new Map();
  const windowBoxes=new Map();
  // delegate mutually exclusive segmented controls
  document.querySelectorAll(".seg[data-sim][data-key]").forEach(box=>{
    segmentBoxes.set(`${box.dataset.sim}:${box.dataset.key}`,box);
    box.addEventListener("click",e=>{
      const b=e.target.closest("button"); if(!b)return;
      [...box.children].forEach(c=>c.classList.remove("active")); b.classList.add("active");
      applySeg(box.dataset.sim, box.dataset.key, b.dataset.v);
      // warm styling for "off"
      if(box.dataset.key==="fanMode") box.classList.toggle("warm", b.dataset.v==="off");
      if(box.dataset.sim==="sb")renderBestButton();
    });
  });
  function setSegActive(target,key,val){const box=segmentBoxes.get(`${target}:${key}`);if(!box)return;[...box.children].forEach(c=>c.classList.toggle("active",c.dataset.v===val));box.classList.toggle("warm", key==="fanMode"&&val==="off");}
  function openWindowSummary(st){
    const names=availableWindows(st);
    return names.length?names.map(name=>WINDOWS[name].wall).join("/"):"none";
  }
  function renderWindowControls(target){
    const sim=simByKey[target], box=windowBoxes.get(target);
    if(!sim||!box)return;
    for(const b of box.children){
      const name=b.dataset.window, forced=sim.st.fanMode!=="off"&&sim.st.fanLoc===name, open=isWindowOpen(sim.st,name);
      b.classList.toggle("active",open);b.disabled=forced;
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
    });
  });

  function sandboxBestConfig(){return bestConfigFor(Object.assign({},sandbox.st,{indoor:sandboxStartIndoor}));}
  function renderBestButton(){
    const cfg=sandboxBestConfig(), modeLabel={out:"Out",in:"In",exchange:"Exchange"};
    const opens=WINDOW_IDS.filter(name=>cfg.openWindows[name]&&!sandbox.st.openWindows[name]);
    let text;
    if(opens.length) text=`Open ${opens.map(windowLabel).join(" + ")} · fan ${cfg.fanMode==="off"?"off":`${modeLabel[cfg.fanMode]} at ${windowLabel(cfg.fanLoc)}`}`;
    else text=cfg.fanMode==="off"?"Fan off · all closed":`${windowLabel(cfg.fanLoc)} · ${modeLabel[cfg.fanMode]}`;
    sbBest.textContent="Load best: "+text;
  }

  // sandbox sliders/buttons
  sbWs.addEventListener("input",e=>{sandbox.st.windSpeed=+e.target.value;sbWsVal.textContent=e.target.value;renderBestButton();});
  sbIt.addEventListener("input",e=>{sandboxStartIndoor=+e.target.value;sbItVal.textContent=e.target.value+"°F";sbReset.textContent="Reset room → "+e.target.value+"°F";resetSim(sandbox,sandboxStartIndoor);renderBestButton();});
  sbOt.addEventListener("input",e=>{sandbox.st.outdoor=+e.target.value;sbOtVal.textContent=e.target.value+"°F";renderBestButton();});
  sbReset.addEventListener("click",()=>resetSim(sandbox,sandboxStartIndoor));
  sbBest.addEventListener("click",()=>{
    const cfg=sandboxBestConfig();applyConfig(sandbox.st,cfg);resetSim(sandbox,sandboxStartIndoor);
    setSegActive("sb","fanLoc",cfg.fanLoc);setSegActive("sb","fanMode",cfg.fanMode);
    renderWindowControls("sb");
    renderBestButton(); // applying a pair suggestion opens windows, which changes what "best" reads as
  });

  race=createRaceController({
    A,B,refs,
    geos:{A:raGeo,B:rbGeo},
    contexts:{A:raCtx,B:rbCtx},
    chart:raChart,
    setSegActive,
    renderWindowControls,
    openWindowSummary,
    integrate,
    getSpeed:()=>SPEED,
  });

  // mode switch
  modeSwitch.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");
    mode=b.dataset.m;
    sandboxView.style.display = mode==="sandbox"?"grid":"none";
    raceView.style.display = mode==="race"?"block":"none";
  });
  // speed
  speedSeg.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");SPEED=+b.dataset.s;
  });

  /* =================== CURRENT WIND =================== */
  function applyWindToActive(toward,speed){
    if(mode==="sandbox"){
      sandbox.st.windDir=toward; setSegActive("sb","windDir",toward);
      if(Number.isFinite(speed)){sandbox.st.windSpeed=speed;sbWs.value=speed;sbWsVal.textContent=speed;}
      renderBestButton();
    } else race.setWind(toward,speed);
  }
  let currentWindToward="S";
  currentWindDir.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");currentWindToward=b.dataset.v;
  });
  currentWs.addEventListener("input",e=>{currentWsVal.textContent=e.target.value+" mph";});
  applyCurrentWind.addEventListener("click",e=>{
    const btn=e.currentTarget; // currentTarget is null once dispatch ends — capture before the timeout
    applyWindToActive(currentWindToward,+currentWs.value);
    btn.textContent="✓ Applied current wind";
    setTimeout(()=>{btn.textContent="Apply current wind to active model";},1800);
  });

  // boot
  createWindRose({refs,applyWindToActive}).init();
  createTrialsController({refs,openWindowSummary}).init();
  renderAllWindowControls();
  renderBestButton();
  requestAnimationFrame(tick);
