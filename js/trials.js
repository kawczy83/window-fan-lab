import { WINDOW_IDS, normalizeOpenWindows, isWindowOpen, isValidTrial } from "./model.js";
import { title } from "./dom.js";

const TRIALS_KEY="window-fan-lab-trials-v1";
const newTrialId=()=>Date.now()+"-"+Math.random().toString(36).slice(2);

const trialRate=t=>(t.start-t.end)/(t.minutes/60);
// Per-degree rate: cooling per hour per °F of indoor–outdoor gap (rate ÷ log-mean differential),
// so trials measured under different weather stay comparable. Null when outdoor wasn't logged or
// the room touched/crossed outdoor temp (the log form is undefined there).
function trialNormRate(t){
  if(!Number.isFinite(t.outdoor))return null;
  const a=t.start-t.outdoor, b=t.end-t.outdoor;
  if(a===0||b===0||(a>0)!==(b>0))return null;
  return Math.log(a/b)/(t.minutes/60);
}
const trialWindowKey=t=>WINDOW_IDS.map(name=>isWindowOpen(t,name)?"1":"0").join("");

function rankTrialGroups(trials){
  const groups=new Map();
  for(const trial of trials){
    const key=`${trial.fanLoc}|${trial.fanMode}|${trialWindowKey(trial)}`;
    const group=groups.get(key)||{sample:trial,drop:0,minutes:0,count:0,normSum:0,normCount:0};
    group.drop+=trial.start-trial.end;group.minutes+=trial.minutes;group.count++;
    const norm=trialNormRate(trial);
    if(norm!=null){group.normSum+=norm;group.normCount++;}
    groups.set(key,group);
  }
  return [...groups.values()].map(g=>({
    sample:g.sample,
    count:g.count,
    rate:g.drop/(g.minutes/60),
    normRate:g.normCount?g.normSum/g.normCount:null,
  })).sort((a,b)=>{
    // Groups with a per-degree rate rank above legacy raw-rate-only groups.
    if((a.normRate!=null)!==(b.normRate!=null))return a.normRate!=null?-1:1;
    if(a.normRate!=null)return b.normRate-a.normRate;
    return b.rate-a.rate;
  });
}

function createTrialsController({refs,openWindowSummary}){
  function normalizeTrial(trial){
    const normalized=Object.assign({},trial,{openWindows:normalizeOpenWindows(trial.openWindows,trial.fanLoc,trial.otherOpen)});
    if(!normalized.id)normalized.id=newTrialId();
    if(!Number.isFinite(normalized.outdoor))delete normalized.outdoor;
    delete normalized.otherOpen;
    return normalized;
  }

  function loadTrials(){
    try{const data=JSON.parse(localStorage.getItem(TRIALS_KEY)||"[]");return Array.isArray(data)?data.filter(isValidTrial).map(normalizeTrial):[];}catch(err){return [];}
  }

  let trials=loadTrials();
  const setupLabel=t=>`${title(t.fanLoc)} · ${title(t.fanMode)} · open ${openWindowSummary(t)}`;

  function syncTrialFanWindow(){
    const fanLoc=refs.trialFanLoc.value,fanMode=refs.trialFanMode.value;
    for(const name of WINDOW_IDS){
      const select=refs.trialOpenSelects[name],forced=name===fanLoc&&fanMode!=="off";
      if(forced)select.value="open";
      select.disabled=forced;
    }
  }

  function trialWindowsFromForm(){
    return Object.fromEntries(WINDOW_IDS.map(name=>[name,refs.trialOpenSelects[name].value==="open"]));
  }

  function saveTrials(){
    try{localStorage.setItem(TRIALS_KEY,JSON.stringify(trials));}catch(err){}
  }

  function cell(text,className){
    const td=document.createElement("td");
    td.textContent=text;
    if(className)td.className=className;
    return td;
  }

  function emptyRow(tbody,colspan,text){
    const tr=document.createElement("tr"),td=cell(text,"empty");
    td.colSpan=colspan;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function renderTrials(){
    const ranking=refs.trialRanking, rows=refs.trialRows;
    ranking.replaceChildren();rows.replaceChildren();
    if(!trials.length){emptyRow(ranking,5,"No measured trials yet.");emptyRow(rows,7,"Add a trial to start comparing real setups.");return;}
    rankTrialGroups(trials).forEach((group,i)=>{
      const tr=document.createElement("tr");
      tr.append(cell(String(i+1)),cell(setupLabel(group.sample)),cell(String(group.count)),
        cell(group.rate.toFixed(2)+" °F/hour","rate"),
        cell(group.normRate==null?"—":group.normRate.toFixed(2)+" /h","rate"));
      ranking.appendChild(tr);
    });
    [...trials].reverse().forEach(trial=>{
      const tr=document.createElement("tr"),del=document.createElement("button");
      tr.append(cell(setupLabel(trial)),cell(`${trial.start.toFixed(1)}°F → ${trial.end.toFixed(1)}°F`),
        cell(Number.isFinite(trial.outdoor)?trial.outdoor.toFixed(1)+"°F":"—"),
        cell(`${trial.minutes.toFixed(1)} min`),cell(trialRate(trial).toFixed(2)+" °F/hour","rate"),cell(trial.notes||"—"));
      del.type="button";del.className="delete-trial";del.dataset.id=trial.id;del.textContent="Delete";
      const td=document.createElement("td");td.appendChild(del);tr.appendChild(td);rows.appendChild(tr);
    });
  }

  refs.trialFanLoc.addEventListener("change",syncTrialFanWindow);
  refs.trialFanMode.addEventListener("change",syncTrialFanWindow);
  refs.trialForm.addEventListener("submit",e=>{
    e.preventDefault();
    const start=+refs.trialStart.value,end=+refs.trialEnd.value,minutes=+refs.trialMinutes.value;
    const outdoorRaw=refs.trialOutdoor.value.trim(), outdoor=outdoorRaw===""?undefined:+outdoorRaw;
    if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(minutes)||minutes<=0){refs.trialMsg.textContent="Enter valid temperatures and a duration greater than zero.";return;}
    if(outdoorRaw!==""&&!Number.isFinite(outdoor)){refs.trialMsg.textContent="Outdoor temperature must be a number (or leave it blank).";return;}
    const trial={id:newTrialId(),fanLoc:refs.trialFanLoc.value,fanMode:refs.trialFanMode.value,openWindows:trialWindowsFromForm(),start,end,minutes,notes:refs.trialNotes.value.trim()};
    if(outdoor!==undefined)trial.outdoor=outdoor;
    trials.push(trial);
    saveTrials();renderTrials();refs.trialNotes.value="";refs.trialMsg.textContent="Measured trial added.";
  });
  refs.trialRows.addEventListener("click",e=>{
    const b=e.target.closest(".delete-trial");if(!b)return;
    trials=trials.filter(t=>t.id!==b.dataset.id);saveTrials();renderTrials();refs.trialMsg.textContent="Trial deleted.";
  });
  refs.clearTrials.addEventListener("click",()=>{
    if(!trials.length||!confirm("Clear all measured trials?"))return;
    trials=[];saveTrials();renderTrials();refs.trialMsg.textContent="All trials cleared.";
  });
  refs.exportTrials.addEventListener("click",()=>{
    if(!trials.length){refs.trialMsg.textContent="No trials to export yet.";return;}
    const blob=new Blob([JSON.stringify(trials,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download="window-fan-lab-trials.json";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    refs.trialMsg.textContent=`Exported ${trials.length} trial${trials.length===1?"":"s"}.`;
  });
  refs.importTrials.addEventListener("click",()=>refs.importTrialsFile.click());
  refs.importTrialsFile.addEventListener("change",async e=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value=""; // allow re-importing the same file after edits
    if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      if(!Array.isArray(data))throw new Error("not an array");
      const incoming=data.filter(isValidTrial).map(normalizeTrial);
      const have=new Set(trials.map(t=>t.id));
      const added=incoming.filter(t=>!have.has(t.id));
      trials.push(...added);
      saveTrials();renderTrials();
      const skipped=data.length-added.length;
      refs.trialMsg.textContent=`Imported ${added.length} trial${added.length===1?"":"s"}${skipped?` (${skipped} skipped as duplicate or invalid)`:""}.`;
    }catch(err){
      refs.trialMsg.textContent="Import failed — that file isn't a valid trials JSON export.";
    }
  });

  return {
    init(){
      renderTrials();
      syncTrialFanWindow();
    },
    render:renderTrials,
    syncFanWindow:syncTrialFanWindow,
  };
}

export { createTrialsController, trialRate, trialNormRate, rankTrialGroups };
