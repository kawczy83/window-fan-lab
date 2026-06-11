import {
  WIND,
  WINDOWS,
  WINDOW_IDS,
  windowLabel,
  windowState,
  normalizeOpenWindows,
  ensureFanWindow,
  isWindowOpen,
  availableWindows,
  onlyOpen,
  applyConfig,
  isValidTrial,
  windBoost,
  windDominated,
  FLOW_MAX,
  flowModel,
  airPath,
  bestConfigFor,
  otherWindows,
  geomFor,
  winOf,
  makeSim,
  resetSim,
  spawn,
  stepParticles,
} from "./model.js";

  /* =================== HELPERS =================== */
  const lerp=(a,b,t)=>a+(b-a)*t;
  function tempColor(st,t){
    const span=Math.max(1,(74-st.outdoor));
    const k=Math.max(0,Math.min(1,(t-st.outdoor)/span));
    const c=[34,211,238], w=[251,113,133];
    return `rgb(${lerp(c[0],w[0],k)|0},${lerp(c[1],w[1],k)|0},${lerp(c[2],w[2],k)|0})`;
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function arrow(ctx,x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();const a=Math.atan2(y2-y1,x2-x1),h=8;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-h*Math.cos(a-0.4),y2-h*Math.sin(a-0.4));ctx.lineTo(x2-h*Math.cos(a+0.4),y2-h*Math.sin(a+0.4));ctx.closePath();ctx.fill();}
  /* =================== DRAW ROOM =================== */
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
    if(hasFan)drawFan(ctx,w,0,Math.min(20,w.len*0.24)); // base; rotation drawn below
  }
  function drawRoom(ctx,g,sim,opts){
    opts=opts||{};
    const st=sim.st;
    ctx.clearRect(0,0,g.W,g.H);
    // room
    ctx.fillStyle="rgba(20,26,38,.9)";roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,14);ctx.fill();
    ctx.globalAlpha=0.10;ctx.fillStyle=tempColor(st,st.indoor);roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,14);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle="#33405a";ctx.lineWidth=6;roundRect(ctx,g.R.x,g.R.y,g.R.w,g.R.h,14);ctx.stroke();
    // compass
    ctx.fillStyle="#5b6b86";ctx.font="700 12px 'JetBrains Mono'";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText("N",g.R.x+g.R.w/2,g.R.y-g.M*0.32);ctx.fillText("S",g.R.x+g.R.w/2,g.R.y+g.R.h+g.M*0.32);
    ctx.fillText("W",g.R.x-g.M*0.32,g.R.y+g.R.h/2);ctx.fillText("E",g.R.x+g.R.w+g.M*0.32,g.R.y+g.R.h/2);
    // wind arrows
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
    // particles
    for(const p of sim.particles){
      ctx.fillStyle=p.cool?"rgba(34,211,238,.85)":"rgba(251,113,133,.85)";
      ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,7);ctx.fill();
      ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(p.x,p.y,5,0,7);ctx.fill();ctx.globalAlpha=1;
    }
    // windows
    const wins=WINDOW_IDS.map(name=>[name,winOf(g,name)]);
    for(const [name,w] of wins){
      const hasFan=st.fanLoc===name&&st.fanMode!=="off";
      drawWindow(ctx,g,w,isWindowOpen(st,name),hasFan);
    }
    // spinning fan overlay (so it animates)
    const fr=Math.min(20,g.WIN*0.24);
    for(const [name,w] of wins)if(st.fanLoc===name&&st.fanMode!=="off")drawFan(ctx,w,sim.fanAngle,fr);
    // big temp
    ctx.fillStyle=tempColor(st,st.indoor);ctx.font=`800 ${g.WIN*0.95|0}px 'Archivo'`;ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(st.indoor.toFixed(1)+"°",g.R.x+g.R.w/2,g.R.y+g.R.h/2-(opts.small?3:6));
    ctx.fillStyle="#6b7790";ctx.font="11px 'JetBrains Mono'";ctx.fillText("INDOOR",g.R.x+g.R.w/2,g.R.y+g.R.h/2+g.WIN*0.55);
  }

  /* =================== CHARTS =================== */
  function drawChartSingle(cv,sim){
    const cx=cv.getContext("2d"),CW=cv.width,CH=cv.height,st=sim.st;
    cx.clearRect(0,0,CW,CH);
    const top=14,bot=CH-22,left=34,right=CW-10;
    const tMin=Math.min(st.outdoor-2,...sim.hist,60), tMax=Math.max(78,...sim.hist);
    const yOf=t=>bot-((t-tMin)/(tMax-tMin))*(bot-top);
    cx.strokeStyle="#1f2734";cx.lineWidth=1;cx.fillStyle="#5b6b86";cx.font="9px 'JetBrains Mono'";cx.textAlign="right";
    for(let k=0;k<=4;k++){const tv=tMin+(tMax-tMin)*k/4,y=yOf(tv);cx.beginPath();cx.moveTo(left,y);cx.lineTo(right,y);cx.stroke();cx.fillText(tv.toFixed(0),left-5,y+3);}
    cx.strokeStyle="rgba(34,211,238,.5)";cx.setLineDash([5,4]);cx.lineWidth=1.5;cx.beginPath();cx.moveTo(left,yOf(st.outdoor));cx.lineTo(right,yOf(st.outdoor));cx.stroke();cx.setLineDash([]);
    cx.fillStyle="rgba(34,211,238,.8)";cx.textAlign="left";cx.fillText("outdoor "+st.outdoor+"°",left+4,yOf(st.outdoor)-4);
    plotLine(cx,sim.hist,left,right,yOf,"#fb7185",tempColor(st,st.indoor));
  }
  function plotLine(cx,hist,left,right,yOf,c0,c1){
    if(hist.length<2)return;
    const MAXH=240;cx.lineWidth=2.4;const g=cx.createLinearGradient(left,0,right,0);g.addColorStop(0,c0);g.addColorStop(1,c1);cx.strokeStyle=g;cx.beginPath();
    hist.forEach((t,i)=>{const x=left+(right-left)*(i/(MAXH-1)),y=yOf(t);i?cx.lineTo(x,y):cx.moveTo(x,y);});cx.stroke();
    const hx=left+(right-left)*((hist.length-1)/(MAXH-1)),hy=yOf(hist[hist.length-1]);cx.fillStyle=c1;cx.beginPath();cx.arc(hx,hy,3.5,0,7);cx.fill();
  }
  function drawChartRace(cv,a,b){
    const cx=cv.getContext("2d"),CW=cv.width,CH=cv.height,out=a.st.outdoor;
    cx.clearRect(0,0,CW,CH);
    const top=14,bot=CH-22,left=34,right=CW-10;
    const all=a.hist.concat(b.hist);
    const tMin=Math.min(out-2,...all,60), tMax=Math.max(78,...all);
    const yOf=t=>bot-((t-tMin)/(tMax-tMin))*(bot-top);
    cx.strokeStyle="#1f2734";cx.lineWidth=1;cx.fillStyle="#5b6b86";cx.font="9px 'JetBrains Mono'";cx.textAlign="right";
    for(let k=0;k<=4;k++){const tv=tMin+(tMax-tMin)*k/4,y=yOf(tv);cx.beginPath();cx.moveTo(left,y);cx.lineTo(right,y);cx.stroke();cx.fillText(tv.toFixed(0),left-5,y+3);}
    cx.strokeStyle="rgba(255,255,255,.25)";cx.setLineDash([5,4]);cx.lineWidth=1.5;cx.beginPath();cx.moveTo(left,yOf(out));cx.lineTo(right,yOf(out));cx.stroke();cx.setLineDash([]);
    cx.fillStyle="rgba(255,255,255,.5)";cx.textAlign="left";cx.fillText("outdoor "+out+"°",left+4,yOf(out)-4);
    plotLineSolid(cx,a.hist,left,right,yOf,"#fbbf24");
    plotLineSolid(cx,b.hist,left,right,yOf,"#22d3ee");
    // labels
    cx.font="700 10px 'JetBrains Mono'";cx.textAlign="right";
    cx.fillStyle="#fbbf24";cx.fillText("A",right-2,top+10);
    cx.fillStyle="#22d3ee";cx.fillText("B",right-2,top+24);
  }
  function plotLineSolid(cx,hist,left,right,yOf,c){
    if(hist.length<2)return;const MAXH=240;cx.lineWidth=2.4;cx.strokeStyle=c;cx.beginPath();
    hist.forEach((t,i)=>{const x=left+(right-left)*(i/(MAXH-1)),y=yOf(t);i?cx.lineTo(x,y):cx.moveTo(x,y);});cx.stroke();
    const hx=left+(right-left)*((hist.length-1)/(MAXH-1)),hy=yOf(hist[hist.length-1]);cx.fillStyle=c;cx.beginPath();cx.arc(hx,hy,3.5,0,7);cx.fill();
  }

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
  let mode="sandbox", SPEED=1, sandboxStartIndoor=74, raceStartIndoor=74;
  const sandbox=makeSim();
  const A=makeSim({fanLoc:"south",fanMode:"out"});
  const B=makeSim({fanLoc:"south",fanMode:"in"});
  let raceRunning=false, winner=null, raceTie=false;

  const K=0.16, EPS=0.08;
  function integrate(sim,dt){
    const rate=flowModel(sim.st);
    sim.st.indoor += -K*rate*(sim.st.indoor-sim.st.outdoor)*dt;
    if(Math.abs(sim.st.indoor-sim.st.outdoor)<0.02) sim.st.indoor=sim.st.outdoor;
    return rate;
  }

  // canvas refs
  const sbRoom=document.getElementById("sbRoom"), sbCtx=sbRoom.getContext("2d"), sbGeo=geomFor(sbRoom.width,sbRoom.height);
  const sbChart=document.getElementById("sbChart");
  const raRoom=document.getElementById("raRoom"), raCtx=raRoom.getContext("2d"), raGeo=geomFor(raRoom.width,raRoom.height);
  const rbRoom=document.getElementById("rbRoom"), rbCtx=rbRoom.getContext("2d"), rbGeo=geomFor(rbRoom.width,rbRoom.height);
  const raChart=document.getElementById("raChart");

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
      document.getElementById("sbIn").innerHTML=sandbox.st.indoor.toFixed(1)+'<span class="u">°F</span>';
      document.getElementById("sbIn").style.color=tempColor(sandbox.st,sandbox.st.indoor);
      document.getElementById("sbOut").innerHTML=sandbox.st.outdoor+'<span class="u">°F</span>';
      const pct=Math.round(Math.min(1,rate/FLOW_MAX)*100);
      document.getElementById("sbFlowBar").style.width=pct+"%";document.getElementById("sbFlowPct").textContent=pct+"%";
      document.getElementById("sbStatus").innerHTML=statusText(sandbox.st);
    } else {
      // race
      [[A,raGeo,raCtx,"timerA","flowA","runnerA","labelA"],[B,rbGeo,rbCtx,"timerB","flowB","runnerB","labelB"]].forEach(([sim,g,ctx,tId,fId,rId,lId])=>{
        let rate=flowModel(sim.st);
        if(raceRunning && !sim.doneAt){
          rate=integrate(sim,dt); sim.t+=dt;
          if(Math.abs(sim.st.indoor-sim.st.outdoor)<EPS){ sim.doneAt=sim.t; }
        }
        spawn(sim,g,raceRunning?rate:rate*0.4); stepParticles(sim,g);
        sim.fanAngle += (sim.st.fanMode==="off"?0:(raceRunning?0.06+rate*0.22:0.05))*(sim.st.fanMode==="in"?-1:1)*SPEED;
        drawRoom(ctx,g,sim,{small:true});
        if(raceRunning && now-sim.lastHist>100){sim.hist.push(sim.st.indoor);if(sim.hist.length>240)sim.hist.shift();sim.lastHist=now;}
        document.getElementById(tId).innerHTML=(sim.doneAt?sim.doneAt.toFixed(1):sim.t.toFixed(1))+'<small> rel. units</small>';
        document.getElementById(fId).textContent=Math.round(Math.min(1,rate/FLOW_MAX)*100)+"%";
        document.getElementById(lId).textContent=`${sim.st.fanLoc} · ${sim.st.fanMode} · open ${openWindowSummary(sim.st)}`;
        document.getElementById(rId).classList.toggle("win", winner===sim||raceTie);
      });
      drawChartRace(raChart,A,B);
      // winner detection (identical configs cross the line in the same step — call that a dead heat)
      if(raceRunning && !winner && !raceTie){
        if(A.doneAt && B.doneAt && Math.abs(A.doneAt-B.doneAt)<1e-9){
          raceTie=true;
          document.getElementById("winbar").className="winbar winner";
          document.getElementById("winbar").innerHTML=`🏁 Dead heat — both configs reach outdoor temp in ${A.doneAt.toFixed(1)} relative units`;
        } else if(A.doneAt || B.doneAt){
          winner = A.doneAt && (!B.doneAt || A.doneAt<=B.doneAt) ? A : B;
          const wname=winner===A?"A":"B", wt=winner.doneAt.toFixed(1);
          document.getElementById("winbar").className="winbar winner";
          document.getElementById("winbar").innerHTML=`🏁 Config ${wname} reaches outdoor temp first — ${wt} relative units`;
        }
      }
      if(raceRunning && A.doneAt && B.doneAt){ raceRunning=false; }
    }
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
  // delegate mutually exclusive segmented controls
  document.querySelectorAll(".seg[data-sim][data-key]").forEach(box=>{
    box.addEventListener("click",e=>{
      const b=e.target.closest("button"); if(!b)return;
      [...box.children].forEach(c=>c.classList.remove("active")); b.classList.add("active");
      applySeg(box.dataset.sim, box.dataset.key, b.dataset.v);
      // warm styling for "off"
      if(box.dataset.key==="fanMode") box.classList.toggle("warm", b.dataset.v==="off");
      if(box.dataset.sim==="sb")renderBestButton();
    });
  });
  function setSegActive(sel,val){const box=document.querySelector(sel);if(!box)return;[...box.children].forEach(c=>c.classList.toggle("active",c.dataset.v===val));box.classList.toggle("warm", box.dataset.key==="fanMode"&&val==="off");}
  function openWindowSummary(st){
    const names=availableWindows(st);
    return names.length?names.map(name=>WINDOWS[name].wall).join("/"):"none";
  }
  function renderWindowControls(target){
    const sim=simByKey[target], box=document.querySelector(`.window-seg[data-sim="${target}"]`);
    if(!sim||!box)return;
    for(const b of box.children){
      const name=b.dataset.window, forced=sim.st.fanMode!=="off"&&sim.st.fanLoc===name, open=isWindowOpen(sim.st,name);
      b.classList.toggle("active",open);b.disabled=forced;
      b.textContent=`${target==="sb"?windowLabel(name):WINDOWS[name].wall} · ${forced?"fan":(open?"open":"closed")}`;
    }
  }
  function renderAllWindowControls(){for(const target of Object.keys(simByKey))renderWindowControls(target);}
  document.querySelectorAll(".window-seg[data-sim]").forEach(box=>{
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
    const text=cfg.fanMode==="off"?"Fan off · all closed":`${windowLabel(cfg.fanLoc)} · ${modeLabel[cfg.fanMode]}`;
    document.getElementById("sbBest").textContent="Load best: "+text;
  }

  // sandbox sliders/buttons
  document.getElementById("sbWs").addEventListener("input",e=>{sandbox.st.windSpeed=+e.target.value;document.getElementById("sbWsVal").textContent=e.target.value;renderBestButton();});
  document.getElementById("sbIt").addEventListener("input",e=>{sandboxStartIndoor=+e.target.value;document.getElementById("sbItVal").textContent=e.target.value+"°F";document.getElementById("sbReset").textContent="Reset room → "+e.target.value+"°F";resetSim(sandbox,sandboxStartIndoor);renderBestButton();});
  document.getElementById("sbOt").addEventListener("input",e=>{sandbox.st.outdoor=+e.target.value;document.getElementById("sbOtVal").textContent=e.target.value+"°F";renderBestButton();});
  document.getElementById("sbReset").addEventListener("click",()=>resetSim(sandbox,sandboxStartIndoor));
  document.getElementById("sbBest").addEventListener("click",()=>{
    const cfg=sandboxBestConfig();applyConfig(sandbox.st,cfg);resetSim(sandbox,sandboxStartIndoor);
    setSegActive('.seg[data-sim="sb"][data-key="fanLoc"]',cfg.fanLoc);setSegActive('.seg[data-sim="sb"][data-key="fanMode"]',cfg.fanMode);
    renderWindowControls("sb");
  });

  // race env sliders
  document.getElementById("raWs").addEventListener("input",e=>{A.st.windSpeed=B.st.windSpeed=+e.target.value;document.getElementById("raWsVal").textContent=e.target.value;});
  document.getElementById("raIt").addEventListener("input",e=>{raceStartIndoor=+e.target.value;document.getElementById("raItVal").textContent=e.target.value+"°F";resetRace();});
  document.getElementById("raOt").addEventListener("input",e=>{A.st.outdoor=B.st.outdoor=+e.target.value;document.getElementById("raOtVal").textContent=e.target.value+"°F";});
  function resetRace(){resetSim(A,raceStartIndoor);resetSim(B,raceStartIndoor);raceRunning=false;winner=null;raceTie=false;document.getElementById("winbar").className="winbar";document.getElementById("winbar").innerHTML="First to reach outdoor temp wins in relative simulation time. Press Start.";document.getElementById("runnerA").classList.remove("win");document.getElementById("runnerB").classList.remove("win");}
  document.getElementById("raReset").addEventListener("click",resetRace);
  document.getElementById("raStart").addEventListener("click",()=>{resetRace();raceRunning=true;document.getElementById("winbar").innerHTML="Racing…";});

  // presets
  const PRESETS={
    outin:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"in",openWindows:windowState(true)}},
    sealed:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"out",openWindows:onlyOpen("south")}},
    exch:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"south",fanMode:"exchange",openWindows:onlyOpen("south")}},
    ws:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"west",fanMode:"out",openWindows:windowState(true)}},
    ns:{A:{fanLoc:"south",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"north",fanMode:"out",openWindows:windowState(true)}},
    we:{A:{fanLoc:"west",fanMode:"out",openWindows:windowState(true)},B:{fanLoc:"east",fanMode:"out",openWindows:windowState(true)}},
  };
  document.querySelectorAll(".presets button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const p=PRESETS[btn.dataset.preset]; if(!p)return;
      applyConfig(A.st,p.A);applyConfig(B.st,p.B);
      ["A","B"].forEach(side=>{
        const cfg=p[side];
        setSegActive(`.seg[data-sim="${side}"][data-key="fanLoc"]`,cfg.fanLoc);
        setSegActive(`.seg[data-sim="${side}"][data-key="fanMode"]`,cfg.fanMode);
        renderWindowControls(side);
      });
      resetRace();
    });
  });

  // mode switch
  document.getElementById("modeSwitch").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");
    mode=b.dataset.m;
    document.getElementById("sandboxView").style.display = mode==="sandbox"?"grid":"none";
    document.getElementById("raceView").style.display = mode==="race"?"block":"none";
  });
  // speed
  document.getElementById("speedSeg").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");SPEED=+b.dataset.s;
  });

  /* =================== CURRENT WIND =================== */
  function applyWindToActive(toward,speed){
    if(mode==="sandbox"){
      sandbox.st.windDir=toward; setSegActive('.seg[data-sim="sb"][data-key="windDir"]',toward);
      if(Number.isFinite(speed)){sandbox.st.windSpeed=speed;document.getElementById("sbWs").value=speed;document.getElementById("sbWsVal").textContent=speed;}
      renderBestButton();
    } else {
      A.st.windDir=B.st.windDir=toward; setSegActive('.seg[data-sim="ENV"][data-key="windDir"]',toward);
      if(Number.isFinite(speed)){A.st.windSpeed=B.st.windSpeed=speed;document.getElementById("raWs").value=speed;document.getElementById("raWsVal").textContent=speed;}
    }
  }
  let currentWindToward="S";
  document.getElementById("currentWindDir").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    [...e.currentTarget.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");currentWindToward=b.dataset.v;
  });
  document.getElementById("currentWs").addEventListener("input",e=>{document.getElementById("currentWsVal").textContent=e.target.value+" mph";});
  document.getElementById("applyCurrentWind").addEventListener("click",e=>{
    const btn=e.currentTarget; // currentTarget is null once dispatch ends — capture before the timeout
    applyWindToActive(currentWindToward,+document.getElementById("currentWs").value);
    btn.textContent="✓ Applied current wind";
    setTimeout(()=>{btn.textContent="Apply current wind to active model";},1800);
  });

  /* =================== WIND ROSE =================== */
  const DIRS16=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  // Philadelphia climatology fallback (% frequency, FROM direction) — westerly prevailing, SW summer / NW winter
  const PHILLY=[5.5,4.5,4.0,3.5,3.5,3.5,4.0,4.5,6.0,7.0,8.5,9.5,11.5,8.5,9.0,7.0];
  const PHILLY_FALLBACK_LOC="Philadelphia, PA · fallback sample data";
  let roseData={pct:PHILLY.slice(), source:"fallback", loc:PHILLY_FALLBACK_LOC, meanSpeed:null};

  function snapToward(fromDeg){ // wind FROM fromDeg blows toward fromDeg+180; snap to eight model directions
    return ["N","NE","E","SE","S","SW","W","NW"][Math.round(((fromDeg+180)%360)/45)%8];
  }
  function dominant(pct){let mi=0;for(let i=1;i<pct.length;i++)if(pct[i]>pct[mi])mi=i;return mi;}

  function drawRose(){
    const cv=document.getElementById("rose"),cx=cv.getContext("2d"),W=cv.width,H=cv.height;
    const cxp=W/2,cyp=H/2,maxR=Math.min(W,H)*0.40;
    cx.clearRect(0,0,W,H);
    const pct=roseData.pct, mx=Math.max(...pct), domI=dominant(pct);
    // rings
    cx.strokeStyle="#222b3a";cx.lineWidth=1;cx.fillStyle="#5b6b86";cx.font="20px 'JetBrains Mono'";cx.textAlign="center";
    for(let r=1;r<=3;r++){cx.beginPath();cx.arc(cxp,cyp,maxR*r/3,0,7);cx.stroke();}
    // spokes + labels
    const labels=[["N",0],["E",90],["S",180],["W",270]];
    cx.strokeStyle="#1b2330";
    for(const [n,deg] of labels){
      const rad=deg*Math.PI/180, ex=cxp+Math.sin(rad)*maxR, ey=cyp-Math.cos(rad)*maxR;
      cx.beginPath();cx.moveTo(cxp,cyp);cx.lineTo(ex,ey);cx.stroke();
      cx.fillStyle="#7c899e";cx.font="700 22px 'Archivo'";
      cx.fillText(n,cxp+Math.sin(rad)*(maxR+26),cyp-Math.cos(rad)*(maxR+26)+7);
    }
    // petals
    for(let i=0;i<16;i++){
      const deg=i*22.5, len=maxR*(pct[i]/mx)*0.96;
      const a0=(deg-9)*Math.PI/180, a1=(deg+9)*Math.PI/180;
      const p0x=cxp+Math.sin(a0)*len, p0y=cyp-Math.cos(a0)*len;
      const p1x=cxp+Math.sin(a1)*len, p1y=cyp-Math.cos(a1)*len;
      const isDom=i===domI;
      const grd=cx.createLinearGradient(cxp,cyp,(p0x+p1x)/2,(p0y+p1y)/2);
      if(isDom){grd.addColorStop(0,"rgba(245,158,11,.35)");grd.addColorStop(1,"#f59e0b");}
      else{grd.addColorStop(0,"rgba(34,211,238,.18)");grd.addColorStop(1,"rgba(34,211,238,.75)");}
      cx.fillStyle=grd;
      cx.beginPath();cx.moveTo(cxp,cyp);cx.lineTo(p0x,p0y);cx.lineTo(p1x,p1y);cx.closePath();cx.fill();
      cx.strokeStyle=isDom?"#fcd34d":"rgba(34,211,238,.4)";cx.lineWidth=isDom?2:1;cx.stroke();
    }
    cx.fillStyle="#06121a";cx.beginPath();cx.arc(cxp,cyp,4,0,7);cx.fill();
  }
  function renderRoseMeta(){
    const domI=dominant(roseData.pct), fromDir=DIRS16[domI], pctv=roseData.pct[domI].toFixed(1);
    const toCard=snapToward(domI*22.5);
    const toWind=WIND[toCard], toName=toWind.name;
    const pill=document.getElementById("rosePill");
    if(roseData.source==="historical"){pill.className="pill historical";pill.textContent="Historical archive · Open-Meteo";}
    else if(roseData.source==="loading"){pill.className="pill loading";pill.textContent="loading…";}
    else {pill.className="pill fallback";pill.textContent="Fallback sample · Philadelphia";}
    document.getElementById("roseLoc").textContent=roseData.loc;
    const ms=roseData.meanSpeed!=null?` Mean wind ≈ ${roseData.meanSpeed.toFixed(1)} mph.`:"";
    const extra=roseData.source==="fallback"?" (Philadelphia fallback sample climatology: westerly overall — SW in summer, NW in winter.)":"";
    document.getElementById("roseSummary").innerHTML=
      `Prevailing wind is <span class="from">FROM ${fromDir}</span> (${pctv}% of the time)${extra}, which means it blows <span class="to">TOWARD ${toName.toUpperCase()}</span> — set the model's wind to <b>"${toName} ${toWind.arrow}"</b>.${ms}`;
    document.getElementById("applyRose").dataset.toward=toCard;
    drawRose();
  }

  async function fetchRose(lat,lon,label){
    document.getElementById("rosePill").className="pill loading";
    document.getElementById("rosePill").textContent="loading…";
    document.getElementById("roseSummary").textContent="Fetching the last 12 months of hourly wind data…";
    const end=new Date(Date.now()-7*864e5), start=new Date(end-365*864e5);
    const f=d=>d.toISOString().slice(0,10);
    const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}`+
      `&start_date=${f(start)}&end_date=${f(end)}&hourly=wind_direction_10m,wind_speed_10m&timezone=auto&wind_speed_unit=mph`;
    try{
      const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),12000);
      const res=await fetch(url,{signal:ctrl.signal}); clearTimeout(to);
      if(!res.ok) throw new Error("http "+res.status);
      const j=await res.json();
      const dirs=j.hourly && j.hourly.wind_direction_10m;
      const spds=j.hourly && j.hourly.wind_speed_10m;
      if(!dirs||!dirs.length) throw new Error("no data");
      const bins=new Array(16).fill(0); let cnt=0, sSum=0, sCnt=0;
      for(let i=0;i<dirs.length;i++){
        const d=dirs[i]; if(d==null)continue;
        bins[Math.round(d/22.5)%16]++; cnt++;
        if(spds&&spds[i]!=null){sSum+=spds[i];sCnt++;}
      }
      if(!cnt) throw new Error("empty");
      const pct=bins.map(b=>100*b/cnt);
      roseData={pct, source:"historical", loc:label||`${(+lat).toFixed(3)}, ${(+lon).toFixed(3)}`, meanSpeed:sCnt?sSum/sCnt:null};
    }catch(err){
      roseData={pct:PHILLY.slice(), source:"fallback", loc:PHILLY_FALLBACK_LOC, meanSpeed:null};
    }
    renderRoseMeta();
  }

  document.getElementById("fetchRose").addEventListener("click",()=>{
    const lat=+document.getElementById("lat").value, lon=+document.getElementById("lon").value;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180){
      document.getElementById("roseSummary").textContent="Enter a latitude from -90 to 90 and a longitude from -180 to 180.";
      return;
    }
    fetchRose(lat,lon,`${lat.toFixed(3)}, ${lon.toFixed(3)}`);
  });
  document.getElementById("geoBtn").addEventListener("click",()=>{
    if(!navigator.geolocation){alert("Geolocation not available — enter coordinates manually.");return;}
    document.getElementById("geoBtn").textContent="locating…";
    navigator.geolocation.getCurrentPosition(
      p=>{const la=p.coords.latitude.toFixed(4),lo=p.coords.longitude.toFixed(4);
        document.getElementById("lat").value=la;document.getElementById("lon").value=lo;
        document.getElementById("geoBtn").textContent="Use my location";
        fetchRose(la,lo,`${(+la).toFixed(3)}, ${(+lo).toFixed(3)}`);},
      ()=>{document.getElementById("geoBtn").textContent="Use my location";alert("Couldn't get location — enter coordinates manually.");}
    );
  });
  document.getElementById("applyRose").addEventListener("click",e=>{
    const btn=e.currentTarget; // currentTarget is null once dispatch ends — capture before the timeout
    const toward=btn.dataset.toward||"E";
    applyWindToActive(toward);
    const tn=(WIND[toward]||WIND.S).name;
    btn.textContent=`✓ Applied historical pattern — wind toward ${tn}`;
    setTimeout(()=>{btn.textContent="↳ Apply historical prevailing direction to model";},1800);
  });

  /* =================== REAL-WORLD TRIALS =================== */
  const TRIALS_KEY="window-fan-lab-trials-v1";
  const newTrialId=()=>Date.now()+"-"+Math.random().toString(36).slice(2);
  function normalizeTrial(trial){
    const normalized=Object.assign({},trial,{openWindows:normalizeOpenWindows(trial.openWindows,trial.fanLoc,trial.otherOpen)});
    if(!normalized.id)normalized.id=newTrialId();
    delete normalized.otherOpen;
    return normalized;
  }
  function loadTrials(){
    // Drop malformed stored records — one bad entry must not take down the whole app at boot.
    try{const data=JSON.parse(localStorage.getItem(TRIALS_KEY)||"[]");return Array.isArray(data)?data.filter(isValidTrial).map(normalizeTrial):[];}catch(err){return [];}
  }
  let trials=loadTrials();
  const trialRate=t=>(t.start-t.end)/(t.minutes/60);
  const title=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const setupLabel=t=>`${title(t.fanLoc)} · ${title(t.fanMode)} · open ${openWindowSummary(t)}`;
  const trialWindowKey=t=>WINDOW_IDS.map(name=>isWindowOpen(t,name)?"1":"0").join("");
  function syncTrialFanWindow(){
    const fanLoc=document.getElementById("trialFanLoc").value,fanMode=document.getElementById("trialFanMode").value;
    for(const name of WINDOW_IDS){
      const select=document.getElementById(`trial${title(name)}Open`),forced=name===fanLoc&&fanMode!=="off";
      if(forced)select.value="open";
      select.disabled=forced;
    }
  }
  function trialWindowsFromForm(){
    return Object.fromEntries(WINDOW_IDS.map(name=>[name,document.getElementById(`trial${title(name)}Open`).value==="open"]));
  }
  document.getElementById("trialFanLoc").addEventListener("change",syncTrialFanWindow);
  document.getElementById("trialFanMode").addEventListener("change",syncTrialFanWindow);
  function saveTrials(){try{localStorage.setItem(TRIALS_KEY,JSON.stringify(trials));}catch(err){}}
  function cell(text,className){const td=document.createElement("td");td.textContent=text;if(className)td.className=className;return td;}
  function emptyRow(tbody,colspan,text){const tr=document.createElement("tr"),td=cell(text,"empty");td.colSpan=colspan;tr.appendChild(td);tbody.appendChild(tr);}
  function renderTrials(){
    const ranking=document.getElementById("trialRanking"), rows=document.getElementById("trialRows");
    ranking.replaceChildren();rows.replaceChildren();
    if(!trials.length){emptyRow(ranking,4,"No measured trials yet.");emptyRow(rows,6,"Add a trial to start comparing real setups.");return;}
    const groups=new Map();
    for(const trial of trials){
      const key=`${trial.fanLoc}|${trial.fanMode}|${trialWindowKey(trial)}`;
      const group=groups.get(key)||{label:setupLabel(trial),drop:0,minutes:0,count:0};
      group.drop+=trial.start-trial.end;group.minutes+=trial.minutes;group.count++;groups.set(key,group);
    }
    [...groups.values()].map(g=>({...g,rate:g.drop/(g.minutes/60)})).sort((a,b)=>b.rate-a.rate).forEach((group,i)=>{
      const tr=document.createElement("tr");
      tr.append(cell(String(i+1)),cell(group.label),cell(String(group.count)),cell(group.rate.toFixed(2)+" °F/hour","rate"));ranking.appendChild(tr);
    });
    [...trials].reverse().forEach(trial=>{
      const tr=document.createElement("tr"),del=document.createElement("button");
      tr.append(cell(setupLabel(trial)),cell(`${trial.start.toFixed(1)}°F → ${trial.end.toFixed(1)}°F`),cell(`${trial.minutes.toFixed(1)} min`),cell(trialRate(trial).toFixed(2)+" °F/hour","rate"),cell(trial.notes||"—"));
      del.type="button";del.className="delete-trial";del.dataset.id=trial.id;del.textContent="Delete";
      const td=document.createElement("td");td.appendChild(del);tr.appendChild(td);rows.appendChild(tr);
    });
  }
  document.getElementById("trialForm").addEventListener("submit",e=>{
    e.preventDefault();
    const start=+document.getElementById("trialStart").value,end=+document.getElementById("trialEnd").value,minutes=+document.getElementById("trialMinutes").value;
    if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(minutes)||minutes<=0){document.getElementById("trialMsg").textContent="Enter valid temperatures and a duration greater than zero.";return;}
    trials.push({id:newTrialId(),fanLoc:document.getElementById("trialFanLoc").value,fanMode:document.getElementById("trialFanMode").value,openWindows:trialWindowsFromForm(),start,end,minutes,notes:document.getElementById("trialNotes").value.trim()});
    saveTrials();renderTrials();document.getElementById("trialNotes").value="";document.getElementById("trialMsg").textContent="Measured trial added.";
  });
  document.getElementById("trialRows").addEventListener("click",e=>{
    const b=e.target.closest(".delete-trial");if(!b)return;
    trials=trials.filter(t=>t.id!==b.dataset.id);saveTrials();renderTrials();document.getElementById("trialMsg").textContent="Trial deleted.";
  });
  document.getElementById("clearTrials").addEventListener("click",()=>{
    if(!trials.length||!confirm("Clear all measured trials?"))return;
    trials=[];saveTrials();renderTrials();document.getElementById("trialMsg").textContent="All trials cleared.";
  });

  // boot
  renderRoseMeta();                 // show fallback immediately
  fetchRose("39.9526","-75.1652","Philadelphia, PA");  // then try the historical archive
  renderTrials();
  renderAllWindowControls();
  syncTrialFanWindow();
  renderBestButton();
  requestAnimationFrame(tick);
