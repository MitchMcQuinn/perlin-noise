/**
 * Stage capture: mouse takes, keyframe timeline, and video export.
 * Pure interpolation / sizing helpers live in StageMath (Node-testable).
 */

"use strict";

const GM = (function () {
  if (typeof hexToRgb01 === "function") {
    return {
      hexToRgb01,
      rgb01ToHex,
      lerpRgb: typeof lerpRgb === "function" ? lerpRgb : null,
      smoothstep01: typeof smoothstep01 === "function" ? smoothstep01 : null,
    };
  }
  if (typeof require === "function") {
    try {
      return require("./gradient-math.js");
    } catch (_) {
      return {};
    }
  }
  return {};
})();

const DISCRETE_PARAM_KEYS = [
  "uOctaves",
  "uDynamicSpeed",
  "u3D",
  "uCam",
  "uGeom",
  "uMouseInteract",
  "uMouseLagMode",
  "uColorMode",
  "uStopCount",
  "uGradientBlend",
];

const DISCRETE_PARAM_SET = new Set(DISCRETE_PARAM_KEYS);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function easeUnit(easing, t) {
  const x = clamp01(t);
  if (easing === "hold") return 0;
  if (easing === "ease") {
    if (typeof GM.smoothstep01 === "function") return GM.smoothstep01(x);
    return x * x * (3 - 2 * x);
  }
  return x;
}

function lerpHex(a, b, t) {
  const hexTo = GM.hexToRgb01;
  const toHex = GM.rgb01ToHex;
  if (typeof hexTo !== "function" || typeof toHex !== "function") {
    return t < 1 ? a : b;
  }
  const ca = hexTo(a);
  const cb = hexTo(b);
  const mix = typeof GM.lerpRgb === "function"
    ? GM.lerpRgb(ca, cb, t)
    : [lerpNum(ca[0], cb[0], t), lerpNum(ca[1], cb[1], t), lerpNum(ca[2], cb[2], t)];
  return toHex(mix[0], mix[1], mix[2]);
}

function lerpAnchors(aList, bList, u) {
  const a = Array.isArray(aList) ? aList : [];
  const b = Array.isArray(bList) ? bList : [];
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const aa = a[i];
    const bb = b[i];
    if (!aa && bb) {
      out.push(cloneJson(bb));
      continue;
    }
    if (aa && !bb) {
      out.push(cloneJson(aa));
      continue;
    }
    if (!aa) continue;
    out.push({
      mode: aa.mode,
      radius: lerpNum(aa.radius, bb.radius, u),
      blur: lerpNum(aa.blur, bb.blur, u),
      strength: lerpNum(aa.strength, bb.strength, u),
      x: lerpNum(aa.x, bb.x, u),
      y: lerpNum(aa.y, bb.y, u),
    });
  }
  return out.slice(0, a.length);
}

function lerpParams(a, b, rawT, easing) {
  const t = clamp01(rawT);
  if (!a) return b ? cloneJson(b) : a;
  if (!b) return cloneJson(a);
  if (t <= 0) return cloneJson(a);
  if (t >= 1) return cloneJson(b);
  if ((easing || "linear") === "hold") return cloneJson(a);
  const u = easeUnit(easing || "linear", t);
  const out = cloneJson(a);

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    if (
      key === "stops" ||
      key === "positions" ||
      key === "anchors" ||
      key === "lightColor" ||
      key === "hazeColor"
    ) {
      return;
    }
    if (DISCRETE_PARAM_SET.has(key)) {
      out[key] = a[key];
      return;
    }
    if (typeof a[key] === "number" && typeof b[key] === "number" && isFinite(a[key]) && isFinite(b[key])) {
      out[key] = lerpNum(a[key], b[key], u);
    }
  });

  out.lightColor = lerpHex(a.lightColor || "#fff6e8", b.lightColor || "#fff6e8", u);
  out.hazeColor = lerpHex(a.hazeColor || "#10151c", b.hazeColor || "#10151c", u);

  const aPos = Array.isArray(a.positions) ? a.positions : [];
  const bPos = Array.isArray(b.positions) ? b.positions : aPos;
  const posN = Math.max(aPos.length, bPos.length);
  out.positions = [];
  for (let i = 0; i < posN; i++) {
    const pa = Number(aPos[i]);
    const pb = Number(bPos[i]);
    const va = isFinite(pa) ? pa : 0;
    const vb = isFinite(pb) ? pb : va;
    out.positions.push(lerpNum(va, vb, u));
  }

  const aStops = Array.isArray(a.stops) ? a.stops : [];
  const bStops = Array.isArray(b.stops) ? b.stops : aStops;
  const stopN = Math.max(aStops.length, bStops.length);
  out.stops = [];
  for (let i = 0; i < stopN; i++) {
    out.stops.push(lerpHex(aStops[i] || "#000000", bStops[i] || aStops[i] || "#000000", u));
  }

  out.anchors = lerpAnchors(a.anchors, b.anchors, u);
  for (const key of DISCRETE_PARAM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(a, key)) out[key] = a[key];
  }
  return out;
}

function paramsAtTime(keyframes, t) {
  const kfs = Array.isArray(keyframes) ? keyframes : [];
  if (!kfs.length) return null;
  if (t <= kfs[0].t) return cloneJson(kfs[0].params);
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].t <= t) i += 1;
  const k0 = kfs[i];
  const k1 = kfs[i + 1];
  if (!k1) return cloneJson(k0.params);
  const span = k1.t - k0.t;
  if (span <= 1e-8) return cloneJson(k1.params);
  return lerpParams(k0.params, k1.params, (t - k0.t) / span, k1.easing || "linear");
}

function sampleAtTime(samples, t) {
  const list = Array.isArray(samples) ? samples : [];
  if (!list.length) return { t, x: 0.5, y: 0.5, on: 0, speed: 0 };
  if (t <= list[0].t) return Object.assign({}, list[0]);
  const last = list[list.length - 1];
  if (t >= last.t) {
    const extra = t - last.t;
    return {
      t,
      x: last.x,
      y: last.y,
      on: last.on,
      speed: last.speed || 0,
      time: (last.time != null ? last.time : last.t) + extra,
    };
  }
  let lo = 0;
  let hi = list.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = list[lo];
  const b = list[hi];
  const span = b.t - a.t;
  const u = span <= 1e-8 ? 1 : (t - a.t) / span;
  return {
    t,
    x: lerpNum(a.x, b.x, u),
    y: lerpNum(a.y, b.y, u),
    on: u < 1 ? a.on : b.on,
    speed: lerpNum(a.speed || 0, b.speed || 0, u),
    time: lerpNum(
      a.time != null ? a.time : a.t,
      b.time != null ? b.time : b.t,
      u
    ),
  };
}

function letterboxSize(wrapW, wrapH, aspectW, aspectH) {
  const bw = Math.max(1, wrapW);
  const bh = Math.max(1, wrapH);
  const aw = Math.max(1e-6, aspectW);
  const ah = Math.max(1e-6, aspectH);
  const wrapA = bw / bh;
  const targetA = aw / ah;
  if (wrapA > targetA) {
    const height = bh;
    return { width: height * targetA, height };
  }
  const width = bw;
  return { width, height: width / targetA };
}

function evenDim(n) {
  const v = Math.round(n);
  return Math.max(2, v - (v % 2));
}

const OUTPUT_BOXES = {
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "4k": [3840, 2160],
};

function outputPixels(aspectW, aspectH, preset, customW, customH) {
  if (preset === "custom") {
    return {
      width: evenDim(customW || 1920),
      height: evenDim(customH || 1080),
    };
  }
  const box = OUTPUT_BOXES[preset] || OUTPUT_BOXES["1080p"];
  const shortEdge = box[1];
  const aw = Math.max(1e-6, aspectW);
  const ah = Math.max(1e-6, aspectH);
  if (aw >= ah) {
    const height = shortEdge;
    const width = height * (aw / ah);
    return { width: evenDim(width), height: evenDim(height) };
  }
  const width = shortEdge;
  const height = width * (ah / aw);
  return { width: evenDim(width), height: evenDim(height) };
}

function videoBitrate(width, height, fps) {
  const pixels = Math.max(1, width * height);
  const rate = pixels * Math.max(24, fps) * 0.16;
  return Math.round(Math.min(80e6, Math.max(8e6, rate)));
}

function formatTakeTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return m + ":" + rem.toFixed(2).padStart(5, "0");
}

const AUDIO_ENV_HZ = 60;
const AUDIO_WAVE_BINS = 1024;

const AUDIO_PARAM_LIMITS = {
  uScale: [0.5, 12],
  uSpeed: [0, 2],
  uWarp: [0, 4],
  uContrast: [0.2, 3],
  uBrightness: [-0.5, 0.5],
  uHue: [0, 1],
  u3DRelief: [0, 3],
  uGeomMotion: [0, 2],
  uMouseStrength: [0, 1.5],
};

const AUDIO_REACT_TOGGLES = [
  { id: "pulseScale", label: "Beat scale", hint: "Kicks punch the noise scale", band: "pulse", key: "uScale", mode: "mul", depth: 0.55 },
  { id: "bassWarp", label: "Bass warp", hint: "Low end folds the field", band: "bass", key: "uWarp", mode: "add", depth: 1.35 },
  { id: "levelSpeed", label: "Level speed", hint: "Loudness drives motion", band: "level", key: "uSpeed", mode: "mul", depth: 1.8 },
  { id: "levelBright", label: "Level glow", hint: "Volume lifts brightness", band: "level", key: "uBrightness", mode: "add", depth: 0.28 },
  { id: "highHue", label: "Treble hue", hint: "Highs cycle color", band: "high", key: "uHue", mode: "add", depth: 0.35, wrap: true },
  { id: "midContrast", label: "Mid contrast", hint: "Mids snap the field", band: "mid", key: "uContrast", mode: "mul", depth: 0.7 },
  { id: "pulseRelief", label: "Beat relief", hint: "Kicks raise 3D height (needs lighting)", band: "pulse", key: "u3DRelief", mode: "add", depth: 1.1 },
  { id: "bassTravel", label: "Bass travel", hint: "Lows spin camera motion", band: "bass", key: "uGeomMotion", mode: "mul", depth: 1.6 },
  { id: "levelStrength", label: "Level brush", hint: "Volume pushes mouse strength", band: "level", key: "uMouseStrength", mode: "mul", depth: 1.2 },
];

function onePoleA(cutoff, sampleRate) {
  const x = (2 * Math.PI * cutoff) / Math.max(1, sampleRate);
  return x / (x + 1);
}

function percentilePeak(arr, p) {
  const n = arr.length;
  if (!n) return 1e-8;
  const copy = Array.prototype.slice.call(arr);
  copy.sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(n - 1, Math.floor(p * (n - 1))));
  return Math.max(1e-8, copy[idx]);
}

function normalizeEnvelope(arr, p, minPeak) {
  const peak = Math.max(percentilePeak(arr, p), minPeak || 0, 1e-8);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] / peak;
    arr[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return arr;
}

function mixToMono(buffer) {
  const n = buffer.length;
  const chN = Math.max(1, buffer.numberOfChannels);
  const out = new Float32Array(n);
  if (chN === 1) {
    out.set(buffer.getChannelData(0));
    return out;
  }
  for (let c = 0; c < chN; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  const inv = 1 / chN;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

function envelopesFromMono(samples, sampleRate, fps) {
  const sr = Math.max(1, sampleRate || 44100);
  const rate = fps || AUDIO_ENV_HZ;
  const n = samples && samples.length ? samples.length : 0;
  const duration = n / sr;
  const frameCount = Math.max(1, Math.ceil(duration * rate) || 1);
  const hop = sr / rate;
  const level = new Float32Array(frameCount);
  const bass = new Float32Array(frameCount);
  const mid = new Float32Array(frameCount);
  const high = new Float32Array(frameCount);
  const pulse = new Float32Array(frameCount);
  const bins = AUDIO_WAVE_BINS;
  const peaks = new Float32Array(bins);
  const troughs = new Float32Array(bins);

  if (!n) {
    return { fps: rate, duration: 0, sampleRate: sr, level, bass, mid, high, pulse, peaks, troughs };
  }

  const aBass = onePoleA(180, sr);
  const aMid = onePoleA(2500, sr);
  let lpBass = 0;
  let lpMid = 0;
  let accL = 0;
  let accB = 0;
  let accM = 0;
  let accH = 0;
  let accN = 0;
  let frame = 0;
  let nextEnd = hop;
  let prevBass = 0;

  const binSize = n / bins;
  let bin = 0;
  let binEnd = binSize;
  let binMin = 0;
  let binMax = 0;

  for (let i = 0; i < n; i++) {
    const x = samples[i];
    if (x < binMin) binMin = x;
    if (x > binMax) binMax = x;
    if (i + 1 >= binEnd || i === n - 1) {
      if (bin < bins) {
        peaks[bin] = binMax;
        troughs[bin] = binMin;
        bin += 1;
      }
      binMin = 0;
      binMax = 0;
      binEnd += binSize;
    }

    lpBass += aBass * (x - lpBass);
    lpMid += aMid * (x - lpMid);
    const b = lpBass;
    const m = lpMid - lpBass;
    const h = x - lpMid;
    accL += x * x;
    accB += b * b;
    accM += m * m;
    accH += h * h;
    accN += 1;

    if (i + 1 >= nextEnd || i === n - 1) {
      if (frame < frameCount) {
        const inv = accN > 0 ? 1 / accN : 0;
        const B = Math.sqrt(accB * inv);
        level[frame] = Math.sqrt(accL * inv);
        bass[frame] = B;
        mid[frame] = Math.sqrt(accM * inv);
        high[frame] = Math.sqrt(accH * inv);
        pulse[frame] = Math.max(0, B - prevBass);
        prevBass = B;
        frame += 1;
      }
      accL = accB = accM = accH = accN = 0;
      nextEnd += hop;
    }
  }

  while (frame < frameCount) {
    const src = Math.max(0, frame - 1);
    level[frame] = level[src];
    bass[frame] = bass[src];
    mid[frame] = mid[src];
    high[frame] = high[src];
    pulse[frame] = pulse[src];
    frame += 1;
  }

  const levelPeak = percentilePeak(level, 0.95);
  normalizeEnvelope(level, 0.95);
  normalizeEnvelope(bass, 0.95, levelPeak * 0.2);
  normalizeEnvelope(mid, 0.95, levelPeak * 0.2);
  normalizeEnvelope(high, 0.95, levelPeak * 0.2);
  normalizeEnvelope(pulse, 0.90, levelPeak * 0.05);

  return { fps: rate, duration, sampleRate: sr, level, bass, mid, high, pulse, peaks, troughs };
}

function lerpArr(arr, i0, i1, u) {
  const a = arr[i0] || 0;
  const b = arr[i1] || 0;
  return a + (b - a) * u;
}

function envelopeAt(envs, t) {
  const empty = { level: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
  if (!envs || !envs.level || !envs.level.length) return empty;
  const fps = envs.fps || AUDIO_ENV_HZ;
  const last = envs.level.length - 1;
  const i = Math.max(0, t) * fps;
  const i0 = Math.max(0, Math.min(last, Math.floor(i)));
  const i1 = Math.max(0, Math.min(last, i0 + 1));
  const u = i0 === i1 ? 0 : i - i0;
  return {
    level: lerpArr(envs.level, i0, i1, u),
    bass: lerpArr(envs.bass, i0, i1, u),
    mid: lerpArr(envs.mid, i0, i1, u),
    high: lerpArr(envs.high, i0, i1, u),
    pulse: lerpArr(envs.pulse, i0, i1, u),
  };
}

function defaultAudioReact() {
  return {
    amount: 0.7,
    extendTake: true,
    maps: {
      pulseScale: true,
      bassWarp: true,
      levelSpeed: true,
      levelBright: false,
      highHue: false,
      midContrast: false,
      pulseRelief: false,
      bassTravel: false,
      levelStrength: false,
    },
  };
}

function mergeAudioReact(raw) {
  const d = defaultAudioReact();
  if (!raw || typeof raw !== "object") return d;
  if (typeof raw.amount === "number" && isFinite(raw.amount)) d.amount = clamp01(raw.amount);
  if (typeof raw.extendTake === "boolean") d.extendTake = raw.extendTake;
  if (raw.maps && typeof raw.maps === "object") {
    for (let i = 0; i < AUDIO_REACT_TOGGLES.length; i++) {
      const id = AUDIO_REACT_TOGGLES[i].id;
      if (typeof raw.maps[id] === "boolean") d.maps[id] = raw.maps[id];
    }
  }
  return d;
}

function clampParamKey(key, value) {
  const lim = AUDIO_PARAM_LIMITS[key];
  if (!lim) return value;
  return Math.max(lim[0], Math.min(lim[1], value));
}

function applyAudioToParams(params, env, react) {
  if (!params) return params;
  if (!env || !react) return cloneJson(params);
  const amount = clamp01(react.amount == null ? 0.7 : react.amount);
  const out = cloneJson(params);
  if (amount <= 1e-6) return out;
  const maps = react.maps || {};
  for (let i = 0; i < AUDIO_REACT_TOGGLES.length; i++) {
    const tog = AUDIO_REACT_TOGGLES[i];
    if (!maps[tog.id]) continue;
    const drive = amount * (env[tog.band] || 0);
    if (drive <= 1e-8) continue;
    const cur = out[tog.key];
    if (typeof cur !== "number" || !isFinite(cur)) continue;
    let next = tog.mode === "mul" ? cur * (1 + tog.depth * drive) : cur + tog.depth * drive;
    if (tog.wrap) {
      next = next - Math.floor(next);
      if (next < 0) next += 1;
    } else {
      next = clampParamKey(tog.key, next);
    }
    out[tog.key] = next;
  }
  return out;
}

function takeDuration(take, audio, react) {
  const d = take ? Math.max(0, Number(take.duration) || 0) : 0;
  const ad = audio && Number(audio.duration) > 0 ? Number(audio.duration) : 0;
  if (react && react.extendTake !== false && ad > d) return Math.max(ad, 0.001);
  return Math.max(d, 0.001);
}

const StageMath = {
  DISCRETE_PARAM_KEYS,
  AUDIO_REACT_TOGGLES,
  AUDIO_ENV_HZ,
  cloneJson,
  lerpNum,
  easeUnit,
  lerpHex,
  lerpParams,
  paramsAtTime,
  sampleAtTime,
  letterboxSize,
  evenDim,
  outputPixels,
  videoBitrate,
  formatTakeTime,
  envelopesFromMono,
  mixToMono,
  envelopeAt,
  defaultAudioReact,
  mergeAudioReact,
  applyAudioToParams,
  takeDuration,
};

const ASPECT_PRESETS = [
  { id: "16:9", w: 16, h: 9 },
  { id: "16:10", w: 16, h: 10 },
  { id: "4:3", w: 4, h: 3 },
  { id: "1:1", w: 1, h: 1 },
  { id: "9:16", w: 9, h: 16 },
  { id: "custom", w: 16, h: 9 },
];

function initCapture(host) {
  if (!host || typeof document === "undefined") return;

  let take = null;
  let recording = false;
  let recElapsed = 0;
  let takeTime = 0;
  let takePlaying = false;
  let timelineOpen = false;
  let selectedKf = -1;
  let applyingTake = false;
  let exportAbort = false;
  let scrubbing = false;
  let audioClip = null;
  let audioReact = defaultAudioReact();
  let audioMute = false;
  let audioCtx = null;
  let audioSource = null;
  let pendingAudioName = "";

  const recBadge = document.getElementById("rec-badge");
  const recTimer = document.getElementById("rec-timer");
  const recHint = document.getElementById("rec-hint");
  const timelineHint = document.getElementById("timeline-hint");
  const btnRecord = document.getElementById("btn-record");
  const btnRecPause = document.getElementById("btn-rec-pause");
  const dock = document.getElementById("timeline-dock");
  const takePlayBtn = document.getElementById("btn-take-play");
  const takeTimeReadout = document.getElementById("take-time-readout");
  const kfEasing = document.getElementById("kf-easing");
  const btnKfAdd = document.getElementById("btn-kf-add");
  const btnKfDel = document.getElementById("btn-kf-del");
  const ruler = document.getElementById("timeline-ruler");
  const ticksEl = document.getElementById("timeline-ticks");
  const playheadEl = document.getElementById("timeline-playhead");
  const spark = document.getElementById("timeline-spark");
  const waveEl = document.getElementById("timeline-wave");
  const kfTrack = document.getElementById("timeline-kf-track");
  const overlay = document.getElementById("export-overlay");
  const exportStatus = document.getElementById("export-status");
  const exportBarFill = document.getElementById("export-bar-fill");
  const takeFileInput = document.getElementById("take-file-input");
  const btnTimeline = document.getElementById("btn-timeline");
  const btnAudio = document.getElementById("btn-audio");
  const audioFileInput = document.getElementById("audio-file-input");
  const btnAudioAdd = document.getElementById("btn-audio-add");
  const btnAudioClear = document.getElementById("btn-audio-clear");
  const audioNameEl = document.getElementById("audio-name");
  const audioMuteEl = document.getElementById("audio-mute");
  const audioAmountEl = document.getElementById("audio-amount");
  const audioAmountVal = document.getElementById("audio-amount-val");
  const audioExtendEl = document.getElementById("audio-extend");
  const audioTogglesEl = document.getElementById("audio-toggles");

  function settings() {
    return host.stageSettings;
  }

  function duration() {
    return takeDuration(take, audioClip, audioReact);
  }

  function isDriven() {
    return host.isExportLocked() || (!!take && timelineOpen && !recording);
  }

  function currentAspect() {
    const s = settings();
    return [s.aspectW, s.aspectH];
  }

  function currentOutput() {
    const s = settings();
    return outputPixels(s.aspectW, s.aspectH, s.outputPreset, s.customW, s.customH);
  }

  function applyMouseSample(sample) {
    const canvas = host.canvas;
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    const x = (sample.x || 0) * w;
    const y = (sample.y || 0) * h;
    const st = host.state;
    st.mouse[0] = x;
    st.mouse[1] = y;
    st.mouseTarget[0] = x;
    st.mouseTarget[1] = y;
    st.mouseVel[0] = 0;
    st.mouseVel[1] = 0;
    if (sample.on) {
      st.mouse[2] = Math.abs(x || 1);
      st.mouse[3] = Math.abs(y || 1);
    } else {
      st.mouse[2] = -Math.abs(x || 1);
      st.mouse[3] = -Math.abs(y || 1);
    }
    st.pointerSpeed = sample.speed || 0;
  }

  function getAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function stopAudioPlayback() {
    if (!audioSource) return;
    try { audioSource.stop(); } catch (_) { /* already stopped */ }
    try { audioSource.disconnect(); } catch (_) { /* ignore */ }
    audioSource = null;
  }

  function startAudioPlayback(fromTime) {
    stopAudioPlayback();
    if (audioMute || !audioClip || !audioClip.buffer) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const offset = Math.max(0, Math.min(Math.max(0, audioClip.duration - 0.02), fromTime || 0));
    if (offset >= audioClip.duration) return;
    const src = ctx.createBufferSource();
    src.buffer = audioClip.buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (audioSource === src) audioSource = null;
    };
    try {
      src.start(0, offset);
      audioSource = src;
    } catch (_) {
      audioSource = null;
    }
  }

  function applyTakeAt(t, opts) {
    if (!take) return;
    const o = opts || {};
    takeTime = Math.max(0, Math.min(duration(), t));
    applyingTake = true;
    host.setSuppressEditorSync(true);
    const base = paramsAtTime(take.keyframes, takeTime);
    const liveAudio = !!(audioClip && (takePlaying || o.live || host.isExportLocked()));
    const cfg = liveAudio && base
      ? applyAudioToParams(base, envelopeAt(audioClip.envelopes, takeTime), audioReact)
      : base;
    if (cfg) host.applySerializedParams(cfg, { silent: true });
    const sample = sampleAtTime(take.mouse, takeTime);
    applyMouseSample(sample);
    host.state.shaderTime = sample.time != null
      ? sample.time
      : (take.shaderTime0 || 0) + takeTime;
    if (!o.silent) {
      if (base) host.applySerializedParams(base, { silent: true });
      host.setSuppressEditorSync(false);
      host.applyParamsToUI();
      if (o.editor) host.syncParamsToEditor();
    }
    applyingTake = false;
    updatePlayhead();
  }

  function parkAt(t) {
    takePlaying = false;
    stopAudioPlayback();
    applyTakeAt(t, { silent: false, editor: true });
    updateTransportUI();
  }

  function updateRecTimer() {
    if (recTimer) recTimer.textContent = formatTakeTime(recElapsed);
  }

  function interactHint() {
    const mode = host.params && host.params.uMouseInteract;
    if (!mode) {
      return "Mouse interaction is off — enable it in Controls to see a brush";
    }
    return "Move over the preview";
  }

  function setRecordingUI(on) {
    if (recBadge) recBadge.hidden = !on;
    if (recHint) {
      recHint.textContent = audioClip
        ? interactHint() + " · " + audioClip.name
        : interactHint();
    }
    if (btnRecord) {
      btnRecord.hidden = false;
      btnRecord.classList.toggle("is-recording", on);
      btnRecord.textContent = on ? "Stop" : "Record";
      btnRecord.title = on ? "Stop recording and open the timeline" : "Record a mouse take";
    }
    if (btnRecPause) {
      btnRecPause.hidden = !on;
      if (on) {
        btnRecPause.textContent = "Pause";
        btnRecPause.title = "Pause recording";
      }
    }
    if (btnTimeline) btnTimeline.hidden = on || timelineOpen || !take;
    document.body.classList.toggle("recording", on);
  }

  function updateTransportUI() {
    if (takePlayBtn) {
      takePlayBtn.innerHTML = takePlaying ? "&#9208;" : "&#9654;";
      takePlayBtn.title = takePlaying ? "Pause take" : "Play take";
    }
    if (btnKfDel) btnKfDel.disabled = !take || selectedKf <= 0;
    if (kfEasing) {
      const kf = take && selectedKf >= 0 ? take.keyframes[selectedKf] : null;
      kfEasing.disabled = !kf || selectedKf === 0;
      if (kf) kfEasing.value = kf.easing || "linear";
    }
  }

  function updatePlayhead() {
    const dur = duration();
    const u = take ? takeTime / dur : 0;
    if (playheadEl) playheadEl.style.left = (u * 100).toFixed(3) + "%";
    if (takeTimeReadout) {
      takeTimeReadout.textContent = take
        ? takeTime.toFixed(2) + " / " + duration().toFixed(2)
        : "0.00 / 0.00";
    }
    const timeEl = document.getElementById("time-readout");
    if (timeEl && take) timeEl.textContent = host.state.shaderTime.toFixed(2);
  }

  function drawSpark() {
    if (!spark) return;
    const cssW = Math.max(1, spark.clientWidth || spark.parentElement.clientWidth || 1);
    const cssH = 36;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    spark.width = Math.floor(cssW * dpr);
    spark.height = Math.floor(cssH * dpr);
    spark.style.width = cssW + "px";
    spark.style.height = cssH + "px";
    const ctx = spark.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, cssW, cssH);
    if (!take || !take.mouse.length) return;
    const dur = duration();
    ctx.beginPath();
    ctx.strokeStyle = "#ff8a2a";
    ctx.lineWidth = 1.25;
    for (let i = 0; i < take.mouse.length; i++) {
      const s = take.mouse[i];
      const x = (s.t / dur) * cssW;
      const y = (1 - s.y) * (cssH - 4) + 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(125, 136, 148, 0.55)";
    ctx.lineWidth = 1;
    for (let i = 0; i < take.mouse.length; i++) {
      const s = take.mouse[i];
      const x = (s.t / dur) * cssW;
      const y = (1 - Math.min(1, (s.speed || 0) / 2)) * (cssH - 4) + 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawWave() {
    if (!waveEl) return;
    const has = !!(audioClip && audioClip.envelopes);
    waveEl.hidden = !has;
    if (!has) return;
    const cssW = Math.max(1, waveEl.clientWidth || waveEl.parentElement.clientWidth || 1);
    const cssH = 48;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    waveEl.width = Math.floor(cssW * dpr);
    waveEl.height = Math.floor(cssH * dpr);
    waveEl.style.width = cssW + "px";
    waveEl.style.height = cssH + "px";
    const ctx = waveEl.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, cssW, cssH);
    const env = audioClip.envelopes;
    const midY = cssH * 0.5;
    const amp = (cssH - 6) * 0.5;
    const peaks = env.peaks;
    const troughs = env.troughs;
    const n = peaks.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / Math.max(1, n - 1)) * cssW;
      const y = midY - (peaks[i] || 0) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) {
      const x = (i / Math.max(1, n - 1)) * cssW;
      const y = midY - (troughs[i] || 0) * amp;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(90, 196, 196, 0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 138, 42, 0.85)";
    ctx.lineWidth = 1.25;
    const bass = env.bass;
    const bN = bass.length;
    const dur = Math.max(env.duration || 0.001, duration());
    for (let i = 0; i < bN; i++) {
      const t = (i / Math.max(1, env.fps || AUDIO_ENV_HZ));
      const x = (t / dur) * cssW;
      const y = cssH - 3 - (bass[i] || 0) * (cssH - 6);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function renderTicks() {
    if (!ticksEl) return;
    ticksEl.innerHTML = "";
    if (!take) return;
    const dur = duration();
    const step = dur > 20 ? 5 : dur > 8 ? 2 : 1;
    for (let t = 0; t <= dur + 1e-6; t += step) {
      const el = document.createElement("span");
      el.className = "timeline-tick";
      el.style.left = ((t / dur) * 100).toFixed(3) + "%";
      el.textContent = t.toFixed(t % 1 ? 1 : 0) + "s";
      ticksEl.appendChild(el);
    }
  }

  function renderKeyframes() {
    if (!kfTrack) return;
    kfTrack.innerHTML = "";
    if (!take) return;
    const dur = duration();
    take.keyframes.forEach((kf, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kf-marker" + (index === selectedKf ? " is-selected" : "");
      btn.style.left = ((kf.t / dur) * 100).toFixed(3) + "%";
      btn.title = "Keyframe at " + kf.t.toFixed(2) + "s (" + (kf.easing || "linear") + ")";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectKeyframe(index);
      });
      kfTrack.appendChild(btn);
    });
  }

  function refreshTimeline() {
    renderTicks();
    renderKeyframes();
    drawSpark();
    drawWave();
    updatePlayhead();
    updateTransportUI();
    updateAudioUI();
  }

  function openTimeline() {
    timelineOpen = true;
    if (dock) dock.hidden = false;
    if (btnTimeline) btnTimeline.hidden = true;
    document.body.classList.add("timeline-open");
    host.setPlaying(false);
    refreshTimeline();
    host.resizeCanvas();
  }

  function closeTimeline() {
    timelineOpen = false;
    takePlaying = false;
    selectedKf = -1;
    stopAudioPlayback();
    if (dock) dock.hidden = true;
    if (btnTimeline) btnTimeline.hidden = !take;
    document.body.classList.remove("timeline-open");
    host.setSuppressEditorSync(false);
    host.resizeCanvas();
  }

  function selectKeyframe(index) {
    if (!take || index < 0 || index >= take.keyframes.length) return;
    selectedKf = index;
    takePlaying = false;
    parkAt(take.keyframes[index].t);
    renderKeyframes();
    updateTransportUI();
  }

  function addKeyframeAt(t) {
    if (!take) return;
    const time = Math.max(0, Math.min(duration(), t));
    const hit = Math.max(0.04, duration() * 0.01);
    const existing = take.keyframes.findIndex((kf) => Math.abs(kf.t - time) <= hit);
    if (existing >= 0) {
      selectKeyframe(existing);
      return;
    }
    const fromTimeline = paramsAtTime(take.keyframes, time);
    const kf = {
      t: time,
      easing: (kfEasing && kfEasing.value) || "linear",
      params: cloneJson(fromTimeline || host.serializeParams()),
    };
    take.keyframes.push(kf);
    take.keyframes.sort((a, b) => a.t - b.t);
    selectedKf = take.keyframes.indexOf(kf);
    refreshTimeline();
    updateTransportUI();
  }

  function deleteSelectedKeyframe() {
    if (!take || selectedKf <= 0) return;
    take.keyframes.splice(selectedKf, 1);
    selectedKf = -1;
    parkAt(takeTime);
    refreshTimeline();
  }

  function pushSample(dt) {
    const canvas = host.canvas;
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    const m = host.state.mouse;
    take.mouse.push({
      t: recElapsed,
      time: host.state.shaderTime,
      x: m[0] / w,
      y: m[1] / h,
      on: m[2] > 0 ? 1 : 0,
      speed: host.state.pointerSpeed || 0,
    });
    recElapsed += dt;
    take.duration = recElapsed;
  }

  function takeIsStub() {
    return !!(take && take.mouse.length <= 1 && take.keyframes.length <= 1);
  }

  function newEmptyTake(dur) {
    const [aw, ah] = currentAspect();
    const out = currentOutput();
    return {
      version: 1,
      shaderTime0: host.state.shaderTime,
      duration: Math.max(0, dur || 0),
      mouse: [{
        t: 0,
        time: host.state.shaderTime,
        x: 0.5,
        y: 0.5,
        on: 0,
        speed: 0,
      }],
      keyframes: [{ t: 0, easing: "linear", params: host.serializeParams() }],
      aspect: [aw, ah],
      export: { width: out.width, height: out.height, fps: settings().exportFps },
    };
  }

  function startRecording() {
    if (recording) return;
    if (take && !takeIsStub() && !window.confirm("Replace the current take? Unexported keyframes will be lost.")) {
      return;
    }
    takePlaying = false;
    stopAudioPlayback();
    closeTimeline();
    recElapsed = 0;
    takeTime = 0;
    selectedKf = 0;
    take = newEmptyTake(0);
    take.mouse = [];
    recording = true;
    setRecordingUI(true);
    updateRecTimer();
    host.setPlaying(true);
    startAudioPlayback(0);
  }

  function pauseRecording() {
    if (!recording) return;
    host.setPlaying(!host.state.playing);
    if (host.state.playing) startAudioPlayback(recElapsed);
    else stopAudioPlayback();
    if (btnRecPause) {
      const playing = host.state.playing;
      btnRecPause.title = playing ? "Pause recording" : "Resume recording";
      btnRecPause.textContent = playing ? "Pause" : "Resume";
    }
  }

  function stopRecording() {
    if (!recording || !take) return;
    recording = false;
    stopAudioPlayback();
    take.duration = Math.max(recElapsed, take.mouse.length ? take.mouse[take.mouse.length - 1].t : 1 / 60);
    setRecordingUI(false);
    host.setPlaying(false);
    takeTime = 0;
    selectedKf = 0;
    openTimeline();
    parkAt(0);
    if (timelineHint) {
      const n = take.mouse.length;
      const secs = (take.duration || 0).toFixed(1);
      const audioNote = audioClip ? " Soundtrack is on the wave track — toggle how the look follows it." : "";
      timelineHint.textContent = n
        ? "Captured " + secs + "s. Play the take, then click the bottom track to add a keyframe." + audioNote
        : "No mouse motion was captured. Record again and move over the preview.";
    }
  }

  function timeFromClientX(clientX, el) {
    const node = el || ruler;
    if (!node) return 0;
    const rect = node.getBoundingClientRect();
    const u = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    return u * duration();
  }

  function seekFromEvent(e, live) {
    if (!take) return;
    selectedKf = -1;
    const t = timeFromClientX(e.clientX, e.currentTarget);
    if (live) applyTakeAt(t, { silent: true, live: true });
    else parkAt(t);
    renderKeyframes();
  }

  function bindScrubber(el) {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      if (!take) return;
      scrubbing = true;
      takePlaying = false;
      stopAudioPlayback();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      seekFromEvent(e, true);
    });
    el.addEventListener("pointermove", (e) => {
      if (scrubbing) seekFromEvent(e, true);
    });
    const endScrub = (e) => {
      if (!scrubbing) return;
      scrubbing = false;
      seekFromEvent(e, false);
    };
    el.addEventListener("pointerup", endScrub);
    el.addEventListener("pointercancel", endScrub);
  }

  function serializeTake() {
    if (!take) return null;
    const out = currentOutput();
    const [aw, ah] = currentAspect();
    return {
      version: 1,
      aspect: [aw, ah],
      export: { width: out.width, height: out.height, fps: settings().exportFps },
      shaderTime0: take.shaderTime0,
      duration: take.duration,
      mouse: take.mouse,
      keyframes: take.keyframes,
      audio: audioClip
        ? { name: audioClip.name, duration: audioClip.duration }
        : (pendingAudioName ? { name: pendingAudioName, duration: 0 } : null),
      audioReact: cloneJson(audioReact),
    };
  }

  function loadTakeObject(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.mouse) || !Array.isArray(data.keyframes)) {
      throw new Error("Not a valid take file.");
    }
    take = {
      version: 1,
      shaderTime0: Number(data.shaderTime0) || 0,
      duration: Math.max(0, Number(data.duration) || 0),
      mouse: data.mouse.map((s) => ({
        t: Number(s.t) || 0,
        time: s.time != null ? Number(s.time) : Number(s.t) || 0,
        x: clamp01(Number(s.x)),
        y: clamp01(Number(s.y)),
        on: s.on ? 1 : 0,
        speed: Number(s.speed) || 0,
      })),
      keyframes: data.keyframes.map((kf) => ({
        t: Math.max(0, Number(kf.t) || 0),
        easing: kf.easing === "hold" || kf.easing === "ease" ? kf.easing : "linear",
        params: kf.params,
      })).sort((a, b) => a.t - b.t),
    };
    if (!take.keyframes.length) {
      take.keyframes.push({ t: 0, easing: "linear", params: host.serializeParams() });
    }
    audioReact = mergeAudioReact(data.audioReact);
    if (data.audio && data.audio.name && !audioClip) {
      pendingAudioName = String(data.audio.name);
    }
    if (Array.isArray(data.aspect) && data.aspect.length >= 2) {
      settings().aspectW = Number(data.aspect[0]) || 16;
      settings().aspectH = Number(data.aspect[1]) || 9;
      const match = ASPECT_PRESETS.find(
        (p) => p.id !== "custom" && p.w === settings().aspectW && p.h === settings().aspectH
      );
      settings().aspectPreset = match ? match.id : "custom";
      if (!match) {
        settings().customAspectW = settings().aspectW;
        settings().customAspectH = settings().aspectH;
      }
    }
    if (data.export) {
      if (data.export.fps) settings().exportFps = data.export.fps === 30 ? 30 : 60;
      if (data.export.width && data.export.height) {
        settings().outputPreset = "custom";
        settings().customW = data.export.width;
        settings().customH = data.export.height;
      }
    }
    host.refreshStageUI();
    host.resizeCanvas();
    selectedKf = 0;
    openTimeline();
    parkAt(0);
  }

  function saveTakeJson() {
    const data = serializeTake();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "perlin-take.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setExportProgress(done, total, label) {
    if (exportStatus) exportStatus.textContent = label;
    if (exportBarFill) {
      const u = total ? done / total : 0;
      exportBarFill.style.width = Math.round(u * 100) + "%";
    }
  }

  async function pickAvcCodec(width, height) {
    if (typeof VideoEncoder === "undefined" || !VideoEncoder.isConfigSupported) return null;
    const candidates = ["avc1.640033", "avc1.640028", "avc1.4d4028", "avc1.4d401f", "avc1.42E01E"];
    for (const codec of candidates) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: videoBitrate(width, height, 60),
          framerate: 60,
        });
        if (res && res.supported) return codec;
      } catch (_) {
        /* try next */
      }
    }
    return null;
  }

  function renderExportFrame(t, dt) {
    applyTakeAt(t, { silent: true });
    host.drawFrame(dt);
    if (host.gl && host.gl.flush) host.gl.flush();
  }

  async function probeAac(channels, sampleRate) {
    if (typeof AudioEncoder === "undefined" || !AudioEncoder.isConfigSupported) return null;
    try {
      const res = await AudioEncoder.isConfigSupported({
        codec: "mp4a.40.2",
        numberOfChannels: channels,
        sampleRate,
        bitrate: 160000,
      });
      if (res && res.supported) return "mp4a.40.2";
    } catch (_) {
      /* unsupported */
    }
    return null;
  }

  async function exportMp4(width, height, fps, totalFrames, takeDur) {
    const { Muxer, ArrayBufferTarget } = await import("https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm");
    const codec = await pickAvcCodec(width, height);
    if (!codec) throw new Error("no-h264");
    const target = new ArrayBufferTarget();
    const wantAudio = !!(audioClip && audioClip.buffer);
    const audioChannels = wantAudio ? Math.min(2, audioClip.buffer.numberOfChannels) : 0;
    const audioRate = wantAudio ? audioClip.buffer.sampleRate : 0;
    const aacCodec = wantAudio && typeof AudioData !== "undefined"
      ? await probeAac(audioChannels, audioRate)
      : null;
    let encoderError = null;
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width, height },
      audio: aacCodec
        ? { codec: "aac", numberOfChannels: audioChannels, sampleRate: audioRate }
        : undefined,
      fastStart: "in-memory",
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => { encoderError = err; },
    });
    encoder.configure({
      codec,
      width,
      height,
      bitrate: videoBitrate(width, height, fps),
      framerate: fps,
      avc: { format: "avc" },
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "quality",
    });

    if (aacCodec && typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined") {
      try {
        setExportProgress(0, totalFrames, "Encoding soundtrack…");
        const audioEnc = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (err) => { encoderError = err; },
        });
        audioEnc.configure({
          codec: aacCodec,
          numberOfChannels: audioChannels,
          sampleRate: audioRate,
          bitrate: 160000,
        });
        const buffer = audioClip.buffer;
        const endFrame = Math.min(buffer.length, Math.max(1, Math.floor(takeDur * audioRate)));
        const hop = 2048;
        for (let offset = 0; offset < endFrame; offset += hop) {
          if (exportAbort) throw new Error("cancelled");
          if (encoderError) throw encoderError;
          const count = Math.min(hop, endFrame - offset);
          const packed = new Float32Array(count * audioChannels);
          for (let c = 0; c < audioChannels; c++) {
            packed.set(buffer.getChannelData(c).subarray(offset, offset + count), c * count);
          }
          const data = new AudioData({
            format: "f32-planar",
            sampleRate: audioRate,
            numberOfFrames: count,
            numberOfChannels: audioChannels,
            timestamp: Math.round((offset / audioRate) * 1e6),
            data: packed,
          });
          audioEnc.encode(data);
          data.close();
        }
        await audioEnc.flush();
        audioEnc.close();
      } catch (err) {
        if (err && err.message === "cancelled") throw err;
        encoderError = null;
      }
    }

    function frameFromCanvas(timestamp, durationUs) {
      try {
        return new VideoFrame(host.canvas, { timestamp, duration: durationUs, alpha: "discard" });
      } catch (_) {
        const w = host.canvas.width;
        const h = host.canvas.height;
        const pixels = new Uint8Array(w * h * 4);
        host.gl.readPixels(0, 0, w, h, host.gl.RGBA, host.gl.UNSIGNED_BYTE, pixels);
        const row = w * 4;
        const flipped = new Uint8ClampedArray(pixels.length);
        for (let y = 0; y < h; y++) {
          flipped.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
        }
        return new VideoFrame(flipped, {
          format: "RGBA",
          codedWidth: w,
          codedHeight: h,
          timestamp,
          duration: durationUs,
        });
      }
    }

    const dt = 1 / fps;
    for (let i = 0; i < totalFrames; i++) {
      if (exportAbort) throw new Error("cancelled");
      if (encoderError) throw encoderError;
      const t = Math.min(takeDur, i / fps);
      renderExportFrame(t, dt);
      const frame = frameFromCanvas(
        Math.round((i * 1e6) / fps),
        Math.round(1e6 / fps)
      );
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      if (i % 2 === 0) {
        setExportProgress(i + 1, totalFrames, "Encoding MP4 " + (i + 1) + " / " + totalFrames);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await encoder.flush();
    encoder.close();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  }

  function pickWebmMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  }

  async function exportWebm(width, height, fps, totalFrames) {
    const mime = pickWebmMime();
    if (!mime) throw new Error("no-webm");
    const stream = host.canvas.captureStream(0);
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: videoBitrate(width, height, fps),
    });
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((resolve, reject) => {
      rec.onstop = resolve;
      rec.onerror = () => reject(new Error("MediaRecorder failed"));
    });
    rec.start();
    const track = stream.getVideoTracks()[0];
    const dt = 1 / fps;
    for (let i = 0; i < totalFrames; i++) {
      if (exportAbort) {
        rec.stop();
        track.stop();
        throw new Error("cancelled");
      }
      const t = Math.min(duration(), i / fps);
      renderExportFrame(t, dt);
      if (track.requestFrame) track.requestFrame();
      setExportProgress(i + 1, totalFrames, "Encoding WebM " + (i + 1) + " / " + totalFrames);
      await new Promise((r) => requestAnimationFrame(r));
    }
    rec.stop();
    track.stop();
    await stopped;
    return new Blob(chunks, { type: mime.split(";")[0] });
  }

  async function exportTake() {
    if (!take || host.isExportLocked()) return;
    exportAbort = false;
    const out = currentOutput();
    const fps = settings().exportFps || 60;
    const takeDur = duration();
    const totalFrames = Math.max(1, Math.round(takeDur * fps) || 1);
    const prevW = host.canvas.width;
    const prevH = host.canvas.height;
    if (overlay) overlay.hidden = false;
    setExportProgress(0, totalFrames, "Preparing encoder…");
    host.setExportLock(true);
    host.setPlaying(false);
    takePlaying = false;
    host.canvas.width = out.width;
    host.canvas.height = out.height;
    let blob = null;
    let ext = "mp4";
    try {
      try {
        blob = await exportMp4(out.width, out.height, fps, totalFrames, takeDur);
        ext = "mp4";
      } catch (err) {
        if (err && err.message === "cancelled") throw err;
        setExportProgress(0, totalFrames, "H.264 unavailable — falling back to WebM…");
        blob = await exportWebm(out.width, out.height, fps, totalFrames);
        ext = "webm";
      }
      if (!exportAbort && blob) {
        downloadBlob("perlin-take-" + out.width + "x" + out.height + "." + ext, blob);
        setExportProgress(totalFrames, totalFrames, "Saved " + ext.toUpperCase());
      }
    } catch (err) {
      if (!err || err.message !== "cancelled") {
        if (exportStatus) {
          exportStatus.textContent = "Export failed: " + (err && err.message ? err.message : err);
        }
        window.alert("Could not export video. Try Chrome/Edge for MP4, or a browser with WebM recording.");
      }
    } finally {
      host.canvas.width = prevW;
      host.canvas.height = prevH;
      host.setExportLock(false);
      host.resizeCanvas();
      if (take) parkAt(takeTime);
      if (overlay) overlay.hidden = true;
    }
  }

  function onTick(dt) {
    if (host.isExportLocked()) return;
    if (recording && host.state.playing) {
      pushSample(dt);
      updateRecTimer();
      return;
    }
    if (takePlaying && take) {
      takeTime += dt;
      if (takeTime >= duration()) {
        takeTime = duration();
        takePlaying = false;
        parkAt(takeTime);
        return;
      }
      applyTakeAt(takeTime, { silent: true });
      host.state.frame += 1;
    }
  }

  function onParamsEdited() {
    if (applyingTake || recording || !take || selectedKf < 0) return;
    take.keyframes[selectedKf].params = host.serializeParams();
  }

  function updateAudioUI() {
    const has = !!audioClip;
    if (btnAudioClear) btnAudioClear.hidden = !has;
    if (audioTogglesEl) audioTogglesEl.hidden = !has;
    if (audioNameEl) {
      if (has) audioNameEl.textContent = audioClip.name;
      else if (pendingAudioName) audioNameEl.textContent = "Re-add “" + pendingAudioName + "”";
      else audioNameEl.textContent = "No audio";
    }
    if (audioAmountEl) audioAmountEl.value = String(audioReact.amount);
    if (audioAmountVal) audioAmountVal.textContent = Math.round(audioReact.amount * 100) + "%";
    if (audioExtendEl) audioExtendEl.checked = audioReact.extendTake !== false;
    if (audioMuteEl) audioMuteEl.checked = !!audioMute;
    if (audioTogglesEl) {
      const boxes = audioTogglesEl.querySelectorAll("input[data-react-id]");
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const id = box.getAttribute("data-react-id");
        box.checked = !!(audioReact.maps && audioReact.maps[id]);
        const lab = box.closest(".audio-toggle");
        if (lab) lab.classList.toggle("is-on", box.checked);
      }
    }
  }

  function previewAudioAtPlayhead() {
    if (!take || selectedKf >= 0 || recording) return;
    applyTakeAt(takeTime, { silent: true, live: true });
  }

  function buildAudioToggles() {
    if (!audioTogglesEl) return;
    audioTogglesEl.innerHTML = "";
    for (let i = 0; i < AUDIO_REACT_TOGGLES.length; i++) {
      const tog = AUDIO_REACT_TOGGLES[i];
      const lab = document.createElement("label");
      lab.className = "audio-toggle";
      lab.title = tog.hint;
      const box = document.createElement("input");
      box.type = "checkbox";
      box.setAttribute("data-react-id", tog.id);
      box.checked = !!(audioReact.maps && audioReact.maps[tog.id]);
      lab.classList.toggle("is-on", box.checked);
      box.addEventListener("change", () => {
        audioReact.maps[tog.id] = box.checked;
        lab.classList.toggle("is-on", box.checked);
        previewAudioAtPlayhead();
      });
      lab.appendChild(box);
      lab.appendChild(document.createTextNode(tog.label));
      audioTogglesEl.appendChild(lab);
    }
  }

  async function loadAudioFile(file) {
    if (!file) return;
    const ctx = getAudioCtx();
    if (!ctx) {
      window.alert("This browser cannot decode audio.");
      return;
    }
    try {
      const arr = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr.slice(0));
      const mono = mixToMono(buffer);
      const envelopes = envelopesFromMono(mono, buffer.sampleRate, AUDIO_ENV_HZ);
      audioClip = {
        name: file.name,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        buffer,
        envelopes,
      };
      pendingAudioName = "";
      if (!take) {
        take = newEmptyTake(audioClip.duration);
        selectedKf = 0;
      }
      openTimeline();
      refreshTimeline();
      if (timelineHint) {
        timelineHint.textContent = "Soundtrack loaded. Play to hear it, then toggle how the look follows the mix. Record a mouse take over it when you are ready.";
      }
    } catch (_) {
      window.alert("Could not decode that audio file.");
    }
  }

  function clearAudio() {
    stopAudioPlayback();
    audioClip = null;
    pendingAudioName = "";
    refreshTimeline();
  }

  function pickAudioFile() {
    if (audioFileInput) audioFileInput.click();
  }

  buildAudioToggles();
  updateAudioUI();

  if (btnRecord) {
    btnRecord.addEventListener("click", () => {
      if (recording) stopRecording();
      else startRecording();
    });
  }
  if (btnRecPause) btnRecPause.addEventListener("click", pauseRecording);
  if (takePlayBtn) {
    takePlayBtn.addEventListener("click", () => {
      if (!take) return;
      if (takePlaying) {
        parkAt(takeTime);
        return;
      }
      if (takeTime >= duration() - 1e-4) takeTime = 0;
      selectedKf = -1;
      takePlaying = true;
      startAudioPlayback(takeTime);
      host.state.lastTick = performance.now();
      updateTransportUI();
      renderKeyframes();
    });
  }
  const btnTakeStart = document.getElementById("btn-take-start");
  if (btnTakeStart) btnTakeStart.addEventListener("click", () => { if (take) parkAt(0); });
  if (btnKfAdd) btnKfAdd.addEventListener("click", () => addKeyframeAt(takeTime));
  if (btnKfDel) btnKfDel.addEventListener("click", deleteSelectedKeyframe);
  if (kfEasing) {
    kfEasing.addEventListener("change", () => {
      if (!take || selectedKf < 0) return;
      take.keyframes[selectedKf].easing = kfEasing.value;
      if (selectedKf === 0) return;
      parkAt(takeTime);
    });
  }
  const btnExport = document.getElementById("btn-export");
  if (btnExport) btnExport.addEventListener("click", () => exportTake());
  const btnExportCancel = document.getElementById("btn-export-cancel");
  if (btnExportCancel) {
    btnExportCancel.addEventListener("click", () => { exportAbort = true; });
  }
  const btnTakeSave = document.getElementById("btn-take-save");
  if (btnTakeSave) btnTakeSave.addEventListener("click", saveTakeJson);
  const btnTakeLoad = document.getElementById("btn-take-load");
  if (btnTakeLoad && takeFileInput) {
    btnTakeLoad.addEventListener("click", () => takeFileInput.click());
    takeFileInput.addEventListener("change", () => {
      const file = takeFileInput.files && takeFileInput.files[0];
      takeFileInput.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadTakeObject(JSON.parse(String(reader.result || "")));
        } catch (err) {
          window.alert(err && err.message ? err.message : "Could not load take.");
        }
      };
      reader.readAsText(file);
    });
  }
  const btnTimelineClose = document.getElementById("btn-timeline-close");
  if (btnTimelineClose) btnTimelineClose.addEventListener("click", closeTimeline);
  if (btnTimeline) btnTimeline.addEventListener("click", () => { if (take) openTimeline(); });
  if (btnAudio) {
    btnAudio.addEventListener("click", () => {
      if (audioClip && take) openTimeline();
      else pickAudioFile();
    });
  }
  if (btnAudioAdd) btnAudioAdd.addEventListener("click", pickAudioFile);
  if (btnAudioClear) btnAudioClear.addEventListener("click", clearAudio);
  if (audioFileInput) {
    audioFileInput.addEventListener("change", () => {
      const file = audioFileInput.files && audioFileInput.files[0];
      audioFileInput.value = "";
      getAudioCtx();
      loadAudioFile(file);
    });
  }
  if (audioMuteEl) {
    audioMuteEl.addEventListener("change", () => {
      audioMute = !!audioMuteEl.checked;
      if (audioMute || !takePlaying) stopAudioPlayback();
      else if (takePlaying) startAudioPlayback(takeTime);
    });
  }
  if (audioAmountEl) {
    audioAmountEl.addEventListener("input", () => {
      audioReact.amount = clamp01(Number(audioAmountEl.value) || 0);
      if (audioAmountVal) audioAmountVal.textContent = Math.round(audioReact.amount * 100) + "%";
      previewAudioAtPlayhead();
    });
  }
  if (audioExtendEl) {
    audioExtendEl.addEventListener("change", () => {
      audioReact.extendTake = !!audioExtendEl.checked;
      if (takeTime > duration()) takeTime = duration();
      refreshTimeline();
    });
  }

  bindScrubber(ruler);
  bindScrubber(waveEl);
  bindScrubber(spark);

  if (kfTrack) {
    kfTrack.addEventListener("click", (e) => {
      if (!take || e.target.classList.contains("kf-marker")) return;
      const rect = kfTrack.getBoundingClientRect();
      const u = clamp01((e.clientX - rect.left) / Math.max(1, rect.width));
      takeTime = u * duration();
      addKeyframeAt(takeTime);
    });
  }

  window.addEventListener("resize", () => {
    if (timelineOpen) {
      drawSpark();
      drawWave();
    }
  });

  host.PerlinCaptureAPI = {
    isDriven,
    onTick,
    onParamsEdited,
    startRecording,
    stopRecording,
    hasTake: () => !!take,
  };

  window.PerlinCapture.isDriven = isDriven;
  window.PerlinCapture.isTakePlaying = () => takePlaying;
  window.PerlinCapture.onTick = onTick;
  window.PerlinCapture.onParamsEdited = onParamsEdited;
}

if (typeof window !== "undefined") {
  window.PerlinCapture = window.PerlinCapture || {};
  window.PerlinCapture.init = initCapture;
  window.PerlinCapture.isDriven = () => false;
  window.PerlinCapture.onTick = () => {};
  window.PerlinCapture.onParamsEdited = () => {};
  window.StageMath = StageMath;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = StageMath;
}
