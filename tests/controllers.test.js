import assert from "node:assert/strict";
import test from "node:test";

import { raceVerdict } from "../js/race.js";
import { rankTrialGroups, trialNormRate, trialRate } from "../js/trials.js";
import { windowState } from "../js/model.js";

const trial = (over) => ({
  fanLoc: "south",
  fanMode: "out",
  openWindows: windowState(true),
  start: 74,
  end: 69,
  minutes: 30,
  outdoor: 64,
  ...over,
});

test("raceVerdict: cooling calls the first finisher immediately", () => {
  assert.deepEqual(raceVerdict(3.2, null, false), { result: "A", time: 3.2 });
  assert.deepEqual(raceVerdict(null, 2.5, false), { result: "B", time: 2.5 });
  assert.deepEqual(raceVerdict(4.0, 2.5, false), { result: "B", time: 2.5 });
  assert.equal(raceVerdict(null, null, false), null);
});

test("raceVerdict: warming waits for both rooms and rewards the slower one", () => {
  assert.equal(raceVerdict(3.2, null, true), null);
  assert.deepEqual(raceVerdict(3.2, 5.0, true), { result: "B", time: 5.0 });
  assert.deepEqual(raceVerdict(6.1, 5.0, true), { result: "A", time: 6.1 });
});

test("raceVerdict: identical finish times are a dead heat", () => {
  assert.deepEqual(raceVerdict(3.2, 3.2, false), { result: "tie", time: 3.2 });
  assert.deepEqual(raceVerdict(3.2, 3.2, true), { result: "tie", time: 3.2 });
});

test("trialNormRate divides out the indoor–outdoor differential", () => {
  // 10°F over outdoor decaying to 5°F over, in half an hour → k = ln(2)/0.5
  const k = trialNormRate(trial());
  assert.ok(Math.abs(k - Math.log(2) / 0.5) < 1e-12);
  // The same setup measured on a hotter afternoon scores identically.
  assert.equal(trialNormRate(trial({ start: 84, end: 74 })), k);
});

test("trialNormRate is null for legacy or unusable records", () => {
  assert.equal(trialNormRate(trial({ outdoor: undefined })), null); // legacy: outdoor never logged
  assert.equal(trialNormRate(trial({ end: 60 })), null); // crossed outdoor temp mid-trial
  assert.equal(trialNormRate(trial({ end: 64 })), null); // ended exactly at outdoor temp
});

test("rankTrialGroups ranks by per-degree rate, not raw temperature drop", () => {
  const bigDropWeakSetup = trial({ fanLoc: "north", start: 94, end: 88 }); // 12°F/h raw but k≈0.45
  const smallDropStrongSetup = trial(); // 10°F/h raw but k≈1.39
  assert.ok(trialRate(bigDropWeakSetup) > trialRate(smallDropStrongSetup)); // raw rate alone would flip it

  const ranked = rankTrialGroups([bigDropWeakSetup, smallDropStrongSetup]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].sample.fanLoc, "south");
  assert.ok(ranked[0].normRate > ranked[1].normRate);
});

test("rankTrialGroups pools repeat runs and sinks no-outdoor groups below normalized ones", () => {
  const legacy = trial({ fanLoc: "east", outdoor: undefined, start: 90, end: 70 }); // huge raw rate, no outdoor
  const runOne = trial();
  const runTwo = trial({ start: 75, end: 69.6 });

  const ranked = rankTrialGroups([legacy, runOne, runTwo]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].sample.fanLoc, "south");
  assert.equal(ranked[0].count, 2); // both south runs pooled into one group
  assert.equal(ranked[1].sample.fanLoc, "east");
  assert.equal(ranked[1].normRate, null);
});
