import * as THREE from "three";
import type { FactoryAsset } from "./factoryLayout";

export type RobotRig = { yaw: THREE.Group; shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; phase: number; kind: "waterjet" | "glue" };

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

export function buildRobotStation(root: THREE.Group, asset: FactoryAsset): RobotRig {
  const abb = asset.kind === "waterjet";
  const body = abb ? "#ed782c" : "#c5cdd2", joints = abb ? "#424851" : "#69aeca";
  box(root, [asset.width * .9, .3, asset.depth * .85], [0, .3, 0], "#344552");
  const station = new THREE.Group(); root.add(station);
  // Waterjet 1 reaches inward from the north end, Waterjet 2 from the south.
  // Rotate the entire cell so animation stays relative to its own mould.
  if (abb) station.rotation.y = asset.id.endsWith("-2") ? Math.PI / 2 : -Math.PI / 2;
  box(station, [2.5, 1, asset.depth * .65], [1.4, .9, 0], abb ? "#547f8d" : "#778e86");
  box(station, [1.9, .18, asset.depth * .48], [1.4, 1.5, 0], "#adb9b5");
  if (abb) for (const z of [-asset.depth * .36, asset.depth * .36]) box(station, [3, .4, .15], [1.4, 1.7, z], "#88acb5");
  const yaw = new THREE.Group(); yaw.position.set(-asset.width * .28, .4, 0); station.add(yaw);
  yaw.scale.setScalar(abb ? .9 : .67);
  cylinder(yaw, .7, .35, "#3e4c59", .18); cylinder(yaw, .46, .8, body, .7);
  const shoulder = new THREE.Group(); shoulder.position.y = 1.15; yaw.add(shoulder); joint(shoulder, .48, joints);
  cylinder(shoulder, .27, 2.1, body, 1.05);
  const elbow = new THREE.Group(); elbow.position.y = 2.1; shoulder.add(elbow); joint(elbow, .4, joints);
  cylinder(elbow, .21, 1.9, body, .95);
  const wrist = new THREE.Group(); wrist.position.y = 1.9; elbow.add(wrist); joint(wrist, .3, joints);
  cylinder(wrist, .16, .55, body, .28);
  box(wrist, [.3, .28, .3], [0, .63, 0], "#25343c");
  cylinder(wrist, .055, abb ? .65 : .45, "#b9cbd2", .9);
  const rig: RobotRig = { yaw, shoulder, elbow, wrist, phase: (asset.line ?? 1) * .8 + (asset.id.endsWith("2") ? 1.8 : 0), kind: abb ? "waterjet" : "glue" };
  animateRobot(rig, 0); return rig;
}

export function animateRobot(rig: RobotRig, seconds: number) {
  const t = seconds * (rig.kind === "waterjet" ? 2.25 : 1.65) + rig.phase;
  rig.yaw.rotation.y = -.4 + Math.sin(t) * .3;
  rig.shoulder.rotation.z = -.7 + Math.sin(t * 1.2) * .15;
  rig.elbow.rotation.z = -1.35 + Math.cos(t * 1.2) * .24;
  rig.wrist.rotation.z = -1 + Math.sin(t * 1.5) * .2;
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
