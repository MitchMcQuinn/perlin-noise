/**
 * Shared gradient helpers used by the app UI and unit tests.
 * Mirrors the GLSL gradientColor() sampling logic.
 */

"use strict";

const MAX_STOPS = 5;
const MIN_STOPS = 2;
const DEFAULT_STOP_FILL = ["#051029", "#0a708a", "#f5a623", "#e84c3c", "#faf0e6"];

function hexToRgb01(hex) {
  const h = String(hex || "#000000").replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
}

function rgb01ToHex(r, g, b) {
  const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function smoothstep01(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Keep first at 0, last at 1, and enforce a small gap between stops. */
function normalizePositions(positions, count) {
  const n = Math.min(MAX_STOPS, Math.max(MIN_STOPS, count | 0));
  const out = positions.slice(0, n).map((p, i) => {
    if (i === 0) return 0;
    if (i === n - 1) return 1;
    return Math.min(1, Math.max(0, Number(p) || 0));
  });
  while (out.length < n) out.push(out.length / (n - 1));

  const gap = 0.02;
  for (let i = 1; i < n - 1; i++) {
    out[i] = Math.max(out[i], out[i - 1] + gap);
  }
  for (let i = n - 2; i >= 1; i--) {
    out[i] = Math.min(out[i], out[i + 1] - gap);
  }
  out[0] = 0;
  out[n - 1] = 1;
  return out;
}

function evenPositions(count) {
  const n = Math.min(MAX_STOPS, Math.max(MIN_STOPS, count | 0));
  const out = [];
  for (let i = 0; i < n; i++) out.push(i / (n - 1));
  return out;
}

/**
 * Sample a multi-stop gradient.
 * @param {number} t sample; values in [0,1] keep endpoints, outside wraps
 * @param {string[]} hexStops
 * @param {number[]} positions
 * @param {number} blend 0 = linear, 1 = smoothstep
 */
function sampleGradient(t, hexStops, positions, blend = 0) {
  const n = Math.min(MAX_STOPS, Math.max(MIN_STOPS, hexStops.length, positions.length));
  const pos = normalizePositions(positions, n);
  // Preserve exact 0 and 1; wrap only when outside [0,1] (color cycle).
  let x = Number(t);
  if (x < 0 || x > 1) {
    x = x - Math.floor(x);
    if (x < 0) x += 1;
  }
  x = Math.min(1, Math.max(0, x));

  if (x <= pos[0]) return hexToRgb01(hexStops[0]);
  if (x >= pos[n - 1]) return hexToRgb01(hexStops[n - 1]);

  let i0 = 0;
  for (let i = 0; i < n - 1; i++) {
    if (x >= pos[i]) i0 = i;
  }
  const i1 = Math.min(i0 + 1, n - 1);
  const span = Math.max(1e-5, pos[i1] - pos[i0]);
  let f = (x - pos[i0]) / span;
  if (blend > 0.5) f = smoothstep01(f);
  return lerpRgb(hexToRgb01(hexStops[i0]), hexToRgb01(hexStops[i1]), f);
}

/** Insert a new stop just before the final stop. */
function addStop(hexStops, positions, count) {
  if (count >= MAX_STOPS) {
    return {
      hexStops: hexStops.slice(0, MAX_STOPS),
      positions: positions.slice(0, MAX_STOPS),
      count,
    };
  }
  const n = count;
  const colors = hexStops.slice(0, n);
  const pos = positions.slice(0, n);
  const midPos = (pos[n - 2] + pos[n - 1]) * 0.5;
  const midCol = lerpRgb(hexToRgb01(colors[n - 2]), hexToRgb01(colors[n - 1]), 0.5);
  colors.splice(n - 1, 0, rgb01ToHex(midCol[0], midCol[1], midCol[2]));
  pos.splice(n - 1, 0, midPos);
  const newCount = n + 1;
  while (colors.length < MAX_STOPS) colors.push(DEFAULT_STOP_FILL[colors.length] || "#ffffff");
  const norm = normalizePositions(pos, newCount);
  while (norm.length < MAX_STOPS) norm.push(1);
  return {
    hexStops: colors.slice(0, MAX_STOPS),
    positions: norm.slice(0, MAX_STOPS),
    count: newCount,
  };
}

function removeStop(hexStops, positions, count) {
  if (count <= MIN_STOPS) {
    return {
      hexStops: hexStops.slice(0, MAX_STOPS),
      positions: positions.slice(0, MAX_STOPS),
      count,
    };
  }
  const n = count;
  const colors = hexStops.slice(0, n);
  const pos = positions.slice(0, n);
  // Drop the second-to-last stop so endpoints stay
  colors.splice(n - 2, 1);
  pos.splice(n - 2, 1);
  const newCount = n - 1;
  while (colors.length < MAX_STOPS) colors.push(DEFAULT_STOP_FILL[colors.length] || "#ffffff");
  const norm = normalizePositions(pos, newCount);
  while (norm.length < MAX_STOPS) norm.push(1);
  return {
    hexStops: colors.slice(0, MAX_STOPS),
    positions: norm.slice(0, MAX_STOPS),
    count: newCount,
  };
}

function formatVec3(hex) {
  const [r, g, b] = hexToRgb01(hex);
  const f = (x) => x.toFixed(3);
  return `vec3(${f(r)}, ${f(g)}, ${f(b)})`;
}

// UMD-ish export for browser + node
const GradientMath = {
  MAX_STOPS,
  MIN_STOPS,
  DEFAULT_STOP_FILL,
  hexToRgb01,
  rgb01ToHex,
  normalizePositions,
  evenPositions,
  sampleGradient,
  addStop,
  removeStop,
  formatVec3,
  lerpRgb,
  smoothstep01,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = GradientMath;
}

if (typeof window !== "undefined") {
  Object.assign(window, GradientMath);
}
