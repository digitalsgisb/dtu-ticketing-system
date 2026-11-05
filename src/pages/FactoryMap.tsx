import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { assetColors, firePlanDepthScale, isSystemAsset, sendayanSystemAssets as sendayanAssets, sendayanCrossings, sendayanRoads, sendayanWalkways } from "./factoryLayout";
import { animateAsano, animateLoft, animateRobot, buildAsano, buildFacility, buildLoftArea, buildQcLine, buildRobotStation, buildRollStorage, type AsanoRig, type LoftRig, type RobotRig } from "./factoryModels";
import { animateDataFlows, buildDataFlows } from "./factoryDataFlow";
import { FactoryProjectCard, factoryProjectPins, pinForFactoryAsset, useFactoryProjects } from "./factoryProjects";
import "./factory-map.css";
import { createFactoryCameraMotion } from "./factoryCamera";
import { PortKlangMap } from "./PortKlangMap";
import { FactoryViewport, FactoryFullscreenButton } from "./FactoryViewport";
import { useSearchParams } from "react-router-dom";

type FactoryView = "overview" | "top" | "line-1" | "line-2" | "loft" | "office" | "attendance";

function FactoryScene({ selected, onSelect, view, moving, activeProject, onProjectSelect, projectCard, showProjects, preview = false }: { selected: string | null; onSelect: (id: string) => void; view: { mode: FactoryView; revision: number }; moving: boolean; activeProject: string | null; onProjectSelect: (key: string) => void; projectCard: ReactNode; showProjects: boolean; preview?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const pinElements = useRef(new Map<string, HTMLButtonElement>());
  const controller = useRef<{ select: (id: string | null) => void; view: (mode: string) => void; motion: (enabled: boolean) => void } | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preview ? 1 : 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Sendayan factory 3D overview. Use the equipment list to select an asset with a keyboard.");
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-keyshortcuts", "Space");
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#f1f5f2");
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
    const render = () => { renderer.render(scene, camera); updateProjectPins(); };
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa4b5ab, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-30, 70, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -75; sun.shadow.camera.right = 75; sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75; sun.shadow.camera.far = 180; sun.shadow.normalBias = .08; scene.add(sun);
    const floorPlan = new THREE.Group(); floorPlan.scale.z = firePlanDepthScale; scene.add(floorPlan);
    const projected = new THREE.Vector3();
    const updateProjectPins = () => {
      const width = container.clientWidth, height = container.clientHeight;
      for (const pin of factoryProjectPins) {
        const element = pinElements.current.get(pin.key), asset = sendayanAssets.find(item => item.id === pin.assetId);
        if (!element || !asset) continue;
        floorPlan.localToWorld(projected.set(asset.x, pin.height + (asset.elevation ?? 0), asset.z)); projected.project(camera);
        const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
        element.hidden = !visible;
        if (visible) { element.style.left = `${(projected.x + 1) * width / 2}px`; element.style.top = `${(1 - projected.y) * height / 2}px`; }
      }
    };
    const mesh = (parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = h / 2, z = 0) => {
      const object = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .15 }));
      object.position.set(x, y, z); object.receiveShadow = true; parent.add(object); return object;
    };
    mesh(floorPlan, 120, .35, 80, "#e3eae5", 3, -.3, 0);
    const grid = new THREE.GridHelper(120, 60, 0xd2ddd6, 0xdce5df); grid.position.set(3, -.1, 0); floorPlan.add(grid);
    for (const road of sendayanRoads) {
      mesh(floorPlan, road.width, .02, road.depth, "#b9c5c0", road.x, -.06, road.z);
      const vertical = road.depth > road.width, length = vertical ? road.depth : road.width;
      for (let offset = -length / 2 + 2; offset < length / 2 - 2; offset += 4) mesh(floorPlan, vertical ? .1 : 1.5, .008, vertical ? 1.5 : .1, "#eef2ef", road.x + (vertical ? 0 : offset), -.043, road.z + (vertical ? offset : 0));
    }
    // Traced filled lanes preserve the fire plan's wide aisles and narrow branches.
    for (const lane of sendayanWalkways) {
      const path = mesh(floorPlan, lane.width, .025, lane.depth, "#26964f", lane.x, .035, lane.z);
      (path.material as THREE.MeshStandardMaterial).roughness = 1;
    }
    for (const crossing of sendayanCrossings) {
      mesh(floorPlan, crossing.width, .01, crossing.depth, "#263436", crossing.x, .055, crossing.z);
      for (let index = 0; index < 7; index += 2) mesh(floorPlan, crossing.width / 7, .006, crossing.depth * .9, "#e7ece6", crossing.x - crossing.width / 2 + (index + .5) * crossing.width / 7, .066, crossing.z);
    }
    const roots = new Map<string, THREE.Group>();
    const robots: RobotRig[] = [];
    const lofts: LoftRig[] = [];
    const formingLines: AsanoRig[] = [];
    for (const asset of sendayanAssets) {
      const root = new THREE.Group(); root.position.set(asset.x, asset.elevation ?? 0, asset.z); root.rotation.y = asset.rotationY ?? 0; root.userData.assetId = asset.id;
      floorPlan.add(root); roots.set(asset.id, root);
      const { width: w, depth: d } = asset; const color = assetColors[asset.kind];
      // Asano has an irregular footprint; a full square plinth would cover its aisle.
      if (!["forming", "sensor", "edge", "entrance"].includes(asset.kind)) mesh(root, w, .18, d, color);
      if (asset.kind === "forming") {
        formingLines.push(buildAsano(root, asset));
      } else if (asset.kind === "rolls") {
        buildRollStorage(root, asset);
      } else if (asset.kind === "waterjet" || asset.kind === "glue") {
        robots.push(...buildRobotStation(root, asset));
      } else if (asset.kind === "qc") {
        buildQcLine(root, asset);
      } else if (asset.id === "loft") {
        lofts.push(buildLoftArea(root, asset));
      } else if (buildFacility(root, asset)) {
        // Dedicated geometry for facilities, entrances, sensors and edge devices.
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
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true; object.receiveShadow = true;
        if (!isSystemAsset(asset)) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => { if (material instanceof THREE.MeshStandardMaterial) {
            const dark = material.color.r + material.color.g + material.color.b < .35;
            material.color.set(dark ? "#b1bcba" : "#f5f8f6"); material.emissive.set(0); material.emissiveIntensity = 0; material.roughness = .8; material.metalness = .05;
          } });
        }
      });
    }
    const dataFlows = buildDataFlows(floorPlan);
    floorPlan.updateMatrixWorld(true);
    const highlight = new THREE.BoxHelper(roots.get("asano-upper")!, 0x78e6d1); highlight.visible = false; scene.add(highlight);
    let selectedRoot: THREE.Group | undefined;
    let frame = 0, elapsed = 0, previousTime = 0, motionEnabled = false, onScreen = true;
    const tick = (now: number) => {
      elapsed += Math.min((now - previousTime) / 1000, .05); previousTime = now;
      robots.forEach(robot => animateRobot(robot, elapsed));
      lofts.forEach(loft => animateLoft(loft, elapsed));
      formingLines.forEach(line => animateAsano(line, elapsed));
      animateDataFlows(dataFlows, elapsed);
      if (selectedRoot) highlight.setFromObject(selectedRoot);
      render(); frame = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (motionEnabled && !document.hidden && onScreen) { previousTime = performance.now(); frame = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", syncMotion);
    const visibilityObserver = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => { onScreen = entries[0]?.isIntersecting ?? false; syncMotion(); }) : null; visibilityObserver?.observe(container);
    const cameraMotion = createFactoryCameraMotion(camera, controls, render);
    let firstView = true;
    controller.current = {
      select(id) { selectedRoot = id ? roots.get(id) : undefined; highlight.visible = !!selectedRoot; if (selectedRoot) highlight.setFromObject(selectedRoot); render(); },
      view(mode) {
        setHover(null);
        const previousPosition = camera.position.clone(), previousTarget = controls.target.clone();
        if (mode === "attendance") {
          controls.target.set(41.5, 1.65, 15.2 * firePlanDepthScale); camera.position.set(27.5, 5, 12 * firePlanDepthScale);
        } else if (mode === "office") {
          controls.target.set(39, 1, 20 * firePlanDepthScale); camera.position.set(65, 38, 54 * firePlanDepthScale);
        } else if (mode === "loft") {
          controls.target.set(-38, 3, -13 * firePlanDepthScale); camera.position.set(-35, 15, 17 * firePlanDepthScale);
        } else if (mode === "line-1" || mode === "line-2") {
          const z = mode === "line-1" ? 20 : -19.2;
          const fit = Math.max(1, 1.4 / camera.aspect);
          controls.target.set(-12, 0, z * firePlanDepthScale); camera.position.set(-12 + 19 * fit, 28 * fit, (z + 32 * fit) * firePlanDepthScale);
        } else { controls.target.set(3, 0, 0); camera.position.set(...(mode === "top" ? [3, Math.max(125, 68 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)), .1] : [78, 86, 105]) as [number, number, number]); }
        const position = camera.position.clone(), target = controls.target.clone();
        camera.position.copy(previousPosition); controls.target.copy(previousTarget);
        cameraMotion.move(position, target, !firstView); firstView = false;
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
      let name: string | undefined;
      while (object && !object.userData.assetId) { name ??= object.userData.partName; object = object.parent; }
      return object ? { id: object.userData.assetId as string, name } : undefined;
    };
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (event.button !== 0 || gestureMoved || spacePanning || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const picked = pick(event); if (picked) onSelect(picked.id);
      pointerMove(event);
    };
    const pointerMove = (event: PointerEvent) => {
      pointerInside = true;
      if (pointers.has(event.pointerId) && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) gestureMoved = true;
      if (event.pointerType === "touch" || event.buttons) { setHover(null); return; }
      const picked = pick(event), asset = sendayanAssets.find(item => item.id === picked?.id);
      renderer.domElement.style.cursor = spacePanning ? "grab" : asset ? "pointer" : "grab";
      const rect = container.getBoundingClientRect();
      setHover(asset ? { name: picked?.name ?? asset.name, x: Math.max(8, Math.min(event.clientX - rect.left + 14, rect.width - 230)), y: Math.max(8, Math.min(event.clientY - rect.top + 14, rect.height - 50)) } : null);
    };
    const pointerLeave = () => { pointerInside = false; setHover(null); };
    const pointerCancel = (event: PointerEvent) => { pointers.delete(event.pointerId); gestureMoved = true; setHover(null); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerleave", pointerLeave);
    renderer.domElement.addEventListener("pointercancel", pointerCancel);
    return () => {
      window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", resetSpace);
      visibilityObserver?.disconnect(); cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", syncMotion);
      controller.current = null; resize.disconnect(); cameraMotion.dispose(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      scene.traverse(object => { const drawable = object as THREE.Mesh; drawable.geometry?.dispose(); const materials = drawable.material ? (Array.isArray(drawable.material) ? drawable.material : [drawable.material]) : []; materials.forEach(material => material.dispose()); });
      sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [onSelect, onProjectSelect, preview]);
  useEffect(() => controller.current?.select(selected), [selected]);
  useEffect(() => controller.current?.view(view.mode), [view]);
  useEffect(() => controller.current?.motion(moving), [moving]);
  return <div className="factory-canvas" ref={host}>
    <div className="factory-project-pins" hidden={!showProjects} aria-label="Projects on this map">{factoryProjectPins.map(pin => <button key={pin.key} type="button" className="factory-project-pin" hidden ref={element => { if (element) pinElements.current.set(pin.key, element); else pinElements.current.delete(pin.key); }} aria-label={`Open ${pin.projectNo} · ${pin.label}`} aria-pressed={activeProject === pin.key} onClick={() => onProjectSelect(pin.key)}><span className="factory-pin-label"><strong>{pin.label}</strong><small>{pin.projectNo}</small></span><span className="factory-pin-marker"><b>{pin.symbol}</b></span></button>)}</div>
    {hover && <div className="factory-hover-name" role="tooltip" style={{ left: hover.x, top: hover.y }}>{hover.name}</div>}{projectCard}
    {error && <div className="factory-render-error" role="alert">3D rendering is unavailable in this browser. You can still explore the equipment list and details.</div>}
  </div>;
}

const ignoreProject = () => {};
export function SendayanMapPreview() {
  const [selected, setSelected] = useState<string | null>(null);
  const select = useCallback((id: string) => setSelected(id), []);
  const [moving, setMoving] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [view, setView] = useState<{ mode: FactoryView; revision: number }>({ mode: "overview", revision: 0 });
  const asset = sendayanAssets.find(item => item.id === selected);
  return <FactoryViewport label="Sendayan factory map" className="factory-dashboard-preview">
    <div className="factory-toolbar"><div><small>FACTORY OVERVIEW</small><strong>Sendayan</strong></div><div className="factory-view-buttons">
      <button type="button" onClick={() => setView(previous => ({ mode: "overview", revision: previous.revision + 1 }))}>Reset view</button>
      <button type="button" onClick={() => setView(previous => ({ mode: "top", revision: previous.revision + 1 }))}>Top view</button>
      <button type="button" aria-pressed={moving} onClick={() => setMoving(value => !value)}>{moving ? "Pause motion" : "Animate motion"}</button><FactoryFullscreenButton />
    </div></div>
    <FactoryScene selected={selected} onSelect={select} view={view} moving={moving} showProjects={false} activeProject={null} onProjectSelect={ignoreProject} projectCard={null} preview />
    <div className="factory-map-footer"><span>{asset?.name ?? "Drag to rotate · Space + drag to pan · Scroll to zoom"}</span><span>Illustrative motion · No live readings</span></div>
  </FactoryViewport>;
}

export function FactoryMapPage() {
  const [searchParams] = useSearchParams();
  const [site, setSite] = useState(searchParams.get("site") === "port-klang" ? "port-klang" : "sendayan");
  useEffect(() => { setSite(searchParams.get("site") === "port-klang" ? "port-klang" : "sendayan"); }, [searchParams]);
  const [selected, setSelected] = useState<string | null>("line-1-edge");
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const projectsVisible = useRef(false); projectsVisible.current = showProjects;
  const { projects, error: projectError, refresh: refreshProjects } = useFactoryProjects();
  const selectAsset = useCallback((id: string) => { setSelected(id); setProjectKey(projectsVisible.current ? pinForFactoryAsset(sendayanAssets.find(item => item.id === id))?.key ?? null : null); }, []);
  const openProject = useCallback((key: string) => { const pin = factoryProjectPins.find(item => item.key === key); if (pin) { setSelected(pin.assetId); setProjectKey(pin.key); setView(previous => ({ mode: pin.line === 1 ? "line-1" : pin.line === 2 ? "line-2" : "attendance", revision: previous.revision + 1 })); } }, []);
  const closeProject = useCallback(() => setProjectKey(null), []);
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [view, setView] = useState<{ mode: FactoryView; revision: number }>({ mode: "overview", revision: 0 });
  const asset = sendayanAssets.find(item => item.id === selected);
  const projectPin = factoryProjectPins.find(pin => pin.key === projectKey);
  const items = sendayanAssets.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="factory-page">
    <div className="page-header"><div><h1>3D Factory Map</h1><p>Explore your sites, equipment and working areas.</p></div><label className="factory-site">Site<select value={site} onChange={event => setSite(event.target.value)}><option value="sendayan">Sendayan</option><option value="port-klang">Port Klang</option></select></label></div>
    {site === "port-klang" ? <PortKlangMap /> : <>
      <div className="factory-notice"><strong>Sendayan · connected systems</strong><span>White = factory context · Colour = system equipment · 3 sensors per line → Raspberry Pi inside each control panel · Illustrative flow, no live readings.</span></div>
      <div className="factory-workspace"><FactoryViewport label="Interactive factory map">
        <div className="factory-toolbar"><div><small>SUGIHARA GRAND INDUSTRIES</small><strong>Sendayan / Open floor</strong></div><div className="factory-view-buttons"><button type="button" onClick={() => setView(previous => ({ mode: "overview", revision: previous.revision + 1 }))}>Reset view</button><button type="button" onClick={() => setView(previous => ({ mode: "top", revision: previous.revision + 1 }))}>Top view</button>{([1, 2] as const).map(line => <button type="button" key={line} onClick={() => setView(previous => ({ mode: `line-${line}`, revision: previous.revision + 1 }))}>Line {line}</button>)}<button type="button" onClick={() => { setSelected("loft"); setView(previous => ({ mode: "loft", revision: previous.revision + 1 })); }}>Loft area</button><button type="button" aria-pressed={moving} onClick={() => setMoving(previous => !previous)}>{moving ? "Pause motion" : "Animate motion"}</button><FactoryFullscreenButton /></div></div>
        <div className="factory-system-strip"><span><b>DATA FLOW</b> 6 sensors <span aria-hidden="true">→</span> 2 Raspberry Pi <span aria-hidden="true">→</span> Office<small className="factory-office-flow">Smart Attendance → Office</small></span><button type="button" onClick={() => { setSelected("office-data"); setView(previous => ({ mode: "office", revision: previous.revision + 1 })); }}>Office & attendance ↗</button><button type="button" onClick={() => { setSelected("attendance"); setView(previous => ({ mode: "attendance", revision: previous.revision + 1 })); }}>Attendance unit ↗</button></div>
        <div className="factory-project-controls"><button type="button" aria-pressed={showProjects} aria-expanded={showProjects} onClick={() => { setShowProjects(value => !value); setProjectKey(null); }}>{showProjects ? "Hide projects" : "Show projects"}</button></div>
        {showProjects && <div className="factory-project-shortcuts" aria-label="Find a project">{factoryProjectPins.map(pin => <button type="button" key={pin.key} onClick={() => openProject(pin.key)}><span aria-hidden="true">●</span>{pin.label}</button>)}<small>Click a pin for the saved project</small></div>}
        <FactoryScene selected={selected} onSelect={selectAsset} view={view} moving={moving} showProjects={showProjects} activeProject={projectKey} onProjectSelect={openProject} projectCard={showProjects && projectPin ? <FactoryProjectCard key={projectPin.key} pin={projectPin} projects={projects} error={projectError} onRetry={refreshProjects} onClose={closeProject} /> : null} />
        <div className="factory-map-footer"><span>Desktop: drag to rotate · Hold Space + drag to pan · Scroll to zoom<br />Mobile: one finger to pan · Two fingers to rotate / pinch to zoom · Tap for details</span><span><i /> Equipment <i className="factory-sensor-key" /> Sensor / data <i className="factory-edge-key" /> Raspberry Pi <i className="factory-walkway-key" /> Walkway <i className="factory-road-key" /> Road</span></div>
      </FactoryViewport><aside className="factory-sidebar">
        <section className="factory-detail" aria-live="polite"><small>SELECTED EQUIPMENT / AREA</small><h2>{asset?.name ?? "Select equipment"}</h2>{asset && <><span className="factory-kind">{asset.kind === "forming" ? "Asano forming machine" : asset.kind === "waterjet" ? "ABB robotic waterjet" : asset.kind === "glue" ? "UR auto glue" : asset.kind === "qc" ? "QC inspection & lighting" : asset.kind === "area" ? "Working area" : asset.kind === "room" ? "Facility" : asset.kind}</span><p>{asset.note ?? "Placed using the current Sendayan fire plan. Select another item in the map or equipment list to explore."}</p><div className="factory-data-status"><i />Layout only · no live status</div></>}</section>
        <div className="factory-equipment-heading"><h3>Equipment & areas</h3><span>{items.length}</span></div>
        <label className="factory-search"><span>Find equipment or an area</span><input type="search" placeholder="Search Line 1, ABB, UR, QC…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="factory-asset-list">{items.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => selectAsset(item.id)}><i style={{ background: isSystemAsset(item) ? assetColors[item.kind] : "#cbd5cf" }} /><span>{item.name}</span><span aria-hidden="true">↗</span></button>)}{!items.length && <p>No matching equipment or areas.</p>}</div>
      </aside></div>
    </>}
  </div>;
}
