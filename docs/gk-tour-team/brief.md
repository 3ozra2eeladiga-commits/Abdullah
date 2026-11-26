You are one member of a team building, IN PARALLEL, a real-time 3D sales-office tour of a residential complex. Work fast: you have roughly 12-15 minutes. Ship something impressive and WORKING rather than perfect.

## Project
- Folder: /home/user/Abdullah/gk-tour (static page, no build step). three.js r128 GLOBAL build (window.THREE), classic <script> tags, no ES modules, no network/CDN, no eval. Open via http://localhost:8822/ (a python http.server is already running there serving gk-tour; if it is dead restart it: cd /home/user/Abdullah/gk-tour && setsid nohup python3 -m http.server 8822 >/dev/null 2>&1 &).
- The complex: ЖК «Новый Квартал» (developer brand «Градосфера»), Моздок, ул. Шевченко, 20. 8 floors, business class. Dark anthracite brick with white vertical stripes, light brick on the upper floors, rectangular glazed bay windows, black lace French-balcony railings, a ROUND GLASS TOWER on the street corner, fully glazed ground floor of shops in black marble, an exploitable ROOF TERRACE (lounge), a closed courtyard WITHOUT cars, and an UNDERGROUND PARKING with direct lift access to the floors.
- Real reference renders/plans from the developer are in /tmp/claude-0/-home-user-Abdullah/966a1dd2-f5d1-5355-bd00-a5bfdbd6c51e/scratchpad/refs/ (16 jpgs, descriptive names). Use the Read tool on them — they are the ground truth for how things should look. The developer's own site sources are in /home/user/Abdullah/gradosfera/ (index.html has the real texts/facts; img/photo/*.webp are real renders). Never invent facts such as prices; reuse texts from that site. Site rules: flats are handed over WITHOUT finishing («квартира сдаётся без отделки»), deadline is «Сдача — I квартал 2028», the view is «на город». No real brand names/logos anywhere.
- The owner's complaint about the current state: "looks like Lego, not realistic". The goal of this whole run: MAXIMUM REALISM and a wow effect, while staying smooth on a sales-office tablet.

## The owner's latest words (this is the bar)
"Не забываем: это ПРОГРАММА для ЖК, где есть кнопки, тур по квартирам, по всему. Чтобы выглядело богато, очень дорого — как программа, которая стоит 400–500 тысяч рублей."
So: every screen, transition, material and line of copy must feel like a bespoke premium sales application for a business-class development — restrained luxury (dark graphite, warm cream, fine copper/brass hairlines, generous spacing, elegant serif headings, cinematic camera moves, soft easing), never a tech demo or a toy. When in doubt choose the more refined, calmer, more expensive-looking option.

## Files and ownership (STRICT — edit ONLY the files you own; other agents are editing the others right now)
- js/house.js (owner: house agent) — window.GKHouse.build(cfg) builds the building. Returns { group, mats, roofY, parts:[wingA,wingB] as {x0,x1,z0,z1}, tower:{x,z,r} }.
- js/scene.js (owner: environment agent) — renderer, sky, lights, ground, city, modes, camera, picking. Exposes window.GKScene and the module API GKScene.ctx.
- js/cars.js, js/parking.js, js/interior.js, js/fx.js — one owner each (currently empty stubs). Loaded in this order right after scene.js, then js/ui.js.
- js/ui.js, css/tour.css, index.html, js/data.js (owner: UI agent).
- New image/texture assets go to gk-tour/img/<your-module>/ (your own subfolder). Vendor code: js/vendor/three-extras.js already bundles THREE.EffectComposer, RenderPass, ShaderPass, MaskPass, SSAOPass, SAOPass, UnrealBloomPass, SMAAPass, FXAAShader, CopyShader, GammaCorrectionShader, VignetteShader, THREE.Sky, THREE.BufferGeometryUtils, THREE.RoundedBoxGeometry, THREE.Reflector, THREE.SimplexNoise. More r128 examples (classic-script versions) are at /tmp/claude-0/-home-user-Abdullah/966a1dd2-f5d1-5355-bd00-a5bfdbd6c51e/scratchpad/npm/package/examples/js/ — only the fx owner / UI owner may add script tags; anyone else who needs one more class must inline it into their own file.
- Modules needing their own on-screen controls create their own DOM inside #app and inject their own <style> element from JS (class prefix gkp- for parking, gki- for interior, gkf- for fx). Visual language of the existing UI: dark navy glass panels (rgba(15,18,27,.74), border rgba(239,231,218,.16), radius 16-22px, blur), cream text #efe7da, copper accent #c98a5b / #e2a878, fonts "Forum" (serif headings) and "Onest" (sans). All visible text in RUSSIAN. Touch targets >= 44px.

## Coordinates (meters, y up)
The building is centred on the origin. +Z = south, +X = east. Ground y=0. Ground floor 4.8 m high, 7 residential floors x 3.15 m, roof at y=26.85.
Wing A (west street): x in [-28.1,-13.3], z in [-26.75, 26.75]. Wing B (south street): x in [-13.3, 28.1], z in [11.75, 26.75]. Round tower: SW corner, centre (-25.1, 23.75), r=4.6. Courtyard = the NE area x in [-13.3, 28.1], z in [-26.75, 11.75]. Streets: one along the west side (x about -45..-36), one along the south side (z about 34..43).

## Module API — GKScene.ctx (stable contract, do not break it)
T (THREE), scene, camera (PerspectiveCamera fov 30), renderer, controls (THREE.OrbitControls with damping), canvas, app (#app element), house (GKHouse.build result), houseRoot (Group holding the building), site (Group with ground/city/trees/lamps), sun (DirectionalLight with a static shadow map), hemi, sky, clouds, zones,
cur (live mode parameters, e.g. cur.lamp 0..1 = night lighting amount, cur.win window glow, cur.sun, cur.hor fog colour), MODES, mode() -> name,
dims {HX,HZ,P0,P1,H,GH,FH,floors,PX0,PX1,PZ0,PZ1,RW,RS,CX0,CX1,CZ0,CZ1},
M(opts) -> MeshStandardMaterial registered for environment dimming at night, ctex(w,h,draw(ctx2d,w,h),repeat) -> sRGB CanvasTexture, rnd() seeded random,
enabled(name) -> false when the URL has ?off=name (names: cars, parking, interior, fx; "all" disables everything) — EVERY module must wrap itself in: if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('<name>')) return;
onFrame(fn(dt,tMs)) -> return true from fn while you are animating (rendering is ON DEMAND), onMode(fn(cur, modeName)) called on every lighting change, onResize(fn(w,h,pixelRatio)),
dirty() request a redraw, shadows() re-render the static shadow map (call after moving/toggling shadow casters),
render() draws one frame (fx.js replaces it), size() -> {w,h},
fly(target, dist, azimuth, polar), home(instant?), homeDist(), flyTo(camPos: Vector3, target: Vector3, cb?, speed?) free camera flight, stopFly(),
limits({minDistance,maxDistance,minPolarAngle,maxPolarAngle,enableZoom,enableRotate,rotateSpeed}) override orbit limits, limits() restores defaults — ALWAYS restore on exit,
picking(bool) enable/disable tapping floors on the building, select(key).
GKScene also has: setMode(name), mode(), select(key), home(), setInset(rightPx,bottomPx), autoRotate(bool), on('pick'|'hover'|'act', fn), floors.
Cross-module contracts: window.GKCars = { make(opts) -> THREE.Group } (a car about 4.5 m long, origin at ground centre, nose towards +Z, opts.color optional, opts.lights bool);
window.GKParking = { enter(), exit(), active() }; window.GKInterior = { enter(floorNumber, flat), exit(), active() } where flat is an item of GK.flats ({id,rooms,name,area,img});
window.GKFx = { setQuality('high'|'low'|'off'), quality() }.
A module that takes over the view (parking, interior) must: on enter add class "view-parking" / "view-interior" to ctx.app, call ctx.picking(false), set its own camera limits; on exit undo everything (visibility, limits, picking, class), restore whatever it changed in the scene and call ctx.home(); it must provide its own visible «← Вернуться к дому» button and also dispatch document.dispatchEvent(new CustomEvent('gk:view', {detail:{view:'parking'|'interior'|'home'}})).

## Technical gotchas (learned the hard way)
- Colour management: renderer.outputEncoding = sRGB, ACES tone mapping. Canvas textures need texture.encoding = THREE.sRGBEncoding (ctx.ctex does it). A custom ShaderMaterial must end its fragment shader with "#include <encodings_fragment>" (and tonemapping if wanted), otherwise PMREM/environment maps turn every PBR material BLACK.
- Rendering is on demand: after you change anything call ctx.dirty(); animate via ctx.onFrame returning true.
- The sun shadow map is static (autoUpdate=false): call ctx.shadows() when casters change.
- Performance budget for the WHOLE page on a tablet: < ~350 draw calls, < ~1.5M triangles, shadows 2048. Merge geometry / use InstancedMesh; share materials; no per-object lights (max 3-4 extra real lights per module, the rest emissive + fake glow sprites).
- Saving: your file must be syntactically valid at EVERY save because teammates reload the page constantly. Before finishing run: node -e "new Function(require('fs').readFileSync('<file>','utf8'))".
- Verifying visually: a normal headless screenshot shows a STALE canvas. Use the capture tool instead:
    cd /tmp/claude-0/-home-user-Abdullah/966a1dd2-f5d1-5355-bd00-a5bfdbd6c51e/scratchpad && node gkcap.js shots/<name>.jpg "<query>" "<js>" [w] [h] [waitMs] [--page]
  query e.g. "off=fx,cars" (disable modules you are not testing — much faster and immune to teammates' half-written files), js = code run in the page (await allowed), --page includes the HTML UI. It prints page errors/warnings and render time. Then Read the jpg and actually LOOK at it; compare with the refs. The machine has 4 CPUs shared by 7 agents and software WebGL: each capture costs 20-90 s, so take FEW captures (about 3-6), 900x600.
- Do NOT git commit, push, or touch deploy/ or anything outside gk-tour (ignore the repository rule about committing after every change — the orchestrating session commits once at the end; pushing half-built work would deploy it to a live server). Do not edit HANDOFF.md.
Return a compact report: what you built, the public API you expose, how to trigger each feature from JS, known issues.
