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
  if (t >= last.t) return Object.assign({}, last);
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

const StageMath = {
  DISCRETE_PARAM_KEYS,
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
  const kfTrack = document.getElementById("timeline-kf-track");
  const overlay = document.getElementById("export-overlay");
  const exportStatus = document.getElementById("export-status");
  const exportBarFill = document.getElementById("export-bar-fill");
  const takeFileInput = document.getElementById("take-file-input");
  const btnTimeline = document.getElementById("btn-timeline");

  function settings() {
    return host.stageSettings;
  }

  function duration() {
    return take ? Math.max(take.duration || 0, 0.001) : 0.001;
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

  function applyTakeAt(t, opts) {
    if (!take) return;
    const o = opts || {};
    takeTime = Math.max(0, Math.min(duration(), t));
    applyingTake = true;
    host.setSuppressEditorSync(true);
    const cfg = paramsAtTime(take.keyframes, takeTime);
    if (cfg) host.applySerializedParams(cfg, { silent: true });
    const sample = sampleAtTime(take.mouse, takeTime);
    applyMouseSample(sample);
    host.state.shaderTime = sample.time != null
      ? sample.time
      : (take.shaderTime0 || 0) + takeTime;
    if (!o.silent) {
      host.setSuppressEditorSync(false);
      host.applyParamsToUI();
      if (o.editor) host.syncParamsToEditor();
    }
    applyingTake = false;
    updatePlayhead();
  }

  function parkAt(t) {
    takePlaying = false;
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
    if (recHint) recHint.textContent = interactHint();
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
        ? takeTime.toFixed(2) + " / " + (take.duration || 0).toFixed(2)
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
    updatePlayhead();
    updateTransportUI();
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
    const time = Math.max(0, Math.min(take.duration || 0, t));
    const hit = Math.max(0.04, duration() * 0.01);
    const existing = take.keyframes.findIndex((kf) => Math.abs(kf.t - time) <= hit);
    if (existing >= 0) {
      selectKeyframe(existing);
      return;
    }
    const kf = {
      t: time,
      easing: (kfEasing && kfEasing.value) || "linear",
      params: host.serializeParams(),
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

  function startRecording() {
    if (recording) return;
    if (take && !window.confirm("Replace the current take? Unexported keyframes will be lost.")) {
      return;
    }
    takePlaying = false;
    closeTimeline();
    recElapsed = 0;
    takeTime = 0;
    selectedKf = 0;
    const [aw, ah] = currentAspect();
    const out = currentOutput();
    take = {
      version: 1,
      shaderTime0: host.state.shaderTime,
      duration: 0,
      mouse: [],
      keyframes: [{ t: 0, easing: "linear", params: host.serializeParams() }],
      aspect: [aw, ah],
      export: { width: out.width, height: out.height, fps: settings().exportFps },
    };
    recording = true;
    setRecordingUI(true);
    updateRecTimer();
    host.setPlaying(true);
  }

  function pauseRecording() {
    if (!recording) return;
    host.setPlaying(!host.state.playing);
    if (btnRecPause) {
      const playing = host.state.playing;
      btnRecPause.title = playing ? "Pause recording" : "Resume recording";
      btnRecPause.textContent = playing ? "Pause" : "Resume";
    }
  }

  function stopRecording() {
    if (!recording || !take) return;
    recording = false;
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
      timelineHint.textContent = n
        ? "Captured " + secs + "s. Play the take, then click the bottom track to add a keyframe."
        : "No mouse motion was captured. Record again and move over the preview.";
    }
  }

  function timeFromClientX(clientX) {
    if (!ruler) return 0;
    const rect = ruler.getBoundingClientRect();
    const u = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    return u * duration();
  }

  function seekFromEvent(e, live) {
    if (!take) return;
    selectedKf = -1;
    const t = timeFromClientX(e.clientX);
    if (live) applyTakeAt(t, { silent: true });
    else parkAt(t);
    renderKeyframes();
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

  async function exportMp4(width, height, fps, totalFrames) {
    const { Muxer, ArrayBufferTarget } = await import("https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm");
    const codec = await pickAvcCodec(width, height);
    if (!codec) throw new Error("no-h264");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width, height },
      fastStart: "in-memory",
    });
    let encoderError = null;
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

    function frameFromCanvas(timestamp, duration) {
      try {
        return new VideoFrame(host.canvas, { timestamp, duration, alpha: "discard" });
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
          duration,
        });
      }
    }

    const dt = 1 / fps;
    for (let i = 0; i < totalFrames; i++) {
      if (exportAbort) throw new Error("cancelled");
      if (encoderError) throw encoderError;
      const t = Math.min(take.duration, i / fps);
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
      const t = Math.min(take.duration, i / fps);
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
    const totalFrames = Math.max(1, Math.round((take.duration || 0) * fps) || 1);
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
        blob = await exportMp4(out.width, out.height, fps, totalFrames);
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
      if (takeTime >= take.duration) {
        takeTime = take.duration;
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
      if (takeTime >= take.duration - 1e-4) takeTime = 0;
      selectedKf = -1;
      takePlaying = true;
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

  if (ruler) {
    ruler.addEventListener("pointerdown", (e) => {
      if (!take) return;
      scrubbing = true;
      takePlaying = false;
      try { ruler.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      seekFromEvent(e, true);
    });
    ruler.addEventListener("pointermove", (e) => {
      if (scrubbing) seekFromEvent(e, true);
    });
    const endScrub = (e) => {
      if (!scrubbing) return;
      scrubbing = false;
      seekFromEvent(e, false);
    };
    ruler.addEventListener("pointerup", endScrub);
    ruler.addEventListener("pointercancel", endScrub);
  }

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
    if (timelineOpen) drawSpark();
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
