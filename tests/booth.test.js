/**
 * Booth timing: BPM from onsets, quantize grid, strobe cap.
 * Run: node tests/booth.test.js
 */

"use strict";

const assert = require("assert");
const path = require("path");
const BoothMath = require(path.join(__dirname, "..", "booth.js"));

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

test("estimateBpm hears a steady 120 and folds slow onsets up into range", () => {
  const onsets = [0, 0.5, 1, 1.5, 2, 2.5];
  assert.strictEqual(BoothMath.estimateBpm(onsets), 120);
  const slow = [0, 1, 2, 3, 4];
  assert.strictEqual(BoothMath.estimateBpm(slow), 120);
  assert.strictEqual(BoothMath.estimateBpm([0, 1]), null);
});

test("tap-sized intervals survive a little jitter", () => {
  const onsets = [0, 0.48, 1.02, 1.5, 1.97, 2.5];
  const bpm = BoothMath.estimateBpm(onsets);
  assert.ok(bpm > 110 && bpm < 130, String(bpm));
});

test("quantize lands on the next bar and does not retrigger the bar just passed", () => {
  const at = BoothMath.nextQuantizeTime(0, 120, 0.1, 4);
  assert.ok(Math.abs(at - 2) < 1e-9);
  const onGrid = BoothMath.nextQuantizeTime(0, 120, 2, 4);
  assert.ok(Math.abs(onGrid - 4) < 1e-6);
  assert.strictEqual(BoothMath.nextQuantizeTime(0, 120, 1.25, 0), 1.25);
});

test("changing BPM keeps the current beat", () => {
  const origin = BoothMath.retimedOrigin(0, 120, 60, 1);
  const beat = (1 - origin) * (60 / 60);
  assert.ok(Math.abs(beat - 2) < 1e-9);
});

test("strobe gain cannot reach a full-white frame", () => {
  assert.ok(BoothMath.strobeGain(1, 1, 0.62) <= 0.62);
  assert.ok(BoothMath.strobeGain(1, 1, 5) <= 0.72);
  assert.ok(Math.abs(BoothMath.strobeGain(0.2, 0.5, 0.62) - 0.1) < 1e-9);
  assert.strictEqual(BoothMath.strobeGain(-1, 2, 0.62), 0);
});

if (!process.exitCode) console.log("\n" + passed + " passed");
