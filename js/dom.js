function byId(id){
  const el=document.getElementById(id);
  if(!el)throw new Error(`Missing required element #${id}`);
  return el;
}

function setLeadingText(el,text){
  if(el.firstChild&&el.firstChild.nodeType===3)el.firstChild.nodeValue=text;
  else el.prepend(document.createTextNode(text));
}

function setPressed(btn,on){
  btn.classList.toggle("active",on);
  btn.setAttribute("aria-pressed",on?"true":"false");
}

function getDomRefs(){
  return {
    sbRoom:byId("sbRoom"),
    sbChart:byId("sbChart"),
    raRoom:byId("raRoom"),
    rbRoom:byId("rbRoom"),
    raChart:byId("raChart"),
    sbIn:byId("sbIn"),
    sbOut:byId("sbOut"),
    sbFlowBar:byId("sbFlowBar"),
    sbFlowPct:byId("sbFlowPct"),
    sbStatus:byId("sbStatus"),
    legendIn:byId("legendIn"),
    legendOut:byId("legendOut"),
    timerA:byId("timerA"),
    timerB:byId("timerB"),
    flowA:byId("flowA"),
    flowB:byId("flowB"),
    labelA:byId("labelA"),
    labelB:byId("labelB"),
    runnerA:byId("runnerA"),
    runnerB:byId("runnerB"),
    winbar:byId("winbar"),
    sbWs:byId("sbWs"),
    sbWsVal:byId("sbWsVal"),
    sbIt:byId("sbIt"),
    sbItVal:byId("sbItVal"),
    sbOt:byId("sbOt"),
    sbOtVal:byId("sbOtVal"),
    sbReset:byId("sbReset"),
    sbBest:byId("sbBest"),
    raWs:byId("raWs"),
    raWsVal:byId("raWsVal"),
    raIt:byId("raIt"),
    raItVal:byId("raItVal"),
    raOt:byId("raOt"),
    raOtVal:byId("raOtVal"),
    raReset:byId("raReset"),
    raStart:byId("raStart"),
    modeSwitch:byId("modeSwitch"),
    sandboxView:byId("sandboxView"),
    raceView:byId("raceView"),
    speedSeg:byId("speedSeg"),
    currentWindDir:byId("currentWindDir"),
    currentWs:byId("currentWs"),
    currentWsVal:byId("currentWsVal"),
    applyCurrentWind:byId("applyCurrentWind"),
    rose:byId("rose"),
    rosePill:byId("rosePill"),
    roseLoc:byId("roseLoc"),
    roseSummary:byId("roseSummary"),
    applyRose:byId("applyRose"),
    latInput:byId("lat"),
    lonInput:byId("lon"),
    fetchRoseBtn:byId("fetchRose"),
    geoBtn:byId("geoBtn"),
  };
}

export { byId, setLeadingText, setPressed, getDomRefs };
