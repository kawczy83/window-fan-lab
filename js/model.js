  /* =================== PHYSICS (pure, shared) =================== */
  const SQRT_HALF=Math.SQRT1_2;
  const WIND={
    N:{name:"North",arrow:"↑",x:0,y:-1},NE:{name:"Northeast",arrow:"↗",x:SQRT_HALF,y:-SQRT_HALF},
    E:{name:"East",arrow:"→",x:1,y:0},SE:{name:"Southeast",arrow:"↘",x:SQRT_HALF,y:SQRT_HALF},
    S:{name:"South",arrow:"↓",x:0,y:1},SW:{name:"Southwest",arrow:"↙",x:-SQRT_HALF,y:SQRT_HALF},
    W:{name:"West",arrow:"←",x:-1,y:0},NW:{name:"Northwest",arrow:"↖",x:-SQRT_HALF,y:-SQRT_HALF},
  };
  const WINDOWS={
    north:{label:"North",wall:"N",nx:0,ny:-1},
    east:{label:"East",wall:"E",nx:1,ny:0},
    south:{label:"South",wall:"S",nx:0,ny:1},
    west:{label:"West",wall:"W",nx:-1,ny:0},
  };
  const WINDOW_IDS=Object.keys(WINDOWS);
  const FAN_MODES=["out","in","exchange","off"];
  const windowLabel=name=>(WINDOWS[name]||WINDOWS.south).label;
  const windowState=open=>Object.fromEntries(WINDOW_IDS.map(name=>[name,open]));
  function normalizeOpenWindows(value,fanLoc,legacyOtherOpen){
    const state=windowState(legacyOtherOpen===undefined);
    if(value&&typeof value==="object"){
      for(const name of WINDOW_IDS)state[name]=Boolean(value[name]);
    }else if(legacyOtherOpen!==undefined){
      for(const name of WINDOW_IDS)state[name]=Boolean(legacyOtherOpen);
      state[fanLoc]=true;
    }
    return state;
  }
  function ensureFanWindow(st){if(st.fanMode!=="off")st.openWindows[st.fanLoc]=true;}
  function isWindowOpen(st,name){return Boolean(st.openWindows[name]||(st.fanMode!=="off"&&st.fanLoc===name));}
  function availableWindows(st,names=WINDOW_IDS){return names.filter(name=>isWindowOpen(st,name));}
  function onlyOpen(...names){const state=windowState(false);for(const name of names)state[name]=true;return state;}
  function applyConfig(st,cfg){
    Object.assign(st,cfg);
    st.openWindows=normalizeOpenWindows(cfg.openWindows||st.openWindows,st.fanLoc,cfg.otherOpen);
    delete st.otherOpen;
    ensureFanWindow(st);
  }
  function configState(st,cfg){
    const next=Object.assign({},st);
    next.openWindows=normalizeOpenWindows(st.openWindows,st.fanLoc,st.otherOpen);
    applyConfig(next,cfg);
    return next;
  }
  function isValidTrial(t){
    // Guards rendering against malformed stored records; openWindows stays optional (legacy otherOpen).
    return Boolean(t&&typeof t==="object"
      &&WINDOW_IDS.includes(t.fanLoc)&&FAN_MODES.includes(t.fanMode)
      &&Number.isFinite(t.start)&&Number.isFinite(t.end)
      &&Number.isFinite(t.minutes)&&t.minutes>0);
  }
  function pressure(st, windowName){
    const wind=WIND[st.windDir]||WIND.S;
    const face=WINDOWS[windowName]||WINDOWS.south;
    const component=face.nx*wind.x+face.ny*wind.y;
    if(component>0) return -0.6*component; // leeward
    if(component<0) return -component;     // windward
    return -0.2;                           // side wall
  }
  function otherWindows(fanLoc){return WINDOW_IDS.filter(name=>name!==fanLoc);}
  function chooseByPressure(st,names,preferHigh){
    return names.reduce((best,name)=>{
      if(!best)return name;
      return (preferHigh?pressure(st,name)>pressure(st,best):pressure(st,name)<pressure(st,best))?name:best;
    },null);
  }
  function windBoost(st){
    // Fractional wind assist (±) through the fan's through-path; 0 unless in/out with another opening.
    if(st.fanMode!=="in"&&st.fanMode!=="out") return 0;
    const others=availableWindows(st,otherWindows(st.fanLoc));
    if(!others.length) return 0;
    const otherW=chooseByPressure(st,others,st.fanMode==="out");
    const intakeW=st.fanMode==="out"?otherW:st.fanLoc, exhaustW=st.fanMode==="out"?st.fanLoc:otherW;
    return 0.25*(pressure(st,intakeW)-pressure(st,exhaustW))*(st.windSpeed/10);
  }
  function naturalFlow(st){
    // Wind-driven cross-ventilation through whatever is open, fan ignored.
    const openings=availableWindows(st);
    if(openings.length<2) return openings.length?0.03:0.02; // <2 openings: no through-path
    const intake=chooseByPressure(st,openings,true), exhaust=chooseByPressure(st,openings.filter(name=>name!==intake),false);
    const draft=pressure(st,intake)-pressure(st,exhaust); // windward−leeward pressure gap, ≥0
    return 0.05+0.35*draft*(st.windSpeed/10); // 0.05 calm/buoyant floor; rises with wind through a real pressure gap
  }
  function fanFlow(st){
    // Flow the fan alone drives through its intended path, before the natural-vent floor.
    const others=availableWindows(st,otherWindows(st.fanLoc));
    if(st.fanMode==="exchange") return others.length?0.60:0.50;
    if(!others.length) return st.fanMode==="out"?0.40:0.34;
    return Math.max(0.05, 1+windBoost(st)+(st.fanMode==="out"&&st.indoor>st.outdoor?0.08:0));
  }
  function windDominated(st){
    // Wind cross-vent outruns the fan: the openings, not the fan, set the flow and its direction.
    return st.fanMode!=="off"&&naturalFlow(st)>fanFlow(st);
  }
  const FLOW_MAX=2.3; // gauge calibration: best case ≈2.28 = out mode, fully wind-aligned, at the 30 mph slider max
  function flowModel(st){
    if(st.fanMode==="off") return naturalFlow(st);
    // The fan can't stop the wind cross-venting the same openings: never below the fan-off rate.
    return Math.max(fanFlow(st),naturalFlow(st));
  }
  function naturalPath(st){
    const openings=availableWindows(st);
    if(openings.length>1){
      const intake=chooseByPressure(st,openings,true);
      const exhaust=chooseByPressure(st,openings.filter(name=>name!==intake),false);
      return {intake,exhaust,bidir:null};
    }
    return {intake:null,exhaust:null,bidir:openings[0]||null};
  }
  function airPath(st){
    // An overpowered fan doesn't set the direction: show the wind's through-path instead.
    if(st.fanMode==="off"||windDominated(st)) return naturalPath(st);
    const fanW=st.fanLoc, others=availableWindows(st,otherWindows(fanW));
    if(st.fanMode==="exchange") return {intake:null,exhaust:null,bidir:fanW};
    const otherW=chooseByPressure(st,others,st.fanMode==="out");
    if(st.fanMode==="out") return {intake:otherW,exhaust:fanW,bidir:null};
    return {intake:fanW,exhaust:otherW,bidir:null};
  }
  function bestConfigFor(st){
    // Best fan placement/mode for the windows the user actually has open — never opens a closed one,
    // except when nothing is open while cooling: then suggest opening the best window pair.
    // Seal-up (fan off, all closed) stays a candidate: it's the right call when outdoor air is hotter.
    const cooling=st.indoor>st.outdoor, open=availableWindows(st), candidates=[];
    if(cooling&&!open.length){
      for(let i=0;i<WINDOW_IDS.length;i++)for(let j=i+1;j<WINDOW_IDS.length;j++){
        const openWindows=onlyOpen(WINDOW_IDS[i],WINDOW_IDS[j]);
        for(const fanLoc of [WINDOW_IDS[i],WINDOW_IDS[j]])
          for(const fanMode of ["out","in","exchange"])candidates.push({fanLoc,fanMode,openWindows});
        candidates.push({fanLoc:st.fanLoc,fanMode:"off",openWindows}); // natural cross-vent pair
      }
    }else{
      for(const fanLoc of open)
        for(const fanMode of ["out","in","exchange"])candidates.push({fanLoc,fanMode,openWindows:st.openWindows});
      candidates.push({fanLoc:st.fanLoc,fanMode:"off",openWindows:windowState(false)});
    }
    return candidates.reduce((best,cfg)=>{
      const score=(cooling?1:-1)*flowModel(configState(st,cfg));
      return !best||score>best.score?{cfg,score}:best;
    },null).cfg;
  }

  /* =================== GEOMETRY (per canvas) =================== */
  function geomFor(W,H){
    const M=Math.min(W,H)*0.17;
    const R={x:M,y:M,w:W-2*M,h:H-2*M};
    const WIN=Math.min(R.w,R.h)*0.34;
    return {W,H,M,R,WIN};
  }
  function winOf(g,name){
    const face=WINDOWS[name]||WINDOWS.south;
    if(face.wall==="N") return {x:g.R.x+g.R.w*0.5,y:g.R.y,len:g.WIN,...face};
    if(face.wall==="E") return {x:g.R.x+g.R.w,y:g.R.y+g.R.h*0.5,len:g.WIN,...face};
    if(face.wall==="S") return {x:g.R.x+g.R.w*0.5,y:g.R.y+g.R.h,len:g.WIN,...face};
    return {x:g.R.x,y:g.R.y+g.R.h*0.5,len:g.WIN,...face};
  }
  /* =================== SIM FACTORY =================== */
  function makeSim(over){
    const st=Object.assign({indoor:74,outdoor:64,fanLoc:"south",fanMode:"out",windDir:"S",windSpeed:5},over||{});
    st.openWindows=normalizeOpenWindows(over&&over.openWindows,st.fanLoc,over&&over.otherOpen);
    delete st.otherOpen;
    ensureFanWindow(st);
    return {st, particles:[], hist:[], fanAngle:Math.random()*6, t:0, doneAt:null, lastHist:0};
  }
  function resetSim(sim,indoor){ sim.st.indoor=indoor==null?74:indoor; sim.particles.length=0; sim.hist.length=0; sim.t=0; sim.doneAt=null; sim.lastHist=0; }

  function spawn(sim,g,rate){
    const path=airPath(sim.st);
    const n=Math.min(3,Math.floor(rate*2));
    for(let i=0;i<n;i++){
      if(path.bidir){
        const w=winOf(g,path.bidir), into=Math.random()<0.5;
        const vx=-w.nx*(into?1:-1),vy=-w.ny*(into?1:-1),tx=-vy,ty=vx,off=(Math.random()-.5)*w.len;
        sim.particles.push(mk(w.x+tx*off,w.y+ty*off,vx,vy,into));
        continue;
      }
      if(path.intake){
        const w=winOf(g,path.intake),vx=-w.nx,vy=-w.ny,tx=-vy,ty=vx,off=(Math.random()-.5)*w.len;
        const x=w.x+tx*off,y=w.y+ty*off;
        sim.particles.push(mk(x,y,vx,vy,true,path.exhaust));
      }
    }
  }
  function mk(x,y,vx,vy,cool,target){const sp=0.8+Math.random()*0.7;return {x,y,vx:vx*sp,vy:vy*sp,cool,life:0,max:150+Math.random()*60,target};}
  function stepParticles(sim,g){
    for(const p of sim.particles){
      if(p.target){
        const w=winOf(g,p.target),dx=w.x-p.x,dy=w.y-p.y,d=Math.hypot(dx,dy)||1;
        p.vx+=(dx/d)*0.05;p.vy+=(dy/d)*0.05;
        const s=Math.hypot(p.vx,p.vy),cap=1.6; if(s>cap){p.vx*=cap/s;p.vy*=cap/s;}
      }
      p.x+=p.vx;p.y+=p.vy;p.life++;
      const targetWall=p.target&&winOf(g,p.target).wall;
      if(p.x<g.R.x+4&&p.vx<0&&targetWall!=="W"&&p.cool)p.vx*=-0.4;
      if(p.x>g.R.x+g.R.w-4&&p.vx>0&&targetWall!=="E"&&p.cool)p.vx*=-0.4;
      if(p.y<g.R.y+4&&p.vy<0&&targetWall!=="N"&&p.cool)p.vy*=-0.4;
      if(p.y>g.R.y+g.R.h-4&&p.vy>0&&targetWall!=="S"&&p.cool)p.vy*=-0.4;
    }
    for(let i=sim.particles.length-1;i>=0;i--){
      const p=sim.particles[i]; let gone=p.life>p.max;
      if(p.target){const w=winOf(g,p.target); if(Math.hypot(w.x-p.x,w.y-p.y)<16)gone=true;}
      if(p.x<g.R.x-26||p.x>g.R.x+g.R.w+26||p.y<g.R.y-26||p.y>g.R.y+g.R.h+26)gone=true;
      if(gone)sim.particles.splice(i,1);
    }
  }

export {
  WIND,
  WINDOWS,
  WINDOW_IDS,
  FAN_MODES,
  windowLabel,
  windowState,
  normalizeOpenWindows,
  ensureFanWindow,
  isWindowOpen,
  availableWindows,
  onlyOpen,
  applyConfig,
  configState,
  isValidTrial,
  pressure,
  otherWindows,
  chooseByPressure,
  windBoost,
  naturalFlow,
  windDominated,
  FLOW_MAX,
  flowModel,
  airPath,
  bestConfigFor,
  geomFor,
  winOf,
  makeSim,
  resetSim,
  spawn,
  stepParticles,
};
