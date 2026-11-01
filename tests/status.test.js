import assert from "node:assert/strict";
import test from "node:test";

import { onlyOpen, windowState } from "../js/model.js";
import { statusText } from "../js/status.js";

const plain = (html) => html.replace(/<[^>]+>/g, "");
const state = (overrides = {}) => ({
  indoor: 78,
  outdoor: 70,
  fanLoc: "south",
  fanMode: "out",
  openWindows: windowState(true),
  windDir: "S",
  windSpeed: 5,
  ...overrides,
});

test("status names cool air coming in while the room is cooling", () => {
  const text = plain(statusText(state()));
  assert.match(text, /cool air in via North, East and West, warm out via South/);
  assert.doesNotMatch(text, /close up/);
});

test("status doesn't call outdoor air cool, or the wind helpful, when it's hotter outside", () => {
  const warming = state({ indoor: 78, outdoor: 95 });
  const text = plain(statusText(warming));
  assert.doesNotMatch(text, /cool air in/);
  assert.match(text, /warm outdoor air in via/);
  assert.match(text, /Outdoor air is warmer than the room — close up to keep it cool/);

  // A wind that adds airflow is speeding up the warm-up, not helping.
  const windy = statusText({ ...warming, fanLoc: "east", windSpeed: 15 });
  assert.doesNotMatch(windy, /helping/);
  assert.match(plain(windy), /speeding that up/);
});

test("a stalled fan isn't told to open a window when it's hotter outside", () => {
  const cooling = plain(statusText(state({ openWindows: onlyOpen("south") })));
  assert.match(cooling, /Open a second window/);

  const warming = plain(statusText(state({ outdoor: 95, openWindows: onlyOpen("south") })));
  assert.doesNotMatch(warming, /Open a second window/);
  assert.match(warming, /close up/);
});

test("a fan fighting the wind says switching it off would move more air", () => {
  const losing = plain(statusText(state({ fanLoc: "north", windSpeed: 15 })));
  assert.match(losing, /working against the fan/);
  assert.match(losing, /Switching the fan off would move more air/);

  const overpowered = plain(statusText(state({ fanLoc: "north", windSpeed: 30 })));
  assert.match(overpowered, /overpowers the fan, pushing air backward through it: in via North/);
  assert.match(overpowered, /switching it off would move more air/);
});

test("fan-off status only claims a wind-driven breeze when the wind drives one", () => {
  const breezy = plain(statusText(state({ fanMode: "off", windSpeed: 15 })));
  assert.match(breezy, /strong cross-breeze — in via North, out via East, West and South/);

  // A big temperature gap in still air moves air, but not as a cross-breeze.
  const still = plain(statusText(state({ fanMode: "off", windSpeed: 0, indoor: 95, outdoor: 60 })));
  assert.match(still, /gentle natural exchange/);
});
