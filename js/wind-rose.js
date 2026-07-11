import { WIND } from "./model.js?v=2.4.1";
import { prepCanvas } from "./draw.js?v=2.4.1";

const DIRS16=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const PHILLY=[5.5,4.5,4.0,3.5,3.5,3.5,4.0,4.5,6.0,7.0,8.5,9.5,11.5,8.5,9.0,7.0];
const PHILLY_FALLBACK_LOC="Philadelphia, PA · fallback sample data";
const ROSE_CACHE_KEY="window-fan-lab-rose-v1";
const ROSE_CACHE_TTL=864e5; // 24 h — the 12-month archive barely changes day to day
const ROSE_CACHE_MAX=8;
const cacheKey=(lat,lon)=>`${(+lat).toFixed(3)},${(+lon).toFixed(3)}`;

function loadRoseCache(lat,lon){
  try{
    const all=JSON.parse(localStorage.getItem(ROSE_CACHE_KEY)||"{}");
    const hit=all[cacheKey(lat,lon)];
    if(hit&&Array.isArray(hit.pct)&&hit.pct.length===16&&Date.now()-hit.fetchedAt<ROSE_CACHE_TTL)return hit;
  }catch(err){}
  return null;
}

function saveRoseCache(lat,lon,data){
  try{
    const all=JSON.parse(localStorage.getItem(ROSE_CACHE_KEY)||"{}");
    all[cacheKey(lat,lon)]=Object.assign({},data,{fetchedAt:Date.now()});
    const keys=Object.keys(all);
    if(keys.length>ROSE_CACHE_MAX){
      keys.sort((a,b)=>(all[a].fetchedAt||0)-(all[b].fetchedAt||0));
      while(keys.length>ROSE_CACHE_MAX)delete all[keys.shift()];
    }
    localStorage.setItem(ROSE_CACHE_KEY,JSON.stringify(all));
  }catch(err){}
}

function snapToward(fromDeg){
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(((fromDeg+180)%360)/45)%8];
}

function dominant(pct){
  let mi=0;
  for(let i=1;i<pct.length;i++)if(pct[i]>pct[mi])mi=i;
  return mi;
}

function drawRose(ch,roseData){
  const cx=ch.ctx,W=ch.W,H=ch.H;
  const cxp=W/2,cyp=H/2,maxR=Math.min(W,H)*0.40;
  cx.clearRect(0,0,W,H);
  const pct=roseData.pct, mx=Math.max(...pct), domI=dominant(pct);
  cx.strokeStyle="#222b3a";cx.lineWidth=1;cx.fillStyle="#5b6b86";cx.font="20px 'JetBrains Mono'";cx.textAlign="center";
  for(let r=1;r<=3;r++){cx.beginPath();cx.arc(cxp,cyp,maxR*r/3,0,7);cx.stroke();}
  const labels=[["N",0],["E",90],["S",180],["W",270]];
  cx.strokeStyle="#1b2330";
  for(const [n,deg] of labels){
    const rad=deg*Math.PI/180, ex=cxp+Math.sin(rad)*maxR, ey=cyp-Math.cos(rad)*maxR;
    cx.beginPath();cx.moveTo(cxp,cyp);cx.lineTo(ex,ey);cx.stroke();
    cx.fillStyle="#7c899e";cx.font="700 22px 'Archivo'";
    cx.fillText(n,cxp+Math.sin(rad)*(maxR+26),cyp-Math.cos(rad)*(maxR+26)+7);
  }
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

function createWindRose({refs,applyWindToActive}){
  let roseData={pct:PHILLY.slice(), source:"fallback", loc:PHILLY_FALLBACK_LOC, meanSpeed:null};
  const roseCanvas=prepCanvas(refs.rose);

  function renderRoseMeta(){
    const domI=dominant(roseData.pct), fromDir=DIRS16[domI], pctv=roseData.pct[domI].toFixed(1);
    const toCard=snapToward(domI*22.5);
    const toWind=WIND[toCard], toName=toWind.name;
    const pill=refs.rosePill;
    if(roseData.source==="historical"){pill.className="pill historical";pill.textContent="Historical archive · Open-Meteo";}
    else if(roseData.source==="loading"){pill.className="pill loading";pill.textContent="loading…";}
    else {pill.className="pill fallback";pill.textContent="Fallback sample · Philadelphia";}
    refs.roseLoc.textContent=roseData.loc;
    const ms=roseData.meanSpeed!=null?` Mean wind ≈ ${roseData.meanSpeed.toFixed(1)} mph.`:"";
    const extra=roseData.source==="fallback"?" (Philadelphia fallback sample climatology: westerly overall — SW in summer, NW in winter.)":"";
    const errNote=roseData.error?`<span class="fetch-err">${roseData.error}</span> `:"";
    refs.roseSummary.innerHTML=errNote+
      `Prevailing wind is <span class="from">FROM ${fromDir}</span> (${pctv}% of the time)${extra}, which means it blows <span class="to">TOWARD ${toName.toUpperCase()}</span> — set the model's wind to <b>"${toName} ${toWind.arrow}"</b>.${ms}`;
    refs.applyRose.dataset.toward=toCard;
    drawRose(roseCanvas,roseData);
  }

  async function fetchRose(lat,lon,label){
    const cached=loadRoseCache(lat,lon);
    if(cached){
      roseData={pct:cached.pct, source:"historical", loc:cached.loc, meanSpeed:cached.meanSpeed};
      renderRoseMeta();
      return;
    }
    refs.rosePill.className="pill loading";
    refs.rosePill.textContent="loading…";
    refs.roseSummary.textContent="Fetching the last 12 months of hourly wind data…";
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
      const loc=label||`${(+lat).toFixed(3)}, ${(+lon).toFixed(3)}`;
      roseData={pct, source:"historical", loc, meanSpeed:sCnt?sSum/sCnt:null};
      saveRoseCache(lat,lon,{pct, loc, meanSpeed:roseData.meanSpeed});
    }catch(err){
      roseData={pct:PHILLY.slice(), source:"fallback", loc:PHILLY_FALLBACK_LOC, meanSpeed:null,
        error:`Couldn't fetch wind history for ${label||"those coordinates"} — showing the fallback sample instead.`};
    }
    renderRoseMeta();
  }

  refs.fetchRoseBtn.addEventListener("click",()=>{
    const lat=+refs.latInput.value, lon=+refs.lonInput.value;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180){
      refs.roseSummary.textContent="Enter a latitude from -90 to 90 and a longitude from -180 to 180.";
      return;
    }
    fetchRose(lat,lon,`${lat.toFixed(3)}, ${lon.toFixed(3)}`);
  });

  refs.geoBtn.addEventListener("click",()=>{
    if(!navigator.geolocation){alert("Geolocation not available — enter coordinates manually.");return;}
    refs.geoBtn.textContent="locating…";
    navigator.geolocation.getCurrentPosition(
      p=>{const la=p.coords.latitude.toFixed(4),lo=p.coords.longitude.toFixed(4);
        refs.latInput.value=la;refs.lonInput.value=lo;
        refs.geoBtn.textContent="Use my location";
        fetchRose(la,lo,`${(+la).toFixed(3)}, ${(+lo).toFixed(3)}`);},
      ()=>{refs.geoBtn.textContent="Use my location";alert("Couldn't get location — enter coordinates manually.");},
      {timeout:10000,maximumAge:600000} // never leave the button stuck on "locating…"
    );
  });

  refs.applyRose.addEventListener("click",e=>{
    const btn=e.currentTarget;
    const toward=btn.dataset.toward||"E";
    applyWindToActive(toward);
    const tn=(WIND[toward]||WIND.S).name;
    btn.textContent=`✓ Applied historical pattern — wind toward ${tn}`;
    setTimeout(()=>{btn.textContent="↳ Apply historical prevailing direction to model";},1800);
  });

  return {
    init(){
      renderRoseMeta();
      fetchRose("39.9526","-75.1652","Philadelphia, PA");
    },
    fetchRose,
  };
}

export { createWindRose };
