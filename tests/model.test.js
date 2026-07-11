import assert from "node:assert/strict";
import test from "node:test";

import {
  airPath,
  applyConfig,
  availableWindows,
  bestConfigFor,
  DEFAULT_INDOOR,
  DEFAULT_OUTDOOR,
  FAN_MODES,
  FLOW_MAX,
  flowModel,
  makeSim,
  naturalFlow,
  normalizeOpenWindows,
  onlyOpen,
  WIND,
  WINDOW_IDS,
  windBoost,
  windDominated,
  windowState,
} from "../js/model.js";

test("new simulations use the displayed default temperatures", () => {
  const sim = makeSim();

  assert.equal(DEFAULT_INDOOR, 78);
  assert.equal(DEFAULT_OUTDOOR, 70);
  assert.equal(sim.st.indoor, DEFAULT_INDOOR);
  assert.equal(sim.st.outdoor, DEFAULT_OUTDOOR);
});

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
  assert.equal(flowModel(isolatedFan), 0.05);
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

test("windBoost is zero without wind and signed by alignment with the fan", () => {
  const calm = baseState();
  calm.windSpeed = 0;
  assert.equal(windBoost(calm), 0); // no wind, no boost — and no "wind is helping" copy

  const aligned = baseState(); // south exhaust, wind toward south
  assert.ok(windBoost(aligned) > 0);

  const opposed = baseState(); // exhausting into the windward north face
  opposed.fanLoc = "north";
  assert.ok(windBoost(opposed) < 0);

  for (const fanMode of ["off", "exchange"]) {
    const inert = baseState();
    inert.fanMode = fanMode;
    assert.equal(windBoost(inert), 0);
  }
  const sealed = baseState();
  sealed.openWindows = onlyOpen("south");
  assert.equal(windBoost(sealed), 0);
});

test("a fan never moves less air than the same open windows without it", () => {
  const fighting = baseState(); // exhaust straight into a 30 mph windward face
  fighting.fanLoc = "north";
  fighting.windSpeed = 30;

  const noFan = baseState();
  noFan.fanMode = "off";
  noFan.windSpeed = 30;

  // The wind keeps cross-venting the other openings, so flow floors at the fan-off rate.
  assert.equal(flowModel(fighting), flowModel(noFan));
  assert.ok(flowModel(fighting) >= naturalFlow(fighting));
});

test("flow stays within (0, FLOW_MAX] across the whole config space", () => {
  for (const fanLoc of WINDOW_IDS)
    for (const fanMode of FAN_MODES)
      for (const windDir of Object.keys(WIND))
        for (const windSpeed of [0, 5, 10, 30])
          for (const openWindows of [
            windowState(true),
            windowState(false),
            onlyOpen("north", "south"),
            onlyOpen("east"),
            onlyOpen(fanLoc),
          ]) {
            const st = { indoor: 74, outdoor: 64, fanLoc, fanMode, openWindows, windDir, windSpeed };
            const flow = flowModel(st);
            assert.ok(
              flow > 0 && flow <= FLOW_MAX,
              `flow ${flow} out of range for ${JSON.stringify(st)}`,
            );
          }
});

test("an overpowered fan's air path follows the wind, not the fan", () => {
  const opposed = baseState(); // exhausting into the windward north face
  opposed.fanLoc = "north";

  // Light wind: the fan still sets the direction — in the far window, out the fan.
  assert.equal(windDominated(opposed), false);
  assert.deepEqual(airPath(opposed), { intake: "east", exhaust: "north", bidir: null });

  // 30 mph: natural cross-vent outruns the fan, so the path reverses to windward → leeward.
  opposed.windSpeed = 30;
  assert.equal(windDominated(opposed), true);
  assert.deepEqual(airPath(opposed), { intake: "north", exhaust: "south", bidir: null });
});

test("strong wind also overrides the exchange-mode bidirectional path", () => {
  const exch = baseState();
  exch.fanMode = "exchange";
  assert.deepEqual(airPath(exch), { intake: null, exhaust: null, bidir: "south" });

  exch.windSpeed = 30;
  assert.equal(windDominated(exch), true);
  assert.deepEqual(airPath(exch), { intake: "north", exhaust: "south", bidir: null });
});

test("a wind-aligned fan keeps its own through-path at any speed", () => {
  const aligned = baseState(); // south exhaust, wind toward south
  aligned.windSpeed = 30;

  assert.equal(windDominated(aligned), false);
  assert.deepEqual(airPath(aligned), { intake: "north", exhaust: "south", bidir: null });
});

test("best config tracks which windows are open instead of assuming all-open", () => {
  const allOpen = baseState();
  allOpen.fanMode = "off"; // no fan placement constraint
  const best = bestConfigFor(allOpen); // wind toward south: exhaust leeward
  assert.equal(best.fanLoc, "south");
  assert.equal(best.fanMode, "out");

  const southClosed = baseState();
  southClosed.fanMode = "off";
  southClosed.openWindows = onlyOpen("north", "east", "west");
  const shifted = bestConfigFor(southClosed);
  assert.notEqual(shifted.fanLoc, "south"); // never puts the fan in a closed window
  assert.equal(shifted.fanMode, "out");
  assert.equal(shifted.openWindows.south, false); // and never reopens it
});

test("a single open window while cooling suggests completing the best pair", () => {
  const oneWindow = baseState(); // wind toward south, only south open
  oneWindow.openWindows = onlyOpen("south");

  const best = bestConfigFor(oneWindow);
  assert.deepEqual(best.openWindows, onlyOpen("north", "south")); // adds the windward window, keeps south
  assert.equal(best.fanLoc, "south"); // exhaust out the leeward side
  assert.equal(best.fanMode, "out");
});

test("a single open window while warming still recommends sealing up", () => {
  const oneWindow = baseState();
  oneWindow.openWindows = onlyOpen("south");
  oneWindow.indoor = 64;
  oneWindow.outdoor = 74;

  const best = bestConfigFor(oneWindow);
  assert.equal(best.fanMode, "off");
  assert.deepEqual(best.openWindows, windowState(false));
});

test("all windows closed while cooling suggests opening the best pair", () => {
  const closedUp = baseState(); // wind toward south
  closedUp.fanMode = "off";
  closedUp.openWindows = windowState(false);

  const best = bestConfigFor(closedUp);
  assert.deepEqual(best.openWindows, onlyOpen("north", "south")); // windward + leeward pair
  assert.equal(best.fanLoc, "south"); // exhaust through the leeward window
  assert.equal(best.fanMode, "out");
});

test("all windows closed while warming still stays sealed", () => {
  const sealed = baseState();
  sealed.fanMode = "off";
  sealed.openWindows = windowState(false);
  sealed.indoor = 64;
  sealed.outdoor = 74;

  const best = bestConfigFor(sealed);
  assert.equal(best.fanMode, "off");
  assert.deepEqual(best.openWindows, windowState(false));
});

test("hotter outdoors still recommends sealing up", () => {
  const warming = baseState();
  warming.indoor = 64;
  warming.outdoor = 74;

  const best = bestConfigFor(warming);
  assert.equal(best.fanMode, "off");
  assert.deepEqual(best.openWindows, windowState(false));
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
