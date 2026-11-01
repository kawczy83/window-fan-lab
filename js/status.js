import {
  WIND,
  availableWindows,
  otherWindows,
  windowLabel,
  airStreams,
  flowModel,
  naturalFlow,
  windBoost,
  windDominated,
  fanReversed,
} from "./model.js?v=2.6.0";

const bold=text=>`<b>${text}</b>`;
function joinLabels(names){
  const labels=names.map(windowLabel);
  return labels.length<3?labels.join(" and "):`${labels.slice(0,-1).join(", ")} and ${labels[labels.length-1]}`;
}
function mainWindows(streams){
  // Windows carrying at least a fifth of the flow, biggest first; an exchange fan's two halves count once.
  const total=streams.reduce((sum,s)=>sum+s.q,0);
  return [...new Set(streams.filter(s=>s.q>=0.2*total).map(s=>s.name))];
}

/* =================== STATUS TEXT (sandbox) =================== */
function statusText(st){
  const open=availableWindows(st), off=st.fanMode==="off", exchange=st.fanMode==="exchange";
  const stalled=(st.fanMode==="in"||st.fanMode==="out")&&!availableWindows(st,otherWindows(st.fanLoc)).length;
  const dirName=(WIND[st.windDir]||WIND.S).name;
  const warmIn=st.outdoor>st.indoor; // outdoor air is the warm one, so ventilating heats the room
  const {inlets,outlets,through,buoyant}=airStreams(st);
  const via=list=>{
    const breeze=exchange?list.filter(s=>!s.fan):list; // describe the cross-breeze, not the exchange fan itself
    return bold(joinLabels(mainWindows(breeze.length?breeze:list)));
  };
  const fanHurts=!off&&!warmIn&&flowModel(st)<naturalFlow(st)-0.005; // cooling slower than with no fan
  let msg;
  if(off){
    const windDriven=open.length>1&&inlets.length&&outlets.length&&through>=buoyant, flow=flowModel(st);
    if(open.length<2) msg=`Fan is <b>off</b> with fewer than two open windows — barely any exchange.`;
    else if(windDriven&&flow>=0.9) msg=`Fan is <b>off</b>, but wind toward ${dirName} drives a <b>strong cross-breeze</b> — in via ${via(inlets)}, out via ${via(outlets)}.`;
    else if(windDriven&&flow>=0.3) msg=`Fan is <b>off</b> — a steady wind-driven cross-breeze runs in via ${via(inlets)} and out via ${via(outlets)}.`;
    else msg=`Fan is <b>off</b> — the room drifts through gentle natural exchange between open windows.`;
  }
  else if(stalled){
    const doing=st.fanMode==="out"?"exhausting":"drawing";
    msg=warmIn
      ?`Fan ${doing} without another open window, so it stalls — no loss while the air outside is warmer.`
      :`Fan ${doing} without another open window. One-in/one-out rule kicks in — it stalls. Open a second window.`;
  }
  else if(windDominated(st)){
    msg=fanReversed(st)
      ?`Wind toward ${dirName} <b>overpowers the fan</b>, pushing air backward through it: in via ${via(inlets)}, out via ${via(outlets)}.`
      :`Wind toward ${dirName} drives a cross-breeze <b>stronger than the exchange fan</b>: in via ${via(inlets)}, out via ${via(outlets)}.`;
    if(fanHurts) msg+=` The fan is holding the breeze back — switching it off would move more air.`;
  }
  else if(exchange) msg=`<b>Exchange</b> mode: one blade in, one out, through a single window.${warmIn?"":" Works, but a fan + other open windows moves more air."}`;
  else {
    const boost=windBoost(st);
    const windNote=fanHurts||boost<-0.05?(warmIn?"slowing that down a little":"working against the fan")
      :boost>0.05?(warmIn?"speeding that up":"<b>helping</b>")
      :"a minor factor";
    msg=warmIn
      ?`Clear through-path: warm outdoor air in via ${via(inlets)}, cooler room air out via ${via(outlets)}. Wind toward ${dirName} is ${windNote} here.`
      :`Clear through-path: cool air in via ${via(inlets)}, warm out via ${via(outlets)}. Wind toward ${dirName} is ${windNote} here.`;
    if(fanHurts) msg+=` Switching the fan off would move more air.`;
  }
  if(warmIn&&open.length&&st.outdoor-st.indoor>=0.15) msg+=` <b style="color:var(--warm)">Outdoor air is warmer than the room — close up to keep it cool.</b>`;
  if(Math.abs(st.indoor-st.outdoor)<0.15&&!off) msg+=` <b style="color:var(--good)">Stabilised at outdoor temp.</b>`;
  return msg;
}

export { statusText };
