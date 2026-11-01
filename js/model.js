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
  const DEFAULT_INDOOR=78;
  const DEFAULT_OUTDOOR=70;
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
  // Wind pressure coefficients (Cp) per wall from Swami & Chandra's (1988) correlation for low-rise
  // walls on a square plan: ≈ +1 facing straight into the wind. Side walls get more suction than the
  // leeward wall (−0.74 vs −0.61), the same ordering as ASCE 7's design values (−0.7 vs −0.5).
  function cpAtAngle(theta){ // theta: angle between the wall's outward normal and where the wind comes from
    const h=theta/2;
    return Math.log(1.248-0.703*Math.sin(h)-1.175*Math.sin(theta)**2+0.769*Math.cos(h)+0.717*Math.cos(h)**2);
  }
  const CP=Object.fromEntries(Object.entries(WIND).map(([dir,wind])=>[dir,Object.fromEntries(WINDOW_IDS.map(name=>{
    const face=WINDOWS[name], facing=-(face.nx*wind.x+face.ny*wind.y); // 1 = wall faces straight into the wind
    return [name,cpAtAngle(Math.acos(Math.max(-1,Math.min(1,facing))))];
  }))]));
  function pressureCoefficient(st,windowName){
    return (CP[st.windDir]||CP.S)[WINDOWS[windowName]?windowName:"south"];
  }
  function otherWindows(fanLoc){return WINDOW_IDS.filter(name=>name!==fanLoc);}

  // Airflow network: every window is an opening whose outdoor pressure is Cp × wind pressure, and the
  // room settles at the one indoor pressure where inflow equals outflow. A fan adds a fixed push in the
  // direction it blows but also partly blocks its window, so blowing against the wind can do worse than
  // no fan, and every extra open window adds a path. Flow unit: a fan plus one open window in still air = 1.
  const A_FAN=0.8;          // a window holding a box fan passes 80% of the air an open window would
  const A_LEAK=0.01;        // a closed window still leaks a little
  const P_FAN=1/A_FAN**2+1; // fan push (shut-off pressure), sized so fan + one open window = 1 in still air
  const WIND_Q=0.39;        // 10 mph wind pressure in fan-push units (weather-report wind, sheltered at the house)
  const BUOYANCY=0.05;      // warm-air-out-the-top exchange per open window at a 10°F indoor/outdoor gap
  const INFILTRATION=0.02;  // background leakage through walls and doors
  const SHORT_CIRCUIT=0.25; // share of an exchange fan's intake that is its own exhaust coming straight back
  const MIN_STREAM=0.01;    // below this an opening is just leaking, not carrying a visible stream
  const signedSqrt=x=>x<0?-Math.sqrt(-x):Math.sqrt(x);
  function openings(st){
    const q=WIND_Q*(st.windSpeed/10)**2, list=[];
    for(const name of WINDOW_IDS){
      const p=pressureCoefficient(st,name)*q;
      if(st.fanMode!=="off"&&name===st.fanLoc){
        if(st.fanMode==="exchange")list.push({name,p,a:A_FAN/2,fan:1,open:true},{name,p,a:A_FAN/2,fan:-1,open:true});
        else list.push({name,p,a:A_FAN,fan:st.fanMode==="in"?1:-1,open:true});
      }else{
        const open=isWindowOpen(st,name);
        list.push({name,p,a:open?1:A_LEAK,fan:0,open});
      }
    }
    return list;
  }
  function inflowAt(o,pin){
    // Orifice flow, + into the room; a fan adds P_FAN of push in the direction it blows (fan: +1 in, −1 out).
    return o.fan?o.fan*o.a*signedSqrt(o.fan*(o.p-pin)+P_FAN):o.a*signedSqrt(o.p-pin);
  }
  function solveRoom(st){
    // Each opening's inflow falls as indoor pressure rises, so bisection finds the unique balance point.
    const list=openings(st);
    let lo=Infinity,hi=-Infinity;
    for(const o of list){lo=Math.min(lo,o.p-P_FAN);hi=Math.max(hi,o.p+P_FAN);}
    for(let i=0;i<50;i++){
      const mid=(lo+hi)/2;
      let net=0;
      for(const o of list)net+=inflowAt(o,mid);
      if(net>0)lo=mid;else hi=mid;
    }
    const pin=(lo+hi)/2;
    for(const o of list)o.q=inflowAt(o,pin);
    return list;
  }
  function flowParts(st){
    const list=solveRoom(st);
    let through=0;
    for(const o of list)through+=Math.max(0,o.q);
    if(st.fanMode==="exchange"){
      const blowIn=list.find(o=>o.fan===1), blowOut=list.find(o=>o.fan===-1);
      through-=SHORT_CIRCUIT*Math.min(Math.max(0,blowIn.q),Math.max(0,-blowOut.q));
    }
    // Buoyancy works the same whichever side is warmer and grows with √|ΔT| (single-sided window exchange).
    let area=0;
    for(const name of WINDOW_IDS)area+=isWindowOpen(st,name)?1:A_LEAK;
    const buoyant=BUOYANCY*area*Math.sqrt((Math.abs(st.indoor-st.outdoor)||0)/10);
    return {list,through,buoyant};
  }
  const FLOW_MAX=3.4; // gauge calibration: best case ≈3.32 = fan blowing with a diagonal 30 mph wind, all open, 55°F gap
  const HIST_MAX=240; // temperature-history samples kept per sim (one per 0.1 sim-time units)
  function flowModel(st){
    // Wind/fan through-flow, temperature-driven exchange and background leakage combine in quadrature.
    const {through,buoyant}=flowParts(st);
    return Math.hypot(through,buoyant,INFILTRATION);
  }
  function naturalFlow(st){
    // The same open windows with the fan switched off (and out of its window).
    if(st.fanMode==="off") return flowModel(st);
    const openWindows=Object.fromEntries(WINDOW_IDS.map(name=>[name,isWindowOpen(st,name)]));
    return flowModel(Object.assign({},st,{fanMode:"off",openWindows}));
  }
  function windBoost(st){
    // Fractional change the wind makes to an in/out fan's airflow (+ helps, − fights it); 0 otherwise.
    if(st.fanMode!=="in"&&st.fanMode!=="out") return 0;
    if(!availableWindows(st,otherWindows(st.fanLoc)).length) return 0;
    return flowModel(st)/flowModel(Object.assign({},st,{windSpeed:0}))-1;
  }
  function fanReversed(st){
    // The wind is pushing air backward through the fan (for exchange, through either half).
    return st.fanMode!=="off"&&solveRoom(st).some(o=>o.fan&&o.fan*o.q<0);
  }
  function windDominated(st){
    // The wind, not the fan, sets the main airflow path: it reverses the fan, or (exchange) the
    // cross-breeze through the other windows outruns the fan's own intake.
    if(st.fanMode==="off") return false;
    const list=solveRoom(st);
    if(list.some(o=>o.fan&&o.fan*o.q<0)) return true;
    if(st.fanMode!=="exchange") return false;
    let cross=0;
    for(const o of list)if(!o.fan&&o.open)cross+=Math.max(0,o.q);
    return cross>list.find(o=>o.fan===1).q;
  }
  function strongest(names,score){
    let best=null,top=MIN_STREAM;
    for(const name of names){const s=score(name);if(s>top){best=name;top=s;}}
    return best;
  }
  function airPath(st){
    // The dominant intake → exhaust pair, or the one window trading air both ways.
    const open=availableWindows(st), net=Object.fromEntries(WINDOW_IDS.map(name=>[name,0]));
    for(const o of solveRoom(st))net[o.name]+=o.q;
    if(st.fanMode!=="off"&&!windDominated(st)){
      const fanW=st.fanLoc, others=open.filter(name=>name!==fanW);
      if(st.fanMode==="exchange") return {intake:null,exhaust:null,bidir:fanW};
      if(st.fanMode==="out") return {intake:strongest(others,name=>net[name]),exhaust:fanW,bidir:null};
      return {intake:fanW,exhaust:strongest(others,name=>-net[name]),bidir:null};
    }
    // Fan off or overpowered: follow the solved flows. With no through-flow (calm, or no pressure
    // difference between the open walls) the windows only trade air both ways.
    const intake=strongest(open,name=>net[name]);
    const exhaust=strongest(open.filter(name=>name!==intake),name=>-net[name]);
    if(intake&&exhaust) return {intake,exhaust,bidir:null};
    return {intake:null,exhaust:null,bidir:open.length===1?open[0]:null};
  }
  function airStreams(st){
    // Visible inflow/outflow at each open window (an exchange fan's two halves stay separate), biggest first.
    const {list,through,buoyant}=flowParts(st), inlets=[], outlets=[];
    for(const o of list){
      if(!o.open)continue;
      if(o.q>MIN_STREAM)inlets.push({name:o.name,q:o.q,fan:o.fan});
      else if(o.q<-MIN_STREAM)outlets.push({name:o.name,q:-o.q,fan:o.fan});
    }
    const biggestFirst=(a,b)=>b.q-a.q;
    return {inlets:inlets.sort(biggestFirst),outlets:outlets.sort(biggestFirst),through,buoyant};
  }
  function bestConfigFor(st){
    // Best fan placement/mode for the windows the user actually has open — never closes an open one,
    // but while cooling with fewer than two open (no through-path possible) it also suggests
    // completing the best window pair, always keeping an already-open window in it.
    // Seal-up (fan off, all closed) stays a candidate: it's the right call when outdoor air is hotter.
    const cooling=st.indoor>st.outdoor, open=availableWindows(st), candidates=[];
    if(cooling&&open.length<2){
      for(let i=0;i<WINDOW_IDS.length;i++)for(let j=i+1;j<WINDOW_IDS.length;j++){
        const pair=[WINDOW_IDS[i],WINDOW_IDS[j]];
        if(open.length&&!pair.includes(open[0]))continue; // keep the user's open window in the pair
        const openWindows=onlyOpen(...pair);
        for(const fanLoc of pair)
          for(const fanMode of ["out","in","exchange"])candidates.push({fanLoc,fanMode,openWindows});
        candidates.push({fanLoc:st.fanLoc,fanMode:"off",openWindows}); // natural cross-vent pair
      }
    }
    for(const fanLoc of open)
      for(const fanMode of ["out","in","exchange"])candidates.push({fanLoc,fanMode,openWindows:st.openWindows});
    if(open.length)candidates.push({fanLoc:st.fanLoc,fanMode:"off",openWindows:st.openWindows}); // a fan fighting the wind can lose to none
    candidates.push({fanLoc:st.fanLoc,fanMode:"off",openWindows:windowState(false)});
    const scored=candidates.map(cfg=>({cfg,score:(cooling?1:-1)*flowModel(configState(st,cfg))}));
    const top=Math.max(...scored.map(c=>c.score));
    // Within 1% of the best, prefer the smallest change (keep the fan as is, then flip it where it sits),
    // then more air; exact ties prefer "out" (exhausting downwind is the canonical, gust-stable choice).
    const modeRank={out:0,in:1,exchange:2,off:3};
    const change=cfg=>cfg.fanMode===st.fanMode&&(cfg.fanMode==="off"||cfg.fanLoc===st.fanLoc)?0:(cfg.fanLoc===st.fanLoc&&cfg.fanMode!=="off"?1:2);
    const near=scored.filter(c=>c.score>=top-0.01*Math.abs(top));
    near.sort((a,b)=>change(a.cfg)-change(b.cfg)||(Math.abs(a.score-b.score)>1e-9?b.score-a.score:modeRank[a.cfg.fanMode]-modeRank[b.cfg.fanMode]));
    return near[0].cfg;
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
    const st=Object.assign({indoor:DEFAULT_INDOOR,outdoor:DEFAULT_OUTDOOR,fanLoc:"south",fanMode:"out",windDir:"S",windSpeed:5},over||{});
    st.openWindows=normalizeOpenWindows(over&&over.openWindows,st.fanLoc,over&&over.otherOpen);
    delete st.otherOpen;
    ensureFanWindow(st);
    st.startIndoor=st.indoor; // anchors the temperature color scale for this scenario
    return {st, particles:[], hist:[], fanAngle:Math.random()*6, t:0, doneAt:null, lastHist:0, histT:0, spawnDebt:0};
  }
  function resetSim(sim,indoor){ sim.st.indoor=indoor==null?DEFAULT_INDOOR:indoor; sim.st.startIndoor=sim.st.indoor; sim.particles.length=0; sim.hist.length=0; sim.t=0; sim.doneAt=null; sim.lastHist=0; sim.histT=0; sim.spawnDebt=0; }

  function pickByFlow(items){
    let r=Math.random()*items.reduce((sum,it)=>sum+it.q,0);
    for(const it of items){r-=it.q;if(r<=0)return it;}
    return items[items.length-1];
  }
  function spawn(sim,g,rate,fscale){
    // Particles follow the solved flows: they enter where air comes in and head for an outlet picked in
    // proportion to how much air leaves there. Temperature-driven exchange shows as two-way traffic.
    const st=sim.st, {inlets,outlets,buoyant}=airStreams(st), open=availableWindows(st);
    const twoWay=open.filter(name=>st.fanMode==="off"||name!==st.fanLoc); // a running fan's window is all forced flow
    const streaming=inlets.reduce((sum,it)=>sum+it.q,0);
    // Fractional spawn debt accumulates across frames so low flows still shed the odd particle.
    sim.spawnDebt=(sim.spawnDebt||0)+rate*2*(fscale==null?1:fscale);
    const n=Math.min(3,Math.floor(sim.spawnDebt));
    sim.spawnDebt=Math.min(3,sim.spawnDebt-n);
    const coolIn=st.outdoor<=st.indoor; // when outdoors is hotter, the incoming air is the warm one
    for(let i=0;i<n;i++){
      let at=null;
      if(inlets.length&&Math.random()*(streaming+buoyant)<streaming){
        const from=pickByFlow(inlets), targets=outlets.filter(it=>it.name!==from.name);
        if(targets.length||!outlets.length){ // no outlet at all (air leaks out unseen): it just mixes in
          const w=winOf(g,from.name),vx=-w.nx,vy=-w.ny,off=(Math.random()-.5)*w.len;
          sim.particles.push(mk(w.x-vy*off,w.y+vx*off,vx,vy,true,coolIn,targets.length?pickByFlow(targets).name:undefined));
          continue;
        }
        at=from.name; // its only outlet is the same window: an exchange fan trading air both ways
      }
      if(!at){
        const pool=twoWay.length?twoWay:open;
        if(!pool.length)continue;
        at=pool[Math.floor(Math.random()*pool.length)];
      }
      const w=winOf(g,at), into=Math.random()<0.5, s=into?1:-1;
      const vx=-w.nx*s,vy=-w.ny*s,off=(Math.random()-.5)*w.len;
      sim.particles.push(mk(w.x-vy*off,w.y+vx*off,vx,vy,into,into?coolIn:!coolIn));
    }
  }
  function mk(x,y,vx,vy,inbound,cool,target){const sp=0.8+Math.random()*0.7;return {x,y,vx:vx*sp,vy:vy*sp,inbound,cool,life:0,max:150+Math.random()*60,target};}
  function stepParticles(sim,g,fscale){
    const f=fscale==null?1:fscale; // frame-rate–independent step: 1 ≈ one 60 Hz frame
    for(const p of sim.particles){
      if(p.target){
        const w=winOf(g,p.target),dx=w.x-p.x,dy=w.y-p.y,d=Math.hypot(dx,dy)||1;
        p.vx+=(dx/d)*0.05*f;p.vy+=(dy/d)*0.05*f;
        const s=Math.hypot(p.vx,p.vy),cap=1.6; if(s>cap){p.vx*=cap/s;p.vy*=cap/s;}
      }
      p.x+=p.vx*f;p.y+=p.vy*f;p.life+=f;
      const targetWall=p.target&&winOf(g,p.target).wall;
      if(p.x<g.R.x+4&&p.vx<0&&targetWall!=="W"&&p.inbound)p.vx*=-0.4;
      if(p.x>g.R.x+g.R.w-4&&p.vx>0&&targetWall!=="E"&&p.inbound)p.vx*=-0.4;
      if(p.y<g.R.y+4&&p.vy<0&&targetWall!=="N"&&p.inbound)p.vy*=-0.4;
      if(p.y>g.R.y+g.R.h-4&&p.vy>0&&targetWall!=="S"&&p.inbound)p.vy*=-0.4;
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
  DEFAULT_INDOOR,
  DEFAULT_OUTDOOR,
  windowLabel,
  windowState,
  normalizeOpenWindows,
  ensureFanWindow,
  isWindowOpen,
  availableWindows,
  onlyOpen,
  applyConfig,
  configState,
  pressureCoefficient,
  otherWindows,
  windBoost,
  naturalFlow,
  fanReversed,
  windDominated,
  FLOW_MAX,
  HIST_MAX,
  flowModel,
  airPath,
  airStreams,
  bestConfigFor,
  geomFor,
  winOf,
  makeSim,
  resetSim,
  spawn,
  stepParticles,
};
