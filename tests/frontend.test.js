import assert from "node:assert/strict";
import test from "node:test";
import { oppositeDirection, windDescription } from "../js/environment.js";
import { resetHistory, recordHistory } from "../js/history.js";
import { chartDomain } from "../js/charts.js";
import { makeSim, HIST_MAX } from "../js/model.js";
import { createRaceController } from "../js/race.js";

test("weather FROM directions convert to the model's opposite TOWARD direction",()=>{
  for(const [from,toward] of [["N","S"],["NE","SW"],["E","W"],["SE","NW"]]){
    assert.equal(oppositeDirection(from),toward);
    assert.equal(oppositeDirection(toward),from);
  }
  assert.equal(windDescription("S",5),"FROM North → TOWARD South ↓ · 5 mph");
});

test("temperature history uses real sampling times and a rolling time domain",()=>{
  const sim=makeSim();resetHistory(sim);
  recordHistory(sim,0.06);recordHistory(sim,0.06);
  assert.deepEqual(sim.histTimes,[0,0.12]);
  for(let i=0;i<HIST_MAX+4;i++)recordHistory(sim,0.13);
  assert.equal(sim.hist.length,HIST_MAX);
  assert.equal(sim.histTimes.length,HIST_MAX);
  const domain=chartDomain([sim]);
  assert.equal(domain.minTime,sim.histTimes[0]);
  assert.equal(domain.maxTime,sim.histTimes.at(-1));
  resetHistory(sim);
  assert.deepEqual(sim.histTimes,[0]);
  assert.deepEqual(sim.hist,[78]);
  assert.equal(chartDomain([sim]).maxTime,5);
});

test("chart bounds follow the scenario instead of hard-coding the default temperatures",()=>{
  const sim=makeSim({indoor:42,outdoor:45});resetHistory(sim);
  const domain=chartDomain([sim]);
  assert.deepEqual([domain.minTemp,domain.maxTemp],[41,46]);
});

test("changing shared wind clears race results, timers and sampled history",()=>{
  const previousDocument=globalThis.document;
  globalThis.document={querySelectorAll:()=>[]};
  function element(){
    const handlers={};
    return {dataset:{},firstChild:{nodeType:3,nodeValue:""},classList:{remove(){}},addEventListener:(type,handler)=>handlers[type]=handler,emit:type=>handlers[type]()};
  }
  try{
    const A=makeSim(),B=makeSim();
    const refs=Object.fromEntries(["timerA","timerB","flowA","flowB","runnerA","runnerB","labelA","labelB","raceView","raStart","winbar","raIt","raOt","raItVal","raOtVal","raReset"].map(key=>[key,element()]));
    const controller=createRaceController({A,B,refs,geos:{},contexts:{},setSegActive(){},renderWindowControls(){}});
    refs.raStart.emit("click");
    assert.equal(refs.raceView.dataset.raceState,"running");
    A.t=22;A.doneAt=22;A.hist.push(70);A.histTimes.push(22);B.st.indoor=73;
    refs.winbar.textContent="Config A wins";
    controller.setWind("W",12);
    assert.equal(refs.raceView.dataset.raceState,"ready");
    for(const sim of [A,B]){
      assert.equal(sim.st.windDir,"W");assert.equal(sim.st.windSpeed,12);
      assert.equal(sim.st.indoor,78);assert.equal(sim.t,0);assert.equal(sim.doneAt,null);
      assert.deepEqual(sim.hist,[78]);assert.deepEqual(sim.histTimes,[0]);
    }
    assert.equal(refs.timerA.firstChild.nodeValue,"0.0");
    assert.equal(refs.raStart.textContent,"Start race");
    assert.match(refs.winbar.textContent,/Press Start race/);
  }finally{globalThis.document=previousDocument;}
});
