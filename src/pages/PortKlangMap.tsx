import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { animatePortKlangDataFlows, sizePortKlangDataPackets, buildPortKlangModel, portKlangModelDescriptions, portKlangModelType, type PortKlangDataFlow, type PortKlangNetworkNode } from "./portKlangModels";
import { animateRobot, type RobotRig } from "./factoryModels";
import { FactoryViewport, FactoryFullscreenButton } from "./FactoryViewport";
import { createFactoryAnimationLoop } from "./factoryAnimation";
import { createFactoryCameraMotion } from "./factoryCamera";
import { portKlangFloors, portKlangPoint, portKlangServer, type PortKlangFloor } from "./portKlangLayout";

type PortKlangView = { top: boolean; revision: number; focusId?: string; network?: boolean };
function PortKlangScene({ floor, selected, onSelect, view, moving, compact }: { floor: PortKlangFloor; selected: string | null; onSelect: (id: string) => void; view: PortKlangView; moving: boolean; compact: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const serverLabel = useRef<HTMLDivElement>(null);
  const motionEnabled = useRef(moving); motionEnabled.current = moving;
  const controller = useRef<{ select: (id: string | null) => void; view: (top: boolean) => void; focus: (id: string) => void; network: () => void; motion: (enabled: boolean) => void } | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current, layout = portKlangFloors[floor];
    setHover(null); setError(false);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1 : 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", `Port Klang ${layout.label} 3D map. Equipment is also available in the searchable list.`);
    container.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#f1f5f2");
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 700);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2.05; controls.minDistance = 8; controls.maxDistance = 300;
    controls.touches.ONE = THREE.TOUCH.PAN; controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    const render = () => {
      sizePortKlangDataPackets(dataFlows,camera,container.clientHeight);renderer.render(scene, camera);
      if(serverLabel.current) {
        const point = new THREE.Vector3(portKlangServer.x,floor==="ground"?9.2:2.4,portKlangServer.z).project(camera);
        serverLabel.current.hidden=floor==="roof"||Math.abs(point.x)>1||Math.abs(point.y)>1||point.z>1||point.z< -1;
        const margin=serverLabel.current.offsetWidth/2+8;serverLabel.current.style.left=`${Math.max(margin,Math.min(container.clientWidth-margin,(point.x+1)*container.clientWidth/2))}px`;serverLabel.current.style.top=`${(1-point.y)*container.clientHeight/2}px`;
      }
    };
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fac9f, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-50, 80, 30); sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 45, bottom: -45, far: 200 }); sun.shadow.normalBias = .06; scene.add(sun);
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color = "#f7faf8") => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color, roughness: .85 }));
      mesh.position.set(x,y,z); mesh.castShadow = h > .2; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    box(scene, 147, .3, 37, 0,-.25,0,"#e0e9e2");
    const grid = new THREE.GridHelper(150, 100, 0xd0ddd3, 0xdce6df); grid.scale.z = .24; grid.position.y = -.08; scene.add(grid);
    const roots = new Map<string,THREE.Group>();
    const dataFlows: PortKlangDataFlow[] = [], networkNodes: PortKlangNetworkNode[] = []; const robots: RobotRig[] = [];
    for (const asset of layout.assets) {
      const root = new THREE.Group(); root.position.set(asset.x,0,asset.z); root.userData.assetId = asset.id; roots.set(asset.id,root); scene.add(root);
      buildPortKlangModel(root, asset, dataFlows, networkNodes, robots);
    }
    if(floor==="ground") {
      const server = new THREE.Group();server.position.set(portKlangServer.x,7,portKlangServer.z);server.userData.assetId=portKlangServer.id;scene.add(server);roots.set(portKlangServer.id,server);buildPortKlangModel(server,portKlangServer);
      const destination = new THREE.Vector3(portKlangServer.x,8.5,portKlangServer.z);
      networkNodes.forEach((node,index)=>{
        const middle=node.piPosition.clone().lerp(destination,.5);middle.y=9+node.piPosition.distanceTo(destination)*.045;
        const curve=new THREE.CatmullRomCurve3([node.piPosition,middle,destination]);
        const path=new THREE.Mesh(new THREE.TubeGeometry(curve,56,.055,6,false),new THREE.MeshBasicMaterial({color:"#9887c8",transparent:true,opacity:.8}));path.userData.partName="Raspberry Pi → first-floor AI PC / database · illustrative";scene.add(path);
        const dots=Array.from({length:4},(_,index)=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:index===0?"#542bb1":"#aa8cdd",depthTest:false}));dot.renderOrder=3;scene.add(dot);return dot;});
        dataFlows.push({curve,dots,phase:index*.2});
      });
    }
    animatePortKlangDataFlows(dataFlows,0);
    // The PDF's grey central first-floor footprint has no equipment layout.
    if (floor === "first") { const p = portKlangPoint(floor,679,798); box(scene,806/12,.05,248/12,p.x,.02,p.z,"#d3ddd6"); }
    for (const route of layout.routes) for(let index=1;index<route.length;index++) {
      const a = portKlangPoint(floor,...route[index-1]), b = portKlangPoint(floor,...route[index]);
      const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz), heading=Math.atan2(dx,dz);
      const strip=box(scene,.23,.025,length,(a.x+b.x)/2,.15,(a.z+b.z)/2,"#27945a"); strip.rotation.y=heading;
      const count=Math.max(1,Math.floor(length/11));
      for(let step=0;step<count;step++) {
        const t=(step+.5)/count;
        const triangle = new THREE.Shape(); triangle.moveTo(0,.85);triangle.lineTo(-.52,-.5);triangle.lineTo(.52,-.5);triangle.closePath();
        const arrow=new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({color:"#27945a",side:THREE.DoubleSide}));
        arrow.rotation.set(-Math.PI/2,0,Math.PI+heading); arrow.position.set(a.x+dx*t,.18,a.z+dz*t); scene.add(arrow);
      }
    }
    const highlight = new THREE.BoxHelper(new THREE.Object3D(),0x16856a); highlight.visible=false;scene.add(highlight);
    const motion = createFactoryCameraMotion(camera,controls,render);
    let selectedRoot:THREE.Group|undefined;
    const animation=createFactoryAnimationLoop(seconds=>{animatePortKlangDataFlows(dataFlows,seconds);robots.forEach(robot=>animateRobot(robot,seconds));if(selectedRoot)highlight.setFromObject(selectedRoot);render();});
    const syncVisibility=()=>animation.setPageVisible(!document.hidden);syncVisibility();document.addEventListener("visibilitychange",syncVisibility);
    const visibilityObserver=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(entries=>animation.setInViewport(entries[entries.length-1]?.isIntersecting??false)):null;visibilityObserver?.observe(container);
    camera.aspect = container.clientWidth / Math.max(1,container.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth,container.clientHeight);
    let initialized=false,currentTop=false;let resizeView:(()=>void)|null=null;
    const setView = (top:boolean) => {
      currentTop=top;resizeView=()=>setView(top);
      const halfWidth=84, distance=Math.max(80,halfWidth/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
      motion.move(top ? new THREE.Vector3(0,distance,.1) : new THREE.Vector3(15,distance*.8,distance*.7),new THREE.Vector3(0,0,0),initialized);
      initialized=true;
    };
    controller.current={select(id){const object=id?roots.get(id):undefined;selectedRoot=object;highlight.visible=!!object;if(object)highlight.setFromObject(object);render();},view:setView,focus(id){resizeView=()=>controller.current?.focus(id);const asset=layout.assets.find(item=>item.id===id);if(!asset)return;const fit=Math.max(1,1.25/camera.aspect),distance=Math.max(7,Math.max(asset.width,asset.depth)*1.15)*fit;motion.move(new THREE.Vector3(asset.x+distance*.5,distance*.85,asset.z+distance),new THREE.Vector3(asset.x,.6,asset.z));},network(){resizeView=()=>controller.current?.network();const distance=Math.max(45,30/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));motion.move(new THREE.Vector3(-30,distance*.85,distance*.7),new THREE.Vector3(-36,1,0));},motion(enabled){animation.setEnabled(enabled);}};
    animation.setEnabled(motionEnabled.current);
    const resize=new ResizeObserver(()=>{const {width,height}=container.getBoundingClientRect();if(!width||!height)return;const changed=Math.abs(camera.aspect-width/height)>.001;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);if(!initialized||changed){if(resizeView)resizeView();else setView(currentTop);}else render();});resize.observe(container);
    controls.addEventListener("change",render);
    let space=false,inside=false,down={x:0,y:0},moved=false;const pointers=new Set<number>();
    const resetSpace=()=>{space=false;controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;};
    const keyDown=(event:KeyboardEvent)=>{if(event.code!=="Space"||(!inside&&document.activeElement!==renderer.domElement)||(event.target instanceof HTMLElement&&event.target.closest("button,input,select,a,textarea")))return;event.preventDefault();space=true;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;};
    const keyUp=(event:KeyboardEvent)=>{if(event.code==="Space"&&space){event.preventDefault();resetSpace();}};
    window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);window.addEventListener("blur",resetSpace);
    const ray=new THREE.Raycaster();
    const pick=(event:PointerEvent)=>{const rect=container.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);let object:THREE.Object3D|null=ray.intersectObjects([...roots.values()],true)[0]?.object??null;while(object&&!object.userData.assetId)object=object.parent;return layout.assets.find(asset=>asset.id===object?.userData.assetId)??(object?.userData.assetId===portKlangServer.id?portKlangServer:undefined);};
    const pointerDown=(event:PointerEvent)=>{if(!pointers.size){down={x:event.clientX,y:event.clientY};moved=space;}pointers.add(event.pointerId);if(pointers.size>1)moved=true;renderer.domElement.focus({preventScroll:true});setHover(null);};
    const pointerMove=(event:PointerEvent)=>{inside=true;if(pointers.size&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)moved=true;if(event.buttons||event.pointerType==="touch"){setHover(null);return;}const asset=pick(event),rect=container.getBoundingClientRect();setHover(asset?{name:asset.name,x:Math.max(8,Math.min(event.clientX-rect.left+12,rect.width-230)),y:Math.max(8,Math.min(event.clientY-rect.top+12,rect.height-55))}:null);};
    const pointerUp=(event:PointerEvent)=>{pointers.delete(event.pointerId);if(event.button!==0||moved||space||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;const asset=pick(event);if(asset)onSelect(asset.id);};
    const leave=()=>{inside=false;setHover(null);};const cancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);moved=true;setHover(null);};
    const events={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerUp,pointerleave:leave,pointercancel:cancel};
    for(const [name,handler]of Object.entries(events))renderer.domElement.addEventListener(name,handler as EventListener);
    return()=>{visibilityObserver?.disconnect();animation.dispose();document.removeEventListener("visibilitychange",syncVisibility);controller.current=null;resize.disconnect();motion.dispose();controls.dispose();window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp);window.removeEventListener("blur",resetSpace);for(const[name,handler]of Object.entries(events))renderer.domElement.removeEventListener(name,handler as EventListener);scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});sun.shadow.dispose();renderer.dispose();renderer.domElement.remove();};
  },[floor,onSelect,compact]);
  useEffect(()=>controller.current?.select(selected),[selected,floor]);
  useEffect(()=>controller.current?.motion(moving),[moving,floor]);
  useEffect(()=>{if(view.network)controller.current?.network();else if(view.focusId)controller.current?.focus(view.focusId);else controller.current?.view(view.top);},[view,floor]);
  return <div className="factory-canvas factory-port-canvas" ref={host}><div hidden ref={serverLabel} className="factory-port-server-label">AI PC / Database<small>First-floor front office{floor==="ground"?" · raised marker":""}</small></div>{hover&&<div className="factory-hover-name" role="tooltip" style={{left:hover.x,top:hover.y}}>{hover.name}</div>}{error&&<div className="factory-render-error" role="alert">3D rendering is unavailable. Use the floor selector and equipment list to explore the layout.</div>}</div>;
}

export function PortKlangMap({ compact = false }: { compact?: boolean } = {}) {
  const [floor,setFloor]=useState<PortKlangFloor>("ground"),[selected,setSelected]=useState<string|null>(null),[query,setQuery]=useState("");
  const [view,setView]=useState<PortKlangView>({top:false,revision:0});
  const [moving,setMoving]=useState(()=>!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const select=useCallback((id:string)=>{setSelected(id);if(id===portKlangServer.id){setFloor("first");setView(previous=>({top:false,revision:previous.revision+1,focusId:id}));}},[]);
  const layout=portKlangFloors[floor],asset=layout.assets.find(item=>item.id===selected);
  const items=layout.assets.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    {!compact && <div className="factory-notice"><strong>Port Klang · layout preview</strong><span>Based on the fire plan dated 5 Jan 2026 · Approximate proportions · No live systems connected.</span></div>}
    <div className={`factory-workspace${compact?" factory-compact-workspace":""}`}><FactoryViewport label="Port Klang factory map">
      <div className="factory-toolbar"><div><small>SUGIHARA GRAND INDUSTRIES</small><strong>Port Klang / {layout.label}</strong></div><div className="factory-view-buttons"><button type="button" onClick={()=>setView(previous=>({top:false,revision:previous.revision+1}))}>Reset view</button><button type="button" onClick={()=>setView(previous=>({top:true,revision:previous.revision+1}))}>Top view</button><button type="button" disabled={!selected} onClick={()=>setView(previous=>({top:false,revision:previous.revision+1,focusId:selected??undefined}))}>Focus selected</button><FactoryFullscreenButton />{compact&&<button type="button" aria-pressed={moving} onClick={()=>setMoving(value=>!value)}>{moving?"Pause motion":"Animate motion"}</button>}</div></div>
      {!compact&&<div className="factory-floor-controls" aria-label="Port Klang floors">{(Object.keys(portKlangFloors) as PortKlangFloor[]).map(key=><button type="button" key={key} aria-pressed={floor===key} onClick={()=>{setFloor(key);setSelected(null);setQuery("");setView(previous=>({top:false,revision:previous.revision+1}));}}>{portKlangFloors[key].label}</button>)}</div>}
      {!compact&&<div className="factory-system-strip"><span><b>DATA FLOW</b>3 waterjet sensors → 3 Raspberry Pi → AI PC / database · First-floor front office<small className="factory-office-flow">Cyan: sensor → Pi · Purple: Pi → AI PC · Illustrative only</small></span><button type="button" onClick={()=>{setFloor("ground");setSelected(null);setView(previous=>({top:false,revision:previous.revision+1,network:true}));}}>Waterjet data flow ↗</button><button type="button" onClick={()=>select(portKlangServer.id)}>AI PC · first floor ↗</button><button type="button" aria-pressed={moving} onClick={()=>setMoving(value=>!value)}>{moving?"Pause motion":"Animate motion"}</button></div>}
      <PortKlangScene floor={floor} selected={selected} onSelect={select} view={view} moving={moving} compact={compact}/>
      {compact?<div className="factory-map-footer"><span>{asset?.name??"Drag to rotate · Space + drag to pan · Scroll to zoom"}</span><span>Illustrative motion · No live readings</span></div>:<div className="factory-map-footer"><span>Drag to rotate · Space + drag to pan · Scroll to zoom<br/>Mobile: one finger to pan · Two fingers to rotate / zoom</span><span>White: equipment & facilities · Green arrows: marked routes<br/>Route widths and equipment shapes are illustrative.</span></div>}
    </FactoryViewport>{!compact && <aside className="factory-sidebar"><section className="factory-detail" aria-live="polite"><small>{layout.label.toUpperCase()} / SELECTED AREA</small><h2>{asset?.name??"Explore Port Klang"}</h2>{asset&&<span className="factory-kind">{asset.kind}</span>}<p>{asset?"Position and footprint follow the supplied evacuation plan. Models are schematic interpretations of the names, rather than measured replicas.":"Select equipment in the map or list. Switch floors to explore the upper offices, storage, training centre, canteen and rooftop."}</p>{asset&&<p>{portKlangModelDescriptions[portKlangModelType(asset)]}</p>}{floor==="first"&&<p>The shaded central footprint has no equipment detail in the source plan.</p>}<div className="factory-data-status"><i/>Layout only · no live status</div></section>
    <div className="factory-equipment-heading"><h3>Equipment & areas</h3><span>{items.length}</span></div><label className="factory-search"><span>Find equipment or an area</span><input type="search" placeholder="Search forming, office, storage…" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="factory-asset-list">{items.map(item=><button type="button" key={item.id} aria-pressed={selected===item.id} onClick={()=>select(item.id)}><i style={{background:item.kind==="assembly"?"#27945a":"#cbd5cf"}}/><span>{item.name}</span><span aria-hidden="true">↗</span></button>)}{!items.length&&<p>No matching equipment or areas.</p>}</div>
    </aside>}</div>
  </>;
}
