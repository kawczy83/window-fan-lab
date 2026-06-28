import { WINDOW_IDS, normalizeOpenWindows, isWindowOpen, isValidTrial } from "./model.js";
import { title } from "./dom.js";

const TRIALS_KEY="window-fan-lab-trials-v1";
const newTrialId=()=>Date.now()+"-"+Math.random().toString(36).slice(2);

function createTrialsController({refs,openWindowSummary}){
  function normalizeTrial(trial){
    const normalized=Object.assign({},trial,{openWindows:normalizeOpenWindows(trial.openWindows,trial.fanLoc,trial.otherOpen)});
    if(!normalized.id)normalized.id=newTrialId();
    delete normalized.otherOpen;
    return normalized;
  }

  function loadTrials(){
    try{const data=JSON.parse(localStorage.getItem(TRIALS_KEY)||"[]");return Array.isArray(data)?data.filter(isValidTrial).map(normalizeTrial):[];}catch(err){return [];}
  }

  let trials=loadTrials();
  const trialRate=t=>(t.start-t.end)/(t.minutes/60);
  const setupLabel=t=>`${title(t.fanLoc)} · ${title(t.fanMode)} · open ${openWindowSummary(t)}`;
  const trialWindowKey=t=>WINDOW_IDS.map(name=>isWindowOpen(t,name)?"1":"0").join("");

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

  refs.trialFanLoc.addEventListener("change",syncTrialFanWindow);
  refs.trialFanMode.addEventListener("change",syncTrialFanWindow);
  refs.trialForm.addEventListener("submit",e=>{
    e.preventDefault();
    const start=+refs.trialStart.value,end=+refs.trialEnd.value,minutes=+refs.trialMinutes.value;
    if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(minutes)||minutes<=0){refs.trialMsg.textContent="Enter valid temperatures and a duration greater than zero.";return;}
    trials.push({id:newTrialId(),fanLoc:refs.trialFanLoc.value,fanMode:refs.trialFanMode.value,openWindows:trialWindowsFromForm(),start,end,minutes,notes:refs.trialNotes.value.trim()});
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

  return {
    init(){
      renderTrials();
      syncTrialFanWindow();
    },
    render:renderTrials,
    syncFanWindow:syncTrialFanWindow,
  };
}

export { createTrialsController };
