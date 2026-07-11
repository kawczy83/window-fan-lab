import assert from "node:assert/strict";
import test from "node:test";

import { raceVerdict } from "../js/race.js";

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
