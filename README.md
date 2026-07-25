# Perlin Noise — Shadertoy Simulator

A single-page, Shadertoy-style live GLSL editor with a real-time WebGL preview, preloaded with an animated Perlin noise (fBm) shader.

## Run it

No build step required. Either open `index.html` directly in a browser, or (recommended, avoids any CDN/file quirks) serve the folder:

```bash
cd "Perlin Noise"
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

An internet connection is needed on first load for the CodeMirror editor (loaded from a CDN).

## Usage

- Edit the GLSL code in the left pane, then press **Cmd/Ctrl + Enter** or click **Run** to recompile.
- Compile errors appear in a console strip below the editor with line numbers, and the offending lines are highlighted. The last working shader keeps rendering while you fix errors.
- Toolbar under the preview: rewind (reset time), play/pause, controls toggle, fullscreen, elapsed time, FPS, and render resolution.
- **Fullscreen:** Click the fullscreen button (⧎) in the toolbar to hide everything but the rendered shader. Press **Esc** to return to the normal editor view.
- Use the **Controls** panel (gear icon) to live-tweak noise and color. Each change rewrites the `// === CONTROLS BEGIN ===` block in the editor and recompiles immediately.
- **Dynamic speed:** Under Noise, toggle it on to drive the animation rate from pointer velocity instead of the Speed slider — 0 when the pointer is still, up to 2 when it moves quickly (mouse or finger drag).
- **3D & Lighting:** Toggle **3D relief** to treat the noise as a heightfield. Surface normals come from finite differences of that field and are lit with a Blinn-Phong model:
  - *Relief* — height exaggeration (how steep the surface reads).
  - *Smoothing* — width of the differencing step; raise it to average out high-frequency octaves and stop the relief from looking grainy.
  - *Light angle / Light pitch* — direction of the light in degrees (azimuth around the surface, elevation above it).
  - *Ambient / Diffuse* — fill light and directional response.
  - *Specular / Gloss* — highlight strength and tightness.
  - *Fresnel rim* — grazing-angle rim light.
  - *Refraction* — bends the view ray through the surface and resamples the field, splitting the color channels for a glassy dispersion.
  - *Occlusion* — darkens valleys and steep flanks.
  - *Light color* — tint applied to the diffuse, specular, and rim terms.

  3D shading resamples the height field two extra times per pixel (three with Refraction), so it costs several extra fBm evaluations. Because the controls are `const`, the entire 3D path compiles away while the toggle is off. Watch the FPS readout if you raise Octaves alongside it.
- **Camera:** Toggle **Perspective** to stop sampling the noise in screen space and instead cast a ray per pixel at the noise plane, so the field recedes into the distance like ground:
  - *Tilt* — viewing angle, from 0° (straight down, identical to the flat view) to 88° (grazing the horizon). Past `tilt + half the field of view > 90°` the horizon enters frame and the sky above it fills with the haze color.
  - *Orbit* — rotates the plane under the camera.
  - *Elevation* — how high the camera sits, which sets how much ground is in frame. The center of the screen always stays on the origin, so Tilt and Orbit pivot around it rather than drifting.
  - *Field of view* — wide angles exaggerate the perspective, narrow ones flatten it toward an orthographic look.
  - *Focus distance / Focus range* — where the sharp band sits and how deep it is, measured 0 (nearest visible) to 1 (farthest visible). The mapping is normalized to what is actually on screen, so the same setting means the same thing at every tilt.
  - *Aperture* — how much detail defocused depths lose. Blur here is a low-pass on the fractal rather than a multi-tap gather: out-of-focus pixels drop fBm octaves, so it costs nothing extra to render. It softens texture and relief convincingly, but it will not produce bokeh highlights.
  - *Depth fade / Haze color* — blends distance into an atmospheric color, which also fills the sky above the horizon. Defaults to the panel background so the field dissolves into the page.

  Mouse effects and anchors are projected onto the plane too, so a brush lands where you point and stretches with perspective as it recedes. Distance also drives an automatic detail limit: pixels covering more ground drop octaves, which keeps the horizon from shimmering (and makes deep tilts cheaper, not costlier).
- **Mouse interactions:** In Controls → Mouse, set Hover interact to Ripple, Swirl, Magnify, Paint, or Pinch, then move over the preview. Adjust radius, blur (edge softness), and strength. Lag style (None / Smooth / Sine / Elastic) trails the effect behind the cursor — raise Lag amount for a heavier follow.
- **Anchors:** Under Mouse → Anchors, add up to 3 fixed pseudo-mouse effects that run alongside the live cursor. Each has its own mode, X/Y, radius, blur, and strength. Use **Place** then click the preview to set position (or drag the X/Y sliders).
- **Presets:** At the top of the Controls panel, name the current configuration and click **Save** to store it (noise, mouse, color, gradient stops, and anchors — all of it). Saved presets are listed below; click a name to load it or the **×** to delete it. Presets persist in your browser via `localStorage`.
- **Export as a web background:** Click the **⤓** button on any saved preset to download a self-contained, dependency-free `*-background.html` file. Open it to see the shader filling a full-page hero element. To drop it into your own site, copy the generated `<script>` and call `PerlinBackground.mount(el)` on any element that has `position: relative; overflow: hidden;` and a height — the animated canvas mounts behind your content (`pointer-events` pass through), auto-resizes, honors `prefers-reduced-motion`, and returns `{ canvas, pause(), play(), destroy() }`. Mouse/lag interactions are baked in and track the pointer over that element.
- Drag on the canvas to feed `iMouse` (the default shader shows a spotlight while dragging).
- Drag the vertical divider to resize the panes.
- **On phones and tablets:** the layout collapses to **Preview / Code** tabs with the Controls panel as a bottom sheet. Dragging a finger across the preview drives the hover interactions and dynamic speed exactly like moving a mouse does on desktop.

## Shader model (Shadertoy-compatible)

Write an entry point of the form:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord)
```

Available uniforms:

| Uniform | Type | Meaning |
| --- | --- | --- |
| `iResolution` | `vec3` | Viewport resolution in pixels (z = 1) |
| `iTime` | `float` | Playback time in seconds |
| `iTimeDelta` | `float` | Time since last frame |
| `iFrame` | `int` | Frame counter |
| `iMouse` | `vec4` | xy = drag position, zw = click position (negative when button is up) |

The default shader also declares adjustable `const` parameters inside a marked Controls block (`uScale`, `uSpeed`, `uOctaves`, and so on). The Controls panel keeps that block in sync with the sliders.

The app uses WebGL2 (GLSL ES 3.00) when available and falls back to WebGL1 (GLSL ES 1.00) otherwise.

## Default shader

The preloaded shader implements classic 3D gradient (Perlin) noise with a permutation-free hash, combines 5 octaves as fractal Brownian motion, animates it by slicing through `z = time`, adds domain warping for swirl, and maps the result through a cosine color palette.

Noise, interactions, and tone mapping are factored into `heightField()`, which is the single source of truth for the surface. `surfaceNormal()` samples it at neighboring points to build normals, and `shadeSurface()` lights them — so mouse effects and anchors automatically show up in the 3D relief.

With the camera on, `planeProject()` turns each pixel into a ray and intersects the plane `z = 0`, whose `xy` is the noise domain; `spaceCoord()` puts the mouse and anchors through the same mapping. Both the octave budget passed to `fbmLod()` and the differencing step used for normals scale with `pixelFootprint()`, which is how depth of field and horizon anti-aliasing are expressed without extra samples.

## Tests

```bash
node tests/gradient.test.js
node tests/shader-compile.test.js
```

Both run in plain Node and check the gradient math plus the structure of the default shader.

Two browser pages cover what Node cannot. Serve the folder, then open:

- `tests/shader-compile.test.html` — builds the shader against live WebGL2 and WebGL1 contexts across a dozen control combinations (3D, refraction, camera tilts, depth of field, gradient mode, interactions) and prints any driver logs.
- `tests/camera-render.test.html` — renders a frame per camera setting so the perspective, focus, and horizon can be eyeballed side by side, then checks the pixels for the properties each control should produce (tilt 0 stays flat, perspective compresses detail with distance, moving the focal plane trades sharpness between near and far, depth fade darkens the distance, orbit changes the sampled slice).

Both share `tests/shader-harness.js`, which pulls the shader sources straight out of `app.js` and rewrites control constants the way the Controls panel does.
