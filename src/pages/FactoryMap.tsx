import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { assetColors, sendayanAssets } from "./factoryLayout";
import { animateRobot, buildQcLine, buildRobotStation, type RobotRig } from "./factoryModels";
import "./factory-map.css";

type FactoryView = "overview" | "top" | "line-1" | "line-2";

function FactoryScene({ selected, onSelect, view, moving }: { selected: string | null; onSelect: (id: string) => void; view: { mode: FactoryView; revision: number }; moving: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<{ select: (id: string | null) => void; view: (mode: string) => void; motion: (enabled: boolean) => void } | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Sendayan factory 3D overview. Use the equipment list to select an asset with a keyboard.");
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-keyshortcuts", "Space");
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#111e2b");
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 700);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2.05; controls.minDistance = 12; controls.maxDistance = 240;
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    let spacePanning = false, pointerInside = false;
    const resetSpace = () => { spacePanning = false; controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; container.classList.remove("factory-space-pan"); };
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.code !== "Space" || (target instanceof HTMLElement && target.closest("input, textarea, select, button, a, [contenteditable]"))) return;
      if (!pointerInside && document.activeElement !== renderer.domElement) return;
      event.preventDefault(); spacePanning = true; controls.mouseButtons.LEFT = THREE.MOUSE.PAN; container.classList.add("factory-space-pan");
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === "Space" && spacePanning) { event.preventDefault(); resetSpace(); } };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", resetSpace);
    const render = () => renderer.render(scene, camera);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x35485a, 2.3));
    const sun = new THREE.DirectionalLight(0xffefd1, 3); sun.position.set(-30, 70, 20); scene.add(sun);
    const mesh = (parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = h / 2, z = 0) => {
      const object = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .15 }));
      object.position.set(x, y, z); parent.add(object); return object;
    };
    mesh(scene, 110, .35, 80, "#293947", 0, -.3, 0);
    const grid = new THREE.GridHelper(110, 55, 0x405260, 0x30424f); grid.position.y = -.1; scene.add(grid);
    // Aisles reproduce the plan's broad circulation pattern, without safety-route claims.
    mesh(scene, 46, .03, 4, "#405d58", -14, .015, 0);
    mesh(scene, 3, .03, 49, "#405d58", 13, .015, 0);
    mesh(scene, 3, .03, 28, "#405d58", -32, .015, -12);
    const roots = new Map<string, THREE.Group>();
    const robots: RobotRig[] = [];
    for (const asset of sendayanAssets) {
      const root = new THREE.Group(); root.position.set(asset.x, 0, asset.z); root.userData.assetId = asset.id;
      scene.add(root); roots.set(asset.id, root);
      const { width: w, depth: d } = asset; const color = assetColors[asset.kind];
      mesh(root, w, .18, d, color);
      if (asset.kind === "forming") {
        mesh(root, w * .83, .9, d * .8, "#b57e25", 0, .65);
        for (const x of [-w * .32, w * .32]) for (const z of [-d * .3, d * .3]) mesh(root, .8, 4.8, .8, "#c5cdd1", x, 3, z);
        mesh(root, w * .84, 1.1, d * .8, color, 0, 5.4);
        mesh(root, w * .65, .6, d * .65, "#9ca6aa", 0, 2.4);
        mesh(root, w * .48, .4, d * .5, "#394854", 0, 2.9);
        mesh(root, 2, 2.3, 2, color, w * .48, 1.2, 0);
        mesh(root, .1, 1, 1.2, "#172d3b", w * .48 + 1.05, 1.7, 0);
      } else if (asset.kind === "waterjet" || asset.kind === "glue") {
        robots.push(buildRobotStation(root, asset));
      } else if (asset.kind === "qc") {
        buildQcLine(root, asset);
      } else if (asset.kind === "rack") {
        const height = 2.6;
        for (const x of [-w / 2 + .2, w / 2 - .2]) for (const z of [-d / 2 + .2, d / 2 - .2]) mesh(root, .22, height, .22, "#566b80", x, height / 2, z);
        for (const y of [.6, 1.5, 2.4]) mesh(root, w, .15, d, color, 0, y);
      } else if (asset.kind === "tank") {
        const height = 2.8;
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, height, 24), new THREE.MeshStandardMaterial({ color })); tank.position.y = height / 2; root.add(tank);
      } else if (asset.kind !== "area") {
        const height = asset.kind === "room" ? 1.3 : 1.9;
        mesh(root, w * .9, height, d * .9, color);
      }
    }
    const highlight = new THREE.BoxHelper(roots.get("asano-upper")!, 0x78e6d1); highlight.visible = false; scene.add(highlight);
    let selectedRoot: THREE.Group | undefined;
    let frame = 0, elapsed = 0, previousTime = 0, motionEnabled = false;
    const tick = (now: number) => {
      elapsed += Math.min((now - previousTime) / 1000, .05); previousTime = now;
      robots.forEach(robot => animateRobot(robot, elapsed));
      if (selectedRoot) highlight.setFromObject(selectedRoot);
      render(); frame = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (motionEnabled && !document.hidden) { previousTime = performance.now(); frame = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", syncMotion);
    controller.current = {
      select(id) { selectedRoot = id ? roots.get(id) : undefined; highlight.visible = !!selectedRoot; if (selectedRoot) highlight.setFromObject(selectedRoot); render(); },
      view(mode) {
        setHover(null);
        if (mode === "line-1" || mode === "line-2") {
          const z = mode === "line-1" ? 17 : -17;
          controls.target.set(-12, 0, z); camera.position.set(7, 28, z + 32);
        } else { controls.target.set(0, 0, 0); camera.position.set(...(mode === "top" ? [0, 125, .1] : [78, 86, 105]) as [number, number, number]); }
        controls.update(); render();
      },
      motion(enabled) { motionEnabled = enabled; syncMotion(); }
    };
    controller.current.view("overview");
    const resize = new ResizeObserver(() => { const { width, height } = container.getBoundingClientRect(); if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); render(); }); resize.observe(container);
    controls.addEventListener("change", render);
    const ray = new THREE.Raycaster(); let down = { x: 0, y: 0 }, gestureMoved = false;
    const pointers = new Set<number>();
    const pointerDown = (event: PointerEvent) => {
      if (!pointers.size) { down = { x: event.clientX, y: event.clientY }; gestureMoved = spacePanning; }
      pointers.add(event.pointerId); if (pointers.size > 1) gestureMoved = true;
      renderer.domElement.focus({ preventScroll: true }); setHover(null);
    };
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObjects([...roots.values()], true)[0]; let object: THREE.Object3D | null = hit?.object ?? null;
      while (object && !object.userData.assetId) object = object.parent;
      return object?.userData.assetId as string | undefined;
    };
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (event.button !== 0 || gestureMoved || spacePanning || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const id = pick(event); if (id) onSelect(id);
      pointerMove(event);
    };
    const pointerMove = (event: PointerEvent) => {
      pointerInside = true;
      if (pointers.has(event.pointerId) && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) gestureMoved = true;
      if (event.pointerType === "touch" || event.buttons) { setHover(null); return; }
      const id = pick(event), asset = sendayanAssets.find(item => item.id === id);
      renderer.domElement.style.cursor = spacePanning ? "grab" : asset ? "pointer" : "grab";
      const rect = container.getBoundingClientRect();
      setHover(asset ? { name: asset.name, x: Math.max(8, Math.min(event.clientX - rect.left + 14, rect.width - 230)), y: Math.max(8, Math.min(event.clientY - rect.top + 14, rect.height - 50)) } : null);
    };
    const pointerLeave = () => { pointerInside = false; setHover(null); };
    const pointerCancel = (event: PointerEvent) => { pointers.delete(event.pointerId); gestureMoved = true; setHover(null); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerleave", pointerLeave);
    renderer.domElement.addEventListener("pointercancel", pointerCancel);
    return () => {
      window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", resetSpace);
      cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", syncMotion);
      controller.current = null; resize.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      scene.traverse(object => { const drawable = object as THREE.Mesh; drawable.geometry?.dispose(); const materials = drawable.material ? (Array.isArray(drawable.material) ? drawable.material : [drawable.material]) : []; materials.forEach(material => material.dispose()); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [onSelect]);
  useEffect(() => controller.current?.select(selected), [selected]);
  useEffect(() => controller.current?.view(view.mode), [view]);
  useEffect(() => controller.current?.motion(moving), [moving]);
  return <div className="factory-canvas" ref={host}>{hover && <div className="factory-hover-name" role="tooltip" style={{ left: hover.x, top: hover.y }}>{hover.name}</div>}{error && <div className="factory-render-error" role="alert">3D rendering is unavailable in this browser. You can still explore the equipment list and details.</div>}</div>;
}

export function FactoryMapPage() {
  const [site, setSite] = useState("sendayan");
  const [selected, setSelected] = useState<string | null>("asano-upper");
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [view, setView] = useState<{ mode: FactoryView; revision: number }>({ mode: "overview", revision: 0 });
  const asset = sendayanAssets.find(item => item.id === selected);
  const items = sendayanAssets.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="factory-page">
    <div className="page-header"><div><h1>3D Factory Map</h1><p>Explore your sites, equipment and working areas.</p></div><label className="factory-site">Site<select value={site} onChange={event => setSite(event.target.value)}><option value="sendayan">Sendayan</option><option value="port-klang">Port Klang</option></select></label></div>
    {site === "port-klang" ? <section className="factory-placeholder"><span>PORT KLANG</span><h2>Your next factory view</h2><p>The Port Klang layout has not been added yet.</p><button type="button" className="btn" onClick={() => setSite("sendayan")}>Explore Sendayan</button></section> : <>
      <div className="factory-notice"><strong>Sendayan · layout preview</strong><span>Line 1 (lower) and Line 2 (upper) share the same layout. Approximate scale · Illustrative robot motion · No live readings.</span></div>
      <div className="factory-workspace"><section className="factory-viewport" aria-label="Interactive factory map">
        <div className="factory-toolbar"><div><small>SUGIHARA GRAND INDUSTRIES</small><strong>Sendayan / Open floor</strong></div><div className="factory-view-buttons"><button type="button" onClick={() => setView(previous => ({ mode: "overview", revision: previous.revision + 1 }))}>Reset view</button><button type="button" onClick={() => setView(previous => ({ mode: "top", revision: previous.revision + 1 }))}>Top view</button>{([1, 2] as const).map(line => <button type="button" key={line} onClick={() => setView(previous => ({ mode: `line-${line}`, revision: previous.revision + 1 }))}>Line {line}</button>)}<button type="button" aria-pressed={moving} onClick={() => setMoving(previous => !previous)}>{moving ? "Pause robots" : "Animate robots"}</button></div></div>
        <FactoryScene selected={selected} onSelect={setSelected} view={view} moving={moving} />
        <div className="factory-map-footer"><span>Desktop: drag to rotate · Hold Space + drag to pan · Scroll to zoom<br />Mobile: one finger to pan · Two fingers to rotate / pinch to zoom · Tap for details</span><span><i /> Asano <i /> ABB / UR <i /> QC lighting</span></div>
      </section><aside className="factory-sidebar">
        <section className="factory-detail" aria-live="polite"><small>SELECTED EQUIPMENT / AREA</small><h2>{asset?.name ?? "Select equipment"}</h2>{asset && <><span className="factory-kind">{asset.kind === "forming" ? "Asano forming machine" : asset.kind === "waterjet" ? "ABB robotic waterjet" : asset.kind === "glue" ? "UR auto glue" : asset.kind === "qc" ? "QC inspection & lighting" : asset.kind === "area" ? "Working area" : asset.kind === "room" ? "Facility" : asset.kind}</span><p>{asset.note ?? "Placed using the current Sendayan fire plan. Select another item in the map or equipment list to explore."}</p><div className="factory-data-status"><i />Layout only · no live status</div></>}</section>
        <div className="factory-equipment-heading"><h3>Equipment & areas</h3><span>{items.length}</span></div>
        <label className="factory-search"><span>Find equipment or an area</span><input type="search" placeholder="Search Line 1, ABB, UR, QC…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="factory-asset-list">{items.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><i style={{ background: assetColors[item.kind] }} /><span>{item.name}</span><span aria-hidden="true">↗</span></button>)}{!items.length && <p>No matching equipment or areas.</p>}</div>
      </aside></div>
    </>}
  </div>;
}
