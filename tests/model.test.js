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

test("fan-off cross-ventilation rises with wind speed", () => {
  const calm = baseState();
  calm.fanMode = "off";
  calm.windSpeed = 0;

  const breezy = baseState();
  breezy.fanMode = "off";
  breezy.windSpeed = 10;

  // No wind through a windward/leeward path: only the buoyant/turbulent floor.
  assert.equal(flowModel(calm), 0.05);
  // The same openings move much more air once the wind drives them.
  assert.ok(flowModel(breezy) > flowModel(calm));
});

test("fan-off ventilation depends on window orientation to the wind", () => {
  const through = baseState(); // wind blows toward south
  through.fanMode = "off";
  through.windSpeed = 10;
  through.openWindows = onlyOpen("north", "south"); // windward + leeward

  const parallel = baseState();
  parallel.fanMode = "off";
  parallel.windSpeed = 10;
  parallel.openWindows = onlyOpen("east", "west"); // both side walls

  // A windward -> leeward path out-ventilates two equal-pressure side walls.
  assert.ok(flowModel(through) > flowModel(parallel));
  // Side-wall pair shares the same pressure: no driving gap, just the floor.
  assert.equal(flowModel(parallel), 0.05);
});

test("a running fan still out-ventilates open windows in the same wind", () => {
  const natural = baseState();
  natural.fanMode = "off";
  natural.windSpeed = 10;

  const fan = baseState(); // south exhaust with a full through-path
  fan.windSpeed = 10;

  assert.ok(flowModel(fan) > flowModel(natural));
});

test("fan still wins and flow stays physical at the 30 mph slider maximum", () => {
  const fan = baseState(); // south exhaust with a full through-path
  fan.windSpeed = 30;

  const natural = baseState();
  natural.fanMode = "off";
  natural.windSpeed = 30;

  // The fan still out-ventilates open windows at the top of the range.
  assert.ok(flowModel(fan) > flowModel(natural));
  // Strong wind never drives flow negative or unbounded.
  assert.ok(flowModel(natural) >= 0.05);
  assert.ok(flowModel(fan) >= 0.05);
});
