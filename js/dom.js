function byId(id){
  const el=document.getElementById(id);
  if(!el)throw new Error(`Missing required element #${id}`);
  return el;
}

function title(s){
  return s.charAt(0).toUpperCase()+s.slice(1);
}

function setLeadingText(el,text){
  if(el.firstChild&&el.firstChild.nodeType===3)el.firstChild.nodeValue=text;
  else el.prepend(document.createTextNode(text));
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
    trialFanLoc:byId("trialFanLoc"),
    trialFanMode:byId("trialFanMode"),
    trialStart:byId("trialStart"),
    trialEnd:byId("trialEnd"),
    trialMinutes:byId("trialMinutes"),
    trialNotes:byId("trialNotes"),
    trialMsg:byId("trialMsg"),
    trialRows:byId("trialRows"),
    trialRanking:byId("trialRanking"),
    trialForm:byId("trialForm"),
    clearTrials:byId("clearTrials"),
    trialOpenSelects:{
      north:byId("trialNorthOpen"),
      east:byId("trialEastOpen"),
      south:byId("trialSouthOpen"),
      west:byId("trialWestOpen"),
    },
  };
}

export { byId, title, setLeadingText, getDomRefs };
