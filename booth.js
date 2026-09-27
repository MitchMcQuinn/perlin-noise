/**
 * DJ booth: live input, beat clock, scene deck, stage effects, show mode.
 * Pure timing helpers are BoothMath so Node can test them.
 * A browser cannot speak Spout, Syphon, or NDI; the output window is the
 * picture for a second display, and OBS can window-capture it.
 */

"use strict";

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function estimateBpm(onsetTimes) {
  const times = (onsetTimes || []).filter((t) => isFinite(t)).slice().sort((a, b) => a - b);
  if (times.length < 3) return null;
  const intervals = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt >= 0.25 && dt <= 1.5) intervals.push(dt);
  }
  if (intervals.length < 2) return null;
  let bpm = 60 / median(intervals);
  while (bpm < 80 && bpm * 2 <= 180) bpm *= 2;
  while (bpm > 170 && bpm / 2 >= 70) bpm /= 2;
  if (!isFinite(bpm)) return null;
  return Math.round(bpm * 10) / 10;
}

function retimedOrigin(originSec, oldBpm, newBpm, nowSec) {
  if (!(oldBpm > 0) || !(newBpm > 0)) return nowSec;
  const beat = (nowSec - originSec) * (oldBpm / 60);
  return nowSec - beat / (newBpm / 60);
}

function nextQuantizeTime(originSec, bpm, nowSec, division) {
  const div = division | 0;
  if (div <= 0 || !(bpm > 0) || !isFinite(nowSec)) return nowSec;
  const bps = bpm / 60;
  const beat = (nowSec - originSec) * bps;
  let next = Math.ceil((beat - 1e-6) / div) * div;
  if (next - beat < 0.04) next += div;
  return originSec + next / bps;
}

function strobeGain(pulse, amount, cap) {
  const p = Math.max(0, Math.min(1, Number(pulse) || 0));
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  const limit = Math.max(0, Math.min(0.72, cap == null ? 0.62 : Number(cap)));
  return Math.min(limit, p * a);
}

const BoothMath = {
  median,
  estimateBpm,
  retimedOrigin,
  nextQuantizeTime,
  strobeGain,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = BoothMath;
}

if (typeof window !== "undefined") {
  window.BoothMath = BoothMath;

  const SETTINGS_KEY = "perlinBooth:v1";
  const PRESETS_KEY = "perlinPresets:v1";
  const STROBE_CAP = 0.62;

  const POST_VERT_300 = `#version 300 es
out vec2 vPos;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vPos = p * 2.0 - 1.0;
  gl_Position = vec4(vPos, 0.0, 1.0);
}`;

  const POST_FRAG_300 = `#version 300 es
precision mediump float;
precision mediump sampler2D;
uniform sampler2D uScene;
uniform sampler2D uHist;
uniform sampler2D uPlate;
uniform float uFeedback;
uniform float uSegments;
uniform float uStrobe;
uniform float uBlackout;
uniform float uPlateAmt;
uniform float uHasPlate;
in vec2 vPos;
out vec4 outColor;

vec2 toUv(vec2 clip) { return clip * 0.5 + 0.5; }

vec2 kaleido(vec2 uv, float segments) {
  if (segments < 1.5) return uv;
  vec2 p = uv * 2.0 - 1.0;
  float ang = atan(p.y, p.x);
  float r = length(p);
  float seg = 6.2831853 / max(1.0, segments);
  ang = mod(ang, seg);
  ang = abs(ang - 0.5 * seg);
  return vec2(cos(ang), sin(ang)) * r * 0.5 + 0.5;
}

void main() {
  vec2 uv = toUv(vPos);
  vec2 kuv = kaleido(uv, uSegments);
  vec3 scene = texture(uScene, kuv).rgb;
  vec3 hist = texture(uHist, uv).rgb;
  vec3 col = mix(scene, hist, clamp(uFeedback, 0.0, 0.9));
  if (uHasPlate > 0.5 && uPlateAmt > 0.001) {
    vec3 plate = texture(uPlate, kuv).rgb;
    float luma = dot(scene, vec3(0.299, 0.587, 0.114));
    float reveal = smoothstep(0.18, 0.75, luma);
    col = mix(col, plate, clamp(uPlateAmt, 0.0, 1.0) * reveal);
  }
  float s = clamp(uStrobe, 0.0, 0.72);
  vec3 flash = mix(vec3(1.0), vec3(0.0), clamp(uBlackout, 0.0, 1.0));
  col = mix(col, flash, s);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  const POST_VERT_100 = `attribute vec2 aPos;
varying vec2 vPos;
void main() {
  vPos = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const POST_FRAG_100 = `precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uHist;
uniform sampler2D uPlate;
uniform float uFeedback;
uniform float uSegments;
uniform float uStrobe;
uniform float uBlackout;
uniform float uPlateAmt;
uniform float uHasPlate;
varying vec2 vPos;

vec2 toUv(vec2 clip) { return clip * 0.5 + 0.5; }

vec2 kaleido(vec2 uv, float segments) {
  if (segments < 1.5) return uv;
  vec2 p = uv * 2.0 - 1.0;
  float ang = atan(p.y, p.x);
  float r = length(p);
  float seg = 6.2831853 / max(1.0, segments);
  ang = mod(ang, seg);
  ang = abs(ang - 0.5 * seg);
  return vec2(cos(ang), sin(ang)) * r * 0.5 + 0.5;
}

void main() {
  vec2 uv = toUv(vPos);
  vec2 kuv = kaleido(uv, uSegments);
  vec3 scene = texture2D(uScene, kuv).rgb;
  vec3 hist = texture2D(uHist, uv).rgb;
  vec3 col = mix(scene, hist, clamp(uFeedback, 0.0, 0.9));
  if (uHasPlate > 0.5 && uPlateAmt > 0.001) {
    vec3 plate = texture2D(uPlate, kuv).rgb;
    float luma = dot(scene, vec3(0.299, 0.587, 0.114));
    float reveal = smoothstep(0.18, 0.75, luma);
    col = mix(col, plate, clamp(uPlateAmt, 0.0, 1.0) * reveal);
  }
  float s = clamp(uStrobe, 0.0, 0.72);
  vec3 flash = mix(vec3(1.0), vec3(0.0), clamp(uBlackout, 0.0, 1.0));
  col = mix(col, flash, s);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function clamp01(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  function loadSettings() {
    const maps = {};
    const toggles = (window.StageMath && window.StageMath.AUDIO_REACT_TOGGLES) || [];
    const defaults = window.StageMath && window.StageMath.defaultAudioReact
      ? window.StageMath.defaultAudioReact()
      : { amount: 0.7, maps: {} };
    toggles.forEach((tog) => {
      maps[tog.id] = !!(defaults.maps && defaults.maps[tog.id]);
    });
    const base = {
      amount: defaults.amount == null ? 0.7 : defaults.amount,
      quantize: 4,
      fade: 0,
      feedback: 0,
      segments: 1,
      strobe: 0,
      blackout: false,
      plate: 0.65,
      bpm: 120,
      maps,
    };
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!raw || typeof raw !== "object") return base;
      if (isFinite(raw.amount)) base.amount = clamp01(raw.amount);
      if ([0, 1, 4, 16, 32].indexOf(raw.quantize | 0) >= 0) base.quantize = raw.quantize | 0;
      if ([0, 1, 4].indexOf(raw.fade | 0) >= 0) base.fade = raw.fade | 0;
      if (isFinite(raw.feedback)) base.feedback = Math.max(0, Math.min(0.9, Number(raw.feedback)));
      if (isFinite(raw.segments)) base.segments = Math.max(1, Math.min(8, Math.round(raw.segments)));
      if (isFinite(raw.strobe)) base.strobe = clamp01(raw.strobe);
      if (typeof raw.blackout === "boolean") base.blackout = raw.blackout;
      if (isFinite(raw.plate)) base.plate = clamp01(raw.plate);
      if (isFinite(raw.bpm) && raw.bpm >= 40 && raw.bpm <= 200) base.bpm = Number(raw.bpm);
      if (raw.maps && typeof raw.maps === "object") {
        toggles.forEach((tog) => {
          if (typeof raw.maps[tog.id] === "boolean") base.maps[tog.id] = raw.maps[tog.id];
        });
      }
    } catch (_) { /* keep defaults */ }
    return base;
  }

  function init(host) {
    if (!host || !host.gl || !host.canvas) return;
    const gl = host.gl;
    const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settings = loadSettings();

    const clock = {
      bpm: settings.bpm,
      origin: performance.now() / 1000,
      tapLockUntil: 0,
      taps: [],
      onsets: [],
      lastOnset: -10,
    };
    const env = { level: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
    const peaks = { level: 0.08, bass: 0.08, mid: 0.08, high: 0.08, pulse: 0.08 };
    let prevBass = 0;
    let live = false;
    let audioCtx = null;
    let analyser = null;
    let mediaStream = null;
    let freqData = null;
    let timeData = null;
    let queue = null;
    let fade = null;
    let activeName = "";
    let outputWin = null;
    let plateImage = null;
    let plateTex = null;
    let sceneTex = null;
    let sceneFbo = null;
    let histTex = null;
    let postProg = null;
    let postLocs = null;
    let postQuad = null;
    let targetW = 0;
    let targetH = 0;
    let postFailed = false;

    const dock = document.createElement("section");
    dock.id = "booth-dock";
    dock.className = "booth-dock";
    dock.hidden = true;
    dock.setAttribute("aria-label", "DJ booth");
    host.canvas.parentElement.appendChild(dock);

    dock.innerHTML = [
      '<div class="booth-row">',
      '  <button id="booth-live" class="btn" type="button" aria-pressed="false">Live</button>',
      '  <select id="booth-device" class="param-select" hidden aria-label="Audio input"></select>',
      '  <div class="booth-meters" aria-hidden="true">',
      '    <div class="booth-meter" title="Level"><i id="booth-m-level"></i></div>',
      '    <div class="booth-meter" title="Kick / bass"><i id="booth-m-bass"></i></div>',
      '    <div class="booth-meter" title="Mid"><i id="booth-m-mid"></i></div>',
      '    <div class="booth-meter" title="High"><i id="booth-m-high"></i></div>',
      '  </div>',
      '  <span id="booth-beat" class="booth-beat" title="Beat"></span>',
      '  <span id="booth-bpm" class="booth-bpm">120 BPM</span>',
      '  <button id="booth-tap" class="btn" type="button" title="Tap tempo (T)">Tap</button>',
      '  <label class="booth-field">Grid<select id="booth-quantize" class="param-select" aria-label="Quantize">',
      '    <option value="0">Now</option><option value="1">1 beat</option>',
      '    <option value="4">4 beats</option><option value="16">16 beats</option>',
      '    <option value="32">32 beats</option></select></label>',
      '  <label class="booth-field">Fade<select id="booth-fade" class="param-select" aria-label="Scene fade">',
      '    <option value="0">Cut</option><option value="1">1 beat</option>',
      '    <option value="4">4 beats</option></select></label>',
      '</div>',
      '<div id="booth-pads" class="booth-pads"></div>',
      '<p id="booth-next" class="booth-next" hidden></p>',
      '<div class="booth-row booth-effects">',
      '  <label class="booth-field">Amount<input id="booth-amount" type="range" min="0" max="1" step="0.01" /></label>',
      '  <label class="booth-field">Feedback<input id="booth-feedback" type="range" min="0" max="0.9" step="0.01" title="Smear the last frame back in" /></label>',
      '  <label class="booth-field">Kaleido<input id="booth-kaleido" type="range" min="1" max="8" step="1" title="1 is off" /></label>',
      '  <label class="booth-field">Kick<select id="booth-strobe-mode" class="param-select" aria-label="Kick treatment">',
      '    <option value="flash">Flash</option><option value="black">Blackout</option></select></label>',
      '  <label class="booth-field">Strength<input id="booth-strobe" type="range" min="0" max="1" step="0.01" title="Capped so a kick cannot blow the frame to full white" /></label>',
      '  <button id="booth-plate" class="btn" type="button">Image</button>',
      '  <input id="booth-plate-file" type="file" accept="image/*" hidden />',
      '  <label class="booth-field" id="booth-plate-amt-label">Plate<input id="booth-plate-amt" type="range" min="0" max="1" step="0.01" /></label>',
      '  <button id="booth-midi" class="btn" type="button" title="Notes from 36 select scenes. Note 35 taps tempo. CC1 amount, CC2 feedback, CC3 kaleidoscope, CC4 kick, CC5 image.">MIDI</button>',
      '  <button id="booth-output" class="btn" type="button" title="Open a window you can put on a projector. Double-click it for fullscreen. OBS can capture that window.">Output</button>',
      '  <button id="booth-show" class="btn btn-primary" type="button" aria-pressed="false">Show</button>',
      '</div>',
      '<div id="booth-maps" class="booth-maps"></div>',
      '<p id="booth-status" class="booth-status"></p>',
    ].join("");

    const el = {
      live: dock.querySelector("#booth-live"),
      device: dock.querySelector("#booth-device"),
      bpm: dock.querySelector("#booth-bpm"),
      beat: dock.querySelector("#booth-beat"),
      tap: dock.querySelector("#booth-tap"),
      quantize: dock.querySelector("#booth-quantize"),
      fade: dock.querySelector("#booth-fade"),
      pads: dock.querySelector("#booth-pads"),
      next: dock.querySelector("#booth-next"),
      amount: dock.querySelector("#booth-amount"),
      feedback: dock.querySelector("#booth-feedback"),
      kaleido: dock.querySelector("#booth-kaleido"),
      strobeMode: dock.querySelector("#booth-strobe-mode"),
      strobe: dock.querySelector("#booth-strobe"),
      plateBtn: dock.querySelector("#booth-plate"),
      plateFile: dock.querySelector("#booth-plate-file"),
      plateAmt: dock.querySelector("#booth-plate-amt"),
      midi: dock.querySelector("#booth-midi"),
      output: dock.querySelector("#booth-output"),
      show: dock.querySelector("#booth-show"),
      maps: dock.querySelector("#booth-maps"),
      status: dock.querySelector("#booth-status"),
      meters: {
        level: dock.querySelector("#booth-m-level"),
        bass: dock.querySelector("#booth-m-bass"),
        mid: dock.querySelector("#booth-m-mid"),
        high: dock.querySelector("#booth-m-high"),
      },
    };

    el.quantize.value = String(settings.quantize);
    el.fade.value = String(settings.fade);
    el.amount.value = String(settings.amount);
    el.feedback.value = String(settings.feedback);
    el.kaleido.value = String(settings.segments);
    el.strobe.value = String(settings.strobe);
    el.strobeMode.value = settings.blackout ? "black" : "flash";
    el.plateAmt.value = String(settings.plate);

    const toggles = (window.StageMath && window.StageMath.AUDIO_REACT_TOGGLES) || [];
    toggles.forEach((tog) => {
      const label = document.createElement("label");
      label.className = "booth-map";
      label.title = tog.hint || "";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!settings.maps[tog.id];
      input.addEventListener("change", () => {
        settings.maps[tog.id] = input.checked;
        saveSettings();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(tog.label));
      el.maps.appendChild(label);
    });

    if (reduceMotion.matches) {
      el.strobe.disabled = true;
      el.strobeMode.disabled = true;
      el.strobe.title = "Kick flash is off because this display prefers reduced motion";
    }

    function saveSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          amount: clamp01(el.amount.value),
          quantize: el.quantize.value | 0,
          fade: el.fade.value | 0,
          feedback: Number(el.feedback.value) || 0,
          segments: el.kaleido.value | 0,
          strobe: clamp01(el.strobe.value),
          blackout: el.strobeMode.value === "black",
          plate: clamp01(el.plateAmt.value),
          bpm: clock.bpm,
          maps: settings.maps,
        }));
      } catch (_) { /* ignore quota */ }
    }

    function setStatus(text) {
      el.status.textContent = text || "";
    }

    function nowSec() {
      return performance.now() / 1000;
    }

    function setBpm(next, lockOriginToNow) {
      const now = nowSec();
      const bpm = Math.max(40, Math.min(200, Number(next) || clock.bpm));
      if (lockOriginToNow) clock.origin = now;
      else clock.origin = retimedOrigin(clock.origin, clock.bpm, bpm, now);
      clock.bpm = Math.round(bpm * 10) / 10;
    }

    function beatNow() {
      return (nowSec() - clock.origin) * (clock.bpm / 60);
    }

    function loadPresetList() {
      if (host.loadPresets) return host.loadPresets();
      try {
        const list = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (_) {
        return [];
      }
    }

    function refreshScenes() {
      const list = loadPresetList();
      el.pads.innerHTML = "";
      if (!list.length) {
        const empty = document.createElement("p");
        empty.className = "booth-empty";
        empty.textContent = "Save a look under Controls → Presets and it becomes a pad.";
        el.pads.appendChild(empty);
        return;
      }
      list.forEach((preset, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "booth-pad";
        if (preset.name === activeName) btn.classList.add("is-active");
        if (queue && queue.name === preset.name) btn.classList.add("is-queued");
        const key = index < 9 ? String(index + 1) : "";
        btn.innerHTML = (key ? '<span class="booth-key">' + key + "</span>" : "") +
          '<span class="booth-pad-name"></span>';
        btn.querySelector(".booth-pad-name").textContent = preset.name;
        btn.title = key
          ? "Tap to cut on the grid. Hold to fade. Key " + key
          : "Tap to cut on the grid. Hold to fade.";
        let held = false;
        let timer = 0;
        btn.addEventListener("pointerdown", (e) => {
          if (e.button != null && e.button !== 0) return;
          held = false;
          timer = window.setTimeout(() => { held = true; }, 280);
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        });
        const fire = () => {
          window.clearTimeout(timer);
          triggerScene(index, held);
          held = false;
        };
        btn.addEventListener("pointerup", fire);
        btn.addEventListener("pointercancel", () => window.clearTimeout(timer));
        el.pads.appendChild(btn);
      });
    }

    function driven() {
      return !!(host.isExportLocked && host.isExportLocked())
        || !!(window.PerlinCapture && window.PerlinCapture.isDriven && window.PerlinCapture.isDriven());
    }

    function commitScene(preset) {
      if (!preset || !preset.config) return;
      activeName = preset.name;
      queue = null;
      fade = null;
      if (host.applySerializedParams) host.applySerializedParams(preset.config);
      refreshScenes();
      updateNext();
    }

    function triggerScene(index, holdFade) {
      if (driven()) {
        setStatus("The timeline has the picture right now. Close it to play scenes.");
        return;
      }
      const list = loadPresetList();
      const preset = list[index];
      if (!preset) return;
      const division = el.quantize.value | 0;
      const fadeBeats = holdFade ? Math.max(4, el.fade.value | 0) : (el.fade.value | 0);
      const when = nextQuantizeTime(clock.origin, clock.bpm, nowSec(), division);
      if (fadeBeats <= 0 && when <= nowSec() + 0.02) {
        commitScene(preset);
        return;
      }
      queue = { name: preset.name, config: preset.config, when, fadeBeats };
      refreshScenes();
      updateNext();
    }

    function updateNext() {
      if (!queue && !fade) {
        el.next.hidden = true;
        el.next.textContent = "";
        return;
      }
      el.next.hidden = false;
      if (fade) el.next.textContent = "Fading to " + fade.name;
      else el.next.textContent = "Next " + queue.name;
    }

    function startQueued(item) {
      queue = null;
      if (!item || !item.config) return;
      if (item.fadeBeats <= 0) {
        const preset = { name: item.name, config: item.config };
        commitScene(preset);
        return;
      }
      const dur = item.fadeBeats * (60 / clock.bpm);
      fade = {
        name: item.name,
        from: host.serializeParams(),
        to: item.config,
        u: 0,
        dur: Math.max(0.05, dur),
      };
      activeName = item.name;
      refreshScenes();
      updateNext();
    }

    function reactSettings() {
      return { amount: clamp01(el.amount.value), maps: settings.maps };
    }

    function frameParams(base) {
      if (!base || driven() || !window.StageMath) return base;
      let look = base;
      if (fade) {
        look = window.StageMath.lerpParams(fade.from, fade.to, fade.u, "linear") || base;
      }
      if (live) {
        return window.StageMath.applyAudioToParams(look, env, reactSettings()) || look;
      }
      return look;
    }

    function effectsActive() {
      const strobe = reduceMotion.matches ? 0 : clamp01(el.strobe.value);
      const plateOn = !!(plateImage && clamp01(el.plateAmt.value) > 0.001);
      return (Number(el.feedback.value) || 0) > 0.001
        || (el.kaleido.value | 0) >= 2
        || strobe > 0.001
        || plateOn;
    }

    function compilePost() {
      if (postProg || postFailed) return postProg;
      const vs = gl.createShader(gl.VERTEX_SHADER);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(vs, isWebGL2 ? POST_VERT_300 : POST_VERT_100);
      gl.shaderSource(fs, isWebGL2 ? POST_FRAG_300 : POST_FRAG_100);
      gl.compileShader(vs);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        postFailed = true;
        console.error(gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
        setStatus("Stage effects could not compile on this GPU.");
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return null;
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      if (!isWebGL2) gl.bindAttribLocation(prog, 0, "aPos");
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        postFailed = true;
        setStatus("Stage effects could not link on this GPU.");
        gl.deleteProgram(prog);
        return null;
      }
      postProg = prog;
      postLocs = {
        scene: gl.getUniformLocation(prog, "uScene"),
        hist: gl.getUniformLocation(prog, "uHist"),
        plate: gl.getUniformLocation(prog, "uPlate"),
        feedback: gl.getUniformLocation(prog, "uFeedback"),
        segments: gl.getUniformLocation(prog, "uSegments"),
        strobe: gl.getUniformLocation(prog, "uStrobe"),
        blackout: gl.getUniformLocation(prog, "uBlackout"),
        plateAmt: gl.getUniformLocation(prog, "uPlateAmt"),
        hasPlate: gl.getUniformLocation(prog, "uHasPlate"),
      };
      if (!isWebGL2) {
        postQuad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, postQuad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      }
      return postProg;
    }

    function makeTex(w, h) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return tex;
    }

    function ensureTargets(w, h) {
      if (sceneTex && targetW === w && targetH === h) return true;
      if (sceneTex) gl.deleteTexture(sceneTex);
      if (histTex) gl.deleteTexture(histTex);
      if (sceneFbo) gl.deleteFramebuffer(sceneFbo);
      sceneTex = makeTex(w, h);
      histTex = makeTex(w, h);
      sceneFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, histTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      targetW = w;
      targetH = h;
      return ok;
    }

    function beginScene() {
      if (!effectsActive() || postFailed) return null;
      const w = host.canvas.width | 0;
      const h = host.canvas.height | 0;
      if (w < 2 || h < 2) return null;
      if (!compilePost()) return null;
      if (!ensureTargets(w, h)) return null;
      return { framebuffer: sceneFbo, width: w, height: h };
    }

    function composite() {
      const w = host.canvas.width | 0;
      const h = host.canvas.height | 0;
      if (!postProg || !sceneTex || !histTex || w < 2 || h < 2) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(postProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(postLocs.scene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, histTex);
      gl.uniform1i(postLocs.hist, 1);
      gl.activeTexture(gl.TEXTURE2);
      if (plateTex) gl.bindTexture(gl.TEXTURE_2D, plateTex);
      else gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(postLocs.plate, 2);
      const strobeAmt = reduceMotion.matches ? 0 : strobeGain(env.pulse, el.strobe.value, STROBE_CAP);
      gl.uniform1f(postLocs.feedback, Number(el.feedback.value) || 0);
      gl.uniform1f(postLocs.segments, el.kaleido.value | 0);
      gl.uniform1f(postLocs.strobe, strobeAmt);
      gl.uniform1f(postLocs.blackout, el.strobeMode.value === "black" ? 1 : 0);
      gl.uniform1f(postLocs.plateAmt, plateImage ? clamp01(el.plateAmt.value) : 0);
      gl.uniform1f(postLocs.hasPlate, plateImage ? 1 : 0);
      if (isWebGL2) {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, postQuad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, histTex);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function bandAverage(loHz, hiHz, sampleRate) {
      const nyquist = sampleRate * 0.5;
      const n = freqData.length;
      const i0 = Math.max(0, Math.floor((loHz / nyquist) * n));
      const i1 = Math.min(n - 1, Math.ceil((hiHz / nyquist) * n));
      let sum = 0;
      let count = 0;
      for (let i = i0; i <= i1; i++) {
        sum += freqData[i];
        count += 1;
      }
      return count ? (sum / count) / 255 : 0;
    }

    function follow(key, value, dt) {
      const peak = value > peaks[key] ? value : Math.max(value, peaks[key] * Math.exp(-dt * 0.4));
      peaks[key] = peak;
      return Math.max(0, Math.min(1, value / Math.max(0.045, peak)));
    }

    function analyseLive(dt) {
      if (!live || !analyser || !audioCtx) {
        env.pulse *= Math.exp(-dt * 8);
        return;
      }
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const x = (timeData[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / timeData.length);
      const rate = audioCtx.sampleRate || 48000;
      const bass = bandAverage(20, 160, rate);
      const mid = bandAverage(160, 2000, rate);
      const high = bandAverage(2000, 8000, rate);
      const flux = Math.max(0, bass - prevBass);
      prevBass = bass;
      env.level = follow("level", rms, dt);
      env.bass = follow("bass", bass, dt);
      env.mid = follow("mid", mid, dt);
      env.high = follow("high", high, dt);
      const pulse = Math.max(flux * 6, env.pulse * Math.exp(-dt * 12));
      env.pulse = follow("pulse", pulse, dt);
      const now = nowSec();
      if (flux > 0.045 && env.bass > 0.45 && now - clock.lastOnset > 0.22) {
        clock.lastOnset = now;
        clock.onsets.push(now);
        if (clock.onsets.length > 16) clock.onsets.shift();
        if (now > clock.tapLockUntil) {
          const est = estimateBpm(clock.onsets);
          if (est) setBpm(clock.bpm * 0.85 + est * 0.15, false);
        }
      }
    }

    function paintMeters() {
      const beat = beatNow();
      const frac = beat - Math.floor(beat);
      const lamp = Math.pow(Math.max(0, 1 - frac), 3);
      el.beat.style.opacity = String(0.25 + 0.75 * lamp);
      el.meters.level.style.transform = "scaleX(" + env.level.toFixed(3) + ")";
      el.meters.bass.style.transform = "scaleX(" + env.bass.toFixed(3) + ")";
      el.meters.mid.style.transform = "scaleX(" + env.mid.toFixed(3) + ")";
      el.meters.high.style.transform = "scaleX(" + env.high.toFixed(3) + ")";
      const inPhrase = (Math.floor(Math.max(0, beat)) % 16) + 1;
      el.bpm.textContent = clock.bpm.toFixed(0) + " BPM · " + inPhrase;
    }

    function beforeFrame(dt) {
      if (host.isExportLocked && host.isExportLocked()) return;
      const step = Math.max(0, Math.min(0.1, dt || 0));
      analyseLive(step);
      if (queue && nowSec() >= queue.when) startQueued(queue);
      if (fade) {
        fade.u += step / fade.dur;
        if (fade.u >= 1) {
          commitScene({ name: fade.name, config: fade.to });
        } else {
          updateNext();
        }
      }
      paintMeters();
    }

    function afterFrame() {
      if (!outputWin || outputWin.closed) return;
      const outCanvas = outputWin.document && outputWin.document.getElementById("booth-out");
      if (!outCanvas) return;
      const ctx2d = outCanvas.getContext("2d");
      if (!ctx2d) return;
      const dpr = Math.min(outputWin.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.floor(outputWin.innerWidth * dpr));
      const h = Math.max(2, Math.floor(outputWin.innerHeight * dpr));
      if (outCanvas.width !== w || outCanvas.height !== h) {
        outCanvas.width = w;
        outCanvas.height = h;
      }
      ctx2d.drawImage(host.canvas, 0, 0, w, h);
    }

    async function startLive(deviceId) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("This browser has no audio input.");
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        setStatus("This browser has no Web Audio.");
        return;
      }
      try {
        if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
        const audio = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
        if (deviceId) audio.deviceId = { exact: deviceId };
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio });
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        if (analyser) {
          try { analyser.disconnect(); } catch (_) { /* ignore */ }
        }
        const source = audioCtx.createMediaStreamSource(mediaStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
        live = true;
        el.live.setAttribute("aria-pressed", "true");
        el.live.textContent = "Live on";
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        el.device.innerHTML = "";
        inputs.forEach((d, i) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || ("Input " + (i + 1));
          el.device.appendChild(opt);
        });
        const current = mediaStream.getAudioTracks()[0];
        const currentId = current && current.getSettings ? current.getSettings().deviceId : "";
        if (currentId) el.device.value = currentId;
        el.device.hidden = inputs.length < 2;
        setStatus("Listening. This input is not played back.");
      } catch (err) {
        live = false;
        el.live.setAttribute("aria-pressed", "false");
        el.live.textContent = "Live";
        setStatus(err && err.name === "NotAllowedError"
          ? "Microphone permission was blocked."
          : "Could not open that audio input.");
      }
    }

    function stopLive() {
      live = false;
      if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
      analyser = null;
      el.live.setAttribute("aria-pressed", "false");
      el.live.textContent = "Live";
      setStatus("");
    }

    function tap() {
      const now = nowSec();
      clock.taps.push(now);
      clock.taps = clock.taps.filter((t) => now - t < 4).slice(-8);
      clock.tapLockUntil = now + 8;
      clock.origin = now;
      const est = estimateBpm(clock.taps);
      if (est) clock.bpm = est;
      saveSettings();
      paintMeters();
    }

    function setShow(on) {
      document.body.classList.toggle("booth-show", on);
      el.show.setAttribute("aria-pressed", on ? "true" : "false");
      el.show.textContent = on ? "Exit show" : "Show";
      if (on) {
        dock.hidden = false;
        document.body.classList.add("booth-open");
        const boothBtn = document.getElementById("btn-booth");
        if (boothBtn) boothBtn.setAttribute("aria-pressed", "true");
      }
      if (host.resizeCanvas) host.resizeCanvas();
    }

    function openOutput() {
      if (outputWin && !outputWin.closed) {
        outputWin.focus();
        return;
      }
      outputWin = window.open("", "perlin-booth-output", "popup,width=1280,height=720");
      if (!outputWin) {
        setStatus("Allow pop-ups to open the projector window.");
        return;
      }
      outputWin.document.open();
      outputWin.document.write(
        "<!DOCTYPE html><html><head><title>Perlin output</title><style>" +
        "html,body{margin:0;height:100%;background:#000;overflow:hidden}" +
        "canvas{width:100%;height:100%;display:block;cursor:none}" +
        "#hint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
        "color:#fff;font:13px sans-serif;background:rgba(0,0,0,.55);padding:6px 12px;border-radius:999px}" +
        "</style></head><body><canvas id=\"booth-out\"></canvas>" +
        "<div id=\"hint\">Double-click for fullscreen</div>" +
        "<script>document.body.addEventListener('dblclick',function(){" +
        "if(!document.fullscreenElement) document.documentElement.requestFullscreen();" +
        "else document.exitFullscreen();});" +
        "setTimeout(function(){var h=document.getElementById('hint'); if(h) h.remove();}, 2600);" +
        "</script></body></html>"
      );
      outputWin.document.close();
      setStatus("Drag that window to the projector. OBS can capture it.");
    }

    function onMidi(e) {
      const data = e.data || [];
      const status = data[0] & 0xf0;
      const note = data[1] | 0;
      const vel = data[2] | 0;
      if (status === 0x90 && vel > 0) {
        if (note === 35) tap();
        else if (note >= 36) triggerScene(note - 36, false);
        return;
      }
      if (status === 0xb0) {
        const v = vel / 127;
        if (note === 1) el.amount.value = String(v);
        else if (note === 2) el.feedback.value = String(v * 0.9);
        else if (note === 3) el.kaleido.value = String(1 + Math.round(v * 7));
        else if (note === 4) el.strobe.value = String(v);
        else if (note === 5) el.plateAmt.value = String(v);
        saveSettings();
      }
    }

    async function enableMidi() {
      if (!navigator.requestMIDIAccess) {
        setStatus("This browser has no MIDI. Chrome and Edge do.");
        return;
      }
      try {
        const access = await navigator.requestMIDIAccess();
        const bind = () => {
          access.inputs.forEach((input) => {
            input.onmidimessage = onMidi;
          });
        };
        bind();
        access.onstatechange = bind;
        el.midi.setAttribute("aria-pressed", "true");
        setStatus(access.inputs.size
          ? "MIDI on. Pads from note 36, note 35 taps tempo."
          : "MIDI is on, but no controller was found.");
      } catch (_) {
        setStatus("MIDI permission was blocked.");
      }
    }

    function uploadPlate(file) {
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        plateImage = img;
        if (!plateTex) plateTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, plateTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        el.plateBtn.textContent = "Image on";
        setStatus("The image shows through the bright parts of the field.");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus("Could not read that image.");
      };
      img.src = url;
    }

    document.getElementById("btn-booth").addEventListener("click", () => {
      const open = dock.hidden;
      dock.hidden = !open;
      document.body.classList.toggle("booth-open", open);
      document.getElementById("btn-booth").setAttribute("aria-pressed", open ? "true" : "false");
      if (open) refreshScenes();
      if (!open && document.body.classList.contains("booth-show")) setShow(false);
    });

    el.live.addEventListener("click", () => {
      if (live) stopLive();
      else startLive(el.device.value || "");
    });
    el.device.addEventListener("change", () => {
      if (live) startLive(el.device.value);
    });
    el.tap.addEventListener("click", tap);
    el.quantize.addEventListener("change", saveSettings);
    el.fade.addEventListener("change", saveSettings);
    [el.amount, el.feedback, el.kaleido, el.strobe, el.plateAmt].forEach((input) => {
      input.addEventListener("input", saveSettings);
    });
    el.strobeMode.addEventListener("change", saveSettings);
    el.plateBtn.addEventListener("click", () => el.plateFile.click());
    el.plateFile.addEventListener("change", () => {
      const file = el.plateFile.files && el.plateFile.files[0];
      uploadPlate(file);
      el.plateFile.value = "";
    });
    el.midi.addEventListener("click", enableMidi);
    el.output.addEventListener("click", openOutput);
    el.show.addEventListener("click", () => {
      setShow(!document.body.classList.contains("booth-show"));
    });

    window.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" && document.body.classList.contains("booth-show")) {
        setShow(false);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (dock.hidden && !document.body.classList.contains("booth-show")) return;
      if (e.key === "t" || e.key === "T") {
        tap();
        e.preventDefault();
        return;
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) triggerScene(n - 1, e.shiftKey);
    }, true);

    window.addEventListener("pagehide", () => {
      if (outputWin && !outputWin.closed) outputWin.close();
      stopLive();
    });

    paintMeters();
    refreshScenes();

    window.PerlinBooth.beforeFrame = beforeFrame;
    window.PerlinBooth.afterFrame = afterFrame;
    window.PerlinBooth.frameParams = frameParams;
    window.PerlinBooth.beginScene = beginScene;
    window.PerlinBooth.composite = composite;
    window.PerlinBooth.refreshScenes = refreshScenes;
  }

  window.PerlinBooth = window.PerlinBooth || {};
  window.PerlinBooth.init = init;
}
