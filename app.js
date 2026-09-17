/* Perlin Noise — Shadertoy Simulator
 *
 * Shadertoy-compatible model: the user writes
 *   void mainImage(out vec4 fragColor, in vec2 fragCoord)
 * and we wrap it with a header (uniforms) and a footer (real main()).
 */

"use strict";

/* ============================================================
 * Default shader: animated Perlin noise (fBm)
 * ============================================================ */

const DEFAULT_SHADER = `// Animated Perlin noise (fBm)
// Classic gradient noise, 3D, sliced through z = time.
// The Controls panel rewrites the block below. Values are uploaded as uniforms.
// You can also edit values by hand, then press Cmd/Ctrl+Enter.

// === CONTROLS BEGIN ===
const float uScale = 3.0;
const float uSpeed = 0.25;
const int   uDynamicSpeed = 0;
const int   uOctaves = 5;
const float uLacunarity = 2.02;
const float uGain = 0.50;
const float uWarp = 1.50;
const float uContrast = 1.00;
const float uBrightness = 0.00;
const float uVignette = 1.00;
const int   uMouseInteract = 0;
const float uMouseRadius = 0.35;
const float uMouseStrength = 0.55;
const float uMouseBlur = 0.55;
const int   uMouseLagMode = 0;
const float uMouseLag = 0.45;
const int   uAnchorCount = 0;
const int   uA0Mode = 0;
const float uA0Radius = 0.35;
const float uA0Blur = 0.55;
const float uA0Strength = 0.55;
const float uA0X = 0.50;
const float uA0Y = 0.50;
const int   uA1Mode = 0;
const float uA1Radius = 0.35;
const float uA1Blur = 0.55;
const float uA1Strength = 0.55;
const float uA1X = 0.25;
const float uA1Y = 0.50;
const int   uA2Mode = 0;
const float uA2Radius = 0.35;
const float uA2Blur = 0.55;
const float uA2Strength = 0.55;
const float uA2X = 0.75;
const float uA2Y = 0.50;
const int   u3D = 0;
const float u3DRelief = 1.00;
const float u3DSmooth = 0.25;
const float u3DLightAngle = 135.00;
const float u3DLightElev = 45.00;
const float u3DAmbient = 0.28;
const float u3DDiffuse = 0.95;
const float u3DSpecular = 0.45;
const float u3DGloss = 32.00;
const float u3DFresnel = 0.25;
const float u3DRefract = 0.00;
const float u3DShadow = 0.35;
const vec3  u3DLightColor = vec3(1.000, 0.965, 0.910);
const int   uCam = 0;
const int   uGeom = 0;
const float uCamPitch = 45.00;
const float uCamYaw = 0.00;
const float uCamHeight = 1.00;
const float uCamFov = 60.00;
const float uCamFocus = 0.30;
const float uCamFocusRange = 0.12;
const float uCamAperture = 0.40;
const float uCamHaze = 0.35;
const float uGeomMotion = 0.15;
const vec3  uCamHazeColor = vec3(0.063, 0.082, 0.110);
const int   uColorMode = 0;
const float uHue = 0.00;
const float uSaturation = 1.00;
const float uColorCycle = 0.10;
const float uGradientBlend = 1.00;
const int   uStopCount = 4;
const float uPos0 = 0.00;
const float uPos1 = 0.33;
const float uPos2 = 0.66;
const float uPos3 = 1.00;
const float uPos4 = 1.00;
const vec3  uColor0 = vec3(0.020, 0.063, 0.161);
const vec3  uColor1 = vec3(0.039, 0.439, 0.541);
const vec3  uColor2 = vec3(0.961, 0.651, 0.137);
const vec3  uColor3 = vec3(0.910, 0.298, 0.235);
const vec3  uColor4 = vec3(0.980, 0.941, 0.902);
// === CONTROLS END ===

// --- Hash: permutation-free, returns a pseudo-random gradient ---
vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// --- Classic 3D Perlin (gradient) noise, range roughly [-1, 1] ---
float perlin(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    // Quintic fade curve: 6t^5 - 15t^4 + 10t^3
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    return mix(
        mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
            mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
        mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
            mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
        u.z);
}

// --- Fractal Brownian Motion (octaves / lacunarity / gain from Controls) ---
// lod is a fractional octave budget: the last kept octave fades in gradually,
// so dropping it is smooth. Depth of field and horizon anti-aliasing both work
// by lowering lod instead of taking extra samples.
float fbmLod(vec3 p, float lod) {
    float value = 0.0;
    float amplitude = 0.5;
    // Cap with a float so this stays valid when uOctaves is a uniform.
    float budget = min(lod, float(uOctaves));
    for (int i = 0; i < 8; i++) {
        float w = clamp(budget - float(i), 0.0, 1.0);
        if (w <= 0.0) break;
        value += amplitude * w * perlin(p);
        p = p * uLacunarity + vec3(13.7, 7.3, 3.1);
        amplitude *= uGain;
    }
    return value;
}

float fbm(vec3 p) {
    return fbmLod(p, float(uOctaves));
}

/* ---------- Camera + geometry: where the noise lives ----------
   With the camera off, the noise is sampled directly in screen space. With it
   on, every pixel becomes a ray cast at the active geometry, and the hit gives
   a pair of surface coordinates that everything downstream samples in:
     Plane  — s = position on the plane z = 0
     Sphere — s = (longitude, latitude) on a unit sphere at the origin
     Tunnel — s = (arc length, depth) inside a cylinder around the z axis
   The noise itself is 3D, so the sphere and tunnel are sampled in the volume
   rather than texture-mapped: no seams, no polar pinching in the pattern. */

const float TAU = 6.28318530718;

float camFocal() {
    return 1.0 / tan(radians(clamp(uCamFov, 10.0, 140.0)) * 0.5);
}

float tunnelRadius() {
    return max(uCamHeight, 0.05);
}

// The sphere is unit-radius, so Elevation reads as height above its surface.
// The offset leaves the default framing with space around the planet.
float sphereCamDist() {
    return 1.6 + max(uCamHeight, 0.05);
}

// Right/up from a forward direction and an up reference
void basisFrom(vec3 fwd, vec3 upRef, out vec3 right, out vec3 up) {
    right = normalize(cross(fwd, upRef));
    up = cross(right, fwd);
}

// Camera position and basis. Tilt / Orbit / Elevation are reinterpreted:
//   Plane  — pitch down from vertical / spin the field / height above it
//   Sphere — latitude of the orbit / longitude / distance from the surface
//   Tunnel — swing away from the axis / roll around it / radius of the tube
void cameraSetup(out vec3 ro, out vec3 fwd, out vec3 right, out vec3 up) {
    if (uGeom == 1) {
        float lat = radians(clamp(uCamPitch, 0.0, 88.0));
        float lon = radians(uCamYaw);
        vec3 dir = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
        ro = dir * sphereCamDist();
        fwd = -dir;
        basisFrom(fwd, vec3(0.0, 0.0, 1.0), right, up);
        return;
    }
    if (uGeom == 2) {
        float swing = radians(clamp(uCamPitch, 0.0, 88.0));
        vec3 aimFwd = vec3(sin(swing), 0.0, cos(swing));
        vec3 aimRight, aimUp;
        basisFrom(aimFwd, vec3(0.0, 1.0, 0.0), aimRight, aimUp);

        // Roll the whole basis around the tube axis
        float roll = radians(uCamYaw);
        float cr = cos(roll);
        float sr = sin(roll);
        fwd   = vec3(cr * aimFwd.x - sr * aimFwd.y, sr * aimFwd.x + cr * aimFwd.y, aimFwd.z);
        right = vec3(cr * aimRight.x - sr * aimRight.y, sr * aimRight.x + cr * aimRight.y, aimRight.z);
        up    = vec3(cr * aimUp.x - sr * aimUp.y, sr * aimUp.x + cr * aimUp.y, aimUp.z);
        ro = vec3(0.0);   // on the axis, which hitTunnel relies on
        return;
    }

    // Pitch 0 looks straight down (matches the flat view); 88 grazes the horizon
    float elev = radians(90.0 - clamp(uCamPitch, 0.0, 88.0));
    float sinE = sin(elev);
    float cosE = cos(elev);
    float h = max(uCamHeight, 0.05);
    // Spelled out rather than crossed: at pitch 0 the view axis is parallel to
    // world up, where deriving right/up from a cross product is singular.
    fwd   = vec3(0.0, cosE, -sinE);
    right = vec3(1.0, 0.0, 0.0);
    up    = vec3(0.0, sinE, cosE);
    // Pull the camera back so the center ray always lands on the origin
    ro = vec3(0.0, -h * cosE / max(sinE, 1e-3), h);
}

// Plane z = 0. Orbit spins the field under the camera rather than moving it.
float hitPlane(vec3 ro, vec3 rd, out vec2 s) {
    s = vec2(0.0);
    if (rd.z > -1e-4) return -1.0;   // above the horizon

    float dist = -ro.z / rd.z;
    vec2 hit = ro.xy + dist * rd.xy;
    float yaw = radians(uCamYaw);
    float cosY = cos(yaw);
    float sinY = sin(yaw);
    s = vec2(cosY * hit.x - sinY * hit.y, sinY * hit.x + cosY * hit.y);
    return dist;
}

// Unit sphere at the origin, near side only
float hitSphere(vec3 ro, vec3 rd, out vec2 s) {
    s = vec2(0.0);
    float b = dot(ro, rd);
    float disc = b * b - (dot(ro, ro) - 1.0);
    if (disc < 0.0) return -1.0;

    float dist = -b - sqrt(disc);
    if (dist <= 0.0) return -1.0;
    vec3 hit = ro + dist * rd;
    s = vec2(atan(hit.y, hit.x), asin(clamp(hit.z, -1.0, 1.0)));
    return dist;
}

// Cylinder around the z axis, seen from the inside. The camera sits on the
// axis, which reduces the intersection to a single divide.
float hitTunnel(vec3 rd, out vec2 s) {
    s = vec2(0.0);
    float side = length(rd.xy);
    if (side < 1e-4) return -1.0;   // straight down the axis, never meets a wall

    float R = tunnelRadius();
    float dist = R / side;
    vec3 hit = dist * rd;
    // Cap the axial reach: past this the wall is sub-pixel anyway, and the
    // noise coordinate would grow large enough to lose float precision.
    s = vec2(atan(hit.y, hit.x) * R, clamp(hit.z, -150.0 * R, 150.0 * R));
    return dist;
}

// Cast the pixel ray at the active geometry. Returns the hit distance along the
// ray, or -1.0 on a miss. rayDir is kept for view-dependent shading.
float traceGeometry(vec2 sUv, out vec2 s, out vec3 rayDir) {
    vec3 ro, fwd, right, up;
    cameraSetup(ro, fwd, right, up);

    float aspect = iResolution.x / iResolution.y;
    vec2 centered = (sUv - 0.5 * vec2(aspect, 1.0)) * 2.0;
    rayDir = normalize(fwd * camFocal() + right * centered.x + up * centered.y);

    if (uGeom == 1) return hitSphere(ro, rayDir, s);
    if (uGeom == 2) return hitTunnel(rayDir, s);
    return hitPlane(ro, rayDir, s);
}

// Screen point -> sampling space, for the mouse and anchors. Missed rays are
// pushed far away so their brushes simply have no reach.
vec2 spaceCoord(vec2 sUv) {
    if (uCam == 0) return sUv;
    vec2 s;
    vec3 rayDir;
    if (traceGeometry(sUv, s, rayDir) < 0.0) return vec2(1e4);
    return s;
}

// Sphere longitude and tunnel circumference wrap, so a brush center has to be
// brought into the same lap as the pixel or it gets cut in half at the seam.
// Only x wraps, which keeps the vec2(1e4) miss sentinel out of reach.
vec2 alignSeam(vec2 center, vec2 ref) {
    if (uCam == 0) return center;
    float period = 0.0;
    if (uGeom == 1) period = TAU;
    if (uGeom == 2) period = TAU * tunnelRadius();
    if (period <= 0.0) return center;
    center.x += period * floor((ref.x - center.x) / period + 0.5);
    return center;
}

// Surface tangent frame at s, plus the world distance one unit of s.x / s.y
// covers (the metric), which keeps step sizes and relief consistent.
void surfaceFrame(vec2 s, out vec3 nrm, out vec3 tanX, out vec3 tanY, out vec2 metric) {
    if (uGeom == 1) {
        float lat = clamp(s.y, -1.5707, 1.5707);
        float cosL = cos(lat);
        float sinL = sin(lat);
        nrm  = vec3(cosL * cos(s.x), cosL * sin(s.x), sinL);
        tanX = vec3(-sin(s.x), cos(s.x), 0.0);
        tanY = vec3(-sinL * cos(s.x), -sinL * sin(s.x), cosL);
        metric = vec2(max(cosL, 0.02), 1.0);
        return;
    }
    if (uGeom == 2) {
        float a = s.x / tunnelRadius();
        nrm  = vec3(-cos(a), -sin(a), 0.0);   // walls face the axis
        tanX = vec3(-sin(a), cos(a), 0.0);
        tanY = vec3(0.0, 0.0, 1.0);
        metric = vec2(1.0, 1.0);
        return;
    }
    nrm  = vec3(0.0, 0.0, 1.0);
    tanX = vec3(1.0, 0.0, 0.0);
    tanY = vec3(0.0, 1.0, 0.0);
    metric = vec2(1.0, 1.0);
}

// Surface coordinates -> the 3D point the noise is sampled at. Spin and travel
// ride here, so the pattern moves while brushes stay put on screen.
vec3 geomPoint(vec2 s, float t) {
    if (uGeom == 1) {
        float lon = s.x + t * uGeomMotion;
        float lat = clamp(s.y, -1.5707, 1.5707);
        float cosL = cos(lat);
        vec3 dir = vec3(cosL * cos(lon), cosL * sin(lon), sin(lat));
        return dir * uScale + vec3(0.0, 0.0, t);
    }
    if (uGeom == 2) {
        float R = tunnelRadius();
        float a = s.x / R;
        return vec3(cos(a), sin(a), 0.0) * R * uScale
             + vec3(0.0, 0.0, (s.y + t * uGeomMotion) * uScale);
    }
    return vec3(s * uScale, t);
}

// World width of one pixel on the surface: grows with distance and with
// grazing angles, which is what keeps normals and fine octaves from
// shimmering as the surface recedes.
float pixelFootprint(float dist, vec3 rayDir, vec3 geomNrm) {
    float grazing = max(-dot(rayDir, geomNrm), 0.02);
    return dist * (2.0 / (camFocal() * max(iResolution.y, 1.0))) / grazing;
}

// Hyperbolic depth curve: compresses distance the way perspective does
float depthCurve(float dist) {
    return dist / (dist + 4.0 * max(uCamHeight, 0.05));
}

// Distance to the plane down the screen's center column (cy: -1 bottom, +1 top).
// Negative when that ray sees only sky.
float columnDist(float cy) {
    float elev = radians(90.0 - clamp(uCamPitch, 0.0, 88.0));
    float sinE = sin(elev);
    float cosE = cos(elev);
    float f = camFocal();
    vec3 rd = normalize(vec3(0.0, cosE * f + sinE * cy, -sinE * f + cosE * cy));
    if (rd.z > -1e-4) return -1.0;
    return max(uCamHeight, 0.05) / -rd.z;
}

// Nearest and farthest distance the geometry can show, so Focus distance can
// mean the same thing at every tilt. farD < 0 means "effectively infinite".
void depthRange(out float nearD, out float farD) {
    if (uGeom == 1) {
        float d = sphereCamDist();
        nearD = max(d - 1.0, 0.02);
        farD = sqrt(max(d * d - 1.0, 1e-4));   // the limb
        return;
    }
    if (uGeom == 2) {
        nearD = tunnelRadius();
        farD = -1.0;                           // the tube recedes forever
        return;
    }
    nearD = columnDist(-1.0);
    farD = columnDist(1.0);
}

// 0 at the nearest visible depth, 1 at the farthest. Falls back to the raw
// curve when the view has no meaningful depth spread (near top-down).
float viewDepth(float dist) {
    float nearD, farD;
    depthRange(nearD, farD);
    if (nearD < 0.0) return depthCurve(dist);
    if (farD < 0.0) farD = nearD * 60.0;

    float nearC = depthCurve(nearD);
    float spread = depthCurve(farD) - nearC;
    if (spread <= 0.02) return depthCurve(dist);
    return clamp((depthCurve(dist) - nearC) / spread, 0.0, 1.0);
}

// Highest octave count that still resolves inside one pixel footprint. Reaching
// 0 is allowed and matters: at a vanishing point one pixel can span more than
// the base wavelength, and anything left there is pure aliasing.
float aliasLod(float footprint) {
    float lanes = 1.0 / max(footprint * uScale * 2.0, 1e-5);
    return max(log2(max(lanes, 1.0)) / log2(max(uLacunarity, 1.05)), 0.0);
}

// Circle of confusion: 0 in the focal band, rising to 1 at the depth extremes
float focusCoc(float depth01) {
    if (uCamAperture <= 0.001) return 0.0;
    float offFocus = abs(depth01 - uCamFocus) - uCamFocusRange;
    return clamp(offFocus / max(0.08, 1.0 - uCamFocusRange), 0.0, 1.0) * uCamAperture;
}

// --- Cosine palette (Inigo Quilez) ---
vec3 cosinePalette(float t) {
    return vec3(0.5) + vec3(0.5) * cos(6.28318 * (vec3(1.0, 1.0, 1.0) * t
              + vec3(0.00, 0.10, 0.20) + uHue) + vec3(0.0, 0.6, 1.0));
}

vec3 stopColor(int i) {
    if (i <= 0) return uColor0;
    if (i == 1) return uColor1;
    if (i == 2) return uColor2;
    if (i == 3) return uColor3;
    return uColor4;
}

float stopPos(int i) {
    if (i <= 0) return uPos0;
    if (i == 1) return uPos1;
    if (i == 2) return uPos2;
    if (i == 3) return uPos3;
    return uPos4;
}

// --- Multi-stop gradient with adjustable positions ---
vec3 gradientColor(float t) {
    // Keep exact 0 and 1 (so the last stop is reachable). Wrap only outside [0,1]
    // so color-cycle can scroll through the ramp without snapping 1.0 -> 0.0.
    if (t < 0.0 || t > 1.0) t = fract(t);
    t = clamp(t, 0.0, 1.0);

    int n = uStopCount;
    if (n < 2) n = 2;
    if (n > 5) n = 5;

    float pFirst = stopPos(0);
    float pLast = stopPos(n - 1);
    if (t <= pFirst) return stopColor(0);
    if (t >= pLast) return stopColor(n - 1);

    int i0 = 0;
    for (int i = 0; i < 4; i++) {
        if (t >= stopPos(i)) i0 = i;
    }
    int last = n - 1;
    if (i0 > last - 1) i0 = last - 1;
    if (i0 < 0) i0 = 0;
    int i1 = i0 + 1;
    if (i1 > n - 1) i1 = n - 1;

    float a = stopPos(i0);
    float b = stopPos(i1);
    float span = max(b - a, 1e-5);
    float f = clamp((t - a) / span, 0.0, 1.0);
    if (uGradientBlend > 0.5) {
        f = f * f * (3.0 - 2.0 * f); // smoothstep
    }
    return mix(stopColor(i0), stopColor(i1), f);
}

vec3 colorize(float t) {
    vec3 col = (uColorMode == 0) ? cosinePalette(t) : gradientColor(t);
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), col, uSaturation);
}

float interactFalloff(vec2 uv0, vec2 center, float radius, float blurAmt, float activeAmt) {
    float md = length(uv0 - center);
    float rad = max(radius, 0.001);
    float dNorm = md / rad;
    float blur = clamp(blurAmt, 0.0, 1.0);
    float soft = exp(-dNorm * dNorm * mix(14.0, 1.35, blur));
    float hard = 1.0 - smoothstep(mix(0.92, 0.55, blur), 1.0, dNorm);
    return mix(hard, soft, smoothstep(0.0, 0.35, blur)) * activeAmt;
}

// Domain modes (1–3) warp uv before fBm. Distances use original uv0.
void applyInteractDomain(inout vec2 uv, vec2 uv0, vec2 center, int mode, float radius, float blurAmt, float strength, float activeAmt) {
    if (mode < 1 || mode > 3 || activeAmt < 0.5) return;
    center = alignSeam(center, uv0);
    float falloff = interactFalloff(uv0, center, radius, blurAmt, activeAmt);
    float md = length(uv0 - center);
    if (mode == 1) {
        vec2 dir = (uv0 - center) / max(md, 1e-4);
        uv += dir * falloff * strength * 0.85;
    } else if (mode == 2) {
        float ang = falloff * strength * 6.28318;
        float ca = cos(ang);
        float sa = sin(ang);
        vec2 d = uv - center;
        uv = center + vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    } else if (mode == 3) {
        float zoom = 1.0 + strength * 2.5 * falloff;
        uv = mix(uv, center + (uv - center) / zoom, falloff);
    }
}

// Value modes (4–5) sculpt v after fBm.
void applyInteractValue(inout float v, vec2 uv0, vec2 center, int mode, float radius, float blurAmt, float strength, float activeAmt) {
    if (mode < 4 || activeAmt < 0.5) return;
    float falloff = interactFalloff(uv0, alignSeam(center, uv0), radius, blurAmt, activeAmt);
    if (mode == 4) {
        v += falloff * strength;
    } else if (mode == 5) {
        v = mix(v, 0.5, falloff * clamp(strength, 0.0, 1.0));
    }
}

// Anchor centers, from viewport-normalized X/Y (widen X by aspect) into
// whichever space we are sampling in.
vec2 anchorUv(int i) {
    float ar = iResolution.x / iResolution.y;
    vec2 sUv = vec2(uA0X * ar, uA0Y);
    if (i == 1) sUv = vec2(uA1X * ar, uA1Y);
    if (i == 2) sUv = vec2(uA2X * ar, uA2Y);
    return spaceCoord(sUv);
}

// --- Height field: warped fBm + value interactions + tone, in [0, 1] ---
// uvW is the domain-warped surface coordinate; uv0 stays unwarped so brush
// falloffs keep their position. geomPoint turns it into the 3D noise sample
// point for the active geometry. 3D mode resamples this at neighboring points,
// and lod trims fine octaves for defocus / distance.
float heightField(vec2 uvW, vec2 uv0, vec2 mUv, float mouseOn, float t, float lod) {
    // Domain-warped fBm: fbm(p + fbm(p)) for extra swirl
    vec3 p = geomPoint(uvW, t);
    float warp = fbmLod(p + vec3(fbmLod(p + vec3(t * 0.5), lod), fbmLod(p.yxz, lod), 0.0), lod);
    float n = fbmLod(p + uWarp * warp, lod);

    float v = n * 0.5 + 0.5;
    applyInteractValue(v, uv0, mUv, uMouseInteract, uMouseRadius, uMouseBlur, uMouseStrength, mouseOn);
    if (uAnchorCount > 0) applyInteractValue(v, uv0, anchorUv(0), uA0Mode, uA0Radius, uA0Blur, uA0Strength, 1.0);
    if (uAnchorCount > 1) applyInteractValue(v, uv0, anchorUv(1), uA1Mode, uA1Radius, uA1Blur, uA1Strength, 1.0);
    if (uAnchorCount > 2) applyInteractValue(v, uv0, anchorUv(2), uA2Mode, uA2Radius, uA2Blur, uA2Strength, 1.0);

    return clamp((v - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
}

// --- Surface normal by forward differences on the height field ---
// eps is a world-space step and doubles as the smoothing control: a wider step
// averages over more detail, so high-frequency octaves stop showing up as
// normal noise. The tangent frame lifts the 2D gradient into world space, which
// is what lets the sphere and tunnel light correctly.
vec3 surfaceNormal(vec2 uvW, vec2 uv0, vec2 mUv, float mouseOn, float t, float lod, float h, float eps) {
    vec3 geomNrm, tanX, tanY;
    vec2 metric;
    surfaceFrame(uv0, geomNrm, tanX, tanY, metric);

    vec2 step = vec2(eps) / max(metric, vec2(0.02));
    vec2 dx = vec2(step.x, 0.0);
    vec2 dy = vec2(0.0, step.y);
    float hx = heightField(uvW + dx, uv0 + dx, mUv, mouseOn, t, lod);
    float hy = heightField(uvW + dy, uv0 + dy, mUv, mouseOn, t, lod);

    vec2 grad = vec2(hx - h, hy - h) / eps;
    return normalize(geomNrm - u3DRelief * 0.35 * (grad.x * tanX + grad.y * tanY));
}

// --- Blinn-Phong + fresnel rim + height/slope occlusion ---
// viewDir points from the surface back toward the camera, so specular and rim
// terms follow the camera when it tilts. geomNrm is the unperturbed surface
// normal, which is what "facing up" means for the occlusion term.
vec3 shadeSurface(vec3 base, vec3 nrm, float h, vec3 viewDir, vec3 geomNrm) {
    float az = radians(u3DLightAngle);
    float el = radians(clamp(u3DLightElev, 1.0, 89.0));
    vec3 lightDir = normalize(vec3(cos(az) * cos(el), sin(az) * cos(el), sin(el)));
    vec3 halfDir = normalize(lightDir + viewDir);

    float diffuse = max(dot(nrm, lightDir), 0.0);
    float specular = pow(max(dot(nrm, halfDir), 0.0), max(u3DGloss, 1.0)) * u3DSpecular;
    float fresnel = pow(1.0 - clamp(dot(nrm, viewDir), 0.0, 1.0), 3.0) * u3DFresnel;

    // Valleys and steep flanks catch less light than plateaus
    float occl = smoothstep(-0.15, 0.85, h) * (0.4 + 0.6 * dot(nrm, geomNrm));
    float shade = mix(1.0, occl, clamp(u3DShadow, 0.0, 1.0));

    vec3 col = base * (u3DAmbient + diffuse * u3DDiffuse * u3DLightColor) * shade;
    col += u3DLightColor * specular;
    col += u3DLightColor * base * fresnel;
    return col;
}

vec3 applyVignette(vec3 col, vec2 fragCoord) {
    vec2 q = fragCoord / iResolution.xy;
    float vig = pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.25);
    return col * mix(1.0, 0.65 + 0.35 * vig, uVignette);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 sUv = fragCoord / iResolution.y;   // screen space, square pixels
    // When Dynamic Speed is on, JS drives iTime at 0..2 from pointer velocity
    // and we treat uSpeed as 1 so the mapped rate is used as-is.
    float t = iTime * (uDynamicSpeed != 0 ? 1.0 : uSpeed);

    // Live mouse (iMouse.xy = lagged effect pos; z > 0 while active)
    float mouseOn = step(0.0, iMouse.z);

    // Sampling space: screen uv, or the surface of the geometry the camera sees
    vec2 uv = sUv;
    vec2 uv0 = sUv;
    vec2 mUv = iMouse.xy / iResolution.y;
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 geomNrm = vec3(0.0, 0.0, 1.0);
    float footprint = 1.0 / max(iResolution.y, 1.0);
    float lod = float(uOctaves);
    float depth01 = 0.0;

    if (uCam != 0) {
        vec2 surf;
        vec3 rayDir;
        float dist = traceGeometry(sUv, surf, rayDir);
        if (dist < 0.0) {
            // Missed the geometry: nothing out there but atmosphere
            fragColor = vec4(clamp(applyVignette(uCamHazeColor, fragCoord), 0.0, 1.0), 1.0);
            return;
        }
        uv = surf;
        uv0 = surf;
        mUv = spaceCoord(mUv);
        viewDir = -rayDir;

        vec3 tanX, tanY;
        vec2 metric;
        surfaceFrame(surf, geomNrm, tanX, tanY, metric);
        footprint = pixelFootprint(dist, rayDir, geomNrm);
        depth01 = viewDepth(dist);

        float coc = focusCoc(depth01);
        lod = min(mix(lod, 0.65, coc), aliasLod(footprint));
        footprint *= 1.0 + coc * 6.0;   // defocus softens the relief too
    }

    applyInteractDomain(uv, uv0, mUv, uMouseInteract, uMouseRadius, uMouseBlur, uMouseStrength, mouseOn);
    if (uAnchorCount > 0) applyInteractDomain(uv, uv0, anchorUv(0), uA0Mode, uA0Radius, uA0Blur, uA0Strength, 1.0);
    if (uAnchorCount > 1) applyInteractDomain(uv, uv0, anchorUv(1), uA1Mode, uA1Radius, uA1Blur, uA1Strength, 1.0);
    if (uAnchorCount > 2) applyInteractDomain(uv, uv0, anchorUv(2), uA2Mode, uA2Radius, uA2Blur, uA2Strength, 1.0);

    float v = heightField(uv, uv0, mUv, mouseOn, t, lod);
    float cycle = t * uColorCycle;
    vec3 col;

    if (u3D != 0) {
        // Step at least ~1 pixel so normals never alias, then widen with Smoothing
        float eps = max(footprint * 1.25, mix(0.0015, 0.03, clamp(u3DSmooth, 0.0, 1.0)));
        vec3 nrm = surfaceNormal(uv, uv0, mUv, mouseOn, t, lod, v, eps);

        float shadeV = v;
        if (u3DRefract > 0.001) {
            // Bend the view ray through the surface and resample the field there.
            // Channels bend by different amounts, which reads as dispersion.
            vec3 rd = refract(-viewDir, nrm, 1.0 / mix(1.0, 1.6, u3DRefract));
            vec2 off = rd.xy * u3DRefract * 0.22;
            float vR = heightField(uv + off, uv0 + off, mUv, mouseOn, t, lod);
            col = vec3(colorize(vR + cycle).r,
                       colorize(mix(v, vR, 0.82) + cycle).g,
                       colorize(mix(v, vR, 0.64) + cycle).b);
            shadeV = mix(v, vR, 0.82);
        } else {
            col = colorize(v + cycle);
        }

        col = shadeSurface(col, nrm, shadeV, viewDir, geomNrm);
    } else {
        col = colorize(v + cycle);
        if (uColorMode == 0) {
            col *= 0.55 + 0.9 * v;
        } else {
            col *= mix(0.92, 1.08, v);
        }
    }

    if (uCam != 0 && uCamHaze > 0.001) {
        float fog = 1.0 - exp(-uCamHaze * 3.0 * depth01);
        col = mix(col, uCamHazeColor, clamp(fog, 0.0, 1.0));
    }

    fragColor = vec4(clamp(applyVignette(col, fragCoord), 0.0, 1.0), 1.0);
}
`;

/* ============================================================
 * WebGL renderer
 * ============================================================ */

const canvas = document.getElementById("glcanvas");

let gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
let isWebGL2 = !!gl;
if (!gl) {
  gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
}
if (!gl) {
  document.getElementById("canvas-wrap").innerHTML =
    '<p style="color:#ff5c6c;padding:20px;font-family:monospace">WebGL is not supported in this browser.</p>';
  throw new Error("WebGL unavailable");
}

const VERT_SRC_300 = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID, no buffers needed
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const VERT_SRC_100 = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEADER_300 = `#version 300 es
precision highp float;
precision highp int;
uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec4  iMouse;
out vec4 _outColor;
#line 1
`;

const FOOTER_300 = `
void main() {
  vec4 c = vec4(0.0);
  mainImage(c, gl_FragCoord.xy);
  _outColor = c;
}`;

const HEADER_100 = `precision highp float;
precision highp int;
uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec4  iMouse;
#line 1
`;

const FOOTER_100 = `
void main() {
  vec4 c = vec4(0.0);
  mainImage(c, gl_FragCoord.xy);
  gl_FragColor = c;
}`;

// Header line count used to remap GLSL error line numbers back to editor
// lines. `#line 1` makes the first user line report as line 1 in most
// drivers, but some ignore it, so we detect which convention applies.
const HEADER_LINES = (isWebGL2 ? HEADER_300 : HEADER_100).split("\n").length - 1;

function compileShader(type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "Unknown shader compile error";
    gl.deleteShader(sh);
    return { ok: false, log };
  }
  return { ok: true, shader: sh };
}

let vertexShader = null;
{
  const res = compileShader(
    gl.VERTEX_SHADER,
    isWebGL2 ? VERT_SRC_300 : VERT_SRC_100
  );
  if (!res.ok) throw new Error("Vertex shader failed: " + res.log);
  vertexShader = res.shader;
}

// WebGL1 needs a real vertex buffer for the fullscreen triangle
let quadBuffer = null;
if (!isWebGL2) {
  quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
}

let program = null; // current (last-good) program
let uniforms = {};
let paramUniforms = {};
let usingParamUniforms = false;

function rewriteControlsToUniforms(code) {
  return String(code || "").replace(
    /\/\/ === CONTROLS BEGIN ===[\s\S]*?\/\/ === CONTROLS END ===/,
    (block) => block.replace(
      /const\s+(float|int|vec3)\s+(\w+)\s*=\s*[^;]+;/g,
      "uniform $1 $2;"
    )
  );
}

function compileWrapped(userCode) {
  const src = isWebGL2
    ? HEADER_300 + userCode + FOOTER_300
    : HEADER_100 + userCode + FOOTER_100;
  const frag = compileShader(gl.FRAGMENT_SHADER, src);
  if (!frag.ok) return { ok: false, log: frag.log };

  const prog = gl.createProgram();
  gl.attachShader(prog, vertexShader);
  gl.attachShader(prog, frag.shader);
  if (!isWebGL2) gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(frag.shader);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "Unknown link error";
    gl.deleteProgram(prog);
    return { ok: false, log };
  }
  return { ok: true, program: prog };
}

function buildProgram(userCode) {
  const uniformSrc = rewriteControlsToUniforms(userCode);
  let compiled = compileWrapped(uniformSrc);
  let asUniforms = true;
  if (!compiled.ok) {
    compiled = compileWrapped(userCode);
    asUniforms = false;
  }
  if (!compiled.ok) return { ok: false, log: compiled.log };

  if (program) gl.deleteProgram(program);
  program = compiled.program;
  usingParamUniforms = asUniforms;
  paramUniforms = {};
  if (usingParamUniforms && !gl.getUniformLocation(program, "uScale")) {
    usingParamUniforms = false;
  }
  uniforms = {
    iResolution: gl.getUniformLocation(program, "iResolution"),
    iTime: gl.getUniformLocation(program, "iTime"),
    iTimeDelta: gl.getUniformLocation(program, "iTimeDelta"),
    iFrame: gl.getUniformLocation(program, "iFrame"),
    iMouse: gl.getUniformLocation(program, "iMouse"),
  };
  return { ok: true };
}

/* ============================================================
 * Adjustable shader parameters (Controls panel)
 * Values live in the editor as a marked const block. The compiler
 * rewrites that block to uniforms so sliders and the timeline can
 * update every frame without recompiling.
 * ============================================================ */

const PARAM_DEFS = [
  { key: "uScale",      label: "Scale",      min: 0.5, max: 12,  step: 0.1,  value: 3.0,  format: (v) => v.toFixed(1) },
  { key: "uSpeed",      label: "Speed",      min: 0,   max: 2,   step: 0.01, value: 0.25, format: (v) => v.toFixed(2) },
  { key: "uOctaves",    label: "Octaves",    min: 1,   max: 8,   step: 1,    value: 5,    format: (v) => String(Math.round(v)), int: true },
  { key: "uLacunarity", label: "Lacunarity", min: 1.2, max: 3.5, step: 0.01, value: 2.02, format: (v) => v.toFixed(2) },
  { key: "uGain",       label: "Gain",       min: 0.2, max: 0.8, step: 0.01, value: 0.5,  format: (v) => v.toFixed(2) },
  { key: "uWarp",       label: "Warp",       min: 0,   max: 4,   step: 0.05, value: 1.5,  format: (v) => v.toFixed(2) },
  { key: "uContrast",   label: "Contrast",   min: 0.2, max: 3,   step: 0.05, value: 1.0,  format: (v) => v.toFixed(2) },
  { key: "uBrightness", label: "Brightness", min: -0.5,max: 0.5, step: 0.01, value: 0.0,  format: (v) => v.toFixed(2) },
  { key: "uVignette",   label: "Vignette",   min: 0,   max: 1,   step: 0.01, value: 1.0,  format: (v) => v.toFixed(2) },
];

const COLOR_SLIDER_DEFS = [
  { key: "uHue",           label: "Hue shift",   min: 0, max: 1, step: 0.01, value: 0.0, format: (v) => v.toFixed(2), modes: [0] },
  { key: "uSaturation",    label: "Saturation",  min: 0, max: 2, step: 0.01, value: 1.0, format: (v) => v.toFixed(2), modes: [0, 1] },
  { key: "uColorCycle",    label: "Color cycle", min: 0, max: 1, step: 0.01, value: 0.1, format: (v) => v.toFixed(2), modes: [0, 1] },
  { key: "uGradientBlend", label: "Soft blend",  min: 0, max: 1, step: 1,    value: 1.0, format: (v) => (v > 0.5 ? "on" : "off"), modes: [1] },
];

/* 3D relief shading: the noise value is treated as a heightfield, normals come
 * from finite differences, and the result is lit with Blinn-Phong. */
const THREED_SLIDER_DEFS = [
  { key: "u3DRelief",     label: "Relief",      min: 0, max: 3,   step: 0.01, value: 1.0,  format: (v) => v.toFixed(2) },
  { key: "u3DSmooth",     label: "Smoothing",   min: 0, max: 1,   step: 0.01, value: 0.25, format: (v) => v.toFixed(2) },
  { key: "u3DLightAngle", label: "Light angle", min: 0, max: 360, step: 1,    value: 135,  format: (v) => `${Math.round(v)}\u00b0` },
  { key: "u3DLightElev",  label: "Light pitch", min: 5, max: 89,  step: 1,    value: 45,   format: (v) => `${Math.round(v)}\u00b0` },
  { key: "u3DAmbient",    label: "Ambient",     min: 0, max: 1,   step: 0.01, value: 0.28, format: (v) => v.toFixed(2) },
  { key: "u3DDiffuse",    label: "Diffuse",     min: 0, max: 2,   step: 0.01, value: 0.95, format: (v) => v.toFixed(2) },
  { key: "u3DSpecular",   label: "Specular",    min: 0, max: 2,   step: 0.01, value: 0.45, format: (v) => v.toFixed(2) },
  { key: "u3DGloss",      label: "Gloss",       min: 2, max: 128, step: 1,    value: 32,   format: (v) => String(Math.round(v)) },
  { key: "u3DFresnel",    label: "Fresnel rim", min: 0, max: 1,   step: 0.01, value: 0.25, format: (v) => v.toFixed(2) },
  { key: "u3DRefract",    label: "Refraction",  min: 0, max: 1,   step: 0.01, value: 0.0,  format: (v) => v.toFixed(2) },
  { key: "u3DShadow",     label: "Occlusion",   min: 0, max: 1,   step: 0.01, value: 0.35, format: (v) => v.toFixed(2) },
];

const DEFAULT_LIGHT_COLOR = "#fff6e8";

const GEOMETRY_OPTIONS = [
  { value: 0, label: "Plane" },
  { value: 1, label: "Sphere" },
  { value: 2, label: "Tunnel" },
];

/* Tilt / Orbit / Elevation aim the camera differently per geometry, so the
 * labels and the section hint follow the active one. */
const GEOMETRY_LABELS = {
  0: { uCamPitch: "Tilt", uCamYaw: "Orbit", uCamHeight: "Elevation" },
  1: { uCamPitch: "View latitude", uCamYaw: "Longitude", uCamHeight: "Distance" },
  2: { uCamPitch: "Look off-axis", uCamYaw: "Roll", uCamHeight: "Tube radius" },
};

const GEOMETRY_HINTS = {
  0: "Casts a ray per pixel at the noise plane, so Tilt and Orbit move the viewpoint instead of just panning the pattern. Mouse and anchor brushes land on the surface in perspective.",
  1: "Wraps the field around a sphere by sampling the noise volume at each surface point, so there are no seams or polar pinching. Spin turns it like a planet; the light angle becomes a day/night terminator. The silhouette stays round \u2014 relief shades the surface rather than displacing it.",
  2: "Puts the camera inside a tube and samples the noise around its wall, seamless all the way around. Spin / travel flies you along it, and Depth fade plus Aperture do the heavy lifting for the sense of depth.",
};

/* Perspective camera: each pixel becomes a ray cast at the geometry, so tilt
 * and focus are geometric rather than screen-space effects. */
const CAMERA_SLIDER_DEFS = [
  { key: "uCamPitch",      label: "Tilt",         min: 0,  max: 88,  step: 1,    value: 45,   format: (v) => `${Math.round(v)}\u00b0` },
  { key: "uCamYaw",        label: "Orbit",        min: 0,  max: 360, step: 1,    value: 0,    format: (v) => `${Math.round(v)}\u00b0` },
  { key: "uCamHeight",     label: "Elevation",    min: 0.2, max: 4,  step: 0.01, value: 1.0,  format: (v) => v.toFixed(2) },
  { key: "uCamFov",        label: "Field of view", min: 20, max: 100, step: 1,   value: 60,   format: (v) => `${Math.round(v)}\u00b0` },
  { key: "uCamFocus",      label: "Focus distance", min: 0, max: 1,  step: 0.01, value: 0.3,  format: (v) => v.toFixed(2) },
  { key: "uCamFocusRange", label: "Focus range",  min: 0,  max: 0.6, step: 0.01, value: 0.12, format: (v) => v.toFixed(2) },
  { key: "uCamAperture",   label: "Aperture",     min: 0,  max: 1,   step: 0.01, value: 0.4,  format: (v) => v.toFixed(2) },
  { key: "uCamHaze",       label: "Depth fade",   min: 0,  max: 1,   step: 0.01, value: 0.35, format: (v) => v.toFixed(2) },
  { key: "uGeomMotion",    label: "Spin / travel", min: 0, max: 2,   step: 0.01, value: 0.15, format: (v) => v.toFixed(2) },
];

const DEFAULT_HAZE_COLOR = "#10151c";

const MOUSE_SLIDER_DEFS = [
  { key: "uMouseRadius",   label: "Radius",   min: 0.05, max: 1.2, step: 0.01, value: 0.35, format: (v) => v.toFixed(2) },
  { key: "uMouseBlur",     label: "Blur",     min: 0,    max: 1,   step: 0.01, value: 0.55, format: (v) => v.toFixed(2) },
  { key: "uMouseStrength", label: "Strength", min: 0,    max: 1.5, step: 0.01, value: 0.55, format: (v) => v.toFixed(2) },
  { key: "uMouseLag",      label: "Lag amount", min: 0,  max: 1,   step: 0.01, value: 0.45, format: (v) => v.toFixed(2), needsLag: true },
];

const MOUSE_INTERACT_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 1, label: "Ripple / push" },
  { value: 2, label: "Swirl" },
  { value: 3, label: "Magnify" },
  { value: 4, label: "Paint / raise" },
  { value: 5, label: "Pinch / flatten" },
];

const MOUSE_LAG_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "Smooth" },
  { value: 2, label: "Sine" },
  { value: 3, label: "Elastic" },
];

const MAX_ANCHORS = 3;
const DEFAULT_ANCHOR = () => ({
  mode: 1,
  radius: 0.35,
  blur: 0.55,
  strength: 0.55,
  x: 0.5,
  y: 0.5,
});

const DEFAULT_STOPS = typeof DEFAULT_STOP_FILL !== "undefined"
  ? DEFAULT_STOP_FILL.slice()
  : ["#051029", "#0a708a", "#f5a623", "#e84c3c", "#faf0e6"];

const PARAMS_BLOCK_RE = /\/\/ === CONTROLS BEGIN ===[\s\S]*?\/\/ === CONTROLS END ===/;

const params = {};
for (const def of PARAM_DEFS) params[def.key] = def.value;
for (const def of COLOR_SLIDER_DEFS) params[def.key] = def.value;
for (const def of MOUSE_SLIDER_DEFS) params[def.key] = def.value;
for (const def of THREED_SLIDER_DEFS) params[def.key] = def.value;
for (const def of CAMERA_SLIDER_DEFS) params[def.key] = def.value;
params.uColorMode = 0;
params.u3D = 0;
params.lightColor = DEFAULT_LIGHT_COLOR;
params.uCam = 0;
params.uGeom = 0;
params.hazeColor = DEFAULT_HAZE_COLOR;
params.uDynamicSpeed = 0;
params.uMouseInteract = 0;
params.uMouseLagMode = 0;
params.uStopCount = 4;
params.stops = DEFAULT_STOPS.slice();
params.positions = evenPositions(MAX_STOPS);
params.anchors = [];

const STAGE_ASPECT_PRESETS = [
  { id: "16:9", w: 16, h: 9 },
  { id: "16:10", w: 16, h: 10 },
  { id: "4:3", w: 4, h: 3 },
  { id: "1:1", w: 1, h: 1 },
  { id: "9:16", w: 9, h: 16 },
  { id: "custom", w: 16, h: 9 },
];

const stageSettings = {
  aspectPreset: "16:9",
  aspectW: 16,
  aspectH: 9,
  customAspectW: 16,
  customAspectH: 9,
  outputPreset: "1080p",
  customW: 1920,
  customH: 1080,
  exportFps: 60,
};

let stageAspectSelect = null;
let stageOutputSelect = null;
let stageFpsSelect = null;
let stageCustomAspect = null;
let stageCustomOutput = null;
let stageOutReadout = null;
let suppressEditorSync = false;
let stageExportLock = false;

const paramsList = document.getElementById("params-list");
const paramsPanel = document.getElementById("params-panel");
const valueEls = {};
const labelEls = {};
let syncingFromParams = false;
let gradientPreviewEl = null;
let colorModeSelect = null;
let mouseInteractSelect = null;
let mouseLagSelect = null;
let dynamicSpeedInput = null;
let threeDInput = null;
let lightColorInput = null;
let cameraInput = null;
let hazeColorInput = null;
let geometrySelect = null;
let geometryHintEl = null;
let stopsHostEl = null;
let stopCountLabelEl = null;
let anchorsHostEl = null;
let anchorCountLabelEl = null;
let placingAnchorIndex = -1; // -1 = not placing
let presetsHostEl = null;
let presetNameInput = null;

function formatGlslLiteral(def, v) {
  if (def.int) return String(Math.round(v));
  if (def.key === "uGradientBlend") return v > 0.5 ? "1.00" : "0.00";
  const s = Number(v).toFixed(2);
  return s.includes(".") ? s : s + ".0";
}

function writeAnchorSlot(lines, i, anchor) {
  const a = anchor || {
    mode: 0,
    radius: 0.35,
    blur: 0.55,
    strength: 0.55,
    x: i === 1 ? 0.25 : i === 2 ? 0.75 : 0.5,
    y: 0.5,
  };
  lines.push(`const int   uA${i}Mode = ${a.mode | 0};`);
  lines.push(`const float uA${i}Radius = ${Number(a.radius).toFixed(2)};`);
  lines.push(`const float uA${i}Blur = ${Number(a.blur).toFixed(2)};`);
  lines.push(`const float uA${i}Strength = ${Number(a.strength).toFixed(2)};`);
  lines.push(`const float uA${i}X = ${Number(a.x).toFixed(2)};`);
  lines.push(`const float uA${i}Y = ${Number(a.y).toFixed(2)};`);
}

function buildParamsBlock(src) {
  const p = src || params;
  const anchors = Array.isArray(p.anchors) ? p.anchors : [];
  const stops = Array.isArray(p.stops) ? p.stops : DEFAULT_STOPS;
  const positions = Array.isArray(p.positions) ? p.positions : evenPositions(MAX_STOPS);
  const stopCount = p.uStopCount | 0;

  const lines = ["// === CONTROLS BEGIN ==="];
  for (const def of PARAM_DEFS) {
    const type = def.int ? "int  " : "float";
    lines.push(`const ${type} ${def.key} = ${formatGlslLiteral(def, p[def.key])};`);
    if (def.key === "uSpeed") {
      lines.push(`const int   uDynamicSpeed = ${p.uDynamicSpeed ? 1 : 0};`);
    }
  }
  lines.push(`const int   uMouseInteract = ${p.uMouseInteract};`);
  for (const def of MOUSE_SLIDER_DEFS) {
    if (def.key === "uMouseLag") continue;
    lines.push(`const float ${def.key} = ${formatGlslLiteral(def, p[def.key])};`);
  }
  lines.push(`const int   uMouseLagMode = ${p.uMouseLagMode};`);
  lines.push(`const float uMouseLag = ${Number(p.uMouseLag).toFixed(2)};`);
  const count = Math.min(MAX_ANCHORS, anchors.length);
  lines.push(`const int   uAnchorCount = ${count};`);
  for (let i = 0; i < MAX_ANCHORS; i++) {
    writeAnchorSlot(lines, i, i < count ? anchors[i] : null);
  }
  lines.push(`const int   u3D = ${p.u3D ? 1 : 0};`);
  for (const def of THREED_SLIDER_DEFS) {
    lines.push(`const float ${def.key} = ${formatGlslLiteral(def, p[def.key])};`);
  }
  lines.push(`const vec3  u3DLightColor = ${formatVec3(p.lightColor || DEFAULT_LIGHT_COLOR)};`);
  lines.push(`const int   uCam = ${p.uCam ? 1 : 0};`);
  lines.push(`const int   uGeom = ${p.uGeom | 0};`);
  for (const def of CAMERA_SLIDER_DEFS) {
    lines.push(`const float ${def.key} = ${formatGlslLiteral(def, p[def.key])};`);
  }
  lines.push(`const vec3  uCamHazeColor = ${formatVec3(p.hazeColor || DEFAULT_HAZE_COLOR)};`);
  lines.push(`const int   uColorMode = ${p.uColorMode};`);
  for (const def of COLOR_SLIDER_DEFS) {
    lines.push(`const float ${def.key} = ${formatGlslLiteral(def, p[def.key])};`);
  }
  lines.push(`const int   uStopCount = ${stopCount};`);
  const pos = normalizePositions(positions, stopCount);
  for (let i = 0; i < MAX_STOPS; i++) {
    const pp = i < stopCount ? pos[i] : 1;
    lines.push(`const float uPos${i} = ${pp.toFixed(2)};`);
  }
  for (let i = 0; i < MAX_STOPS; i++) {
    const hex = stops[i] || DEFAULT_STOPS[i];
    lines.push(`const vec3  uColor${i} = ${formatVec3(hex)};`);
  }
  lines.push("// === CONTROLS END ===");
  return lines.join("\n");
}

function paramLoc(name) {
  if (!program) return null;
  if (!(name in paramUniforms)) paramUniforms[name] = gl.getUniformLocation(program, name);
  return paramUniforms[name];
}

function uploadParamsUniforms(p) {
  p = p || params;
  if (!program || !usingParamUniforms) return;

  const f = (name, v) => {
    const loc = paramLoc(name);
    if (loc) gl.uniform1f(loc, +v);
  };
  const i = (name, v) => {
    const loc = paramLoc(name);
    if (loc) gl.uniform1i(loc, v | 0);
  };
  const v3 = (name, hex) => {
    const loc = paramLoc(name);
    if (!loc) return;
    const rgb = hexToRgb01(hex);
    gl.uniform3f(loc, rgb[0], rgb[1], rgb[2]);
  };

  for (const def of PARAM_DEFS) {
    if (def.int) i(def.key, p[def.key]);
    else f(def.key, p[def.key]);
  }
  i("uDynamicSpeed", p.uDynamicSpeed);
  i("uMouseInteract", p.uMouseInteract);
  for (const def of MOUSE_SLIDER_DEFS) f(def.key, p[def.key]);
  i("uMouseLagMode", p.uMouseLagMode);
  const anchors = Array.isArray(p.anchors) ? p.anchors : [];
  const count = Math.min(MAX_ANCHORS, anchors.length);
  i("uAnchorCount", count);
  for (let n = 0; n < MAX_ANCHORS; n++) {
    const a = anchors[n] || {
      mode: 0,
      radius: 0.35,
      blur: 0.55,
      strength: 0.55,
      x: n === 1 ? 0.25 : n === 2 ? 0.75 : 0.5,
      y: 0.5,
    };
    i("uA" + n + "Mode", a.mode);
    f("uA" + n + "Radius", a.radius);
    f("uA" + n + "Blur", a.blur);
    f("uA" + n + "Strength", a.strength);
    f("uA" + n + "X", a.x);
    f("uA" + n + "Y", a.y);
  }
  i("u3D", p.u3D);
  for (const def of THREED_SLIDER_DEFS) f(def.key, p[def.key]);
  v3("u3DLightColor", p.lightColor || DEFAULT_LIGHT_COLOR);
  i("uCam", p.uCam);
  i("uGeom", p.uGeom);
  for (const def of CAMERA_SLIDER_DEFS) f(def.key, p[def.key]);
  v3("uCamHazeColor", p.hazeColor || DEFAULT_HAZE_COLOR);
  i("uColorMode", p.uColorMode);
  for (const def of COLOR_SLIDER_DEFS) f(def.key, p[def.key]);
  const stopCount = p.uStopCount | 0;
  i("uStopCount", stopCount);
  const pos = normalizePositions(p.positions || evenPositions(MAX_STOPS), stopCount);
  const stops = Array.isArray(p.stops) ? p.stops : DEFAULT_STOPS;
  for (let n = 0; n < MAX_STOPS; n++) {
    f("uPos" + n, n < stopCount ? pos[n] : 1);
    v3("uColor" + n, stops[n] || DEFAULT_STOPS[n]);
  }
}

function updateGradientPreview() {
  if (!gradientPreviewEl) return;
  const n = params.uStopCount;
  const pos = normalizePositions(params.positions, n);
  const stops = [];
  for (let i = 0; i < n; i++) {
    stops.push(`${params.stops[i]} ${(pos[i] * 100).toFixed(1)}%`);
  }
  gradientPreviewEl.style.background = `linear-gradient(90deg, ${stops.join(", ")})`;
  if (stopCountLabelEl) {
    stopCountLabelEl.textContent = `Stops (${n})`;
  }
}

function updateMouseInteractVisibility() {
  const on = params.uMouseInteract > 0;
  const lagOn = on && params.uMouseLagMode > 0;
  paramsList.querySelectorAll("[data-mouse-interact]").forEach((el) => {
    el.hidden = !on;
  });
  paramsList.querySelectorAll("[data-mouse-lag]").forEach((el) => {
    el.hidden = !lagOn;
  });
  if (mouseInteractSelect) mouseInteractSelect.value = String(params.uMouseInteract);
  if (mouseLagSelect) mouseLagSelect.value = String(params.uMouseLagMode);
  canvas.classList.toggle("interact-on", on);
}

function updateThreeDVisibility() {
  const on = !!params.u3D;
  paramsList.querySelectorAll("[data-threed]").forEach((el) => {
    el.hidden = !on;
  });
  if (threeDInput) threeDInput.checked = on;
  if (valueEls.u3D) valueEls.u3D.textContent = on ? "on" : "off";
}

function updateCameraVisibility() {
  const on = !!params.uCam;
  paramsList.querySelectorAll("[data-camera]").forEach((el) => {
    el.hidden = !on;
  });
  if (cameraInput) cameraInput.checked = on;
  if (valueEls.uCam) valueEls.uCam.textContent = on ? "on" : "off";

  const geom = params.uGeom | 0;
  if (geometrySelect) geometrySelect.value = String(geom);
  if (geometryHintEl) geometryHintEl.textContent = GEOMETRY_HINTS[geom];
  const labels = GEOMETRY_LABELS[geom] || GEOMETRY_LABELS[0];
  for (const key of Object.keys(labels)) {
    if (labelEls[key]) labelEls[key].textContent = labels[key];
  }
}

function updateColorModeVisibility() {
  const mode = params.uColorMode;
  paramsList.querySelectorAll("[data-color-mode]").forEach((el) => {
    const modes = el.getAttribute("data-color-mode").split(",").map(Number);
    el.hidden = !modes.includes(mode);
  });
  if (colorModeSelect) colorModeSelect.value = String(mode);
  updateGradientPreview();
  renderStopPickers();
  updateMouseInteractVisibility();
}

function applyParamsToUI() {
  const allDefs = [
    ...PARAM_DEFS,
    ...COLOR_SLIDER_DEFS,
    ...MOUSE_SLIDER_DEFS,
    ...THREED_SLIDER_DEFS,
    ...CAMERA_SLIDER_DEFS,
  ];
  for (const def of allDefs) {
    const input = document.getElementById("param-" + def.key);
    if (input) input.value = String(params[def.key]);
    if (valueEls[def.key]) valueEls[def.key].textContent = def.format(params[def.key]);
  }
  if (dynamicSpeedInput) dynamicSpeedInput.checked = !!params.uDynamicSpeed;
  if (lightColorInput) lightColorInput.value = params.lightColor || DEFAULT_LIGHT_COLOR;
  if (hazeColorInput) hazeColorInput.value = params.hazeColor || DEFAULT_HAZE_COLOR;
  updateDynamicSpeedUI();
  updateThreeDVisibility();
  updateCameraVisibility();
  updateColorModeVisibility();
  renderAnchorsUI();
  updateSectionSummaries();
}

function parseAnchorFromCode(code, i) {
  const num = (key) => {
    const re = new RegExp(
      "const\\s+(?:float|int)\\s+uA" + i + key + "\\s*=\\s*([-]?[0-9]*\\.?[0-9]+)\\s*;"
    );
    const m = code.match(re);
    return m ? parseFloat(m[1]) : NaN;
  };
  const mode = num("Mode");
  if (!Number.isFinite(mode)) return null;
  return {
    mode: Math.min(5, Math.max(0, Math.round(mode))),
    radius: Number.isFinite(num("Radius")) ? num("Radius") : 0.35,
    blur: Number.isFinite(num("Blur")) ? num("Blur") : 0.55,
    strength: Number.isFinite(num("Strength")) ? num("Strength") : 0.55,
    x: Number.isFinite(num("X")) ? Math.min(1, Math.max(0, num("X"))) : 0.5,
    y: Number.isFinite(num("Y")) ? Math.min(1, Math.max(0, num("Y"))) : 0.5,
  };
}

function parseParamsFromCode(code) {
  let changed = false;
  const parseDefs = [
    ...PARAM_DEFS,
    ...COLOR_SLIDER_DEFS,
    ...MOUSE_SLIDER_DEFS,
    ...THREED_SLIDER_DEFS,
    ...CAMERA_SLIDER_DEFS,
  ];
  for (const def of parseDefs) {
    const re = new RegExp(
      "const\\s+(?:float|int)\\s+" + def.key + "\\s*=\\s*([-]?[0-9]*\\.?[0-9]+)\\s*;"
    );
    const m = code.match(re);
    if (!m) continue;
    const v = def.int ? Math.round(parseFloat(m[1])) : parseFloat(m[1]);
    if (!Number.isFinite(v) || v === params[def.key]) continue;
    params[def.key] = v;
    changed = true;
  }

  const modeM = code.match(/const\s+int\s+uColorMode\s*=\s*(\d+)\s*;/);
  if (modeM) {
    const v = parseInt(modeM[1], 10) ? 1 : 0;
    if (v !== params.uColorMode) { params.uColorMode = v; changed = true; }
  }

  const dynM = code.match(/const\s+int\s+uDynamicSpeed\s*=\s*(\d+)\s*;/);
  if (dynM) {
    const v = parseInt(dynM[1], 10) ? 1 : 0;
    if (v !== params.uDynamicSpeed) { params.uDynamicSpeed = v; changed = true; }
  }

  const threeDM = code.match(/const\s+int\s+u3D\s*=\s*(\d+)\s*;/);
  if (threeDM) {
    const v = parseInt(threeDM[1], 10) ? 1 : 0;
    if (v !== params.u3D) { params.u3D = v; changed = true; }
  }

  const lightM = code.match(
    /const\s+vec3\s+u3DLightColor\s*=\s*vec3\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)\s*;/
  );
  if (lightM) {
    const hex = rgb01ToHex(parseFloat(lightM[1]), parseFloat(lightM[2]), parseFloat(lightM[3]));
    if (hex.toLowerCase() !== String(params.lightColor || "").toLowerCase()) {
      params.lightColor = hex;
      changed = true;
    }
  }

  const camM = code.match(/const\s+int\s+uCam\s*=\s*(\d+)\s*;/);
  if (camM) {
    const v = parseInt(camM[1], 10) ? 1 : 0;
    if (v !== params.uCam) { params.uCam = v; changed = true; }
  }

  const geomM = code.match(/const\s+int\s+uGeom\s*=\s*(\d+)\s*;/);
  if (geomM) {
    const v = Math.min(2, Math.max(0, parseInt(geomM[1], 10)));
    if (v !== params.uGeom) { params.uGeom = v; changed = true; }
  }

  const hazeM = code.match(
    /const\s+vec3\s+uCamHazeColor\s*=\s*vec3\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)\s*;/
  );
  if (hazeM) {
    const hex = rgb01ToHex(parseFloat(hazeM[1]), parseFloat(hazeM[2]), parseFloat(hazeM[3]));
    if (hex.toLowerCase() !== String(params.hazeColor || "").toLowerCase()) {
      params.hazeColor = hex;
      changed = true;
    }
  }

  const mouseM = code.match(/const\s+int\s+uMouseInteract\s*=\s*(\d+)\s*;/);
  if (mouseM) {
    const v = Math.min(5, Math.max(0, parseInt(mouseM[1], 10)));
    if (v !== params.uMouseInteract) { params.uMouseInteract = v; changed = true; }
  }

  const lagModeM = code.match(/const\s+int\s+uMouseLagMode\s*=\s*(\d+)\s*;/);
  if (lagModeM) {
    const v = Math.min(3, Math.max(0, parseInt(lagModeM[1], 10)));
    if (v !== params.uMouseLagMode) { params.uMouseLagMode = v; changed = true; }
  }

  let anchorCount = params.anchors.length;
  const acM = code.match(/const\s+int\s+uAnchorCount\s*=\s*(\d+)\s*;/);
  if (acM) {
    anchorCount = Math.min(MAX_ANCHORS, Math.max(0, parseInt(acM[1], 10)));
  }
  const nextAnchors = [];
  for (let i = 0; i < anchorCount; i++) {
    const a = parseAnchorFromCode(code, i);
    if (a) nextAnchors.push(a);
  }
  if (JSON.stringify(nextAnchors) !== JSON.stringify(params.anchors)) {
    params.anchors = nextAnchors;
    changed = true;
  }

  const stopM = code.match(/const\s+int\s+uStopCount\s*=\s*(\d+)\s*;/);
  if (stopM) {
    const v = Math.min(MAX_STOPS, Math.max(MIN_STOPS, parseInt(stopM[1], 10)));
    if (v !== params.uStopCount) { params.uStopCount = v; changed = true; }
  }

  const newPos = params.positions.slice();
  for (let i = 0; i < MAX_STOPS; i++) {
    const re = new RegExp("const\\s+float\\s+uPos" + i + "\\s*=\\s*([-]?[0-9]*\\.?[0-9]+)\\s*;");
    const m = code.match(re);
    if (!m) continue;
    const v = parseFloat(m[1]);
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v - (newPos[i] || 0)) > 1e-4) {
      newPos[i] = v;
      changed = true;
    }
  }
  params.positions = normalizePositions(newPos, params.uStopCount)
    .concat(evenPositions(MAX_STOPS).slice(params.uStopCount))
    .slice(0, MAX_STOPS);

  for (let i = 0; i < MAX_STOPS; i++) {
    const re = new RegExp(
      "const\\s+vec3\\s+uColor" + i +
      "\\s*=\\s*vec3\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*;"
    );
    const m = code.match(re);
    if (!m) continue;
    const hex = rgb01ToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    if (hex.toLowerCase() !== String(params.stops[i] || "").toLowerCase()) {
      params.stops[i] = hex;
      changed = true;
    }
  }

  if (changed) applyParamsToUI();
}

function makeSliderRow(def) {
  const row = document.createElement("div");
  row.className = "param-row";
  if (def.modes) row.setAttribute("data-color-mode", def.modes.join(","));

  const label = document.createElement("label");
  label.className = "param-label";
  label.htmlFor = "param-" + def.key;

  const name = document.createElement("span");
  name.textContent = def.label;
  labelEls[def.key] = name;

  const value = document.createElement("span");
  value.className = "value";
  value.textContent = def.format(params[def.key]);
  valueEls[def.key] = value;

  label.appendChild(name);
  label.appendChild(value);

  const input = document.createElement("input");
  input.type = "range";
  input.id = "param-" + def.key;
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  input.value = String(params[def.key]);

  input.addEventListener("input", () => {
    const v = def.int || def.step === 1
      ? Math.round(parseFloat(input.value))
      : parseFloat(input.value);
    params[def.key] = v;
    value.textContent = def.format(v);
    syncParamsToEditor();
  });

  row.appendChild(label);
  row.appendChild(input);
  return row;
}

/* Collapsible sections keep the panel scannable now that it holds six feature
 * groups. Headers show a live summary of what is active inside, so a collapsed
 * section still tells you its state at a glance. Open/closed choices persist. */
const SECTIONS_KEY = "perlinSectionsOpen:v1";
const sectionSummaryEls = {};
let sectionOpenState = null;

function loadSectionState() {
  if (sectionOpenState) return sectionOpenState;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SECTIONS_KEY));
  } catch (_) {
    /* fall through to the default */
  }
  sectionOpenState = saved && typeof saved === "object"
    ? saved
    : { stage: true, noise: true };   // first visit: stage + essentials expanded
  return sectionOpenState;
}

function storeSectionState() {
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sectionOpenState));
  } catch (_) {
    /* storage unavailable — sections just reset next visit */
  }
}

/**
 * Section with a clickable header that folds its body away. Returns { root,
 * body }: callers append controls to body and mount root in the panel.
 */
function makeCollapsibleSection(id, titleText, extraClass) {
  const open = !!loadSectionState()[id];

  const root = document.createElement("div");
  root.className = "param-section" + (extraClass ? " " + extraClass : "");
  root.classList.toggle("collapsed", !open);

  const header = document.createElement("button");
  header.type = "button";
  header.className = "param-section-header";
  header.setAttribute("aria-expanded", String(open));

  const chevron = document.createElement("span");
  chevron.className = "section-chevron";
  chevron.textContent = "\u25B8";

  const name = document.createElement("span");
  name.className = "section-name";
  name.textContent = titleText;

  const summary = document.createElement("span");
  summary.className = "section-summary";
  sectionSummaryEls[id] = summary;

  header.appendChild(chevron);
  header.appendChild(name);
  header.appendChild(summary);

  const body = document.createElement("div");
  body.className = "param-section-body";

  header.addEventListener("click", () => {
    const nowOpen = root.classList.contains("collapsed");
    root.classList.toggle("collapsed", !nowOpen);
    header.setAttribute("aria-expanded", String(nowOpen));
    sectionOpenState[id] = nowOpen;
    storeSectionState();
    if (nowOpen) header.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  root.appendChild(header);
  root.appendChild(body);
  return { root, body };
}

/** Refresh the at-a-glance text on every section header. */
function updateSectionSummaries() {
  const set = (id, text) => {
    if (sectionSummaryEls[id]) sectionSummaryEls[id].textContent = text;
  };

  const presetCount = loadPresets().length;
  set("presets", presetCount ? `${presetCount} saved` : "none saved");

  const s = stageSettings;
  const out = (typeof StageMath !== "undefined" && StageMath.outputPixels)
    ? StageMath.outputPixels(s.aspectW, s.aspectH, s.outputPreset, s.customW, s.customH)
    : { width: 1920, height: 1080 };
  set("stage", `${s.aspectW}:${s.aspectH} \u00b7 ${out.width}\u00d7${out.height}`);

  set("noise", `scale ${Number(params.uScale).toFixed(1)} \u00b7 ${params.uOctaves} oct`);
  set("threed", params.u3D ? "on" : "off");

  const geom = GEOMETRY_OPTIONS.find((o) => o.value === (params.uGeom | 0)) || GEOMETRY_OPTIONS[0];
  set("camera", params.uCam ? geom.label.toLowerCase() : "off");

  const mouseOpt = MOUSE_INTERACT_OPTIONS.find((o) => o.value === params.uMouseInteract);
  let mouseText = params.uMouseInteract > 0 && mouseOpt
    ? mouseOpt.label.split(" /")[0].toLowerCase()
    : "off";
  const anchorCount = params.anchors.length;
  if (anchorCount > 0) {
    mouseText += ` \u00b7 ${anchorCount} anchor${anchorCount > 1 ? "s" : ""}`;
  }
  set("mouse", mouseText);

  set("color", params.uColorMode ? `gradient \u00b7 ${params.uStopCount} stops` : "cosine");
}

/** Checkbox row plus explanatory hint, used by the 3D and Camera sections. */
function makeToggleBlock(opts) {
  const block = document.createElement("div");
  block.className = "param-toggle-block";

  const row = document.createElement("div");
  row.className = "param-row param-toggle-row";

  const label = document.createElement("label");
  label.className = "param-label param-toggle-label";
  label.htmlFor = "param-" + opts.key;
  const name = document.createElement("span");
  name.textContent = opts.label;
  const status = document.createElement("span");
  status.className = "value";
  status.textContent = params[opts.key] ? "on" : "off";
  valueEls[opts.key] = status;
  label.appendChild(name);
  label.appendChild(status);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "param-" + opts.key;
  input.className = "param-checkbox";
  input.checked = !!params[opts.key];
  if (opts.title) input.title = opts.title;
  input.addEventListener("change", () => {
    params[opts.key] = input.checked ? 1 : 0;
    opts.onChange();
    syncParamsToEditor();
  });

  const wrap = document.createElement("div");
  wrap.className = "param-toggle-wrap";
  wrap.appendChild(input);

  row.appendChild(label);
  row.appendChild(wrap);
  block.appendChild(row);

  if (opts.hint) {
    const hint = document.createElement("p");
    hint.className = "param-hint";
    hint.textContent = opts.hint;
    block.appendChild(hint);
  }

  return { block, input };
}

/** Dropdown row bound to an int param. */
function makeSelectRow(opts) {
  const row = document.createElement("div");
  row.className = "param-row param-toggle-row";
  if (opts.dataAttr) row.setAttribute(opts.dataAttr, "1");

  const label = document.createElement("label");
  label.className = "param-label param-toggle-label";
  label.htmlFor = "param-" + opts.key;
  const name = document.createElement("span");
  name.textContent = opts.label;
  label.appendChild(name);

  const select = document.createElement("select");
  select.id = "param-" + opts.key;
  select.className = "param-select";
  select.innerHTML = opts.options
    .map((o) => `<option value="${o.value}">${o.label}</option>`)
    .join("");
  select.value = String(params[opts.key]);
  select.addEventListener("change", () => {
    params[opts.key] = parseInt(select.value, 10);
    opts.onChange();
    syncParamsToEditor();
  });

  row.appendChild(label);
  row.appendChild(select);
  return { row, select };
}

/** Color swatch row (light color, haze color). */
function makeColorRow(opts) {
  const row = document.createElement("div");
  row.className = "param-row param-toggle-row";
  if (opts.dataAttr) row.setAttribute(opts.dataAttr, "1");

  const label = document.createElement("label");
  label.className = "param-label param-toggle-label";
  label.htmlFor = "param-" + opts.key;
  const name = document.createElement("span");
  name.textContent = opts.label;
  label.appendChild(name);

  const input = document.createElement("input");
  input.type = "color";
  input.id = "param-" + opts.key;
  input.className = "light-color-input";
  input.value = opts.value;
  input.addEventListener("input", () => {
    opts.onInput(input.value);
    syncParamsToEditor();
  });

  row.appendChild(label);
  row.appendChild(input);
  return { row, input };
}

function updateDynamicSpeedUI() {
  const speedInput = document.getElementById("param-uSpeed");
  const on = !!params.uDynamicSpeed;
  if (dynamicSpeedInput) dynamicSpeedInput.checked = on;
  if (speedInput) {
    speedInput.disabled = on;
    const row = speedInput.closest(".param-row");
    if (row) row.classList.toggle("param-disabled", on);
  }
  if (valueEls.uSpeed) {
    valueEls.uSpeed.textContent = on
      ? "mouse"
      : PARAM_DEFS.find((d) => d.key === "uSpeed").format(params.uSpeed);
  }
  if (valueEls.uDynamicSpeed) {
    valueEls.uDynamicSpeed.textContent = on ? "on" : "off";
  }
}

function makeDynamicSpeedToggle() {
  const made = makeToggleBlock({
    key: "uDynamicSpeed",
    label: "Dynamic speed",
    title: "Drive animation speed from pointer velocity (0\u20132)",
    hint: "Animation speed follows pointer velocity over the preview (mouse or finger drag): 0 when still, up to 2 when moving quickly.",
    onChange: updateDynamicSpeedUI,
  });
  dynamicSpeedInput = made.input;
  return made.block;
}

function renderStopPickers() {
  if (!stopsHostEl) return;
  stopsHostEl.innerHTML = "";
  const n = params.uStopCount;
  params.positions = normalizePositions(params.positions, n)
    .concat(params.positions.slice(n))
    .slice(0, MAX_STOPS);

  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "stop-row";

    const meta = document.createElement("div");
    meta.className = "stop-meta";

    const label = document.createElement("span");
    label.className = "stop-label";
    label.textContent = `Stop ${i + 1}`;

    const posVal = document.createElement("span");
    posVal.className = "stop-pos-value";
    posVal.textContent = params.positions[i].toFixed(2);

    meta.appendChild(label);
    meta.appendChild(posVal);

    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = params.stops[i];
    picker.title = `Gradient stop ${i + 1}`;
    picker.addEventListener("input", () => {
      params.stops[i] = picker.value;
      updateGradientPreview();
      syncParamsToEditor();
    });

    const pos = document.createElement("input");
    pos.type = "range";
    pos.className = "stop-pos";
    pos.min = "0";
    pos.max = "1";
    pos.step = "0.01";
    pos.value = String(params.positions[i]);
    pos.disabled = i === 0 || i === n - 1;
    pos.title = i === 0 || i === n - 1
      ? "Endpoint is fixed"
      : "Stop position along the gradient";
    pos.addEventListener("input", () => {
      params.positions[i] = parseFloat(pos.value);
      params.positions = normalizePositions(params.positions, n)
        .concat(params.positions.slice(n))
        .slice(0, MAX_STOPS);
      pos.value = String(params.positions[i]);
      posVal.textContent = params.positions[i].toFixed(2);
      updateGradientPreview();
      syncParamsToEditor();
    });

    row.appendChild(meta);
    row.appendChild(picker);
    row.appendChild(pos);
    stopsHostEl.appendChild(row);
  }
}

function buildColorSection() {
  const { root, body: section } = makeCollapsibleSection("color", "Color");

  const modeRow = document.createElement("div");
  modeRow.className = "param-row";
  const modeLabel = document.createElement("label");
  modeLabel.className = "param-label";
  modeLabel.htmlFor = "param-uColorMode";
  modeLabel.innerHTML = "<span>Mode</span>";
  colorModeSelect = document.createElement("select");
  colorModeSelect.id = "param-uColorMode";
  colorModeSelect.className = "param-select";
  colorModeSelect.innerHTML =
    '<option value="0">Cosine palette</option>' +
    '<option value="1">Custom gradient</option>';
  colorModeSelect.value = String(params.uColorMode);
  colorModeSelect.addEventListener("change", () => {
    params.uColorMode = parseInt(colorModeSelect.value, 10);
    updateColorModeVisibility();
    syncParamsToEditor();
  });
  modeRow.appendChild(modeLabel);
  modeRow.appendChild(colorModeSelect);
  section.appendChild(modeRow);

  for (const def of COLOR_SLIDER_DEFS) {
    section.appendChild(makeSliderRow(def));
  }

  const gradBlock = document.createElement("div");
  gradBlock.className = "gradient-block";
  gradBlock.setAttribute("data-color-mode", "1");

  gradientPreviewEl = document.createElement("div");
  gradientPreviewEl.className = "gradient-preview";
  gradientPreviewEl.title = "Gradient preview (matches shader sampling)";
  gradBlock.appendChild(gradientPreviewEl);

  const stopControls = document.createElement("div");
  stopControls.className = "stop-controls";

  stopCountLabelEl = document.createElement("span");
  stopCountLabelEl.className = "stop-count-label";
  stopCountLabelEl.textContent = `Stops (${params.uStopCount})`;

  const btnMinus = document.createElement("button");
  btnMinus.type = "button";
  btnMinus.className = "btn btn-ghost stop-btn";
  btnMinus.textContent = "−";
  btnMinus.title = "Remove stop";
  btnMinus.addEventListener("click", () => {
    const next = removeStop(params.stops, params.positions, params.uStopCount);
    params.stops = next.hexStops;
    params.positions = next.positions;
    params.uStopCount = next.count;
    updateColorModeVisibility();
    syncParamsToEditor();
  });

  const btnPlus = document.createElement("button");
  btnPlus.type = "button";
  btnPlus.className = "btn btn-ghost stop-btn";
  btnPlus.textContent = "+";
  btnPlus.title = "Add stop";
  btnPlus.addEventListener("click", () => {
    const next = addStop(params.stops, params.positions, params.uStopCount);
    params.stops = next.hexStops;
    params.positions = next.positions;
    params.uStopCount = next.count;
    updateColorModeVisibility();
    syncParamsToEditor();
  });

  const btnDistribute = document.createElement("button");
  btnDistribute.type = "button";
  btnDistribute.className = "btn btn-ghost stop-btn";
  btnDistribute.textContent = "Even";
  btnDistribute.title = "Space stops evenly";
  btnDistribute.addEventListener("click", () => {
    params.positions = evenPositions(params.uStopCount)
      .concat(evenPositions(MAX_STOPS).slice(params.uStopCount))
      .slice(0, MAX_STOPS);
    updateColorModeVisibility();
    syncParamsToEditor();
  });

  stopControls.appendChild(stopCountLabelEl);
  stopControls.appendChild(btnMinus);
  stopControls.appendChild(btnPlus);
  stopControls.appendChild(btnDistribute);
  gradBlock.appendChild(stopControls);

  stopsHostEl = document.createElement("div");
  stopsHostEl.className = "stops-host";
  gradBlock.appendChild(stopsHostEl);

  section.appendChild(gradBlock);
  return root;
}

function buildThreeDSection() {
  const { root, body: section } = makeCollapsibleSection("threed", "3D & Lighting");

  const made = makeToggleBlock({
    key: "u3D",
    label: "3D relief",
    title: "Light the noise as a 3D surface",
    hint: "Treats the noise as a heightfield: normals are lit with diffuse, specular, and rim terms. Costs extra fBm samples per pixel, so it is free while switched off.",
    onChange: updateThreeDVisibility,
  });
  threeDInput = made.input;
  section.appendChild(made.block);

  for (const def of THREED_SLIDER_DEFS) {
    const sliderRow = makeSliderRow(def);
    sliderRow.setAttribute("data-threed", "1");
    section.appendChild(sliderRow);
  }

  const lightRow = makeColorRow({
    key: "u3DLightColor",
    label: "Light color",
    value: params.lightColor || DEFAULT_LIGHT_COLOR,
    dataAttr: "data-threed",
    onInput: (hex) => { params.lightColor = hex; },
  });
  lightColorInput = lightRow.input;
  section.appendChild(lightRow.row);

  const refractHint = document.createElement("p");
  refractHint.className = "param-hint";
  refractHint.setAttribute("data-threed", "1");
  refractHint.textContent = "Refraction bends the view ray through the surface and resamples the field, splitting channels for a glassy dispersion. Raise Smoothing if the relief looks grainy.";
  section.appendChild(refractHint);

  return root;
}

function buildCameraSection() {
  const { root, body: section } = makeCollapsibleSection("camera", "Camera");

  const made = makeToggleBlock({
    key: "uCam",
    label: "Perspective",
    title: "Cast a ray per pixel at a surface instead of sampling screen space",
    hint: "Views the noise on a surface in perspective instead of flat on the screen. Free while switched off.",
    onChange: updateCameraVisibility,
  });
  cameraInput = made.input;
  section.appendChild(made.block);

  const geomRow = makeSelectRow({
    key: "uGeom",
    label: "Geometry",
    options: GEOMETRY_OPTIONS,
    dataAttr: "data-camera",
    onChange: updateCameraVisibility,
  });
  geometrySelect = geomRow.select;
  section.appendChild(geomRow.row);

  geometryHintEl = document.createElement("p");
  geometryHintEl.className = "param-hint";
  geometryHintEl.setAttribute("data-camera", "1");
  geometryHintEl.textContent = GEOMETRY_HINTS[params.uGeom | 0];
  section.appendChild(geometryHintEl);

  for (const def of CAMERA_SLIDER_DEFS) {
    const sliderRow = makeSliderRow(def);
    sliderRow.setAttribute("data-camera", "1");
    section.appendChild(sliderRow);
  }

  const hazeRow = makeColorRow({
    key: "uCamHazeColor",
    label: "Haze color",
    value: params.hazeColor || DEFAULT_HAZE_COLOR,
    dataAttr: "data-camera",
    onInput: (hex) => { params.hazeColor = hex; },
  });
  hazeColorInput = hazeRow.input;
  section.appendChild(hazeRow.row);

  const focusHint = document.createElement("p");
  focusHint.className = "param-hint";
  focusHint.setAttribute("data-camera", "1");
  focusHint.textContent = "Focus distance runs 0 (nearest) to 1 (horizon), with Focus range as the sharp band around it. Aperture sets how much detail defocused depths lose \u2014 there is no extra sampling cost. Depth fade blends distance into the haze color, which also fills the sky above the horizon.";
  section.appendChild(focusHint);

  return root;
}

function buildMouseSection() {
  const { root, body: section } = makeCollapsibleSection("mouse", "Mouse & Anchors");

  const modeRow = document.createElement("div");
  modeRow.className = "param-row";
  const modeLabel = document.createElement("label");
  modeLabel.className = "param-label";
  modeLabel.htmlFor = "param-uMouseInteract";
  modeLabel.innerHTML = "<span>Hover interact</span>";

  mouseInteractSelect = document.createElement("select");
  mouseInteractSelect.id = "param-uMouseInteract";
  mouseInteractSelect.className = "param-select";
  mouseInteractSelect.innerHTML = MOUSE_INTERACT_OPTIONS.map(
    (o) => `<option value="${o.value}">${o.label}</option>`
  ).join("");
  mouseInteractSelect.value = String(params.uMouseInteract);
  mouseInteractSelect.addEventListener("change", () => {
    params.uMouseInteract = parseInt(mouseInteractSelect.value, 10);
    updateMouseInteractVisibility();
    if (params.uMouseInteract === 0) {
      mouseHasPosition = false;
      state.mouse[2] = -Math.abs(state.mouse[2] || 1);
      state.mouse[3] = -Math.abs(state.mouse[3] || 1);
    } else {
      refreshMouseActive();
    }
    syncParamsToEditor();
  });
  modeRow.appendChild(modeLabel);
  modeRow.appendChild(mouseInteractSelect);
  section.appendChild(modeRow);

  const hint = document.createElement("p");
  hint.className = "param-hint";
  hint.setAttribute("data-mouse-interact", "1");
  hint.textContent = "Move over the preview to disturb the noise (drag with a finger on touch). Leaving the canvas keeps the effect at the last position. Blur softens the brush edge; lag trails the effect behind the cursor.";
  section.appendChild(hint);

  for (const def of MOUSE_SLIDER_DEFS) {
    if (def.needsLag) continue;
    const row = makeSliderRow(def);
    row.setAttribute("data-mouse-interact", "1");
    section.appendChild(row);
  }

  const lagRow = document.createElement("div");
  lagRow.className = "param-row";
  lagRow.setAttribute("data-mouse-interact", "1");
  const lagLabel = document.createElement("label");
  lagLabel.className = "param-label";
  lagLabel.htmlFor = "param-uMouseLagMode";
  lagLabel.innerHTML = "<span>Lag style</span>";
  mouseLagSelect = document.createElement("select");
  mouseLagSelect.id = "param-uMouseLagMode";
  mouseLagSelect.className = "param-select";
  mouseLagSelect.innerHTML = MOUSE_LAG_OPTIONS.map(
    (o) => `<option value="${o.value}">${o.label}</option>`
  ).join("");
  mouseLagSelect.value = String(params.uMouseLagMode);
  mouseLagSelect.addEventListener("change", () => {
    params.uMouseLagMode = parseInt(mouseLagSelect.value, 10);
    // Snap so enabling lag doesn't jump from an old spring state
    if (params.uMouseLagMode === 0) {
      state.mouse[0] = state.mouseTarget[0];
      state.mouse[1] = state.mouseTarget[1];
      state.mouseVel = [0, 0];
    }
    updateMouseInteractVisibility();
    syncParamsToEditor();
  });
  lagRow.appendChild(lagLabel);
  lagRow.appendChild(mouseLagSelect);
  section.appendChild(lagRow);

  for (const def of MOUSE_SLIDER_DEFS) {
    if (!def.needsLag) continue;
    const row = makeSliderRow(def);
    row.setAttribute("data-mouse-interact", "1");
    row.setAttribute("data-mouse-lag", "1");
    section.appendChild(row);
  }

  section.appendChild(buildAnchorsBlock());
  return root;
}

function makeAnchorSlider(anchor, index, key, label, min, max, step) {
  const row = document.createElement("div");
  row.className = "param-row";
  const lab = document.createElement("label");
  lab.className = "param-label";
  const name = document.createElement("span");
  name.textContent = label;
  const value = document.createElement("span");
  value.className = "value";
  value.textContent = Number(anchor[key]).toFixed(2);
  lab.appendChild(name);
  lab.appendChild(value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(anchor[key]);
  input.addEventListener("input", () => {
    anchor[key] = parseFloat(input.value);
    value.textContent = Number(anchor[key]).toFixed(2);
    syncParamsToEditor();
  });
  row.appendChild(lab);
  row.appendChild(input);
  return row;
}

function setPlacingAnchor(index) {
  placingAnchorIndex = index;
  canvas.classList.toggle("placing-anchor", index >= 0);
  renderAnchorsUI();
}

function renderAnchorsUI() {
  if (!anchorsHostEl) return;
  if (anchorCountLabelEl) {
    anchorCountLabelEl.textContent = `Anchors (${params.anchors.length}/${MAX_ANCHORS})`;
  }
  anchorsHostEl.innerHTML = "";

  params.anchors.forEach((anchor, index) => {
    const card = document.createElement("div");
    card.className = "anchor-card";

    const head = document.createElement("div");
    head.className = "anchor-card-head";
    const title = document.createElement("span");
    title.textContent = `Anchor ${index + 1}`;
    head.appendChild(title);

    const placeBtn = document.createElement("button");
    placeBtn.type = "button";
    placeBtn.className = "btn btn-ghost stop-btn" + (placingAnchorIndex === index ? " active" : "");
    placeBtn.textContent = placingAnchorIndex === index ? "Click canvas…" : "Place";
    placeBtn.title = "Click the preview to set this anchor’s position";
    placeBtn.addEventListener("click", () => {
      setPlacingAnchor(placingAnchorIndex === index ? -1 : index);
    });
    head.appendChild(placeBtn);
    card.appendChild(head);

    const modeRow = document.createElement("div");
    modeRow.className = "param-row";
    const modeLabel = document.createElement("label");
    modeLabel.className = "param-label";
    modeLabel.innerHTML = "<span>Mode</span>";
    const modeSelect = document.createElement("select");
    modeSelect.className = "param-select";
    modeSelect.innerHTML = MOUSE_INTERACT_OPTIONS.map(
      (o) => `<option value="${o.value}">${o.label}</option>`
    ).join("");
    modeSelect.value = String(anchor.mode);
    modeSelect.addEventListener("change", () => {
      anchor.mode = parseInt(modeSelect.value, 10);
      syncParamsToEditor();
    });
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSelect);
    card.appendChild(modeRow);

    card.appendChild(makeAnchorSlider(anchor, index, "x", "X", 0, 1, 0.01));
    card.appendChild(makeAnchorSlider(anchor, index, "y", "Y", 0, 1, 0.01));
    card.appendChild(makeAnchorSlider(anchor, index, "radius", "Radius", 0.05, 1.2, 0.01));
    card.appendChild(makeAnchorSlider(anchor, index, "blur", "Blur", 0, 1, 0.01));
    card.appendChild(makeAnchorSlider(anchor, index, "strength", "Strength", 0, 1.5, 0.01));

    anchorsHostEl.appendChild(card);
  });
}

function buildAnchorsBlock() {
  const block = document.createElement("div");
  block.className = "anchors-block";

  const sub = document.createElement("div");
  sub.className = "param-section-title anchors-subtitle";
  sub.textContent = "Anchors";
  block.appendChild(sub);

  const hint = document.createElement("p");
  hint.className = "param-hint";
  hint.textContent = "Fixed pseudo-mouse effects that run alongside the live cursor. Each anchor has its own mode and brush.";
  block.appendChild(hint);

  const controls = document.createElement("div");
  controls.className = "stop-controls";

  anchorCountLabelEl = document.createElement("span");
  anchorCountLabelEl.className = "stop-count-label";
  anchorCountLabelEl.textContent = `Anchors (0/${MAX_ANCHORS})`;

  const btnMinus = document.createElement("button");
  btnMinus.type = "button";
  btnMinus.className = "btn btn-ghost stop-btn";
  btnMinus.textContent = "−";
  btnMinus.title = "Remove last anchor";
  btnMinus.addEventListener("click", () => {
    if (params.anchors.length === 0) return;
    if (placingAnchorIndex === params.anchors.length - 1) setPlacingAnchor(-1);
    else if (placingAnchorIndex >= params.anchors.length - 1) placingAnchorIndex = -1;
    params.anchors.pop();
    renderAnchorsUI();
    syncParamsToEditor();
  });

  const btnPlus = document.createElement("button");
  btnPlus.type = "button";
  btnPlus.className = "btn btn-ghost stop-btn";
  btnPlus.textContent = "+";
  btnPlus.title = "Add anchor";
  btnPlus.addEventListener("click", () => {
    if (params.anchors.length >= MAX_ANCHORS) return;
    const n = params.anchors.length;
    const a = DEFAULT_ANCHOR();
    a.x = n === 0 ? 0.5 : n === 1 ? 0.25 : 0.75;
    a.y = 0.5;
    params.anchors.push(a);
    renderAnchorsUI();
    syncParamsToEditor();
  });

  controls.appendChild(anchorCountLabelEl);
  controls.appendChild(btnMinus);
  controls.appendChild(btnPlus);
  block.appendChild(controls);

  anchorsHostEl = document.createElement("div");
  anchorsHostEl.className = "anchors-host";
  block.appendChild(anchorsHostEl);

  renderAnchorsUI();
  return block;
}

/* ============================================================
 * Presets: save / name / load favorite configurations
 * ============================================================ */

const PRESETS_KEY = "perlinPresets:v1";

// All scalar params that make up a saved configuration.
const SCALAR_PARAM_KEYS = [
  ...PARAM_DEFS.map((d) => d.key),
  "uDynamicSpeed",
  "u3D",
  ...THREED_SLIDER_DEFS.map((d) => d.key),
  "uCam",
  "uGeom",
  ...CAMERA_SLIDER_DEFS.map((d) => d.key),
  "uMouseInteract",
  "uMouseLagMode",
  ...MOUSE_SLIDER_DEFS.map((d) => d.key),
  "uColorMode",
  ...COLOR_SLIDER_DEFS.map((d) => d.key),
  "uStopCount",
];

function serializeParams() {
  const out = {};
  for (const k of SCALAR_PARAM_KEYS) out[k] = params[k];
  out.lightColor = params.lightColor || DEFAULT_LIGHT_COLOR;
  out.hazeColor = params.hazeColor || DEFAULT_HAZE_COLOR;
  out.stops = params.stops.slice();
  out.positions = params.positions.slice();
  out.anchors = params.anchors.map((a) => ({ ...a }));
  return out;
}

function applySerializedParams(cfg, opts) {
  if (!cfg || typeof cfg !== "object") return;
  opts = opts || {};

  for (const k of SCALAR_PARAM_KEYS) {
    if (typeof cfg[k] === "number" && isFinite(cfg[k])) params[k] = cfg[k];
  }

  params.uDynamicSpeed = params.uDynamicSpeed ? 1 : 0;
  params.u3D = params.u3D ? 1 : 0;
  params.uCam = params.uCam ? 1 : 0;
  params.uGeom = Math.min(2, Math.max(0, params.uGeom | 0));
  params.uStopCount = Math.max(MIN_STOPS, Math.min(MAX_STOPS, params.uStopCount | 0));

  const hexRe = /^#[0-9a-f]{3,6}$/i;
  if (typeof cfg.lightColor === "string" && hexRe.test(cfg.lightColor)) {
    params.lightColor = cfg.lightColor;
  }
  if (typeof cfg.hazeColor === "string" && hexRe.test(cfg.hazeColor)) {
    params.hazeColor = cfg.hazeColor;
  }

  if (Array.isArray(cfg.stops)) {
    params.stops = cfg.stops.slice(0, MAX_STOPS);
  }
  while (params.stops.length < MAX_STOPS) {
    params.stops.push(DEFAULT_STOPS[params.stops.length % DEFAULT_STOPS.length]);
  }

  if (Array.isArray(cfg.positions) && cfg.positions.length) {
    const base = cfg.positions.slice(0, MAX_STOPS).map(Number);
    while (base.length < MAX_STOPS) base.push(1);
    params.positions = base;
  }

  if (Array.isArray(cfg.anchors)) {
    const clamp01 = (val, fallback) =>
      isFinite(val) ? Math.max(0, Math.min(1, Number(val))) : fallback;
    params.anchors = cfg.anchors.slice(0, MAX_ANCHORS).map((a, i) => {
      a = a || {};
      return {
        mode: isFinite(a.mode) ? Math.max(0, a.mode | 0) : 0,
        radius: isFinite(a.radius) ? Number(a.radius) : 0.35,
        blur: isFinite(a.blur) ? Number(a.blur) : 0.55,
        strength: isFinite(a.strength) ? Number(a.strength) : 0.55,
        x: clamp01(a.x, i === 1 ? 0.25 : i === 2 ? 0.75 : 0.5),
        y: clamp01(a.y, 0.5),
      };
    });
  }

  if (opts.silent) return;

  placingAnchorIndex = -1;
  canvas.classList.remove("placing-anchor");
  applyParamsToUI();
  if (!opts.skipEditor) syncParamsToEditor();
}

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function storePresets(list) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch (_) {
    /* storage unavailable / quota — silently ignore */
  }
}

function saveCurrentPreset() {
  const name = (presetNameInput ? presetNameInput.value : "").trim();
  if (!name) {
    if (presetNameInput) presetNameInput.focus();
    return;
  }
  const list = loadPresets();
  const entry = { name, config: serializeParams(), savedAt: Date.now() };
  const existing = list.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) {
    if (!window.confirm(`A preset named "${list[existing].name}" already exists. Overwrite it?`)) {
      return;
    }
    list[existing] = entry;
  } else {
    list.push(entry);
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  storePresets(list);
  if (presetNameInput) presetNameInput.value = "";
  renderPresetsList();
}

function deletePreset(name) {
  const list = loadPresets().filter((p) => p.name !== name);
  storePresets(list);
  renderPresetsList();
}

/* ---- Export a config as a self-contained web-background HTML file ---- */

function slugify(name) {
  return (
    (name || "perlin-background")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "perlin-background"
  );
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Full user shader (mainImage + helpers) with the Controls block for `cfg`. */
function shaderWithConfig(cfg) {
  const block = buildParamsBlock(cfg);
  let code = editor.getValue();
  code = PARAMS_BLOCK_RE.test(code)
    ? code.replace(PARAMS_BLOCK_RE, block)
    : block + "\n\n" + code;
  return code;
}

/** Build a standalone, dependency-free HTML page that renders `cfg`
 *  as the animated background of an element. */
function buildEmbedHtml(name, cfg) {
  const safeName = String(name || "Perlin background").replace(/[<>]/g, "");
  const userShader = shaderWithConfig(cfg);
  const lag = {
    uMouseInteract: cfg.uMouseInteract | 0,
    uMouseLagMode: cfg.uMouseLagMode | 0,
    uMouseLag: Number(cfg.uMouseLag) || 0,
  };
  const dynamicSpeed = cfg.uDynamicSpeed ? 1 : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeName} — Perlin background</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #000; }

  /* The element you want an animated background on.
     It needs a non-static position, hidden overflow, and a size. */
  .perlin-bg {
    position: relative;
    overflow: hidden;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    isolation: isolate;
  }

  /* Your real content sits above the canvas. */
  .perlin-content {
    position: relative;
    z-index: 1;
    color: #fff;
    text-align: center;
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.55);
    padding: 2rem;
  }
  .perlin-content h1 { font-size: clamp(2rem, 6vw, 4rem); margin: 0 0 .5rem; }
  .perlin-content p { margin: 0; opacity: .85; }
</style>
</head>
<body>
  <section class="perlin-bg" id="perlin-target">
    <div class="perlin-content">
      <h1>Your content here</h1>
      <p>Animated Perlin noise background &mdash; &ldquo;${safeName}&rdquo;</p>
    </div>
  </section>

<script>
/* ============================================================
 * Perlin Noise animated background — self-contained, no deps.
 * Generated by the Perlin Noise Shadertoy Simulator.
 *
 * Reuse on your own site:
 *   1. Give your target element: position: relative; overflow: hidden;
 *      and a height (e.g. min-height: 100vh).
 *   2. Include this <script>, then call:
 *        PerlinBackground.mount(document.querySelector('#hero'));
 *
 *   mount(target, options) options:
 *     zIndex               (default "0")   canvas stacking within target
 *     respectReducedMotion (default true)  pause if user prefers reduced motion
 *   returns { canvas, pause(), play(), destroy() }
 * ============================================================ */
(function (global) {
  "use strict";

  var USER_SHADER = ${JSON.stringify(userShader)};
  var LAG = ${JSON.stringify(lag)};
  var DYNAMIC_SPEED = ${dynamicSpeed};
  var VERT_300 = ${JSON.stringify(VERT_SRC_300)};
  var VERT_100 = ${JSON.stringify(VERT_SRC_100)};
  var HEADER_300 = ${JSON.stringify(HEADER_300)};
  var FOOTER_300 = ${JSON.stringify(FOOTER_300)};
  var HEADER_100 = ${JSON.stringify(HEADER_100)};
  var FOOTER_100 = ${JSON.stringify(FOOTER_100)};

  function compileShader(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("PerlinBackground shader error:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function mount(target, options) {
    options = options || {};
    if (!target) { console.warn("PerlinBackground: no target element"); return null; }

    var cs = getComputedStyle(target);
    if (cs.position === "static") target.style.position = "relative";
    if (cs.overflow === "visible") target.style.overflow = "hidden";

    var canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.zIndex = options.zIndex != null ? options.zIndex : "0";
    canvas.style.pointerEvents = "none";
    target.insertBefore(canvas, target.firstChild);

    var isGL2 = true;
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: true });
    if (!gl) { isGL2 = false; gl = canvas.getContext("webgl", { antialias: false, alpha: true }); }
    if (!gl) { console.error("PerlinBackground: WebGL not supported"); return null; }

    var vs = compileShader(gl, gl.VERTEX_SHADER, isGL2 ? VERT_300 : VERT_100);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER,
      (isGL2 ? HEADER_300 : HEADER_100) + USER_SHADER + (isGL2 ? FOOTER_300 : FOOTER_100));
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    if (!isGL2) gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("PerlinBackground link error:", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    var buf = null;
    if (!isGL2) {
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }

    var uRes = gl.getUniformLocation(prog, "iResolution");
    var uTime = gl.getUniformLocation(prog, "iTime");
    var uDelta = gl.getUniformLocation(prog, "iTimeDelta");
    var uFrame = gl.getUniformLocation(prog, "iFrame");
    var uMouse = gl.getUniformLocation(prog, "iMouse");

    // iMouse.xy = effect position in pixels (bottom-left origin); z/w sign = active.
    var mouse = [0, 0, -1, -1];
    var mTarget = [0, 0];
    var mVel = [0, 0];
    var hasPos = false;
    var ptrSpeed = 0, ptrX = 0, ptrY = 0, ptrT = 0, ptrHas = false;
    var DYN_REF = 1.4, DYN_DECAY = 8;

    function coords(e) {
      var r = canvas.getBoundingClientRect();
      return [
        (e.clientX - r.left) * (canvas.width / r.width),
        (r.bottom - e.clientY) * (canvas.height / r.height)
      ];
    }
    function samplePtr(e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var scale = Math.max(1, Math.min(r.width, r.height));
      var now = performance.now();
      if (ptrHas && ptrT > 0) {
        var dt = Math.max(1e-3, (now - ptrT) / 1000);
        var dist = Math.hypot(x - ptrX, y - ptrY) / scale;
        var instant = dist / dt;
        ptrSpeed = Math.max(instant, ptrSpeed * 0.35 + instant * 0.65);
      }
      ptrX = x; ptrY = y; ptrT = now; ptrHas = true;
    }
    function setActive(on) {
      if (on) { mouse[2] = Math.abs(mouse[0] || 1); mouse[3] = Math.abs(mouse[1] || 1); }
      else { mouse[2] = -Math.abs(mouse[2] || 1); mouse[3] = -Math.abs(mouse[3] || 1); }
    }
    function refresh() { setActive(LAG.uMouseInteract > 0 && hasPos); }

    // Touch/pen: prevent page scroll so dragging drives the shader like mouse hover
    if (DYNAMIC_SPEED || LAG.uMouseInteract > 0) {
      target.style.touchAction = "none";
    }
    if (LAG.uMouseInteract > 0 || DYNAMIC_SPEED) {
      target.addEventListener("pointermove", function (e) {
        samplePtr(e);
        if (LAG.uMouseInteract > 0) {
          var c = coords(e);
          mTarget[0] = c[0]; mTarget[1] = c[1]; hasPos = true;
          if (LAG.uMouseLagMode === 0 || LAG.uMouseLag < 0.001) { mouse[0] = c[0]; mouse[1] = c[1]; mVel[0] = 0; mVel[1] = 0; }
          refresh();
        }
      }, { passive: false });
      target.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "touch" || e.pointerType === "pen") e.preventDefault();
        ptrHas = false;
        samplePtr(e);
        if (LAG.uMouseInteract > 0) {
          var c = coords(e);
          mTarget[0] = c[0]; mTarget[1] = c[1]; mouse[0] = c[0]; mouse[1] = c[1];
          mVel[0] = 0; mVel[1] = 0; hasPos = true; refresh();
        }
      }, { passive: false });
      target.addEventListener("pointerenter", function (e) {
        ptrHas = false;
        samplePtr(e);
        if (LAG.uMouseInteract > 0) {
          var c = coords(e);
          mTarget[0] = c[0]; mTarget[1] = c[1]; mouse[0] = c[0]; mouse[1] = c[1];
          mVel[0] = 0; mVel[1] = 0; hasPos = true; refresh();
        }
      });
      target.addEventListener("pointerleave", function () { ptrHas = false; });
    }

    function updateLag(dt) {
      var mode = LAG.uMouseLagMode | 0;
      var amt = Math.min(1, Math.max(0, LAG.uMouseLag || 0));
      var tx = mTarget[0], ty = mTarget[1];
      if (mode === 0 || amt < 0.001 || LAG.uMouseInteract === 0) {
        mouse[0] = tx; mouse[1] = ty; mVel[0] = 0; mVel[1] = 0; return;
      }
      var x = mouse[0], y = mouse[1], vx = mVel[0], vy = mVel[1];
      if (mode === 1) {
        var follow = 2.2 + (1 - amt) * 22;
        var a = 1 - Math.exp(-dt * follow);
        x += (tx - x) * a; y += (ty - y) * a; vx = 0; vy = 0;
      } else {
        var omega = mode === 3 ? 5 + (1 - amt) * 18 : 7 + (1 - amt) * 16;
        var zeta = mode === 3 ? 0.08 + (1 - amt) * 0.12 : 0.28 + (1 - amt) * 0.25;
        var ax = omega * omega * (tx - x) - 2 * zeta * omega * vx;
        var ay = omega * omega * (ty - y) - 2 * zeta * omega * vy;
        vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
      }
      mouse[0] = x; mouse[1] = y; mVel[0] = vx; mVel[1] = vy;
    }

    function resize() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.floor(target.clientWidth * dpr));
      var h = Math.max(1, Math.floor(target.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(target);
    else global.addEventListener("resize", resize);

    var last = performance.now(), frame = 0, raf = 0, time = 0, paused = false;
    if (options.respectReducedMotion !== false && global.matchMedia &&
        global.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paused = true;
    }

    function tick(now) {
      var dt = Math.min((now - last) / 1000, 0.1); last = now;
      resize();
      updateLag(dt);
      if (ptrSpeed > 0) {
        ptrSpeed *= Math.exp(-dt * DYN_DECAY);
        if (ptrSpeed < 0.001) ptrSpeed = 0;
      }
      if (!paused) {
        var rate = 1;
        if (DYNAMIC_SPEED) rate = Math.max(0, Math.min(2, (ptrSpeed / DYN_REF) * 2));
        time += dt * rate;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform3f(uRes, canvas.width, canvas.height, 1.0);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uDelta, paused ? 0.0 : dt);
      if (uFrame) gl.uniform1i(uFrame, frame);
      gl.uniform4f(uMouse, mouse[0], mouse[1], mouse[2], mouse[3]);
      if (isGL2) {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!paused) frame++;
      raf = requestAnimationFrame(tick);
    }
    resize();
    raf = requestAnimationFrame(tick);

    return {
      canvas: canvas,
      pause: function () { paused = true; },
      play: function () { paused = false; last = performance.now(); },
      destroy: function () {
        cancelAnimationFrame(raf);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  global.PerlinBackground = { mount: mount };

  var el = document.getElementById("perlin-target");
  if (el) mount(el);
})(window);
</script>
</body>
</html>`;
}

function exportPresetToFile(preset) {
  if (!preset || !preset.config) return;
  const html = buildEmbedHtml(preset.name, preset.config);
  downloadTextFile(slugify(preset.name) + "-background.html", html, "text/html");
}

function renderPresetsList() {
  if (!presetsHostEl) return;
  const list = loadPresets();
  presetsHostEl.innerHTML = "";
  updateSectionSummaries();

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "param-hint";
    empty.textContent = "No saved presets yet. Tune the controls, name it, then Save.";
    presetsHostEl.appendChild(empty);
    return;
  }

  for (const preset of list) {
    const row = document.createElement("div");
    row.className = "preset-row";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "preset-load-btn";
    loadBtn.textContent = preset.name;
    loadBtn.title = "Load this preset";
    loadBtn.addEventListener("click", () => applySerializedParams(preset.config));

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "btn btn-ghost preset-export-btn";
    exportBtn.textContent = "\u2913"; // downwards arrow to bar
    exportBtn.title = "Export as a web-background HTML file";
    exportBtn.setAttribute("aria-label", `Export preset ${preset.name} as web background`);
    exportBtn.addEventListener("click", () => exportPresetToFile(preset));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-ghost preset-del-btn";
    delBtn.textContent = "\u00d7";
    delBtn.title = "Delete preset";
    delBtn.setAttribute("aria-label", `Delete preset ${preset.name}`);
    delBtn.addEventListener("click", () => deletePreset(preset.name));

    row.appendChild(loadBtn);
    row.appendChild(exportBtn);
    row.appendChild(delBtn);
    presetsHostEl.appendChild(row);
  }
}

function buildPresetsSection() {
  const { root, body: section } =
    makeCollapsibleSection("presets", "Presets", "presets-section");

  const saveRow = document.createElement("div");
  saveRow.className = "preset-save-row";

  presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.className = "preset-name-input";
  presetNameInput.placeholder = "Name this configuration\u2026";
  presetNameInput.maxLength = 40;
  presetNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCurrentPreset();
    }
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-primary preset-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.title = "Save current controls as a preset";
  saveBtn.addEventListener("click", saveCurrentPreset);

  saveRow.appendChild(presetNameInput);
  saveRow.appendChild(saveBtn);
  section.appendChild(saveRow);

  presetsHostEl = document.createElement("div");
  presetsHostEl.className = "presets-host";
  section.appendChild(presetsHostEl);

  renderPresetsList();
  return root;
}

function currentOutputPixels() {
  if (typeof StageMath !== "undefined" && StageMath.outputPixels) {
    return StageMath.outputPixels(
      stageSettings.aspectW,
      stageSettings.aspectH,
      stageSettings.outputPreset,
      stageSettings.customW,
      stageSettings.customH
    );
  }
  return { width: 1920, height: 1080 };
}

function applyStageAspectFromUI() {
  const id = stageAspectSelect ? stageAspectSelect.value : stageSettings.aspectPreset;
  stageSettings.aspectPreset = id;
  const preset = STAGE_ASPECT_PRESETS.find((p) => p.id === id) || STAGE_ASPECT_PRESETS[0];
  if (id === "custom") {
    stageSettings.aspectW = Math.max(1, Number(stageSettings.customAspectW) || 16);
    stageSettings.aspectH = Math.max(1, Number(stageSettings.customAspectH) || 9);
  } else {
    stageSettings.aspectW = preset.w;
    stageSettings.aspectH = preset.h;
  }
  if (stageCustomAspect) stageCustomAspect.hidden = id !== "custom";
  if (stageCustomOutput) stageCustomOutput.hidden = stageSettings.outputPreset !== "custom";
  const out = currentOutputPixels();
  if (stageOutReadout) stageOutReadout.textContent = `${out.width} \u00d7 ${out.height}`;
  updateSectionSummaries();
  resizeCanvas();
}

function refreshStageUI() {
  if (stageAspectSelect) stageAspectSelect.value = stageSettings.aspectPreset;
  if (stageOutputSelect) stageOutputSelect.value = stageSettings.outputPreset;
  if (stageFpsSelect) stageFpsSelect.value = String(stageSettings.exportFps);
  if (stageCustomAspect) {
    const inputs = stageCustomAspect.querySelectorAll("input");
    if (inputs[0]) inputs[0].value = String(stageSettings.customAspectW);
    if (inputs[1]) inputs[1].value = String(stageSettings.customAspectH);
    stageCustomAspect.hidden = stageSettings.aspectPreset !== "custom";
  }
  if (stageCustomOutput) {
    const inputs = stageCustomOutput.querySelectorAll("input");
    if (inputs[0]) inputs[0].value = String(stageSettings.customW);
    if (inputs[1]) inputs[1].value = String(stageSettings.customH);
    stageCustomOutput.hidden = stageSettings.outputPreset !== "custom";
  }
  applyStageAspectFromUI();
}

function makeNumberField(value, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.value = String(value);
  input.addEventListener("change", () => {
    const n = parseFloat(input.value);
    if (isFinite(n) && n > 0) onChange(n);
  });
  return input;
}

function buildStageSection() {
  const { root, body } = makeCollapsibleSection("stage", "Stage");

  const aspectRow = document.createElement("div");
  aspectRow.className = "param-row";
  const aspectLabel = document.createElement("label");
  aspectLabel.className = "param-label";
  aspectLabel.innerHTML = "<span>Aspect</span>";
  stageAspectSelect = document.createElement("select");
  stageAspectSelect.className = "param-select";
  stageAspectSelect.innerHTML = STAGE_ASPECT_PRESETS.map(
    (p) => `<option value="${p.id}">${p.id}</option>`
  ).join("");
  stageAspectSelect.value = stageSettings.aspectPreset;
  stageAspectSelect.addEventListener("change", applyStageAspectFromUI);
  aspectRow.appendChild(aspectLabel);
  aspectRow.appendChild(stageAspectSelect);
  body.appendChild(aspectRow);

  stageCustomAspect = document.createElement("div");
  stageCustomAspect.className = "stage-custom-grid";
  stageCustomAspect.hidden = true;
  stageCustomAspect.appendChild(makeNumberField(stageSettings.customAspectW, (n) => {
    stageSettings.customAspectW = n;
    applyStageAspectFromUI();
  }));
  stageCustomAspect.appendChild(makeNumberField(stageSettings.customAspectH, (n) => {
    stageSettings.customAspectH = n;
    applyStageAspectFromUI();
  }));
  body.appendChild(stageCustomAspect);

  const outRow = document.createElement("div");
  outRow.className = "param-row";
  const outLabel = document.createElement("label");
  outLabel.className = "param-label";
  outLabel.innerHTML = "<span>Output</span>";
  stageOutReadout = document.createElement("span");
  stageOutReadout.className = "stage-out-readout";
  outLabel.appendChild(stageOutReadout);
  stageOutputSelect = document.createElement("select");
  stageOutputSelect.className = "param-select";
  stageOutputSelect.innerHTML = [
    ["1080p", "1080p"],
    ["1440p", "1440p"],
    ["4k", "4K"],
    ["custom", "Custom"],
  ].map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  stageOutputSelect.value = stageSettings.outputPreset;
  stageOutputSelect.addEventListener("change", () => {
    stageSettings.outputPreset = stageOutputSelect.value;
    applyStageAspectFromUI();
  });
  outRow.appendChild(outLabel);
  outRow.appendChild(stageOutputSelect);
  body.appendChild(outRow);

  stageCustomOutput = document.createElement("div");
  stageCustomOutput.className = "stage-custom-grid";
  stageCustomOutput.hidden = true;
  stageCustomOutput.appendChild(makeNumberField(stageSettings.customW, (n) => {
    stageSettings.customW = Math.round(n);
    applyStageAspectFromUI();
  }));
  stageCustomOutput.appendChild(makeNumberField(stageSettings.customH, (n) => {
    stageSettings.customH = Math.round(n);
    applyStageAspectFromUI();
  }));
  body.appendChild(stageCustomOutput);

  const fpsRow = document.createElement("div");
  fpsRow.className = "param-row";
  const fpsLabel = document.createElement("label");
  fpsLabel.className = "param-label";
  fpsLabel.innerHTML = "<span>Export fps</span>";
  stageFpsSelect = document.createElement("select");
  stageFpsSelect.className = "param-select";
  stageFpsSelect.innerHTML = '<option value="60">60</option><option value="30">30</option>';
  stageFpsSelect.value = String(stageSettings.exportFps);
  stageFpsSelect.addEventListener("change", () => {
    stageSettings.exportFps = parseInt(stageFpsSelect.value, 10) === 30 ? 30 : 60;
    updateSectionSummaries();
  });
  fpsRow.appendChild(fpsLabel);
  fpsRow.appendChild(stageFpsSelect);
  body.appendChild(fpsRow);

  const hint = document.createElement("p");
  hint.className = "param-hint";
  hint.textContent = "Locks the preview to the projection frame. 1080p uses 1080 on the short edge (16:9 \u2192 1920\u00d71080, 9:16 \u2192 1080\u00d71920).";
  body.appendChild(hint);

  applyStageAspectFromUI();
  return root;
}

function buildNoiseSection() {
  const { root, body } = makeCollapsibleSection("noise", "Noise");
  for (const def of PARAM_DEFS) {
    body.appendChild(makeSliderRow(def));
    if (def.key === "uSpeed") {
      body.appendChild(makeDynamicSpeedToggle());
    }
  }
  return root;
}

function buildParamsUI() {
  paramsList.innerHTML = "";

  paramsList.appendChild(buildStageSection());
  paramsList.appendChild(buildPresetsSection());
  paramsList.appendChild(buildNoiseSection());
  paramsList.appendChild(buildThreeDSection());
  paramsList.appendChild(buildCameraSection());
  paramsList.appendChild(buildMouseSection());
  paramsList.appendChild(buildColorSection());
  updateColorModeVisibility();
  updateDynamicSpeedUI();
  updateThreeDVisibility();
  updateCameraVisibility();
  updateSectionSummaries();
}

/* ============================================================
 * Playback state + render loop
 * ============================================================ */

const state = {
  playing: true,
  shaderTime: 0, // accumulated iTime (seconds)
  frame: 0,
  lastTick: performance.now(),
  // FPS tracking
  fpsAccumTime: 0,
  fpsAccumFrames: 0,
  fps: 0,
  // iMouse: xy = lagged effect pos, zw = active (sign encodes hover/press)
  mouse: [0, 0, -1, -1],
  mouseTarget: [0, 0],
  mouseVel: [0, 0],
  // Pointer speed for Dynamic Speed (canvas heights / second, smoothed)
  pointerSpeed: 0,
  pointerLastX: 0,
  pointerLastY: 0,
  pointerLastT: 0,
  pointerHasSample: false,
};

/** Map smoothed pointer speed → animation rate in [0, 2]. */
const DYNAMIC_SPEED_REF = 1.4; // canvas-heights/sec that maps to full speed 2
const DYNAMIC_SPEED_DECAY = 8; // how fast speed falls when the pointer stops

function samplePointerSpeed(clientX, clientY, nowMs) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const scale = Math.max(1, Math.min(rect.width, rect.height));
  if (state.pointerHasSample && state.pointerLastT > 0) {
    const dt = Math.max(1e-3, (nowMs - state.pointerLastT) / 1000);
    const dist = Math.hypot(x - state.pointerLastX, y - state.pointerLastY) / scale;
    const instant = dist / dt;
    // Fast attack so flicks register; slight smoothing to avoid jitter
    state.pointerSpeed = Math.max(instant, state.pointerSpeed * 0.35 + instant * 0.65);
  }
  state.pointerLastX = x;
  state.pointerLastY = y;
  state.pointerLastT = nowMs;
  state.pointerHasSample = true;
}

function dynamicSpeedFromPointer() {
  const mapped = (state.pointerSpeed / DYNAMIC_SPEED_REF) * 2;
  return Math.max(0, Math.min(2, mapped));
}

const timeReadout = document.getElementById("time-readout");
const fpsReadout = document.getElementById("fps-readout");
const resReadout = document.getElementById("res-readout");
const playBtn = document.getElementById("btn-play");

function resizeCanvas() {
  if (stageExportLock) return;
  const wrap = document.getElementById("canvas-wrap");
  const wrapW = wrap ? wrap.clientWidth : 0;
  const wrapH = wrap ? wrap.clientHeight : 0;
  if (wrapW < 2 || wrapH < 2) return;

  const fit = (typeof StageMath !== "undefined" && StageMath.letterboxSize)
    ? StageMath.letterboxSize(wrapW, wrapH, stageSettings.aspectW, stageSettings.aspectH)
    : { width: wrapW, height: wrapH };
  const cssW = Math.max(1, fit.width);
  const cssH = Math.max(1, fit.height);
  const left = (wrapW - cssW) / 2;
  const top = (wrapH - cssH) / 2;
  canvas.style.inset = "auto";
  canvas.style.left = left + "px";
  canvas.style.top = top + "px";
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (resReadout) resReadout.textContent = `${w} \u00d7 ${h}`;
}

function captureIsDriven() {
  return window.PerlinCapture && typeof window.PerlinCapture.isDriven === "function"
    && window.PerlinCapture.isDriven();
}

function drawFrame(dt) {
  if (!program) return;
  const timeDelta = dt == null ? 0 : dt;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.uniform3f(uniforms.iResolution, canvas.width, canvas.height, 1.0);
  gl.uniform1f(uniforms.iTime, state.shaderTime);
  gl.uniform1f(uniforms.iTimeDelta, timeDelta);
  gl.uniform1i(uniforms.iFrame, state.frame);
  gl.uniform4f(uniforms.iMouse, ...state.mouse);
  uploadParamsUniforms(params);

  if (isWebGL2) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/** Advance lagged effect position toward the real pointer. */
function updateMouseLag(dt) {
  const mode = params.uMouseLagMode | 0;
  const amount = Math.min(1, Math.max(0, params.uMouseLag || 0));
  const tx = state.mouseTarget[0];
  const ty = state.mouseTarget[1];

  if (mode === 0 || amount < 0.001 || params.uMouseInteract === 0) {
    state.mouse[0] = tx;
    state.mouse[1] = ty;
    state.mouseVel[0] = 0;
    state.mouseVel[1] = 0;
    return;
  }

  let x = state.mouse[0];
  let y = state.mouse[1];
  let vx = state.mouseVel[0];
  let vy = state.mouseVel[1];

  if (mode === 1) {
    // Smooth exponential follow — higher amount = more lag (slower chase)
    const follow = 2.2 + (1 - amount) * 22;
    const a = 1 - Math.exp(-dt * follow);
    x += (tx - x) * a;
    y += (ty - y) * a;
    vx = 0;
    vy = 0;
  } else {
    // Spring-damper: sine = gentle underdamped, elastic = bouncy underdamped
    const omega = mode === 3
      ? 5 + (1 - amount) * 18
      : 7 + (1 - amount) * 16;
    const zeta = mode === 3
      ? 0.08 + (1 - amount) * 0.12
      : 0.28 + (1 - amount) * 0.25;
    const ax = omega * omega * (tx - x) - 2 * zeta * omega * vx;
    const ay = omega * omega * (ty - y) - 2 * zeta * omega * vy;
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
  }

  state.mouse[0] = x;
  state.mouse[1] = y;
  state.mouseVel[0] = vx;
  state.mouseVel[1] = vy;
}

function tick(now) {
  const dt = Math.min((now - state.lastTick) / 1000, 0.1);
  state.lastTick = now;

  if (stageExportLock) {
    requestAnimationFrame(tick);
    return;
  }

  resizeCanvas();
  const driven = captureIsDriven();
  if (!driven) {
    updateMouseLag(dt);

    // Decay pointer speed toward 0 when the cursor isn't moving
    if (state.pointerSpeed > 0) {
      state.pointerSpeed *= Math.exp(-dt * DYNAMIC_SPEED_DECAY);
      if (state.pointerSpeed < 0.001) state.pointerSpeed = 0;
    }

    if (state.playing) {
      const rate = params.uDynamicSpeed ? dynamicSpeedFromPointer() : 1;
      state.shaderTime += dt * rate;

      // FPS: update readout twice a second
      state.fpsAccumTime += dt;
      state.fpsAccumFrames += 1;
      if (state.fpsAccumTime >= 0.5) {
        state.fps = state.fpsAccumFrames / state.fpsAccumTime;
        state.fpsAccumTime = 0;
        state.fpsAccumFrames = 0;
        fpsReadout.textContent = `${state.fps.toFixed(1)} fps`;
      }
      timeReadout.textContent = state.shaderTime.toFixed(2);
    }
  }

  if (window.PerlinCapture && typeof window.PerlinCapture.onTick === "function") {
    window.PerlinCapture.onTick(dt);
  }

  const takePlaying = window.PerlinCapture && typeof window.PerlinCapture.isTakePlaying === "function"
    && window.PerlinCapture.isTakePlaying();
  drawFrame((!driven && state.playing) || takePlaying ? dt : 0.0);
  if (!driven && state.playing) state.frame += 1;

  requestAnimationFrame(tick);
}

/* ============================================================
 * Mouse -> iMouse (hover interact + Shadertoy click semantics)
 * ============================================================ */

function canvasViewportNorm(e) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  // Match shader / gl_FragCoord: 0 at bottom
  const y = Math.min(1, Math.max(0, (rect.bottom - e.clientY) / rect.height));
  return [x, y];
}

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  // y flipped: gl_FragCoord origin is bottom-left
  const y = (rect.bottom - e.clientY) * (canvas.height / rect.height);
  return [x, y];
}

let mouseDown = false;
let mouseOver = false;
let mouseHasPosition = false; // keep effect at last known pos after leave
let activePointerId = null;

function isTouchLikePointer(e) {
  return e.pointerType === "touch" || e.pointerType === "pen";
}

function setMouseActive(active) {
  if (active) {
    state.mouse[2] = Math.abs(state.mouse[0] || 1);
    state.mouse[3] = Math.abs(state.mouse[1] || 1);
  } else {
    state.mouse[2] = -Math.abs(state.mouse[2] || 1);
    state.mouse[3] = -Math.abs(state.mouse[3] || 1);
  }
}

function refreshMouseActive() {
  // Once we've seen a pointer position, keep the effect alive at that spot
  // even after the cursor leaves the canvas (until interact is turned off).
  const keepAlive = params.uMouseInteract > 0 && mouseHasPosition;
  setMouseActive(keepAlive || mouseDown);
}

function syncMouseFromEvent(e) {
  const [x, y] = canvasCoords(e);
  state.mouseTarget[0] = x;
  state.mouseTarget[1] = y;
  mouseHasPosition = true;
  // Without lag, keep effect glued to the pointer
  if ((params.uMouseLagMode | 0) === 0 || (params.uMouseLag || 0) < 0.001) {
    state.mouse[0] = x;
    state.mouse[1] = y;
    state.mouseVel[0] = 0;
    state.mouseVel[1] = 0;
  }
  refreshMouseActive();
}

function shouldTrackPointer(e) {
  if (captureIsDriven()) return false;
  // Desktop hover, active press/drag, or any in-progress touch/pen stroke
  return mouseOver || mouseDown || (e.buttons & 1) === 1 || isTouchLikePointer(e);
}

canvas.addEventListener("pointerenter", (e) => {
  if (captureIsDriven()) return;
  mouseOver = true;
  const [x, y] = canvasCoords(e);
  state.mouseTarget[0] = x;
  state.mouseTarget[1] = y;
  // Snap on enter so lag doesn't fly in from a stale corner
  state.mouse[0] = x;
  state.mouse[1] = y;
  state.mouseVel[0] = 0;
  state.mouseVel[1] = 0;
  mouseHasPosition = true;
  // Seed pointer sample without counting the enter jump as motion
  state.pointerHasSample = false;
  samplePointerSpeed(e.clientX, e.clientY, performance.now());
  syncMouseFromEvent(e);
});

canvas.addEventListener("pointerleave", () => {
  // Keep tracking while a captured touch/pen drag continues off-canvas
  if (mouseDown) return;
  mouseOver = false;
  state.pointerHasSample = false;
  // Do not clear the effect — leave it parked at the last known position.
  refreshMouseActive();
});

canvas.addEventListener("pointerdown", (e) => {
  if (captureIsDriven()) return;
  if (placingAnchorIndex >= 0 && placingAnchorIndex < params.anchors.length) {
    const [nx, ny] = canvasViewportNorm(e);
    const a = params.anchors[placingAnchorIndex];
    a.x = nx;
    a.y = ny;
    setPlacingAnchor(-1);
    syncParamsToEditor();
    e.preventDefault();
    return;
  }

  // Touch/pen: prevent page scroll so dragging drives the shader like mouse hover
  if (isTouchLikePointer(e)) e.preventDefault();

  mouseDown = true;
  mouseOver = true;
  activePointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  state.pointerHasSample = false;
  samplePointerSpeed(e.clientX, e.clientY, performance.now());
  syncMouseFromEvent(e);
}, { passive: false });

canvas.addEventListener("pointermove", (e) => {
  if (!shouldTrackPointer(e)) return;
  if (activePointerId != null && e.pointerId !== activePointerId && isTouchLikePointer(e)) {
    return;
  }
  if (isTouchLikePointer(e) && mouseDown) e.preventDefault();
  samplePointerSpeed(e.clientX, e.clientY, performance.now());
  syncMouseFromEvent(e);
}, { passive: false });

function endPointerStroke(e) {
  if (activePointerId != null && e.pointerId !== activePointerId) return;
  mouseDown = false;
  activePointerId = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  // Touch has no hover: park at last position (same as leaving the canvas on desktop)
  if (isTouchLikePointer(e)) {
    mouseOver = false;
    state.pointerHasSample = false;
    refreshMouseActive();
    return;
  }
  if (mouseOver) syncMouseFromEvent(e);
  else refreshMouseActive();
}

canvas.addEventListener("pointerup", endPointerStroke);
canvas.addEventListener("pointercancel", endPointerStroke);
canvas.addEventListener("lostpointercapture", (e) => {
  if (activePointerId === e.pointerId) {
    mouseDown = false;
    activePointerId = null;
    if (!mouseOver) refreshMouseActive();
  }
});

/* ============================================================
 * Toolbar controls
 * ============================================================ */

function setPlaying(playing) {
  state.playing = playing;
  playBtn.innerHTML = playing ? "&#9208;" : "&#9654;"; // pause / play glyphs
  playBtn.title = playing ? "Pause" : "Play";
  if (playing) state.lastTick = performance.now();
}

playBtn.addEventListener("click", () => setPlaying(!state.playing));

document.getElementById("btn-rewind").addEventListener("click", () => {
  state.shaderTime = 0;
  state.frame = 0;
  timeReadout.textContent = "0.00";
});

/* ============================================================
 * Editor + compile pipeline
 * ============================================================ */

const consoleEl = document.getElementById("console");

const editor = CodeMirror(document.getElementById("editor-host"), {
  value: DEFAULT_SHADER,
  mode: "x-shader/x-fragment",
  theme: "material-darker",
  lineNumbers: true,
  indentUnit: 4,
  tabSize: 4,
  matchBrackets: true,
  viewportMargin: 40,
});

let errorLineHandles = [];

function clearErrorMarks() {
  for (const h of errorLineHandles) {
    editor.removeLineClass(h, "background", "cm-error-line");
  }
  errorLineHandles = [];
}

// GLSL logs look like: "ERROR: 0:23: 'foo' : undeclared identifier"
function parseErrorLog(log) {
  const errors = [];
  const re = /ERROR:\s*\d+:(\d+):\s*(.*)/g;
  let m;
  while ((m = re.exec(log)) !== null) {
    // Thanks to `#line 1` the reported number is already the user-code
    // line; drivers that ignore #line report header-offset numbers, so
    // clamp anything past the document into range after subtracting.
    let line = parseInt(m[1], 10);
    if (line > editor.lineCount()) line -= HEADER_LINES;
    errors.push({ line: Math.max(1, line), message: m[2].trim() });
  }
  return errors;
}

function showConsole(text, ok) {
  consoleEl.hidden = false;
  consoleEl.textContent = text;
  consoleEl.classList.toggle("ok", !!ok);
  if (ok) {
    setTimeout(() => {
      if (consoleEl.classList.contains("ok")) consoleEl.hidden = true;
    }, 1600);
  }
}

function compile(options = {}) {
  const quiet = !!options.quiet;
  clearErrorMarks();
  const code = editor.getValue();
  if (!syncingFromParams) parseParamsFromCode(code);
  const result = buildProgram(code);

  if (result.ok) {
    if (!quiet) showConsole("Compiled successfully.", true);
    else consoleEl.hidden = true;
    return true;
  }

  const errors = parseErrorLog(result.log);
  if (errors.length === 0) {
    showConsole(result.log, false);
    return false;
  }

  const lines = [];
  for (const err of errors) {
    lines.push(`Line ${err.line}: ${err.message}`);
    const handle = editor.addLineClass(err.line - 1, "background", "cm-error-line");
    errorLineHandles.push(handle);
  }
  showConsole(lines.join("\n"), false);
  editor.scrollIntoView({ line: errors[0].line - 1, ch: 0 }, 80);
  return false;
}

function syncParamsToEditor() {
  updateSectionSummaries();
  if (suppressEditorSync) {
    if (window.PerlinCapture && typeof window.PerlinCapture.onParamsEdited === "function") {
      window.PerlinCapture.onParamsEdited();
    }
    return;
  }
  const block = buildParamsBlock();
  let code = editor.getValue();
  if (PARAMS_BLOCK_RE.test(code)) {
    code = code.replace(PARAMS_BLOCK_RE, block);
  } else {
    code = block + "\n\n" + code;
  }

  const cursor = editor.getCursor();
  const scroll = editor.getScrollInfo();
  syncingFromParams = true;
  editor.setValue(code);
  editor.setCursor(cursor);
  editor.scrollTo(scroll.left, scroll.top);
  syncingFromParams = false;
  if (!usingParamUniforms) compile({ quiet: true });
  if (window.PerlinCapture && typeof window.PerlinCapture.onParamsEdited === "function") {
    window.PerlinCapture.onParamsEdited();
  }
}

function resetParams() {
  for (const def of PARAM_DEFS) params[def.key] = def.value;
  for (const def of COLOR_SLIDER_DEFS) params[def.key] = def.value;
  for (const def of MOUSE_SLIDER_DEFS) params[def.key] = def.value;
  for (const def of THREED_SLIDER_DEFS) params[def.key] = def.value;
  for (const def of CAMERA_SLIDER_DEFS) params[def.key] = def.value;
  params.uColorMode = 0;
  params.uDynamicSpeed = 0;
  params.u3D = 0;
  params.lightColor = DEFAULT_LIGHT_COLOR;
  params.uCam = 0;
  params.uGeom = 0;
  params.hazeColor = DEFAULT_HAZE_COLOR;
  params.uMouseInteract = 0;
  params.uMouseLagMode = 0;
  params.uStopCount = 4;
  params.stops = DEFAULT_STOPS.slice();
  params.positions = evenPositions(MAX_STOPS);
  params.anchors = [];
  placingAnchorIndex = -1;
  canvas.classList.remove("placing-anchor");
  mouseHasPosition = false;
  state.mouse[2] = -1;
  state.mouse[3] = -1;
  state.pointerSpeed = 0;
  state.pointerHasSample = false;
  applyParamsToUI();
  syncParamsToEditor();
}

buildParamsUI();

function setParamsPanelOpen(open) {
  paramsPanel.classList.toggle("hidden", !open);
  const btn = document.getElementById("btn-params-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", open ? "true" : "false");
    btn.title = open ? "Hide controls" : "Show controls";
  }
}

document.getElementById("btn-params-reset").addEventListener("click", resetParams);

document.getElementById("btn-params-toggle").addEventListener("click", () => {
  setParamsPanelOpen(paramsPanel.classList.contains("hidden"));
});

const paramsCloseBtn = document.getElementById("btn-params-close");
if (paramsCloseBtn) {
  paramsCloseBtn.addEventListener("click", () => setParamsPanelOpen(false));
}

/* Mobile Preview / Code view switcher */
const MOBILE_MQ = window.matchMedia("(max-width: 860px)");
let mobileView = "preview";

function setMobileView(view) {
  mobileView = view === "code" ? "code" : "preview";
  document.body.classList.toggle("mobile-view-code", mobileView === "code");
  document.body.classList.toggle("mobile-view-preview", mobileView === "preview");
  document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
    const active = btn.getAttribute("data-mobile-view") === mobileView;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  // CodeMirror needs a refresh after becoming visible
  requestAnimationFrame(() => {
    editor.refresh();
    resizeCanvas();
  });
}

document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setMobileView(btn.getAttribute("data-mobile-view"));
  });
});

function syncMobileLayout() {
  if (MOBILE_MQ.matches) {
    setMobileView(mobileView);
    // Prefer a clear preview first; open Controls via the gear when needed
    if (!document.body.dataset.mobileParamsInit) {
      document.body.dataset.mobileParamsInit = "1";
      setParamsPanelOpen(false);
    }
  } else {
    document.body.classList.remove("mobile-view-code", "mobile-view-preview");
    requestAnimationFrame(() => editor.refresh());
  }
}

if (typeof MOBILE_MQ.addEventListener === "function") {
  MOBILE_MQ.addEventListener("change", syncMobileLayout);
} else if (typeof MOBILE_MQ.addListener === "function") {
  MOBILE_MQ.addListener(syncMobileLayout);
}

/* Fullscreen shader view (Esc to exit) */
const fullscreenHint = document.getElementById("fullscreen-hint");
let fullscreenHintTimer = null;

function setFullscreen(on) {
  document.body.classList.toggle("fullscreen", on);
  const btn = document.getElementById("btn-fullscreen");
  if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");

  if (fullscreenHintTimer) clearTimeout(fullscreenHintTimer);
  if (on && fullscreenHint) {
    fullscreenHint.classList.add("show");
    fullscreenHintTimer = setTimeout(() => fullscreenHint.classList.remove("show"), 2200);
  } else if (fullscreenHint) {
    fullscreenHint.classList.remove("show");
  }
  editor.refresh();
}

document.getElementById("btn-fullscreen").addEventListener("click", () => {
  setFullscreen(!document.body.classList.contains("fullscreen"));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("fullscreen")) {
    setFullscreen(false);
  }
});

document.getElementById("btn-run").addEventListener("click", () => compile());

editor.setOption("extraKeys", {
  "Cmd-Enter": () => compile(),
  "Ctrl-Enter": () => compile(),
});

/* ============================================================
 * Draggable divider
 * ============================================================ */

const divider = document.getElementById("divider");
const editorPane = document.querySelector(".pane-editor");

divider.addEventListener("pointerdown", (e) => {
  divider.classList.add("dragging");
  divider.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const total = document.querySelector(".split").getBoundingClientRect();
    const pct = ((ev.clientX - total.left) / total.width) * 100;
    editorPane.style.flexBasis = Math.min(80, Math.max(15, pct)) + "%";
    editor.refresh();
  };
  const onUp = () => {
    divider.classList.remove("dragging");
    divider.removeEventListener("pointermove", onMove);
    divider.removeEventListener("pointerup", onUp);
  };
  divider.addEventListener("pointermove", onMove);
  divider.addEventListener("pointerup", onUp);
});

window.addEventListener("resize", () => {
  editor.refresh();
  resizeCanvas();
});

/* ============================================================
 * Boot
 * ============================================================ */

window.PerlinStageHost = {
  canvas,
  gl,
  params,
  state,
  stageSettings,
  serializeParams,
  applySerializedParams,
  applyParamsToUI,
  syncParamsToEditor,
  setPlaying,
  uploadParamsUniforms,
  drawFrame,
  resizeCanvas,
  refreshStageUI,
  setSuppressEditorSync: (v) => { suppressEditorSync = !!v; },
  setExportLock: (v) => { stageExportLock = !!v; },
  isExportLocked: () => stageExportLock,
};

syncMobileLayout();
compile();
try {
  if (window.PerlinCapture && typeof window.PerlinCapture.init === "function") {
    window.PerlinCapture.init(window.PerlinStageHost);
  }
} catch (err) {
  console.error("Stage capture failed to initialize:", err);
}
requestAnimationFrame(tick);
