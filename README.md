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
- Use the **Controls** panel (gear icon) to live-tweak noise and color. Each change rewrites the `// === CONTROLS BEGIN ===` block in the editor and recompiles immediately. The panel is grouped into collapsible sections — Presets, Noise, 3D & Lighting, Camera, Mouse & Anchors, Color — and each collapsed header shows a live summary of what is active inside (for example `Camera · sphere`). Which sections you keep open persists across visits.
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
- **Camera:** Toggle **Perspective** to stop sampling the noise in screen space and instead cast a ray per pixel at a surface, so the field has real depth:
  - *Geometry* — **Plane** (ground receding to a horizon), **Sphere** (a planet), or **Tunnel** (the inside of a tube). Because the noise is already 3D, the sphere and tunnel are sampled in the volume at each surface point rather than texture-mapped, so the pattern has no seams and no polar pinching.
  - *Field of view* — wide angles exaggerate the perspective, narrow ones flatten it toward an orthographic look.
  - *Focus distance / Focus range* — where the sharp band sits and how deep it is, measured 0 (nearest visible) to 1 (farthest visible). The mapping is normalized to what is actually on screen, so the same setting means the same thing at every tilt and in every geometry.
  - *Aperture* — how much detail defocused depths lose. Blur here is a low-pass on the fractal rather than a multi-tap gather: out-of-focus pixels drop fBm octaves, so it costs nothing extra to render. It softens texture and relief convincingly, but it will not produce bokeh highlights.
  - *Depth fade / Haze color* — blends distance into an atmospheric color, which also fills the sky wherever a ray misses the surface. Defaults to the panel background so the field dissolves into the page.
  - *Spin / travel* — spins the sphere like a planet, or flies you along the tunnel. It scales with Speed, so Speed 0 stops everything. On the plane it does nothing.

  The three aiming sliders are reinterpreted per geometry, and the panel relabels them to match:

  | | Plane | Sphere | Tunnel |
  | --- | --- | --- | --- |
  | first | *Tilt* — 0° straight down (identical to the flat view) to 88° grazing the horizon | *View latitude* — 0° at the equator to 88° over the pole | *Look off-axis* — 0° straight down the tube, higher swings toward the wall |
  | second | *Orbit* — rotates the plane under the camera | *Longitude* — orbits around the globe | *Roll* — rotates around the tube axis |
  | third | *Elevation* — camera height, which sets how much ground is in frame | *Distance* — how far out the orbit sits | *Tube radius* — how wide the tube is, and so how much pattern wraps around you |

  Everything downstream works off the surface hit rather than the screen, so it all carries over: mouse and anchor brushes land where you point (wrapping correctly across the sphere's date line and around the tunnel), relief and lighting use the surface's own tangent frame so a lit sphere gets a day/night terminator, and depth of field measures from the geometry's own near and far limits. Distance drives an automatic detail limit as well: pixels covering more surface drop octaves, which keeps the horizon and the tunnel's vanishing point from shimmering, and makes deep views cheaper rather than costlier.

  One honest limitation: relief shades the surface without displacing it, so a sphere's silhouette stays a clean circle no matter how high Relief goes. It reads as a cloud-covered world rather than a cratered moon.
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

With the camera on, `traceGeometry()` turns each pixel into a ray and intersects the active geometry, and the hit becomes a pair of surface coordinates: position on the plane, longitude/latitude on the sphere, or arc length and depth in the tunnel. `geomPoint()` maps those coordinates into the 3D point the noise is sampled at (which is where spin and travel ride), `surfaceFrame()` supplies the normal, tangents, and metric that let one gradient calculation light every geometry, and `spaceCoord()` puts the mouse and anchors through the same trace. Adding a geometry means adding an intersection, a frame, and a sample mapping — nothing downstream of `heightField()` changes.

Both the octave budget passed to `fbmLod()` and the differencing step used for normals scale with `pixelFootprint()`, which is how depth of field and distance anti-aliasing are expressed without extra samples. The budget is allowed to reach zero octaves, so at a horizon or a vanishing point — where one pixel can span more than the base wavelength — the field resolves to its own average instead of aliasing.

## Tests

```bash
node tests/gradient.test.js
node tests/shader-compile.test.js
```

Both run in plain Node and check the gradient math plus the structure of the default shader.

Two browser pages cover what Node cannot. Serve the folder, then open:

- `tests/shader-compile.test.html` — builds the shader against live WebGL2 and WebGL1 contexts across a dozen control combinations (3D, refraction, camera tilts, depth of field, all three geometries, gradient mode, interactions) and prints any driver logs.
- `tests/camera-render.test.html` — renders a frame per camera and geometry setting so they can be eyeballed side by side, then checks the pixels for the properties each control should produce: tilt 0 stays flat, perspective compresses detail with distance, moving the focal plane trades sharpness between near and far, depth fade darkens the distance, orbit changes the sampled slice, the sphere leaves sky in the corners and shades unevenly across a terminator, and the tunnel's detail collapses at the vanishing point while travel (and only travel) moves its wall.

Both share `tests/shader-harness.js`, which pulls the shader sources straight out of `app.js` and rewrites control constants the way the Controls panel does. It renders every variant through one shared WebGL context, since browsers keep only about 16 alive and silently drop the oldest.
