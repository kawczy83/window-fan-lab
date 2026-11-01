import assert from "node:assert/strict";
import test from "node:test";

import { chartDomain } from "../js/charts.js";
import { resetHistory } from "../js/history.js";
import { makeSim } from "../js/model.js";
import { createRaceController } from "../js/race.js";
import {
  formatTemp,
  formatTempWithUnit,
  fromUnit,
  loadUnit,
  saveUnit,
  SLIDER_RANGE,
  syncTempSlider,
  toUnit,
} from "../js/units.js";

test("converts between Fahrenheit and Celsius", () => {
  assert.equal(toUnit(32, "C"), 0);
  assert.equal(toUnit(212, "C"), 100);
  assert.equal(toUnit(78, "F"), 78);
  for (const f of [40, 70, 78, 95]) assert.ok(Math.abs(fromUnit(toUnit(f, "C"), "C") - f) < 1e-9);
});

test("temperatures read as whole degrees when they are, otherwise to one decimal", () => {
  assert.equal(formatTempWithUnit(70, "F"), "70°F");
  assert.equal(formatTempWithUnit(70, "C"), "21.1°C");
  assert.equal(formatTempWithUnit(fromUnit(26, "C"), "C"), "26°C"); // a value set in °C reads back whole
  assert.equal(formatTemp(78, "C", 1), "25.6");
});

test("re-scaling a slider to another unit keeps the temperature it holds", () => {
  const input = { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const label = {};
  syncTempSlider(input, label, 78, "C");
  assert.deepEqual([input.min, input.max, input.value], [4, 35, 26]);
  assert.equal(label.textContent, "25.6°C"); // the exact value, not the rounded thumb position
  assert.equal(input.attrs["aria-valuetext"], "25.6°C");
  syncTempSlider(input, label, 78, "F");
  assert.deepEqual([input.min, input.max, input.value], [40, 95, 78]);
  assert.equal(label.textContent, "78°F");

  // The Celsius range spans the whole Fahrenheit one.
  assert.ok(fromUnit(SLIDER_RANGE.C.min, "C") <= SLIDER_RANGE.F.min);
  assert.ok(fromUnit(SLIDER_RANGE.C.max, "C") >= SLIDER_RANGE.F.max);
});

test("chart bounds pad in whole degrees of the chosen unit", () => {
  const sim = makeSim(); // 78°F in, 70°F out
  resetHistory(sim);
  const fahrenheit = chartDomain([sim]);
  assert.deepEqual([fahrenheit.minTemp, fahrenheit.maxTemp], [69, 79]);
  const celsius = chartDomain([sim], "C"); // 21.1°C to 25.6°C
  assert.deepEqual([celsius.minTemp, celsius.maxTemp], [20, 27]);
});

test("the unit choice is remembered, and blocked storage falls back to °F", () => {
  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  assert.equal(loadUnit(storage), "F");
  saveUnit(storage, "C");
  assert.equal(loadUnit(storage), "C");

  const blocked = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  assert.equal(loadUnit(blocked), "F");
  assert.doesNotThrow(() => saveUnit(blocked, "C"));
  assert.equal(loadUnit(null), "F");
});

test("race sliders read the chosen unit while the race itself runs in °F", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => [] };
  function element() {
    const handlers = {};
    const el = {
      value: "",
      textContent: "",
      dataset: {},
      attrs: {},
      firstChild: { nodeType: 3, nodeValue: "" },
      classList: { remove() {} },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      emit: (type) => handlers[type]({ target: el }),
    };
    return el;
  }
  try {
    let unit = "C";
    const A = makeSim(), B = makeSim();
    const refs = Object.fromEntries(
      ["timerA", "timerB", "flowA", "flowB", "runnerA", "runnerB", "labelA", "labelB", "raceView", "raStart",
        "winbar", "raIt", "raOt", "raItVal", "raOtVal", "raReset"].map((key) => [key, element()]),
    );
    const race = createRaceController({
      A, B, refs, geos: {}, contexts: {}, setSegActive() {}, renderWindowControls() {}, getUnit: () => unit,
    });

    refs.raOt.value = "21";
    refs.raOt.emit("input");
    assert.ok(Math.abs(A.st.outdoor - 69.8) < 1e-9);
    assert.equal(B.st.outdoor, A.st.outdoor);
    assert.equal(refs.raOtVal.textContent, "21°C");

    refs.raIt.value = "26";
    refs.raIt.emit("input");
    assert.ok(Math.abs(A.st.indoor - 78.8) < 1e-9); // the reset race starts from 26°C

    unit = "F";
    race.renderUnits();
    assert.equal(refs.raItVal.textContent, "78.8°F");
    assert.equal(refs.raIt.value, 79);
    assert.equal(refs.raOtVal.textContent, "69.8°F");
  } finally {
    globalThis.document = previousDocument;
  }
});
