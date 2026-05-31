import assert from "node:assert/strict";
import test from "node:test";

import {
  airPath,
  applyConfig,
  availableWindows,
  flowModel,
  normalizeOpenWindows,
  onlyOpen,
  windowState,
} from "../js/model.js";

const baseState = () => ({
  indoor: 74,
  outdoor: 64,
  fanLoc: "south",
  fanMode: "out",
  openWindows: windowState(true),
  windDir: "S",
  windSpeed: 5,
});

test("south exhaust draws from the windward north window by default", () => {
  assert.deepEqual(airPath(baseState()), {
    intake: "north",
    exhaust: "south",
    bidir: null,
  });
});

test("airflow path uses the best available open window", () => {
  const state = baseState();
  state.openWindows = onlyOpen("east", "south");

  assert.equal(airPath(state).intake, "east");
});

test("isolating the fan removes its through-path and reduces airflow", () => {
  const openPath = baseState();
  const isolatedFan = baseState();
  isolatedFan.openWindows = onlyOpen("south");

  assert.equal(airPath(isolatedFan).intake, null);
  assert.equal(flowModel(isolatedFan), 0.4);
  assert.ok(flowModel(openPath) > flowModel(isolatedFan));
});

test("fan-off natural exchange uses only open windows", () => {
  const state = baseState();
  state.fanMode = "off";
  state.openWindows = onlyOpen("east", "west");

  assert.deepEqual(availableWindows(state), ["east", "west"]);
  assert.deepEqual(airPath(state), {
    intake: "east",
    exhaust: "west",
    bidir: null,
  });
});

test("applying a configuration keeps an active fan window open", () => {
  const state = baseState();

  applyConfig(state, {
    fanLoc: "west",
    fanMode: "in",
    openWindows: onlyOpen("north"),
  });

  assert.deepEqual(state.openWindows, {
    north: true,
    east: false,
    south: false,
    west: true,
  });
});

test("legacy grouped window state migrates to individual windows", () => {
  assert.deepEqual(normalizeOpenWindows(null, "south", true), {
    north: true,
    east: true,
    south: true,
    west: true,
  });
  assert.deepEqual(normalizeOpenWindows(null, "south", false), {
    north: false,
    east: false,
    south: true,
    west: false,
  });
});
