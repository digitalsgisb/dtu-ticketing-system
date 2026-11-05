import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { assetColors, sendayanAssets } from "./factoryLayout";
import "./factory-map.css";

function FactoryScene({ selected, onSelect, view, labels }: { selected: string | null; onSelect: (id: string) => void; view: { mode: "overview" | "top"; revision: number }; labels: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<{ select: (id: string | null) => void; view: (mode: string) => void; labels: (show: boolean) => void } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Sendayan factory 3D overview. Use the equipment list to select an asset with a keyboard.");
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#111e2b");
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 700);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2.05; controls.minDistance = 12; controls.maxDistance = 240;
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
    const labelGroup = new THREE.Group(); scene.add(labelGroup);
    const textures: THREE.Texture[] = [];
    for (const asset of sendayanAssets) {
      const root = new THREE.Group(); root.position.set(asset.x, 0, asset.z); root.userData.assetId = asset.id;
      scene.add(root); roots.set(asset.id, root);
      const { width: w, depth: d } = asset; const color = assetColors[asset.kind];
      mesh(root, w, .18, d, color);
      let height = .3;
      if (asset.kind === "forming") {
        height = 6;
        mesh(root, w * .83, .9, d * .8, "#b57e25", 0, .65);
        for (const x of [-w * .32, w * .32]) for (const z of [-d * .3, d * .3]) mesh(root, .8, 4.8, .8, "#c5cdd1", x, 3, z);
        mesh(root, w * .84, 1.1, d * .8, color, 0, 5.4);
        mesh(root, w * .65, .6, d * .65, "#9ca6aa", 0, 2.4);
        mesh(root, w * .48, .4, d * .5, "#394854", 0, 2.9);
        mesh(root, 2, 2.3, 2, color, w * .48, 1.2, 0);
        mesh(root, .1, 1, 1.2, "#172d3b", w * .48 + 1.05, 1.7, 0);
      } else if (asset.kind === "rack") {
        height = 2.6;
        for (const x of [-w / 2 + .2, w / 2 - .2]) for (const z of [-d / 2 + .2, d / 2 - .2]) mesh(root, .22, height, .22, "#566b80", x, height / 2, z);
        for (const y of [.6, 1.5, 2.4]) mesh(root, w, .15, d, color, 0, y);
      } else if (asset.kind === "tank") {
        height = 2.8;
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, height, 24), new THREE.MeshStandardMaterial({ color })); tank.position.y = height / 2; root.add(tank);
      } else if (asset.kind !== "area") {
        height = asset.kind === "room" ? 1.3 : 1.9;
        mesh(root, w * .9, height, d * .9, color);
        if (asset.kind === "glue" || asset.kind === "waterjet") mesh(root, w * .65, .12, d * .65, "#344957", 0, height + .07);
      }
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 80;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#102030e8"; ctx.fillRect(0, 0, 512, 80);
        ctx.font = "600 27px Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#f0f5fa"; ctx.fillText(asset.name, 256, 49, 490);
        const texture = new THREE.CanvasTexture(canvas); textures.push(texture);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
        label.position.set(asset.x, height + 2, asset.z); label.scale.set(12, 1.875, 1); labelGroup.add(label);
      }
    }
    const highlight = new THREE.BoxHelper(roots.get("asano-upper")!, 0x78e6d1); highlight.visible = false; scene.add(highlight);
    controller.current = {
      select(id) { const root = id ? roots.get(id) : undefined; highlight.visible = !!root; if (root) highlight.setFromObject(root); render(); },
      view(mode) { controls.target.set(0, 0, 0); camera.position.set(...(mode === "top" ? [0, 125, .1] : [78, 86, 105]) as [number, number, number]); controls.update(); render(); },
      labels(show) { labelGroup.visible = show; render(); }
    };
    controller.current.view("overview");
    const resize = new ResizeObserver(() => { const { width, height } = container.getBoundingClientRect(); if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); render(); }); resize.observe(container);
    controls.addEventListener("change", render);
    const ray = new THREE.Raycaster(); let down = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObjects([...roots.values()], true)[0]; let object: THREE.Object3D | null = hit?.object ?? null;
      while (object && !object.userData.assetId) object = object.parent;
      if (object) onSelect(object.userData.assetId);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp);
    return () => {
      controller.current = null; resize.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      scene.traverse(object => { const drawable = object as THREE.Mesh; drawable.geometry?.dispose(); const materials = drawable.material ? (Array.isArray(drawable.material) ? drawable.material : [drawable.material]) : []; materials.forEach(material => material.dispose()); });
      textures.forEach(texture => texture.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [onSelect]);
  useEffect(() => controller.current?.select(selected), [selected]);
  useEffect(() => controller.current?.view(view.mode), [view]);
  useEffect(() => controller.current?.labels(labels), [labels]);
  return <div className="factory-canvas" ref={host}>{error && <div className="factory-render-error" role="alert">3D rendering is unavailable in this browser. You can still explore the equipment list and details.</div>}</div>;
}

export function FactoryMapPage() {
  const [site, setSite] = useState("sendayan");
  const [selected, setSelected] = useState<string | null>("asano-upper");
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState(true);
  const [view, setView] = useState<{ mode: "overview" | "top"; revision: number }>({ mode: "overview", revision: 0 });
  const asset = sendayanAssets.find(item => item.id === selected);
  const items = sendayanAssets.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="factory-page">
    <div className="page-header"><div><h1>3D Factory Map</h1><p>Explore your sites, equipment and working areas.</p></div><label className="factory-site">Site<select value={site} onChange={event => setSite(event.target.value)}><option value="sendayan">Sendayan</option><option value="port-klang">Port Klang</option></select></label></div>
    {site === "port-klang" ? <section className="factory-placeholder"><span>PORT KLANG</span><h2>Your next factory view</h2><p>The Port Klang layout has not been added yet.</p><button type="button" className="btn" onClick={() => setSite("sendayan")}>Explore Sendayan</button></section> : <>
      <div className="factory-notice"><strong>Sendayan · layout preview</strong><span>Based on your fire plan. Positions and equipment shapes are approximate; dimensions are not to scale. Live readings are not connected.</span></div>
      <div className="factory-workspace"><section className="factory-viewport" aria-label="Interactive factory map">
        <div className="factory-toolbar"><div><small>SUGIHARA GRAND INDUSTRIES</small><strong>Sendayan / Open floor</strong></div><div className="factory-view-buttons"><button type="button" onClick={() => setView(previous => ({ mode: "overview", revision: previous.revision + 1 }))}>Reset view</button><button type="button" onClick={() => setView(previous => ({ mode: "top", revision: previous.revision + 1 }))}>Top view</button><label><input type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} />Labels</label></div></div>
        <FactoryScene selected={selected} onSelect={setSelected} view={view} labels={labels} />
        <div className="factory-map-footer"><span>Drag to rotate · Scroll to zoom · Right-drag to pan · Click equipment</span><span><i /> Forming <i /> Storage <i /> Facilities</span></div>
      </section><aside className="factory-sidebar">
        <section className="factory-detail" aria-live="polite"><small>SELECTED EQUIPMENT / AREA</small><h2>{asset?.name ?? "Select equipment"}</h2>{asset && <><span className="factory-kind">{asset.kind === "forming" ? "Asano forming machine" : asset.kind === "area" ? "Working area" : asset.kind === "room" ? "Facility" : asset.kind}</span><p>{asset.kind === "forming" ? "Both Asano units are the same type of forming machine. Upper and lower refer to their positions on the supplied plan." : asset.note ?? "Placed using the current Sendayan fire plan. Select another item in the map or equipment list to explore."}</p><div className="factory-data-status"><i />Layout only · no live status</div></>}</section>
        <div className="factory-equipment-heading"><h3>Equipment & areas</h3><span>{items.length}</span></div>
        <label className="factory-search"><span>Find equipment or an area</span><input type="search" placeholder="Search Asano, office, storage…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="factory-asset-list">{items.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><i style={{ background: assetColors[item.kind] }} /><span>{item.name}</span><span aria-hidden="true">↗</span></button>)}{!items.length && <p>No matching equipment or areas.</p>}</div>
      </aside></div>
    </>}
  </div>;
}
