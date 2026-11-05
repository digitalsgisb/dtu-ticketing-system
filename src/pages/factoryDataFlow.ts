import * as THREE from "three";
import { sendayanNetworks } from "./factoryLayout";

export type DataFlow = { curve: THREE.QuadraticBezierCurve3; dots: THREE.Mesh[]; offset: number };

export function buildDataFlows(parent: THREE.Group): DataFlow[] {
  const flows: DataFlow[] = [];
  for (const network of sendayanNetworks) for (const [index, sensor] of network.sensors.entries()) {
    const start = new THREE.Vector3(sensor.x, (sensor.elevation ?? 0) + .7, sensor.z);
    const end = new THREE.Vector3(network.edge.x, (network.edge.elevation ?? 0) + .25, network.edge.z + .18);
    const arch = start.clone().lerp(end, .5); arch.y = 12 + index;
    const curve = new THREE.QuadraticBezierCurve3(start, arch, end);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .035, 5, false), new THREE.MeshBasicMaterial({ color: "#4eabb7", transparent: true, opacity: .4 })); parent.add(tube);
    const arrowAt = curve.getPoint(.9), direction = curve.getTangent(.9).normalize();
    parent.add(new THREE.ArrowHelper(direction, arrowAt, .9, "#008fa3", .4, .3));
    const dots = Array.from({ length: 4 }, () => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), new THREE.MeshBasicMaterial({ color: "#00a5bf" })); parent.add(dot); return dot;
    });
    flows.push({ curve, dots, offset: network.line * .2 + index * .13 });
  }
  animateDataFlows(flows, 0); return flows;
}

export function animateDataFlows(flows: DataFlow[], seconds: number) {
  flows.forEach(flow => flow.dots.forEach((dot, index) => {
    // Increasing t always travels from the sensor toward the Raspberry Pi.
    dot.position.copy(flow.curve.getPoint((seconds * .32 + flow.offset + index / flow.dots.length) % 1));
  }));
}
