import assert from "node:assert/strict";
import test from "node:test";

import {
  airPath,
  airStreams,
  applyConfig,
  availableWindows,
  bestConfigFor,
  DEFAULT_INDOOR,
  DEFAULT_OUTDOOR,
  FAN_MODES,
  fanReversed,
  FLOW_MAX,
  flowModel,
  geomFor,
  makeSim,
  naturalFlow,
  normalizeOpenWindows,
  onlyOpen,
  pressureCoefficient,
  spawn,
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
  // Only leakage and temperature-driven mixing remain: a small fraction of the open-path flow.
  assert.ok(flowModel(isolatedFan) < 0.1 * flowModel(openPath));
});

test("fan-off natural exchange uses only open windows", () => {
  const state = baseState();
  state.fanMode = "off";
  state.openWindows = onlyOpen("north", "east");

  assert.deepEqual(availableWindows(state), ["north", "east"]);
  assert.deepEqual(airPath(state), {
    intake: "north",
    exhaust: "east",
    bidir: null,
  });
});

test("open windows on equal-pressure walls only trade air both ways", () => {
  const state = baseState(); // wind toward south: east and west get the same side-wall suction
  state.fanMode = "off";
  state.openWindows = onlyOpen("east", "west");

  // No pressure difference, so no east → west stream — just two-way exchange at each window.
  assert.deepEqual(airPath(state), { intake: null, exhaust: null, bidir: null });
  const { inlets, outlets } = airStreams(state);
  assert.deepEqual([inlets, outlets], [[], []]);
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

  // No wind: only temperature-driven exchange and leakage remain.
  assert.ok(flowModel(calm) < 0.25);
  // The same openings move much more air once the wind drives them.
  assert.ok(flowModel(breezy) > 3 * flowModel(calm));
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
  // Side-wall pair shares the same pressure: no wind-driven gap, so it does what it would in still air.
  const parallelCalm = { ...parallel, windSpeed: 0 };
  assert.ok(Math.abs(flowModel(parallel) - flowModel(parallelCalm)) < 0.005);
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

test("a fan blowing against a strong wind moves less air than no fan; turned around it wins", () => {
  const fighting = baseState(); // exhausting straight into a 15 mph windward face
  fighting.fanLoc = "north";
  fighting.windSpeed = 15;

  assert.ok(flowModel(fighting) < naturalFlow(fighting));
  assert.ok(flowModel({ ...fighting, fanMode: "in" }) > naturalFlow(fighting));
});

test("an opposed fan stalls where its push and the wind balance, then the wind reverses it", () => {
  const stalled = baseState(); // north exhaust against a south-bound wind, only north + south open
  stalled.fanLoc = "north";
  stalled.openWindows = onlyOpen("north", "south");
  stalled.windSpeed = 20;

  // Near the balance point almost nothing gets through, far below what the open pair does alone.
  assert.ok(flowModel(stalled) < 0.25 * naturalFlow(stalled));
  assert.equal(fanReversed(stalled), false);
  // Stronger wind pushes air backward through the fan, which still holds it back.
  stalled.windSpeed = 30;
  assert.equal(fanReversed(stalled), true);
  assert.ok(flowModel(stalled) < naturalFlow(stalled));
});

test("extra open windows add paths and airflow", () => {
  for (const fanMode of ["off", "out"]) {
    const pair = { ...baseState(), fanMode, windSpeed: 10, openWindows: onlyOpen("north", "south") };
    const allOpen = { ...pair, openWindows: windowState(true) };
    assert.ok(flowModel(allOpen) > 1.1 * flowModel(pair), fanMode);
  }
  // With every window open the wind leaves through all three suction walls, not just the leeward one.
  const { inlets, outlets } = airStreams({ ...baseState(), fanMode: "off", windSpeed: 15 });
  assert.deepEqual(inlets.map((s) => s.name), ["north"]);
  assert.deepEqual(outlets.map((s) => s.name).sort(), ["east", "south", "west"]);
});

test("temperature-driven exchange depends on the size of the gap, not its sign", () => {
  const still = { ...baseState(), fanMode: "off", windSpeed: 0 }; // 74°F in, 64°F out
  assert.equal(flowModel(still), flowModel({ ...still, indoor: 64, outdoor: 74 }));
  assert.ok(flowModel({ ...still, indoor: 94 }) > flowModel(still));
  assert.ok(flowModel(still) > flowModel({ ...still, indoor: 65 }));
  // An in/out fan gets no special bonus for cooling versus warming either.
  assert.equal(flowModel(baseState()), flowModel({ ...baseState(), indoor: 64, outdoor: 74 }));
});

test("side walls get more suction than the leeward wall", () => {
  const towardSouth = { windDir: "S" };
  assert.ok(pressureCoefficient(towardSouth, "north") > 0); // windward pushes
  assert.ok(pressureCoefficient(towardSouth, "south") < 0); // leeward pulls
  assert.ok(pressureCoefficient(towardSouth, "east") < pressureCoefficient(towardSouth, "south"));
  assert.equal(pressureCoefficient(towardSouth, "east"), pressureCoefficient(towardSouth, "west"));

  const diagonal = { windDir: "SE" }; // from the northwest: north and west face the wind
  assert.equal(pressureCoefficient(diagonal, "north"), pressureCoefficient(diagonal, "west"));
  assert.equal(pressureCoefficient(diagonal, "east"), pressureCoefficient(diagonal, "south"));
  assert.ok(pressureCoefficient(diagonal, "north") > 0 && pressureCoefficient(diagonal, "south") < 0);
});

test("particles enter at the solved inlets and head for the solved outlets", () => {
  const g = geomFor(640, 520);
  const breezy = makeSim({ fanMode: "off", windSpeed: 15 });
  for (let i = 0; i < 200; i++) spawn(breezy, g, 1, 1);
  const streams = breezy.particles.filter((p) => p.target);
  assert.ok(streams.length > 100);
  for (const p of streams) {
    assert.equal(p.y, g.R.y); // spawned in the north window
    assert.ok(["east", "south", "west"].includes(p.target));
  }
  assert.equal(new Set(streams.map((p) => p.target)).size, 3);

  // Dead calm: no fake breeze, only two-way exchange at the open windows.
  const calm = makeSim({ fanMode: "off", windSpeed: 0 });
  for (let i = 0; i < 200; i++) spawn(calm, g, 1, 1);
  assert.ok(calm.particles.length > 0);
  assert.equal(calm.particles.filter((p) => p.target).length, 0);
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

  // Light wind: the fan still sets the direction — out the fan, drawing mostly from the leeward
  // south window (the side walls' stronger suction holds their air back).
  assert.equal(windDominated(opposed), false);
  assert.deepEqual(airPath(opposed), { intake: "south", exhaust: "north", bidir: null });

  // 30 mph: the wind pushes air backward through the fan, in at the windward north window and out
  // through the side walls, which pull hardest.
  opposed.windSpeed = 30;
  assert.equal(windDominated(opposed), true);
  assert.equal(fanReversed(opposed), true);
  assert.deepEqual(airPath(opposed), { intake: "north", exhaust: "east", bidir: null });
});

test("strong wind also overrides the exchange-mode bidirectional path", () => {
  const exch = baseState();
  exch.fanMode = "exchange";
  assert.deepEqual(airPath(exch), { intake: null, exhaust: null, bidir: "south" });

  exch.windSpeed = 30;
  assert.equal(windDominated(exch), true);
  assert.equal(fanReversed(exch), false); // both blades still push their way; the cross-breeze just outruns them
  assert.deepEqual(airPath(exch), { intake: "north", exhaust: "east", bidir: null });
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
  // Wind toward south: blowing in at the windward north window works with the wind, and the other
  // three walls, all under suction, carry the air away.
  const best = bestConfigFor(allOpen);
  assert.equal(best.fanLoc, "north");
  assert.equal(best.fanMode, "in");

  const southClosed = baseState();
  southClosed.fanMode = "off";
  southClosed.openWindows = onlyOpen("north", "east", "west");
  const shifted = bestConfigFor(southClosed);
  assert.notEqual(shifted.fanLoc, "south"); // never puts the fan in a closed window
  assert.equal(shifted.openWindows.south, false); // and never reopens it
});

test("best config keeps the fan where it is when moving it gains under 1%", () => {
  // Still air: every in/out placement with all windows open moves the same air.
  const calm = { ...baseState(), fanLoc: "west", windSpeed: 0 };
  assert.deepEqual([bestConfigFor(calm).fanLoc, bestConfigFor(calm).fanMode], ["west", "out"]);

  // A fan exhausting into the wind is told to turn around in place when that is the best move.
  const fighting = { ...baseState(), fanLoc: "north" };
  assert.deepEqual([bestConfigFor(fighting).fanLoc, bestConfigFor(fighting).fanMode], ["north", "in"]);
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
