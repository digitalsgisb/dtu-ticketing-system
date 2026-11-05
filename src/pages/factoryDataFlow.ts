import * as THREE from "three";
import { officeDataHub, sendayanAssets, sendayanNetworks } from "./factoryLayout";

export type DataFlow = { fromId: string; toId: string; curve: THREE.QuadraticBezierCurve3; dots: THREE.Mesh[]; offset: number };

export function buildDataFlows(parent: THREE.Group): DataFlow[] {
  const flows: DataFlow[] = [];
  const connect = (fromId: string, toId: string, start: THREE.Vector3, end: THREE.Vector3, colour: string, height: number, offset: number, count: number) => {
    const arch = start.clone().lerp(end, .5); arch.y = height;
    const curve = new THREE.QuadraticBezierCurve3(start, arch, end);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .035, 5, false), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .4 })); parent.add(tube);
    const arrowAt = curve.getPoint(.9), direction = curve.getTangent(.9).normalize();
    parent.add(new THREE.ArrowHelper(direction, arrowAt, .9, colour, .4, .3));
    const dots = Array.from({ length: count }, () => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(count > 4 ? .19 : .15, 10, 8), new THREE.MeshBasicMaterial({ color: colour })); parent.add(dot); return dot;
    });
    flows.push({ fromId, toId, curve, dots, offset });
  };
  for (const network of sendayanNetworks) {
    for (const [index, sensor] of network.sensors.entries()) {
      connect(sensor.id, network.edge.id,
        new THREE.Vector3(sensor.x, (sensor.elevation ?? 0) + .7, sensor.z),
        new THREE.Vector3(network.edge.x, (network.edge.elevation ?? 0) + .25, network.edge.z + .18),
        "#00a5bf", 12 + index, network.line * .2 + index * .13, 4);
    }
    connect(network.edge.id, officeDataHub.id,
      new THREE.Vector3(network.edge.x, (network.edge.elevation ?? 0) + .25, network.edge.z + .18),
      new THREE.Vector3(officeDataHub.x, (officeDataHub.elevation ?? 0) + .6, officeDataHub.z),
      "#7662c3", 22, network.line * .21, 6);
  }
  const attendance = sendayanAssets.find(asset => asset.id === "attendance")!;
  const attendanceStart = new THREE.Vector3(0, 2.2, .25).applyAxisAngle(new THREE.Vector3(0, 1, 0), attendance.rotationY ?? 0).add(new THREE.Vector3(attendance.x, attendance.elevation ?? 0, attendance.z));
  connect(attendance.id, officeDataHub.id, attendanceStart,
    new THREE.Vector3(officeDataHub.x, (officeDataHub.elevation ?? 0) + .6, officeDataHub.z),
    "#7662c3", 10, .4, 4);
  animateDataFlows(flows, 0); return flows;
}

export function animateDataFlows(flows: DataFlow[], seconds: number) {
  flows.forEach(flow => flow.dots.forEach((dot, index) => {
    // Increasing t travels from the named source toward the receiving node.
    dot.position.copy(flow.curve.getPoint((seconds * .32 + flow.offset + index / flow.dots.length) % 1));
  }));
}
