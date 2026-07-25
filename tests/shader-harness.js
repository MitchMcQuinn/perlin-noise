/**
 * Shared browser test harness: pulls the shader sources straight out of app.js
 * and compiles / renders them against real WebGL contexts, the same way the app
 * does. Used by shader-compile.test.html and camera-render.test.html.
 */

"use strict";

window.ShaderHarness = (function () {
  /** Pull a template-literal constant out of app.js source text. */
  function extractLiteral(src, name) {
    const m = src.match(new RegExp("const " + name + " = `([\\s\\S]*?)`;"));
    if (!m) throw new Error(`could not find ${name} in app.js`);
    return m[1];
  }

  /** Rewrite one `const <type> <name> = <value>;` line inside the controls block. */
  function setConst(shader, name, value) {
    const re = new RegExp("(const\\s+(?:float|int|vec3)\\s+" + name + "\\s*=\\s*)[^;]+;");
    if (!re.test(shader)) throw new Error(`no const named ${name}`);
    return shader.replace(re, `$1${value};`);
  }

  /** Apply a { constName: glslValue } map, as the Controls panel would. */
  function withConsts(shader, pairs) {
    return Object.keys(pairs).reduce((s, k) => setConst(s, k, pairs[k]), shader);
  }

  /** Fetch app.js and slice out the shader wrapper pieces plus DEFAULT_SHADER. */
  async function loadSources(appUrl) {
    const src = await fetch(appUrl || "../app.js", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    const names = [
      "VERT_SRC_300", "VERT_SRC_100",
      "HEADER_300", "FOOTER_300", "HEADER_100", "FOOTER_100",
    ];
    const parts = {};
    for (const n of names) parts[n] = extractLiteral(src, n);
    return { src, parts, shader: extractLiteral(src, "DEFAULT_SHADER") };
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return {
      ok: gl.getShaderParameter(sh, gl.COMPILE_STATUS),
      log: gl.getShaderInfoLog(sh) || "",
      shader: sh,
    };
  }

  /** Compile + link the wrapped user shader, mirroring buildProgram() in app.js. */
  function buildProgram(gl, isGL2, parts, userShader) {
    const vertSrc = isGL2 ? parts.VERT_SRC_300 : parts.VERT_SRC_100;
    const fragSrc = (isGL2 ? parts.HEADER_300 : parts.HEADER_100)
      + userShader
      + (isGL2 ? parts.FOOTER_300 : parts.FOOTER_100);

    const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    let result;

    if (!vs.ok) {
      result = { ok: false, log: "vertex shader: " + vs.log };
    } else if (!fs.ok) {
      result = { ok: false, log: fs.log };
    } else {
      const prog = gl.createProgram();
      gl.attachShader(prog, vs.shader);
      gl.attachShader(prog, fs.shader);
      if (!isGL2) gl.bindAttribLocation(prog, 0, "aPos");
      gl.linkProgram(prog);
      const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
      result = ok
        ? { ok: true, log: "", program: prog }
        : { ok: false, log: gl.getProgramInfoLog(prog) || "link failed" };
      if (!ok) gl.deleteProgram(prog);
    }

    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);
    return result;
  }

  /** Same as buildProgram but drops the program: for compile-only checks. */
  function checkProgram(gl, isGL2, parts, userShader) {
    const res = buildProgram(gl, isGL2, parts, userShader);
    if (res.program) gl.deleteProgram(res.program);
    return { ok: res.ok, log: res.log };
  }

  /**
   * Draw one frame of a shader variant into `canvas` and read it back.
   * Returns { ok, log, pixels, width, height } with pixels as RGBA rows going
   * bottom-to-top, matching gl_FragCoord.
   */
  function renderFrame(canvas, parts, userShader, opts) {
    const o = opts || {};
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })
      || canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { ok: false, log: "no WebGL context" };
    const isGL2 = typeof WebGL2RenderingContext !== "undefined"
      && gl instanceof WebGL2RenderingContext;

    const built = buildProgram(gl, isGL2, parts, userShader);
    if (!built.ok) return { ok: false, log: built.log };

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(built.program);
    gl.uniform3f(gl.getUniformLocation(built.program, "iResolution"),
      canvas.width, canvas.height, 1);
    gl.uniform1f(gl.getUniformLocation(built.program, "iTime"), o.time === undefined ? 8 : o.time);
    gl.uniform1f(gl.getUniformLocation(built.program, "iTimeDelta"), 1 / 60);
    const frameLoc = gl.getUniformLocation(built.program, "iFrame");
    if (frameLoc) gl.uniform1i(frameLoc, 60);
    const m = o.mouse || [-1, -1, -1, -1];
    gl.uniform4f(gl.getUniformLocation(built.program, "iMouse"), m[0], m[1], m[2], m[3]);

    let buf = null;
    if (!isGL2) {
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    if (buf) gl.deleteBuffer(buf);
    gl.deleteProgram(built.program);
    const err = gl.getError();
    return {
      ok: err === gl.NO_ERROR,
      log: err === gl.NO_ERROR ? "" : `gl error 0x${err.toString(16)}`,
      pixels,
      width: canvas.width,
      height: canvas.height,
      isGL2,
    };
  }

  /** Mean luma and its standard deviation over a horizontal band of the frame. */
  function bandStats(frame, y0Frac, y1Frac) {
    const y0 = Math.floor(y0Frac * frame.height);
    const y1 = Math.min(frame.height, Math.ceil(y1Frac * frame.height));
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < frame.width; x++) {
        const i = (y * frame.width + x) * 4;
        const luma = (0.299 * frame.pixels[i] + 0.587 * frame.pixels[i + 1]
          + 0.114 * frame.pixels[i + 2]) / 255;
        sum += luma;
        sumSq += luma * luma;
        n += 1;
      }
    }
    const mean = sum / n;
    return { mean, sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  }

  /**
   * Mean absolute difference between horizontally adjacent pixels: a cheap
   * measure of how much fine detail survives in a band. Blur and perspective
   * compression both drive it down.
   */
  function bandDetail(frame, y0Frac, y1Frac) {
    const y0 = Math.floor(y0Frac * frame.height);
    const y1 = Math.min(frame.height, Math.ceil(y1Frac * frame.height));
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 1; x < frame.width; x++) {
        const i = (y * frame.width + x) * 4;
        const j = i - 4;
        sum += (Math.abs(frame.pixels[i] - frame.pixels[j])
          + Math.abs(frame.pixels[i + 1] - frame.pixels[j + 1])
          + Math.abs(frame.pixels[i + 2] - frame.pixels[j + 2])) / (3 * 255);
        n += 1;
      }
    }
    return sum / n;
  }

  return {
    extractLiteral,
    setConst,
    withConsts,
    loadSources,
    buildProgram,
    checkProgram,
    renderFrame,
    bandStats,
    bandDetail,
  };
})();
