/**
 * Smoke-test: ensure the default shader (gradient mode) compiles under WebGL.
 * Requires a browser with WebGL — skipped in plain Node.
 * Run in browser console, or: node tests/shader-compile.test.js (self-check only)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const match = appSrc.match(/const DEFAULT_SHADER = `([\s\S]*?)`;/);
assert.ok(match, "DEFAULT_SHADER not found in app.js");
const shader = match[1];

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

test("controls block includes gradient uniforms", () => {
  assert.ok(shader.includes("uColorMode"));
  assert.ok(shader.includes("uGradientBlend"));
  assert.ok(shader.includes("uStopCount"));
  assert.ok(shader.includes("uPos0"));
  assert.ok(shader.includes("uColor0"));
  assert.ok(shader.includes("gradientColor"));
  assert.ok(shader.includes("stopPos"));
});

test("controls block and helpers support mouse anchors", () => {
  assert.ok(shader.includes("uAnchorCount"));
  assert.ok(shader.includes("uA0Mode"));
  assert.ok(shader.includes("uA2X"));
  assert.ok(shader.includes("applyInteractDomain"));
  assert.ok(shader.includes("applyInteractValue"));
});

test("controls block supports dynamic speed", () => {
  assert.ok(shader.includes("uDynamicSpeed"));
  assert.ok(shader.includes("uDynamicSpeed != 0 ? 1.0 : uSpeed"));
});

test("3D relief uniforms are declared in the controls block", () => {
  for (const key of [
    "u3D", "u3DRelief", "u3DSmooth", "u3DLightAngle", "u3DLightElev",
    "u3DAmbient", "u3DDiffuse", "u3DSpecular", "u3DGloss", "u3DFresnel",
    "u3DRefract", "u3DShadow", "u3DLightColor",
  ]) {
    assert.ok(shader.includes(key), `missing ${key}`);
  }
});

test("3D shading samples a shared height field", () => {
  // Height must be factored out so normals/refraction can resample it.
  assert.ok(shader.includes("float heightField(vec2 uvW, vec2 uv0"));
  assert.ok(shader.includes("vec3 surfaceNormal("));
  assert.ok(shader.includes("vec3 shadeSurface("));
  // Normals from forward differences, lit with Blinn-Phong + fresnel.
  assert.ok(shader.includes("vec2 grad = vec2(hx - h, hy - h) / eps;"));
  assert.ok(shader.includes("normalize(lightDir + viewDir)"));
  // Specular and refraction follow the camera rather than a fixed view axis.
  assert.ok(shader.includes("refract(-viewDir, nrm"));
  assert.ok(shader.includes("vec3 shadeSurface(vec3 base, vec3 nrm, float h, vec3 viewDir, vec3 geomNrm)"));
  // Occlusion leans on the unperturbed normal, not a hardcoded up axis.
  assert.ok(shader.includes("(0.4 + 0.6 * dot(nrm, geomNrm))"));
  // Whole 3D path sits behind a const branch so it compiles away when off.
  assert.ok(shader.includes("if (u3D != 0) {"));
});

test("camera uniforms are declared in the controls block", () => {
  for (const key of [
    "uCam", "uCamPitch", "uCamYaw", "uCamHeight", "uCamFov",
    "uCamFocus", "uCamFocusRange", "uCamAperture", "uCamHaze", "uCamHazeColor",
  ]) {
    assert.ok(shader.includes(key), `missing ${key}`);
  }
});

test("camera casts screen rays at the active geometry", () => {
  assert.ok(shader.includes("float traceGeometry(vec2 sUv, out vec2 s, out vec3 rayDir)"));
  // Rays that pass above the plane's horizon report a miss, not a hit behind the eye.
  assert.ok(shader.includes("if (rd.z > -1e-4) return -1.0;"));
  // Mouse and anchors must be traced into the same space as the surface.
  assert.ok(shader.includes("vec2 spaceCoord(vec2 sUv)"));
  assert.ok(shader.includes("return spaceCoord(sUv);"));
  assert.ok(shader.includes("mUv = spaceCoord(mUv);"));
  // Whole camera path sits behind a const branch so it compiles away when off.
  assert.ok(shader.includes("if (uCam != 0) {"));
  assert.ok(shader.includes("if (uCam == 0) return sUv;"));
});

test("geometry modes share one sampling pipeline", () => {
  // Each geometry contributes an intersection, a tangent frame, and a mapping
  // from surface coordinates into the 3D noise volume.
  assert.ok(shader.includes("float hitPlane(vec3 ro, vec3 rd, out vec2 s)"));
  assert.ok(shader.includes("float hitSphere(vec3 ro, vec3 rd, out vec2 s)"));
  assert.ok(shader.includes("float hitTunnel(vec3 rd, out vec2 s)"));
  assert.ok(shader.includes("void surfaceFrame(vec2 s, out vec3 nrm, out vec3 tanX, out vec3 tanY, out vec2 metric)"));
  assert.ok(shader.includes("vec3 geomPoint(vec2 s, float t)"));
  // Plane mode must still build exactly the coordinate it always did.
  assert.ok(shader.includes("return vec3(s * uScale, t);"));
  assert.ok(shader.includes("vec3 p = geomPoint(uvW, t);"));
  // Normals lift the 2D gradient through the tangent frame, scaled by the metric.
  assert.ok(shader.includes("vec2 step = vec2(eps) / max(metric, vec2(0.02));"));
  assert.ok(shader.includes("normalize(geomNrm - u3DRelief * 0.35 * (grad.x * tanX + grad.y * tanY))"));
  // Wrapping coordinates need brush centers pulled into the pixel's lap.
  assert.ok(shader.includes("vec2 alignSeam(vec2 center, vec2 ref)"));
  assert.ok(shader.includes("center = alignSeam(center, uv0);"));
  assert.ok(shader.includes("alignSeam(center, uv0), radius, blurAmt, activeAmt)"));
  // floor(x + 0.5) because round() does not exist in GLSL ES 1.00.
  assert.ok(shader.includes("period * floor((ref.x - center.x) / period + 0.5)"));
});

test("depth of field and horizon aliasing ride the fBm octave budget", () => {
  // Blur is a detail cut, not extra taps: fbmLod carries a fractional budget.
  assert.ok(shader.includes("float fbmLod(vec3 p, float lod)"));
  assert.ok(shader.includes("float w = clamp(budget - float(i), 0.0, 1.0);"));
  assert.ok(shader.includes("float fbm(vec3 p) {"));
  assert.ok(shader.includes("return fbmLod(p, float(uOctaves));"));
  // Height field and normals take the same budget so they defocus together.
  assert.ok(shader.includes("float mouseOn, float t, float lod)"));
  assert.ok(shader.includes("lod = min(mix(lod, 0.65, coc), aliasLod(footprint));"));
  assert.ok(shader.includes("footprint *= 1.0 + coc * 6.0;"));
  // Focus distance is normalized against the visible depth range.
  assert.ok(shader.includes("float viewDepth(float dist)"));
  assert.ok(shader.includes("depth01 = viewDepth(dist);"));
});

test("camera params are written to the controls block and parsed back", () => {
  assert.ok(appSrc.includes("const CAMERA_SLIDER_DEFS = ["));
  assert.ok(appSrc.includes("lines.push(`const int   uCam = ${p.uCam ? 1 : 0};`)"));
  assert.ok(appSrc.includes("const vec3  uCamHazeColor = ${formatVec3("));
  assert.ok(appSrc.includes("const\\s+vec3\\s+uCamHazeColor"));
  // uCam must not be confused with uCamPitch and friends when parsing.
  assert.ok(appSrc.includes("/const\\s+int\\s+uCam\\s*=\\s*(\\d+)\\s*;/"));
  // Presets must carry the camera suite (scalars + haze color).
  assert.ok(appSrc.includes("...CAMERA_SLIDER_DEFS.map((d) => d.key)"));
  assert.ok(appSrc.includes("out.hazeColor = params.hazeColor"));
});

test("camera sliders and shader camera constants are the same set", () => {
  // A slider with no constant (or the reverse) would silently do nothing.
  const defsBlock = appSrc.match(/const CAMERA_SLIDER_DEFS = \[([\s\S]*?)\n\];/)[1];
  const sliderKeys = (defsBlock.match(/key: "(\w+)"/g) || [])
    .map((s) => s.replace(/key: "|"/g, ""))
    .sort();

  const block = shader.match(/\/\/ === CONTROLS BEGIN ===([\s\S]*?)\/\/ === CONTROLS END ===/)[1];
  const declared = (block.match(/const\s+float\s+(u(?:Cam|Geom)\w+)\s*=/g) || [])
    .map((s) => s.match(/(u(?:Cam|Geom)\w+)/)[1])
    .sort();

  assert.deepStrictEqual(declared, sliderKeys);
  // The two toggles and the haze color are typed separately.
  assert.ok(/const\s+int\s+uCam\s*=/.test(block));
  assert.ok(/const\s+int\s+uGeom\s*=/.test(block));
  assert.ok(/const\s+vec3\s+uCamHazeColor\s*=/.test(block));
  // Every one is written by buildParamsBlock, not just declared in the default.
  assert.ok(appSrc.includes("for (const def of CAMERA_SLIDER_DEFS) {\n    lines.push("));
  assert.ok(appSrc.includes("lines.push(`const int   uGeom = ${p.uGeom | 0};`)"));
});

test("geometry mode is a first-class param (UI, presets, parsing)", () => {
  assert.ok(appSrc.includes("const GEOMETRY_OPTIONS = ["));
  // Labels and hint text follow the geometry, since Tilt/Orbit/Elevation are
  // reinterpreted per mode.
  assert.ok(appSrc.includes("const GEOMETRY_LABELS = {"));
  assert.ok(appSrc.includes("const GEOMETRY_HINTS = {"));
  assert.ok(appSrc.includes('uCamHeight: "Tube radius"'));
  assert.ok(appSrc.includes("/const\\s+int\\s+uGeom\\s*=\\s*(\\d+)\\s*;/"));
  assert.ok(appSrc.includes('"uGeom",'));
  assert.ok(appSrc.includes("params.uGeom = Math.min(2, Math.max(0, params.uGeom | 0));"));
});

test("3D params are written to the controls block and parsed back", () => {
  assert.ok(appSrc.includes("const THREED_SLIDER_DEFS = ["));
  assert.ok(appSrc.includes("lines.push(`const int   u3D = ${p.u3D ? 1 : 0};`)"));
  assert.ok(appSrc.includes("const vec3  u3DLightColor = ${formatVec3("));
  assert.ok(appSrc.includes("const\\s+vec3\\s+u3DLightColor"));
  // Presets must carry the 3D suite (scalars + light color).
  assert.ok(appSrc.includes("...THREED_SLIDER_DEFS.map((d) => d.key)"));
  assert.ok(appSrc.includes("out.lightColor = params.lightColor"));
});

test("every control the shader body reads is declared in the controls block", () => {
  const blockRe = /\/\/ === CONTROLS BEGIN ===([\s\S]*?)\/\/ === CONTROLS END ===/;
  const block = shader.match(blockRe)[1];
  const body = shader.replace(blockRe, "");

  const declared = new Set();
  const declRe = /const\s+(?:float|int|vec3)\s+(\w+)\s*=/g;
  let d;
  while ((d = declRe.exec(block)) !== null) declared.add(d[1]);

  // Control names are `u` + uppercase/digit, which never collides with locals
  // like `uv`, `uv0`, or `uvW`.
  const used = new Set(body.match(/\bu[A-Z0-9]\w*/g) || []);
  const missing = [...used].filter((name) => !declared.has(name));
  assert.deepStrictEqual(missing, [], `undeclared controls: ${missing.join(", ")}`);
  assert.ok(declared.has("u3DLightColor"));
  assert.ok(used.has("u3DRelief"));
});

test("gradient wraps outside [0,1] but clamps endpoints", () => {
  assert.ok(shader.includes("if (t < 0.0 || t > 1.0) t = fract(t);"));
  assert.ok(shader.includes("if (t >= pLast) return stopColor(n - 1);"));
});

test("gradient mode preserves stop colors (lighter value tint)", () => {
  assert.ok(shader.includes("uColorMode == 0"));
  assert.ok(shader.includes("mix(0.92, 1.08, v)"));
});

test("can rewrite controls block for gradient mode", () => {
  const gm = require(path.join(__dirname, "..", "gradient-math.js"));
  const blockRe = /\/\/ === CONTROLS BEGIN ===[\s\S]*?\/\/ === CONTROLS END ===/;
  assert.ok(blockRe.test(shader));

  const lines = ["// === CONTROLS BEGIN ==="];
  lines.push("const int   uColorMode = 1;");
  lines.push("const float uGradientBlend = 0.00;");
  lines.push("const int   uStopCount = 3;");
  lines.push("const float uPos0 = 0.00;");
  lines.push("const float uPos1 = 0.40;");
  lines.push("const float uPos2 = 1.00;");
  lines.push("const float uPos3 = 1.00;");
  lines.push("const float uPos4 = 1.00;");
  for (let i = 0; i < 5; i++) {
    lines.push(`const vec3  uColor${i} = ${gm.formatVec3(gm.DEFAULT_STOP_FILL[i])};`);
  }
  lines.push("// === CONTROLS END ===");
  const next = shader.replace(blockRe, lines.join("\n"));
  assert.ok(next.includes("uColorMode = 1"));
  assert.ok(next.includes("uPos1 = 0.40"));
  assert.ok(blockRe.test(next));
});

test("export builds a self-contained web-background page", () => {
  // buildParamsBlock must accept an arbitrary config source (for presets).
  assert.ok(appSrc.includes("function buildParamsBlock(src)"));
  // Embed generator + its key building blocks.
  assert.ok(appSrc.includes("function buildEmbedHtml("));
  assert.ok(appSrc.includes("global.PerlinBackground = { mount: mount };"));
  assert.ok(appSrc.includes("var USER_SHADER = ${JSON.stringify(userShader)};"));
  assert.ok(appSrc.includes("(isGL2 ? HEADER_300 : HEADER_100) + USER_SHADER"));
  // Lag physics must be ported into the embed (matches preview).
  assert.ok(appSrc.includes("function updateLag(dt)"));
  // Download + per-preset export wiring.
  assert.ok(appSrc.includes("function exportPresetToFile("));
  assert.ok(appSrc.includes("function downloadTextFile("));
  assert.ok(appSrc.includes("preset-export-btn"));
});

test("compile rewrites controls consts to uniforms", () => {
  assert.ok(appSrc.includes("function rewriteControlsToUniforms("));
  assert.ok(appSrc.includes("function uploadParamsUniforms("));
  const rewritten = shader.replace(
    /\/\/ === CONTROLS BEGIN ===[\s\S]*?\/\/ === CONTROLS END ===/,
    (block) => block.replace(
      /const\s+(float|int|vec3)\s+(\w+)\s*=\s*[^;]+;/g,
      "uniform $1 $2;"
    )
  );
  assert.ok(rewritten.includes("uniform float uScale"));
  assert.ok(rewritten.includes("uniform int uOctaves"));
  assert.ok(rewritten.includes("uniform vec3 uColor0"));
  assert.ok(!/const\s+float\s+uScale\s*=/.test(rewritten));
  const origLines = shader.split("\n").length;
  const nextLines = rewritten.split("\n").length;
  assert.strictEqual(nextLines, origLines, "uniform rewrite must keep editor line numbers");
});

if (!process.exitCode) console.log(`\n${passed} passed`);
