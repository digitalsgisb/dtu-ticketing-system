import * as THREE from "three";
import type { FactoryAsset } from "./factoryLayout";

export type RobotRig = { yaw: THREE.Group; shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; phase: number; kind: "waterjet" | "glue" };
export type LoftRig = { vehicle: THREE.Group; wheels: THREE.Mesh[]; forks: THREE.Group; travel: number };
export type AsanoRig = { platen: THREE.Group; roll: THREE.Group; carpet: THREE.Group; phase: number };

function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: string, emissive = false) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, metalness: .35, roughness: .5, ...(emissive ? { emissive: color, emissiveIntensity: 2.2 } : {}) }));
  object.position.set(...position); parent.add(object); return object;
}

function cylinder(parent: THREE.Object3D, radius: number, length: number, color: string, y: number) {
  const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), new THREE.MeshStandardMaterial({ color, roughness: .4, metalness: .45 }));
  part.position.y = y; parent.add(part); return part;
}

function joint(parent: THREE.Object3D, radius: number, color: string) {
  const part = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), new THREE.MeshStandardMaterial({ color, metalness: .4, roughness: .4 })); parent.add(part);
}

export function buildFacility(root: THREE.Group, asset: FactoryAsset): boolean {
  const w = asset.width, d = asset.depth;
  if (asset.id === "office-east" || asset.id === "toilets") {
    const h = asset.id === "office-east" ? 3.1 : 2.2;
    const upright = asset.id === "office-east" ? .44 : .23, foot = asset.id === "office-east" ? .45 : .22;
    box(root, [w * upright, h, d], [w * (.5 - upright / 2), h / 2, 0], "#f6f8f7");
    box(root, [w * (1 - upright), h, d * foot], [-w * upright / 2, h / 2, d * (.5 - foot / 2)], "#f6f8f7"); return true;
  }
  if (asset.id === "carpark" || asset.id === "ev-bay") {
    for (const z of (asset.id === "ev-bay" ? [0] : [-3, 3])) {
      if (asset.id === "ev-bay") {
        for (const offset of [-1.1, 1.1]) box(root, [4.6, .025, .06], [-.7, .21, offset], "#ffffff");
      } else for (const x of [-1.1, 1.1]) box(root, [.06, .025, 4.6], [x, .21, z], "#ffffff");
      const car = new THREE.Group(); car.position.set(0, .2, z); root.add(car);
      if (asset.id === "ev-bay") { car.position.x = -.7; car.rotation.y = Math.PI / 2; }
      box(car, [1.4, .45, 3.1], [0, .55, 0], "#edf1ef");
      box(car, [1.15, .5, 1.55], [0, 1, -.05], "#bec8c8");
      box(car, [1.2, .1, 1.35], [0, 1.29, -.05], "#edf1ef");
      for (const x of [-.7, .7]) for (const wheelZ of [-1, 1]) {
        const wheel = cylinder(car, .25, .17, "#37484b", 0); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .3, wheelZ);
      }
    } return true;
  }
  if (asset.kind === "seating") {
    for (const x of [-w * .23, w * .23]) {
      box(root, [.85, .12, d * .78], [x, 1.1, 0], "#f1f4f2");
      for (const z of [-d * .28, d * .28]) for (const dx of [-.27, .27]) box(root, [.08, 1, .08], [x + dx, .5, z], "#899892");
      for (const z of [-d * .28, 0, d * .28]) for (const side of [-1, 1]) {
        box(root, [.45, .1, .5], [x + side * .75, .6, z], "#c6ceca");
        box(root, [.08, .6, .5], [x + side * .98, .9, z], "#c6ceca");
        for (const dz of [-.17, .17]) box(root, [.06, .55, .06], [x + side * .75, .28, z + dz], "#899892");
      }
    } return true;
  }
  if (asset.kind === "charger") {
    box(root, [.65, 1.7, .4], [0, .95, 0], "#21a086");
    box(root, [.42, .5, .05], [0, 1.35, .23], "#b8f4de", true);
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(.3, 1.5, .1), new THREE.Vector3(.65, .8, .2), new THREE.Vector3(.5, .35, .35), new THREE.Vector3(.25, 1.05, .3)]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 20, .035, 6, false), new THREE.MeshStandardMaterial({ color: "#405a54" })));
    return true;
  }
  if (asset.kind === "entrance") {
    for (const x of [-w / 2, w / 2]) box(root, [.13, 2.4, .16], [x, 1.2, 0], "#edf2ef");
    box(root, [w, .14, .18], [0, 2.4, 0], "#edf2ef"); return true;
  }
  if (asset.kind === "attendance") {
    box(root, [.16, 1.5, .16], [0, .75, 0], "#888fa2");
    box(root, [.65, .85, .25], [0, 1.8, 0], "#7662c3");
    box(root, [.45, .52, .04], [0, 1.85, .15], "#d5f1eb", true); return true;
  }
  if (asset.kind === "sensor") {
    box(root, [.12, .3, .12], [0, .15, 0], "#5b8893");
    box(root, [.55, .35, .45], [0, .42, 0], "#00a5bf");
    cylinder(root, .03, .6, "#4f737a", .88).position.x = .2;
    box(root, [.1, .08, .08], [0, .46, .26], "#96ffdf", true); return true;
  }
  if (asset.kind === "edge") {
    box(root, [1.1, .75, .1], [0, .25, 0], "#159b72");
    box(root, [.34, .3, .12], [-.1, .25, .1], "#2c4243");
    for (const x of [-.4, -.27, -.14, -.01, .12, .25]) box(root, [.06, .1, .08], [x, .56, .09], "#e1ba65");
    box(root, [.22, .25, .2], [.45, .2, .1], "#c3d2cc"); return true;
  }
  return false;
}

function carpetProduct(parent: THREE.Object3D) {
  const carpet = new THREE.Group(); parent.add(carpet);
  // A formed automotive floor carpet: four recessed footwells and a raised centre tunnel.
  box(carpet, [2, .08, 2.6], [0, 0, 0], "#4b4e50");
  for (const x of [-.52, .52]) for (const z of [-.65, .65]) {
    box(carpet, [.82, .08, 1.05], [x, .08, z], "#242b2e");
    for (const edge of [-.44, .44]) box(carpet, [.07, .25, 1.12], [x + edge, .16, z], "#41474a");
    for (const edge of [-.55, .55]) box(carpet, [.9, .23, .07], [x, .15, z + edge], "#41474a");
  }
  box(carpet, [.25, .4, 2.6], [0, .2, 0], "#52575a");
  box(carpet, [1.95, .23, .16], [0, .15, 0], "#52575a");
  return carpet;
}

export function buildAsano(root: THREE.Group, asset: FactoryAsset): AsanoRig {
  const stage = (name: string, x: number, z: number) => {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.userData.partName = `${asset.name} · ${name}`; root.add(group); return group;
  };
  const conveyor = (parent: THREE.Group, length: number, width: number, y: number) => {
    box(parent, [length, .25, width], [0, y, 0], "#425760");
    for (let x = -length / 2 + .15; x < length / 2; x += .42) {
      const roller = cylinder(parent, .1, width - .1, "#a8b6bd", 0); roller.rotation.x = Math.PI / 2; roller.position.set(x, y + .2, 0);
    }
    for (const x of [-length * .35, length * .35]) for (const z of [-width * .35, width * .35]) box(parent, [.12, y, .12], [x, y / 2, z], "#657983");
  };
  const loftFeed = stage("Loft layer in", -6.3, 0); conveyor(loftFeed, 3.1, 3.1, 1.25);
  for (const y of [1.55, 1.65, 1.75]) box(loftFeed, [2.4, .07, 2.5], [-.2, y, 0], "#c8c6b6");
  const feedSide = asset.line === 1 ? -1 : 1;
  const feed = stage("Roll in", -5, feedSide * 4.8);
  for (const z of [-1.2, 1.2]) box(feed, [.18, 2.8, .18], [0, 1.4, z], "#6d838d");
  const roll = new THREE.Group(); roll.position.y = 1.7; feed.add(roll);
  const drum = cylinder(roll, .85, 2.6, "#8f5148", 0); drum.rotation.x = Math.PI / 2;
  const core = cylinder(roll, .2, 2.9, "#c2af87", 0); core.rotation.x = Math.PI / 2;
  box(roll, [.1, .1, 2.65], [.85, 0, 0], "#b68b74");
  box(feed, [2.2, .07, 2.6], [1.05, 1.35, 0], "#676665");
  const prep = stage("Roll material preparation", -2.1, feedSide * 4.2);
  conveyor(prep, 3.5, 2.4, 1.3); box(prep, [2.8, .08, 1.8], [0, 1.58, 0], "#666460");
  const heat = stage("Heating & layer feed", -1.8, 0);
  conveyor(heat, 5.3, 4, 1.4);
  for (const side of [-1, 1]) {
    box(heat, [5.3, 2.3, .3], [0, 2.6, side * 2], "#d6a234");
    box(heat, [4.7, .18, .12], [0, 2.2, side * 1.8], "#ffb763", true);
  }
  box(heat, [5.3, .3, 4.2], [0, 3.9, 0], "#dab04b");
  for (let x = -2.1; x <= 2.1; x += .7) box(heat, [.1, .1, 3.7], [x, 4.1, 0], "#7d8f97");
  const forming = stage("Carpet forming press", 2.9, 0);
  box(forming, [4.2, .65, 5.1], [0, .7, 0], "#b78129");
  for (const x of [-1.65, 1.65]) for (const z of [-2, 2]) {
    box(forming, [.32, 4.5, .32], [x, 2.8, z], "#b4bfc4");
    cylinder(forming, .22, 1.5, "#6d818b", 4.6).position.set(x, 4.6, z);
  }
  box(forming, [4.3, .65, 5.2], [0, 5, 0], "#e5ad37");
  box(forming, [3.2, .3, 3.7], [0, 1.45, 0], "#65737a");
  const lowerMould = carpetProduct(forming); lowerMould.position.y = 1.7;
  const platen = new THREE.Group(); forming.add(platen);
  box(platen, [3.3, .4, 3.8], [0, 0, 0], "#818f96");
  const out = stage("Carpet out", 6.4, 0); conveyor(out, 2.9, 3.5, 1.4);
  const carpet = carpetProduct(out); carpet.position.set(0, 1.7, 0);
  const change = stage("Mould-change platform", 2.9, asset.line === 2 ? -5.3 : 5.3);
  box(change, [4.3, .35, 3.7], [0, .5, 0], "#93685d");
  for (const x of [-1.5, 1.5]) box(change, [.1, .1, 3.6], [x, .75, 0], "#b8c1c2");
  // Keep the small cabinet clear of Line 2's relocated platform.
  const cabinet = stage("Hydraulic & control unit", asset.line === 2 ? -1 : 2.9, -4.6);
  box(cabinet, [2.5, 2.4, 2.1], [0, 1.2, 0], "#97a7aa");
  box(cabinet, [1, .8, .06], [0, 1.6, 1.08], "#17394a");
  const rig = { platen, roll, carpet, phase: asset.line === 1 ? 0 : 2 };
  animateAsano(rig, 0); return rig;
}

export function animateAsano(rig: AsanoRig, seconds: number) {
  const t = seconds * .8 + rig.phase;
  rig.platen.position.y = 2.8 + .55 * Math.cos(t);
  rig.roll.rotation.z = -seconds * .6;
}

export function buildRollStorage(root: THREE.Group, asset: FactoryAsset) {
  const columns = Math.max(1, Math.floor(asset.width / .9));
  const rows = Math.max(1, Math.floor(asset.depth / .9));
  for (let x = 0; x < columns; x++) for (let z = 0; z < rows; z++) {
    const roll = new THREE.Group(); roll.position.set((x - (columns - 1) / 2) * .85, 0, (z - (rows - 1) / 2) * .85); root.add(roll);
    cylinder(roll, .34, 1.05, "#914d49", .7);
    cylinder(roll, .12, .03, "#cfb58b", 1.24);
    cylinder(roll, .065, .035, "#394047", 1.26);
  }
}

export function buildRobotStation(root: THREE.Group, asset: FactoryAsset): RobotRig[] {
  const abb = asset.kind === "waterjet";
  const body = abb ? "#ed782c" : "#c5cdd2", joints = abb ? "#424851" : "#69aeca";
  box(root, [asset.width * .9, .3, asset.depth * .85], [0, .3, 0], "#344552");
  const station = new THREE.Group(); root.add(station);
  // Waterjet 1 reaches inward from the north end, Waterjet 2 from the south.
  // Rotate the entire cell so animation stays relative to its own mould.
  if (abb) station.rotation.y = asset.id.endsWith("-2") ? Math.PI / 2 : -Math.PI / 2;
  const workX = abb ? 0 : 1.4;
  box(station, [2.5, 1, asset.depth * .65], [workX, .9, 0], abb ? "#547f8d" : "#778e86");
  box(station, [1.9, .18, asset.depth * .48], [workX, 1.5, 0], "#adb9b5");
  if (abb) for (const z of [-asset.depth * .36, asset.depth * .36]) box(station, [3, .4, .15], [0, 1.7, z], "#88acb5");
  const rigs: RobotRig[] = [];
  for (let index = 0; index < (abb ? 2 : 1); index++) {
  // Both ABB arms sit side by side at the same end, facing the mould together.
  const mount = new THREE.Group(); mount.position.set(-asset.width * .28, .4, abb ? (index === 0 ? -1.15 : 1.15) : 0);
  mount.userData.partName = `${asset.name} · ${abb ? "ABB" : "UR"} arm ${index + 1}`;
  station.add(mount);
  const yaw = new THREE.Group(); mount.add(yaw);
  yaw.scale.setScalar(abb ? .68 : .67);
  cylinder(yaw, .7, .35, "#3e4c59", .18); cylinder(yaw, .46, .8, body, .7);
  const shoulder = new THREE.Group(); shoulder.position.y = 1.15; yaw.add(shoulder); joint(shoulder, .48, joints);
  cylinder(shoulder, .27, 2.1, body, 1.05);
  const elbow = new THREE.Group(); elbow.position.y = 2.1; shoulder.add(elbow); joint(elbow, .4, joints);
  cylinder(elbow, .21, 1.9, body, .95);
  const wrist = new THREE.Group(); wrist.position.y = 1.9; elbow.add(wrist); joint(wrist, .3, joints);
  cylinder(wrist, .16, .55, body, .28);
  box(wrist, [.3, .28, .3], [0, .63, 0], "#25343c");
  cylinder(wrist, .055, abb ? .65 : .45, "#b9cbd2", .9);
  const rig: RobotRig = { yaw, shoulder, elbow, wrist, phase: (asset.line ?? 1) * .8 + (asset.id.endsWith("2") ? 1.8 : 0) + index * Math.PI, kind: abb ? "waterjet" : "glue" };
  animateRobot(rig, 0); rigs.push(rig);
  }
  return rigs;
}

export function animateRobot(rig: RobotRig, seconds: number) {
  const t = seconds * (rig.kind === "waterjet" ? 2.25 : 1.65) + rig.phase;
  rig.yaw.rotation.y = -.4 + Math.sin(t) * .3;
  rig.shoulder.rotation.z = -.7 + Math.sin(t * 1.2) * .15;
  rig.elbow.rotation.z = -1.35 + Math.cos(t * 1.2) * .24;
  rig.wrist.rotation.z = -1 + Math.sin(t * 1.5) * .2;
}

export function buildLoftArea(root: THREE.Group, asset: FactoryAsset): LoftRig {
  const height = 9, shelfWidth = 1.1;
  const ends = asset.depth / 2 - .5;
  // Two tall rack rows leave an open central aisle; no shelf crosses the vehicle path.
  for (const side of [-1, 1]) {
    const x = side * (asset.width / 2 - .7);
    for (let bay = 0; bay <= 5; bay++) {
      const z = -ends + bay * (2 * ends / 5);
      for (const offset of [-shelfWidth / 2, shelfWidth / 2]) box(root, [.14, height, .14], [x + offset, height / 2, z], "#587f95");
    }
    for (const y of [1.2, 3.5, 5.8, 8.1]) {
      box(root, [shelfWidth, .15, asset.depth - 1], [x, y, 0], "#91a4b1");
      box(root, [.12, .25, asset.depth - 1], [x - side * shelfWidth / 2, y, 0], "#d69b43");
      for (let bay = 0; bay < 5; bay++) {
        const z = -ends + (bay + .5) * (2 * ends / 5);
        box(root, [.8, .8, 2.1], [x, y + .48, z], bay % 2 ? "#b2b6a4" : "#958773");
      }
    }
  }
  for (const x of [-1.15, 1.15]) box(root, [.07, .02, asset.depth - 1], [x, .2, 0], "#d2b55f");
  const vehicle = new THREE.Group(); vehicle.position.y = .18; root.add(vehicle);
  const wheels: THREE.Mesh[] = [];
  for (const x of [-.68, .68]) for (const z of [-.65, .55]) {
    const wheel = cylinder(vehicle, .31, .23, "#202c34", 0);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .32, z); wheels.push(wheel);
  }
  box(vehicle, [1.25, .65, 1.75], [0, .65, -.1], "#e6b036");
  box(vehicle, [1.2, .5, .55], [0, 1.05, -.7], "#ce902b");
  box(vehicle, [.55, .14, .55], [0, 1.05, -.2], "#283b44");
  box(vehicle, [.55, .5, .12], [0, 1.3, -.43], "#283b44");
  for (const x of [-.56, .56]) for (const z of [-.8, .6]) box(vehicle, [.07, 1.5, .07], [x, 1.7, z], "#394b55");
  box(vehicle, [1.35, .12, 1.6], [0, 2.45, -.1], "#e6b036");
  for (const x of [-.42, .42]) box(vehicle, [.12, 2.7, .12], [x, 1.6, .85], "#384d59");
  const forks = new THREE.Group(); vehicle.add(forks);
  box(forks, [1, .55, .15], [0, .55, .95], "#71828c");
  for (const x of [-.33, .33]) box(forks, [.13, .1, 1.25], [x, .3, 1.5], "#aab7bc");
  const rig = { vehicle, wheels, forks, travel: asset.depth / 2 - 3.3 };
  animateLoft(rig, 0); return rig;
}

export function animateLoft(rig: LoftRig, seconds: number) {
  // Reversing avoids an unrealistic U-turn inside the narrow aisle.
  rig.vehicle.position.z = Math.sin(seconds * .38) * rig.travel;
  rig.wheels.forEach(wheel => { wheel.rotation.y = rig.vehicle.position.z / .31; });
  rig.forks.position.y = .15 + .3 * Math.pow(Math.sin(seconds * .38), 8);
}

export function buildQcLine(root: THREE.Group, asset: FactoryAsset) {
  const w = asset.width, d = asset.depth;
  box(root, [w, .45, d * .65], [0, .4, 0], "#485b64");
  for (let x = -w / 2 + .4; x < w / 2; x += .6) {
    const roller = cylinder(root, .12, d * .6, "#9caeb5", 0);
    roller.rotation.x = Math.PI / 2; roller.position.set(x, .72, 0);
  }
  // Repeated open lighting arches along the QC line, as in the supplied reference.
  for (let x = -w / 2 + .4; x <= w / 2; x += (w - .8) / 4) {
    for (const side of [-1, 1]) {
      box(root, [.18, 3.6, .18], [x, 1.8, side * d / 2], "#82969e");
      box(root, [.12, 2.9, .12], [x, 1.9, side * (d / 2 - .17)], "#e7fff5", true);
      const corner = box(root, [.18, 1.1, .18], [x, 3.95, side * (d / 2 - .37)], "#82969e"); corner.rotation.x = side * Math.PI / 4;
      const strip = box(root, [.12, .9, .12], [x, 3.94, side * (d / 2 - .48)], "#e7fff5", true); strip.rotation.x = side * Math.PI / 4;
    }
    box(root, [.18, .18, d - 1.45], [x, 4.3, 0], "#82969e");
    box(root, [.16, .08, d - 1.55], [x, 4.18, 0], "#f3fff8", true);
  }
}
