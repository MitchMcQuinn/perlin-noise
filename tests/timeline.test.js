/**
 * Stage capture math: keyframe interpolation, mouse sampling, aspect → pixels.
 * Run: node tests/timeline.test.js
 */

"use strict";

const assert = require("assert");
const path = require("path");
const StageMath = require(path.join(__dirname, "..", "stage.js"));

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

function baseParams(extra) {
  return Object.assign({
    uScale: 3,
    uSpeed: 0.25,
    uOctaves: 5,
    uLacunarity: 2,
    uGain: 0.5,
    uDynamicSpeed: 0,
    u3D: 0,
    uCam: 0,
    uGeom: 0,
    uMouseInteract: 1,
    uMouseLagMode: 0,
    uColorMode: 0,
    uStopCount: 4,
    uGradientBlend: 1,
    uHue: 0,
    lightColor: "#fff6e8",
    hazeColor: "#10151c",
    stops: ["#000000", "#ff0000", "#00ff00", "#0000ff", "#ffffff"],
    positions: [0, 0.33, 0.66, 1, 1],
    anchors: [{ mode: 1, radius: 0.2, blur: 0.5, strength: 0.5, x: 0.2, y: 0.2 }],
  }, extra || {});
}

test("linear lerp interpolates continuous floats", () => {
  const a = baseParams({ uScale: 2, uSpeed: 0 });
  const b = baseParams({ uScale: 4, uSpeed: 1 });
  const mid = StageMath.lerpParams(a, b, 0.5, "linear");
  assert.strictEqual(mid.uScale, 3);
  assert.strictEqual(mid.uSpeed, 0.5);
});

test("hold keeps the outgoing keyframe until t=1", () => {
  const a = baseParams({ uScale: 2 });
  const b = baseParams({ uScale: 8 });
  const mid = StageMath.lerpParams(a, b, 0.5, "hold");
  assert.strictEqual(mid.uScale, 2);
  const end = StageMath.lerpParams(a, b, 1, "hold");
  assert.strictEqual(end.uScale, 8);
});

test("ease in/out is slower than linear early on", () => {
  const a = baseParams({ uScale: 0 });
  const b = baseParams({ uScale: 1 });
  const linear = StageMath.lerpParams(a, b, 0.25, "linear");
  const eased = StageMath.lerpParams(a, b, 0.25, "ease");
  assert.ok(eased.uScale < linear.uScale);
  assert.ok(eased.uScale > 0);
  const unit = StageMath.easeUnit("ease", 0.25);
  assert.ok(Math.abs(unit - (0.25 * 0.25 * (3 - 2 * 0.25))) < 1e-9);
});

test("discrete keys step instead of interpolating", () => {
  const a = baseParams({ uOctaves: 3, uCam: 0, uColorMode: 0, uGeom: 0, uMouseInteract: 1 });
  const b = baseParams({ uOctaves: 8, uCam: 1, uColorMode: 1, uGeom: 2, uMouseInteract: 4 });
  const mid = StageMath.lerpParams(a, b, 0.5, "linear");
  assert.strictEqual(mid.uOctaves, 3);
  assert.strictEqual(mid.uCam, 0);
  assert.strictEqual(mid.uColorMode, 0);
  assert.strictEqual(mid.uGeom, 0);
  assert.strictEqual(mid.uMouseInteract, 1);
  const end = StageMath.lerpParams(a, b, 1, "linear");
  assert.strictEqual(end.uOctaves, 8);
  assert.strictEqual(end.uCam, 1);
});

test("colors and anchors lerp; anchor mode holds", () => {
  const a = baseParams({
    lightColor: "#000000",
    anchors: [{ mode: 1, radius: 0.2, blur: 0, strength: 0, x: 0, y: 0 }],
  });
  const b = baseParams({
    lightColor: "#ffffff",
    anchors: [{ mode: 4, radius: 0.8, blur: 1, strength: 1, x: 1, y: 1 }],
  });
  const mid = StageMath.lerpParams(a, b, 0.5, "linear");
  assert.strictEqual(mid.lightColor.toLowerCase(), "#808080");
  assert.strictEqual(mid.anchors[0].mode, 1);
  assert.ok(Math.abs(mid.anchors[0].radius - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.anchors[0].x - 0.5) < 1e-9);
});

test("paramsAtTime picks surrounding keyframes", () => {
  const kfs = [
    { t: 0, easing: "linear", params: baseParams({ uScale: 1 }) },
    { t: 2, easing: "linear", params: baseParams({ uScale: 5 }) },
    { t: 4, easing: "hold", params: baseParams({ uScale: 9 }) },
  ];
  assert.strictEqual(StageMath.paramsAtTime(kfs, 0).uScale, 1);
  assert.strictEqual(StageMath.paramsAtTime(kfs, 1).uScale, 3);
  assert.strictEqual(StageMath.paramsAtTime(kfs, 2).uScale, 5);
  assert.strictEqual(StageMath.paramsAtTime(kfs, 3).uScale, 5);
  assert.strictEqual(StageMath.paramsAtTime(kfs, 4).uScale, 9);
});

test("mouse samples lerp position and keep on-flag from the earlier sample", () => {
  const samples = [
    { t: 0, x: 0, y: 0, on: 1, speed: 0 },
    { t: 1, x: 1, y: 1, on: 0, speed: 2 },
  ];
  const mid = StageMath.sampleAtTime(samples, 0.5);
  assert.ok(Math.abs(mid.x - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.y - 0.5) < 1e-9);
  assert.strictEqual(mid.on, 1);
  assert.ok(Math.abs(mid.speed - 1) < 1e-9);
  const before = StageMath.sampleAtTime(samples, -1);
  assert.strictEqual(before.x, 0);
  const after = StageMath.sampleAtTime(samples, 9);
  assert.strictEqual(after.x, 1);
  const timed = StageMath.sampleAtTime([
    { t: 0, time: 10, x: 0, y: 0, on: 1, speed: 0 },
    { t: 2, time: 14, x: 1, y: 1, on: 1, speed: 0 },
  ], 1);
  assert.ok(Math.abs(timed.time - 12) < 1e-9);
});

test("letterbox fits the aspect inside the wrap", () => {
  const landscape = StageMath.letterboxSize(1920, 1080, 16, 9);
  assert.ok(Math.abs(landscape.width - 1920) < 0.5);
  assert.ok(Math.abs(landscape.height - 1080) < 0.5);
  const pillar = StageMath.letterboxSize(1920, 1080, 1, 1);
  assert.ok(Math.abs(pillar.width - 1080) < 0.5);
  assert.ok(Math.abs(pillar.height - 1080) < 0.5);
  const letter = StageMath.letterboxSize(1080, 1080, 16, 9);
  assert.ok(Math.abs(letter.width - 1080) < 0.5);
  assert.ok(Math.abs(letter.height - 607.5) < 0.5);
});

test("outputPixels maps 1080p to the short edge", () => {
  const hd = StageMath.outputPixels(16, 9, "1080p");
  assert.strictEqual(hd.width, 1920);
  assert.strictEqual(hd.height, 1080);
  const portrait = StageMath.outputPixels(9, 16, "1080p");
  assert.strictEqual(portrait.width, 1080);
  assert.strictEqual(portrait.height, 1920);
  const square = StageMath.outputPixels(1, 1, "1080p");
  assert.strictEqual(square.width, 1080);
  assert.strictEqual(square.height, 1080);
  const custom = StageMath.outputPixels(16, 9, "custom", 1000, 500);
  assert.strictEqual(custom.width, 1000);
  assert.strictEqual(custom.height, 500);
});

test("evenDim and bitrate stay in encoder-friendly ranges", () => {
  assert.strictEqual(StageMath.evenDim(1921), 1920);
  assert.strictEqual(StageMath.evenDim(1), 2);
  const rate = StageMath.videoBitrate(1920, 1080, 60);
  assert.ok(rate >= 8e6 && rate <= 80e6);
});

if (!process.exitCode) console.log(`\n${passed} passed`);
