import * as THREE from "three";
import type { PortKlangAsset } from "./portKlangLayout";
import { animateRobot, buildRobotStation, type RobotRig } from "./factoryModels";

export type PortKlangDataFlow = { curve: THREE.CatmullRomCurve3; dots: THREE.Mesh[]; phase: number };
export type PortKlangNetworkNode = { assetId: string; piPosition: THREE.Vector3 };
export function animatePortKlangDataFlows(flows: PortKlangDataFlow[], seconds: number) {
  for (const flow of flows) flow.dots.forEach((dot,index) => dot.position.copy(flow.curve.getPoint((seconds*.35+flow.phase+index*.23)%1)));
}

// Keep packets legible at overview scale, including dots inside scaled station models.
export function sizePortKlangDataPackets(flows: PortKlangDataFlow[], camera: THREE.PerspectiveCamera, viewportHeight: number) {
  const position = new THREE.Vector3(), parentScale = new THREE.Vector3();
  for (const flow of flows) flow.dots.forEach((dot,index) => {
    dot.getWorldPosition(position); dot.parent?.getWorldScale(parentScale);
    if (!dot.parent) parentScale.set(1,1,1);
    const perPixel = 2 * camera.position.distanceTo(position) * Math.tan(THREE.MathUtils.degToRad(camera.fov/2)) / Math.max(1,viewportHeight);
    const radius = Math.max(.025,Math.min(.65,perPixel*(index===0?2.8:1.9)));
    const geometryRadius = (dot.geometry as THREE.SphereGeometry).parameters.radius;
    dot.scale.set(radius/(geometryRadius*parentScale.x),radius/(geometryRadius*parentScale.y),radius/(geometryRadius*parentScale.z));
  });
}

export function portKlangModelType(asset: PortKlangAsset) {
  const name = asset.name.toLowerCase();
  if (name.includes("solar")) return "solar";
  if (name.includes("security")) return "security";
  if (name.includes("punch card")) return "attendance";
  if (name.includes("pump")) return "pump";
  if (name.includes("tube") || name.includes("roll form storage")) return "tube-rack";
  if (name.includes("waterjet assembly")) return "assembly-line";
  if (name.includes("waterjet")) return "waterjet";
  if (name.includes("forming") && name.includes("oven") && !name.includes("mini forming oven")) return "forming-oven";
  if (name.includes("oven")) return "oven";
  if (name.includes("forming") || name.includes("new mf")) return "forming";
  if (name.includes("coating")) return "coating";
  if (name.includes("hot roller")) return "hot-roller";
  if (name.includes("needle") || name.includes("dilo")) return "needle-punch";
  if (name.includes("luggage")) return "luggage";
  if (name.includes("mould maker") || name.includes("maintenance")) return "workshop";
  if (name.includes("mould") || name.includes("jig")) return "mould-rack";
  if (name.includes("tube") || name.includes("roll form")) return "tube-rack";
  if (name.includes("raw material")) return "raw-material";
  if (name.includes("finished goods") || name.includes("old part")) return "finished-goods";
  if (name.includes("document")) return "documents";
  if (name.includes("meeting")) return "meeting";
  if (name.includes("training")) return "training";
  if (name.includes("pantry")) return "pantry";
  if (name.includes("canteen")) return "canteen";
  if (name.includes("toilet")) return "toilets";
  if (name.includes("surau")) return "surau";
  if (name.includes("laboratory")) return "qc";
  if (name.includes("office")) return "office";
  if (name.includes("motorbike")) return "motorbike";
  return asset.kind;
}

export const portKlangModelDescriptions: Record<ReturnType<typeof portKlangModelType>, string> = {
  forming: "Forming press with four columns, mould bed, material roll and feed/output rollers.",
  "forming-oven": "Forming press beside a heating oven, connected by a roller feed bed.",
  oven: "Insulated oven enclosure with a dark feed opening, roller bed and control screen.",
  waterjet: "Two ABB arms beside one mould, with a sensor feeding its own Raspberry Pi and a dedicated TV. Waterjet 2's Pi is at the front; Waterjets 1 and 4 have theirs at the side. Animated dots illustrate data direction, not live readings.",
  "assembly-line": "Roller conveyor with assembly benches and a parts trolley.",
  coating: "Material unwind roll, coating rollers, process hood and take-up roll.",
  "hot-roller": "Paired horizontal rollers in a support frame with feed and exit tables.",
  "needle-punch": "Textile processing loom with a needle-beam housing and fabric feed rollers.",
  luggage: "Mat worktables with shaped carpet pieces, cutting station and a trolley.",
  "mould-rack": "Open shelves holding forming moulds and jig frames.",
  "tube-rack": "Cantilever rack holding long tubes and rolled sections.",
  "raw-material": "Pallets of material rolls beside open storage racks.",
  "finished-goods": "Stacked cartons on pallets and loaded warehouse shelves.",
  documents: "Filing cabinets and shelves of document binders.",
  workshop: "Workbench, tool board, storage cabinet and a machining/work station.",
  office: "Open office with desks, monitors, chairs and filing cabinets.",
  meeting: "Meeting table with surrounding chairs and a presentation screen.",
  training: "Rows of training desks and chairs facing a teaching screen.",
  pantry: "Counter, sink, refrigerator and a small table.",
  canteen: "Dining tables with benches and a serving counter.",
  toilets: "Cutaway cubicles with toilet bowls and a wash basin.",
  surau: "Prayer mats, shoe shelf and a small storage cabinet.",
  qc: "Inspection benches, sample pieces and a measurement station.",
  pump: "Motor and pump assemblies with connected pipes and a valve.",
  tank: "Cylindrical sprinkler tank with rim, access ladder and outlet pipe.",
  security: "Cutaway guard booth with desk, windows and a gate barrier.",
  attendance: "Wall-mounted punch-card terminal and card slots.",
  parking: "Marked car parking bays with wheel stops.",
  motorbike: "Marked motorcycle bays with compact bike silhouettes.",
  assembly: "Green assembly-point marking and a raised sign.",
  chemical: "Bunded chemical drums, containment pallet and warning sign.",
  solar: "Small solar-panel array beside the rooftop access point.",
  roof: "Flat rooftop slab with a low perimeter parapet.",
  storage: "Open warehouse shelving with stored packages.",
  machine: "Process bed with a support frame and operator console.",
  room: "Cutaway room with a desk and storage cabinet.",
  server: "AI PC hosting the main server and database in the front first-floor office. Receives data from the three waterjet Raspberry Pis. Connections shown are illustrative, not live telemetry."
};

// Name-based, schematic models. Each model uses the traced footprint; no exact
// equipment make, robot configuration or physical dimension is inferred.
export function buildPortKlangModel(root: THREE.Group, asset: PortKlangAsset, flows: PortKlangDataFlow[] = [], nodes: PortKlangNetworkNode[] = [], robots: RobotRig[] = []) {
  const type = portKlangModelType(asset);
  root.userData.modelType = type;
  const processing = ["forming", "forming-oven", "oven", "waterjet", "coating", "hot-roller", "needle-punch", "assembly-line", "luggage"].includes(type);
  const turn = processing && asset.depth > asset.width * 1.35;
  const pivot = new THREE.Group(); root.add(pivot); if (turn) pivot.rotation.y = Math.PI / 2;
  const w = turn ? asset.depth : asset.width, d = turn ? asset.width : asset.depth;
  const h = type === "tank" ? 3.5 : Math.min(2.7, Math.max(1.05, Math.min(w, d) * .65));
  const model = new THREE.Group(); model.scale.set(w, h, d); pivot.add(model);
  const white = "#f6f9f7", frame = "#b6c7be", dark = "#6f8980", pale = "#e0e9e3";
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: .08 });
  function add(geometry: THREE.BufferGeometry, x: number, y: number, z: number, color: string, name: string) {
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.partName = name; model.add(mesh); return mesh;
  }
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number, color = white, name = asset.name) => add(new THREE.BoxGeometry(bw, bh, bd), x, y, z, color, name);
  const cylinder = (radius: number, length: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y", color = white, name = asset.name) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, length, 16), x, y, z, color, name);
    if (axis === "x") mesh.rotation.z = Math.PI / 2; if (axis === "z") mesh.rotation.x = Math.PI / 2; return mesh;
  };
  const table = (x: number, z: number, tw = .3, td = .3, y = .43) => {
    box(tw, .045, td, x, y, z, white, "Worktable");
    for (const dx of [-1,1]) for (const dz of [-1,1]) box(.018, y-.1, .018, x+dx*tw*.38, (y-.1)/2+.06, z+dz*td*.36, frame, "Table leg");
  };
  const chair = (x: number, z: number, reverse = false) => {
    box(.095,.04,.09,x,.25,z,pale,"Chair seat");box(.095,.2,.02,x,.35,z+(reverse?-.04:.04),frame,"Chair back");
    box(.025,.16,.025,x,.15,z,frame,"Chair base");
  };
  const screen = (x: number, z: number, width = .14, y = .68) => {
    box(width,.18,.025,x,y,z,dark,"Display");box(width*.84,.13,.007,x,y,z+.016,pale,"Display screen");box(.02,.12,.025,x,y-.13,z,frame,"Display stand");
  };
  const conveyor = (x: number, z: number, length = .55, depth = .38) => {
    box(length,.06,depth,x,.31,z,frame,"Conveyor frame");
    for (let i=0;i<7;i++) cylinder(.022,depth*.9,x-length*.43+i*length*.86/6,.36,z,"z",white,"Feed roller");
    for (const dx of [-1,1]) box(.025,.25,depth*.7,x+dx*length*.38,.17,z,frame,"Conveyor support");
  };
  const roll = (x: number, z: number, radius = .12, length = .44) => {
    cylinder(radius,length,x,.46,z,"z",pale,"Material roll");
    for (const dz of [-1,1]) box(.035,.33,.03,x,.24,z+dz*length*.44,frame,"Roll stand");
  };
  const press = (x: number, size = .5) => {
    box(size,.12,.7,x,.15,0,frame,"Press base");box(size*.72,.08,.52,x,.36,0,dark,"Forming mould");
    for (const dx of [-1,1]) for (const dz of [-1,1]) cylinder(.025,.67,x+dx*size*.38,.52,dz*.26,"y",frame,"Press column");
    box(size,.14,.72,x,.9,0,white,"Press crown");box(size*.66,.1,.5,x,.63,0,pale,"Upper forming platen");
    cylinder(.045,.17,x,.75,0,"y",frame,"Hydraulic ram");
  };
  const oven = (x: number, width = .5) => {
    box(width,.62,.72,x,.47,0,white,"Heating oven");box(width+.01,.26,.52,x,.36,0,dark,"Oven feed opening");
    box(width,.07,.74,x,.8,0,pale,"Insulated oven roof");
    for(const dz of [-.22,0,.22]) box(width*.82,.018,.035,x,.845,dz,frame,"Vent grille");
  };
  const pallet = (x: number, z: number, pw = .26, pd = .28) => {
    for (const dz of [-.35,0,.35]) box(pw,.025,pd*.2,x,.13,z+dz*pd,frame,"Pallet slat");
    for (const dx of [-.32,.32]) box(pw*.13,.07,pd*.88,x+dx*pw,.085,z,frame,"Pallet runner");
  };
  const rack = (z: number, moulds = false, cartons = true) => {
    for (const x of [-.43,.43]) for(const dz of [-.075,.075]) box(.022,.9,.022,x,.53,z+dz,frame,"Rack upright");
    for(const y of [.16,.48,.8]) {
      box(.9,.025,.2,0,y,z,pale,"Rack shelf");
      for(const x of [-.29,0,.29]) {
        if(moulds) {box(.21,.06,.15,x,y+.05,z,dark,"Forming mould");box(.11,.045,.08,x,y+.1,z,white,"Mould profile");}
        else if(cartons) box(.22,.18,.15,x,y+.11,z,white,"Stored carton");
      }
    }
  };
  const room = () => {
    // Low cutaway walls keep the contents visible from the factory overview.
    box(.95,.025,.95,0,.07,0,pale,"Room floor");box(.97,.5,.018,0,.32,-.47,white,"Rear wall");box(.018,.3,.95,-.47,.22,0,white,"Side wall");
  };
  box(.98,.045,.98,0,.025,0,pale,"Footprint");
  switch(type) {
    case "forming": case "forming-oven":
      roll(-.4,0,.1,.55); conveyor(-.24,0,.25,.45); press(.16,.48); conveyor(.4,0,.16,.48);
      if(type==="forming-oven") oven(-.2,.25);
      screen(.37,.36,.1,.65); break;
    case "oven":
      conveyor(0,0,.9,.48);oven(0,.5);screen(.32,.31,.12,.62);break;
    case "waterjet":
      {
        const cell = new THREE.Group();
        const rigs = buildRobotStation(cell, { ...asset, kind: "waterjet", width: 8, depth: 7 }); robots.push(...rigs);
        // Fit the swept robot envelope, rather than just the initial pose.
        const bounds = new THREE.Box3();
        for (let step=0;step<=56;step++) { rigs.forEach(rig=>animateRobot(rig,step*.5)); bounds.union(new THREE.Box3().setFromObject(cell)); }
        rigs.forEach(rig=>animateRobot(rig,0));
        const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        cell.scale.set(.59/size.x,.78/size.y,.52/size.z);
        cell.position.set(-center.x*cell.scale.x,.08-bounds.min.y*cell.scale.y,-center.z*cell.scale.z);
        cell.traverse(object => { if (object instanceof THREE.Mesh) {
          object.castShadow = true; object.receiveShadow = true;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(value => { if (value instanceof THREE.MeshStandardMaterial) { const c = value.color; value.color.set(c.r+c.g+c.b < .8 ? dark : white); value.roughness = .78; value.metalness = .08; } });
        } });
        model.add(cell);
        const front = asset.id.endsWith("waterjet-2"), cabinetX = front ? -.4 : turn ? 0 : .4, cabinetZ = !front && turn ? .38 : .05;
        // Waterjet 2's long cell is rotated: its negative local X is the map's front (+Z).
        box(.15,.43,.16,cabinetX,.3,cabinetZ,white,"Raspberry Pi enclosure");
        box(.13,.29,.012,cabinetX,.38,cabinetZ+.088,"#159b72","Raspberry Pi board");
        box(.052,.085,.012,cabinetX,.38,cabinetZ+.1,dark,"Raspberry Pi processor");
        for(const dx of [-.035,.035])box(.023,.045,.02,cabinetX+dx,.29,cabinetZ+.1,frame,"Raspberry Pi port");
        box(.065,.08,.06,0,.57,0,"#00a5bf","Waterjet sensor / transmitter");
        cylinder(.004,.12,.025,.66,0,"y",frame,"Sensor antenna");
        box(.18,.025,.13,.26,.09,-.37,frame,"TV stand base");
        box(.025,.57,.025,.26,.38,-.37,frame,"TV stand");
        box(.31,.23,.025,.26,.78,-.37,dark,"Dedicated waterjet TV");
        box(.28,.2,.01,.26,.78,-.352,"#225b65","TV dashboard screen");
        for(let index=0;index<3;index++)box(.05,.025+index*.02,.006,.18+index*.077,.75+index*.01,-.345,"#9bd2c5","Illustrative dashboard bar");
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0,.62,0),new THREE.Vector3(cabinetX*.45,1.12,cabinetZ*.6),new THREE.Vector3(cabinetX,.47,cabinetZ+.11)]);
        const path = new THREE.Mesh(new THREE.TubeGeometry(curve,32,.003,6,false),material("#80bdc2")); path.userData.partName="Sensor → Raspberry Pi · illustrative data"; model.add(path);
        const dots = Array.from({length:3},(_,index)=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(.012,8,6),new THREE.MeshBasicMaterial({color:index===0?"#007f9c":"#11bfd1",depthTest:false}));dot.userData.partName="Data packet · illustrative";dot.renderOrder=3;model.add(dot);dot.position.copy(curve.getPoint(index*.23));return dot;});
        flows.push({curve,dots,phase:asset.id.endsWith("2")?.25:0});
        nodes.push({assetId:asset.id,piPosition:model.localToWorld(new THREE.Vector3(cabinetX,.47,cabinetZ+.11))});
      }
      break;
    case "assembly-line":
      conveyor(0,0,.89,.35);for(const x of [-.28,.28])table(x,.32,.23,.18);box(.16,.2,.15,.27,.23,-.32,frame,"Parts trolley");break;
    case "coating":
      roll(-.33,0,.13,.55);roll(.33,0,.15,.55);conveyor(0,0,.6,.55);
      for(const x of [-.16,.03,.19])cylinder(.07,.61,x,.55,0,"z",frame,"Coating roller");
      box(.29,.23,.64,.03,.85,0,white,"Process hood");box(.23,.21,.24,.02,.2,.32,pale,"Coating reservoir");screen(.28,.37,.1);break;
    case "hot-roller":
      conveyor(0,0,.9,.47);for(const z of [-.33,.33])box(.2,.8,.09,0,.5,z,white,"Roller support");
      for(const y of [.45,.69])cylinder(.105,.57,0,y,0,"z",frame,"Heated roller");screen(.3,.33);break;
    case "needle-punch":
      conveyor(0,0,.9,.5);roll(-.36,0,.09,.54);roll(.38,0,.09,.54);
      for(const z of [-.3,.3])box(.24,.7,.08,0,.5,z,white,"Loom frame");box(.36,.2,.75,0,.87,0,white,"Needle beam housing");
      for(let i=0;i<9;i++)box(.008,.15,.008,-.13+i*.0325,.66,0,dark,"Needle beam detail");box(.73,.012,.4,0,.4,0,pale,"Textile web");break;
    case "luggage":
      for(const x of [-.25,.25]){table(x,0,.35,.6);box(.25,.035,.35,x,.47,0,dark,"Shaped carpet mat");box(.08,.04,.14,x,.5,-.12,pale,"Carpet contour");}
      box(.15,.25,.18,.28,.2,.37,frame,"Mat trolley");screen(-.35,-.36,.12,.64);break;
    case "raw-material":
      rack(-.32,false,false);for(const x of [-.3,0,.3])for(const z of [-.28,.2]){pallet(x,z);for(const dx of [-.055,.055])cylinder(.047,.48,x+dx,.4,z,"y",white,"Raw material roll");}break;
    case "finished-goods":
      rack(-.32);for(const x of [-.3,0,.3]){pallet(x,.2);for(const y of [.25,.45])for(const dx of [-.065,.065])box(.115,.18,.26,x+dx,y,.2,white,"Packed goods carton");}break;
    case "mould-rack":rack(-.26,true);rack(.26,true);break;
    case "tube-rack":
      for(const z of [-.28,.28]){for(const x of [-.35,.35])box(.03,.85,.035,x,.5,z,frame,"Cantilever upright");for(const y of [.25,.52,.79])for(let i=0;i<4;i++)cylinder(.025,.86,0,y,z-.075+i*.05,"x",white,"Stored tube / roll section");}break;
    case "documents":
      room();for(const x of [-.3,0,.3]){box(.22,.72,.2,x,.44,-.28,white,"Filing cabinet");for(const y of [.2,.4,.6])box(.16,.015,.012,x,y,-.174,frame,"Drawer handle");}rack(.27);break;
    case "workshop":
      table(-.15,-.2,.54,.28);box(.62,.45,.03,-.12,.74,-.38,frame,"Tool board");for(let i=0;i<6;i++)box(.018,.17,.025,-.33+i*.08,.74,-.35,dark,"Hanging tool");
      box(.25,.52,.26,.28,.33,.2,white,"Workshop machine");box(.32,.045,.32,.28,.61,.2,frame,"Machining table");cylinder(.025,.3,.28,.8,.2,"y",dark,"Machine spindle");break;
    case "office": case "room":
      room();for(const x of [-.23,.23]){table(x,0,.32,.32);screen(x,-.07,.14,.65);chair(x,.23);}box(.25,.6,.16,.26,.4,-.34,white,"Office cabinet");break;
    case "meeting":
      room();table(0,0,.4,.62);for(const z of [-.22,0,.22]){chair(-.32,z);chair(.32,z,true);}screen(0,-.43,.55,.8);break;
    case "training":
      room();for(const z of [-.05,.22])for(const x of [-.25,.25]){table(x,z,.3,.18);chair(x,z+.13);}screen(0,-.42,.6,.78);break;
    case "pantry":
      room();box(.6,.42,.25,-.1,.31,-.29,white,"Kitchen counter");box(.18,.025,.16,-.2,.54,-.29,dark,"Sink");box(.19,.75,.24,.32,.46,-.29,white,"Refrigerator");table(-.05,.21,.4,.28);chair(-.05,.39);break;
    case "canteen":
      room();for(const x of [-.25,.25])for(const z of [-.03,.29]){table(x,z,.33,.18);for(const dz of [-.12,.12])box(.3,.04,.055,x,.24,z+dz,frame,"Dining bench");}box(.7,.44,.18,0,.32,-.32,white,"Serving counter");break;
    case "toilets":
      room();for(const x of [-.27,.08]){box(.012,.6,.5,x+.13,.39,-.17,white,"Cubicle partition");cylinder(.072,.13,x,.22,-.2,"y",white,"Toilet bowl");box(.14,.27,.075,x,.38,-.34,pale,"Toilet cistern");}box(.65,.045,.17,0,.48,.3,white,"Wash counter");for(const x of [-.2,.2])box(.13,.012,.11,x,.51,.3,dark,"Wash basin");break;
    case "surau":
      room();for(const x of [-.28,0,.28])for(const z of [-.12,.2]){box(.2,.01,.24,x,.1,z,frame,"Prayer mat");box(.14,.01,.02,x,.11,z-.08,white,"Mat border");}box(.7,.2,.13,0,.2,-.35,white,"Shoe shelf");break;
    case "qc":
      room();table(0,-.22,.75,.28);table(.05,.25,.65,.25);screen(-.18,-.29);box(.18,.06,.13,.18,.49,-.22,dark,"Inspection sample");box(.02,.25,.02,.18,.64,-.22,frame,"Measurement stand");break;
    case "pump":
      for(const z of [-.22,.22]){box(.75,.06,.24,0,.12,z,frame,"Pump skid");cylinder(.09,.25,-.18,.3,z,"x",white,"Electric motor");cylinder(.08,.18,.1,.3,z,"x",frame,"Pump casing");box(.32,.04,.04,.25,.29,z,dark,"Outlet pipe");}cylinder(.035,.6,.36,.3,0,"z",frame,"Pipe manifold");break;
    case "tank":
      cylinder(.39,.91,0,.53,0,"y",white,"Sprinkler tank");for(const y of [.17,.88])cylinder(.4,.025,0,y,0,"y",frame,"Tank rim");
      for(const x of [-.08,.08])box(.015,.86,.02,x,.5,.42,frame,"Access ladder rail");for(let i=0;i<7;i++)box(.17,.015,.02,0,.15+i*.12,.42,frame,"Ladder rung");box(.24,.045,.04,.29,.2,.25,dark,"Tank outlet");break;
    case "security":
      room();table(0,0,.46,.3);chair(0,.22);box(.55,.2,.02,0,.49,-.45,frame,"Guard window");box(.03,.4,.03,.35,.3,.3,frame,"Gate barrier post");box(.7,.035,.035,0,.5,.3,white,"Gate barrier arm");break;
    case "attendance":
      box(.85,.8,.045,0,.48,-.3,white,"Terminal wall");box(.22,.24,.08,-.2,.52,-.23,frame,"Punch card terminal");box(.14,.09,.012,-.2,.56,-.181,dark,"Terminal display");for(let i=0;i<4;i++)box(.15,.04,.045,.2,.28+i*.11,-.23,pale,"Card slot");break;
    case "parking":
      for(let z=-.35;z<=.3;z+=.25){box(.85,.008,.015,0,.06,z,white,"Parking bay line");box(.06,.035,.13,-.35,.09,z+.12,frame,"Wheel stop");}break;
    case "motorbike":
      for(const x of [-.32,0,.32]){for(const z of [-.15,.16])cylinder(.065,.04,x,.15,z,"x",dark,"Motorcycle wheel");box(.09,.07,.23,x,.26,0,white,"Motorcycle body");box(.09,.035,.12,x,.32,-.04,frame,"Motorcycle seat");box(.18,.015,.02,x,.39,.14,frame,"Handlebar");}break;
    case "chemical":
      box(.9,.06,.8,0,.1,0,frame,"Containment bund");for(const x of [-.26,0,.26])for(const z of [-.19,.19]){cylinder(.09,.4,x,.35,z,"y",white,"Chemical drum");for(const y of [.19,.48])cylinder(.092,.02,x,y,z,"y",frame,"Drum band");}box(.02,.55,.02,.36,.5,-.33,frame,"Warning sign post");box(.16,.16,.02,.36,.8,-.33,"#cfb464","Chemical warning sign");break;
    case "solar":
      for(const x of [-.24,.24]){const panel=box(.4,.025,.64,x,.28,0,frame,"Solar panel");panel.rotation.x=-.18;for(let i=0;i<4;i++)box(.34,.008,.012,x,.32,-.22+i*.145,white,"Panel cell line");}break;
    case "assembly":
      box(.9,.02,.9,0,.06,0,"#27945a","Assembly point");box(.6,.01,.06,0,.08,0);box(.06,.01,.6,0,.08,0);box(.025,.65,.025,.36,.4,-.35,frame,"Assembly sign post");box(.21,.18,.02,.36,.78,-.35,"#27945a","Assembly sign");break;
    case "roof":
      for(const z of [-.47,.47])box(.96,.075,.018,0,.1,z,white,"Roof parapet");for(const x of [-.47,.47])box(.018,.075,.96,x,.1,0,white,"Roof parapet");break;
    case "server":
      table(0,0,.8,.65);
      box(.22,.48,.35,-.25,.7,0,"#286b6d","AI PC tower / database host");box(.018,.35,.015,-.29,.7,.182,"#8ce1ce","PC indicator strip");
      screen(.12,-.12,.4,.78);box(.36,.015,.12,.12,.47,.17,frame,"Keyboard");break;
    case "storage":rack(-.25);rack(.25);break;
    default:conveyor(0,0,.8,.6);press(0,.45);break;
  }
  return type;
}
