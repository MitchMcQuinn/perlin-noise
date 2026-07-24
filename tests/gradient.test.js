/**
 * Gradient math + controls-block sync tests.
 * Run: node tests/gradient.test.js
 */

"use strict";

const path = require("path");
const assert = require("assert");
const gm = require(path.join(__dirname, "..", "gradient-math.js"));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok  -", name);
  } catch (err) {
    console.error("FAIL -", name);
    console.error("     ", err.message);
    process.exitCode = 1;
  }
}

test("hex <-> rgb roundtrip", () => {
  const hex = "#0a708a";
  const rgb = gm.hexToRgb01(hex);
  assert.strictEqual(gm.rgb01ToHex(...rgb), hex);
});

test("even positions for 4 stops", () => {
  assert.deepStrictEqual(
    gm.evenPositions(4).map((p) => Number(p.toFixed(2))),
    [0, 0.33, 0.67, 1]
  );
});

test("normalizePositions clamps endpoints and gaps", () => {
  const pos = gm.normalizePositions([0.2, 0.21, 0.22, 0.9], 4);
  assert.strictEqual(pos[0], 0);
  assert.strictEqual(pos[3], 1);
  assert.ok(pos[2] - pos[1] >= 0.02 - 1e-9);
});

test("sampleGradient returns exact endpoint colors", () => {
  const colors = ["#ff0000", "#00ff00", "#0000ff"];
  const pos = [0, 0.5, 1];
  assert.deepStrictEqual(gm.sampleGradient(0, colors, pos, 0), [1, 0, 0]);
  assert.deepStrictEqual(gm.sampleGradient(1, colors, pos, 0), [0, 0, 1]);
  const mid = gm.sampleGradient(0.5, colors, pos, 0);
  assert.ok(Math.abs(mid[1] - 1) < 1e-9);
});

test("sampleGradient wraps outside [0,1] (color cycle)", () => {
  const colors = ["#ff0000", "#0000ff"];
  const pos = [0, 1];
  const a = gm.sampleGradient(0.25, colors, pos, 0);
  const b = gm.sampleGradient(1.25, colors, pos, 0);
  assert.deepStrictEqual(a, b);
  // Exact 1.0 must hit the last stop (not wrap to the first)
  assert.deepStrictEqual(gm.sampleGradient(1, colors, pos, 0), [0, 0, 1]);
});

test("sampleGradient respects uneven stop positions", () => {
  const colors = ["#000000", "#ffffff", "#000000"];
  const pos = [0, 0.2, 1];
  // At t=0.2 should be pure white
  const at = gm.sampleGradient(0.2, colors, pos, 0);
  assert.ok(Math.abs(at[0] - 1) < 1e-6);
  // At t=0.1 should be mid gray (halfway to white)
  const mid = gm.sampleGradient(0.1, colors, pos, 0);
  assert.ok(Math.abs(mid[0] - 0.5) < 1e-6);
});

test("addStop inserts interpolated color and increases count", () => {
  const colors = gm.DEFAULT_STOP_FILL.slice();
  const pos = gm.evenPositions(4).concat([1]);
  const next = gm.addStop(colors, pos, 4);
  assert.strictEqual(next.count, 5);
  assert.strictEqual(next.hexStops.length, gm.MAX_STOPS);
  assert.strictEqual(next.positions[0], 0);
  assert.strictEqual(next.positions[4], 1);
});

test("removeStop keeps endpoints and decreases count", () => {
  const colors = gm.DEFAULT_STOP_FILL.slice();
  const pos = gm.evenPositions(4).concat([1]);
  const next = gm.removeStop(colors, pos, 4);
  assert.strictEqual(next.count, 3);
  assert.strictEqual(next.positions[0], 0);
  assert.strictEqual(next.positions[2], 1);
});

test("add/remove respect min/max bounds", () => {
  const colors = gm.DEFAULT_STOP_FILL.slice();
  let state = { hexStops: colors, positions: gm.evenPositions(2).concat([1, 1, 1]), count: 2 };
  state = gm.removeStop(state.hexStops, state.positions, state.count);
  assert.strictEqual(state.count, 2);
  state = { hexStops: colors, positions: gm.evenPositions(5), count: 5 };
  state = gm.addStop(state.hexStops, state.positions, state.count);
  assert.strictEqual(state.count, 5);
});

test("formatVec3 matches expected precision", () => {
  assert.strictEqual(gm.formatVec3("#051029"), "vec3(0.020, 0.063, 0.161)");
});

test("smooth blend differs from linear at mid-segment", () => {
  const colors = ["#000000", "#ffffff"];
  const pos = [0, 1];
  const linear = gm.sampleGradient(0.25, colors, pos, 0);
  const soft = gm.sampleGradient(0.25, colors, pos, 1);
  // smoothstep(0.25) = 0.15625 < 0.25, so soft is darker
  assert.ok(soft[0] < linear[0]);
});

if (process.exitCode) {
  console.error(`\n${passed} passed before failure`);
} else {
  console.log(`\n${passed} passed`);
}
