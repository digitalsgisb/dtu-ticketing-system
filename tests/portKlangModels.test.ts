import { expect, it } from "vitest";
import { Box3, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { portKlangFloors, portKlangServer } from "../src/pages/portKlangLayout";
import { animatePortKlangDataFlows, sizePortKlangDataPackets, buildPortKlangModel, portKlangModelDescriptions, portKlangModelType, type PortKlangDataFlow, type PortKlangNetworkNode } from "../src/pages/portKlangModels";
import { animateRobot, type RobotRig } from "../src/pages/factoryModels";

it("chooses recognisable models without mistaking stored forming materials for machines",()=>{
  const expected:Record<string,string>={"pk-ground-waterjet-1":"waterjet","pk-ground-waterjet-assy":"assembly-line","pk-ground-forming-4":"forming-oven","pk-ground-oven-4":"oven","pk-ground-latex":"coating","pk-ground-hot-roller":"hot-roller","pk-ground-dilo":"needle-punch","pk-ground-tube":"tube-rack","pk-ground-mould-jig":"mould-rack","pk-first-roll-form":"tube-rack","pk-first-canteen":"canteen","pk-ground-toilets-north":"toilets","pk-roof-solar":"solar"};
  for(const asset of Object.values(portKlangFloors).flatMap(floor=>floor.assets)) if(expected[asset.id])expect(portKlangModelType(asset)).toBe(expected[asset.id]);
});

it("keeps moving packets visible at overview and close-up zoom despite scaled station geometry",()=>{
  const root=new Group(),flows:PortKlangDataFlow[]=[];
  buildPortKlangModel(root,portKlangFloors.ground.assets.find(asset=>asset.id==="pk-ground-waterjet-1")!,flows);
  const camera=new PerspectiveCamera(43,1,.1,700),dot=flows[0].dots[0];
  for(const distance of [20,100]) {
    camera.position.set(0,10,distance);sizePortKlangDataPackets(flows,camera,600);
    const point=dot.getWorldPosition(new Vector3()),scale=dot.getWorldScale(new Vector3());
    const radius=.012*scale.x,perPixel=2*camera.position.distanceTo(point)*Math.tan(43*Math.PI/360)/600;
    expect(radius/perPixel).toBeCloseTo(2.8);expect(scale.x).toBeCloseTo(scale.y);expect(scale.y).toBeCloseTo(scale.z);
  }
  root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
});

it("gives each active waterjet its own sensor, Pi and TV, with world-space network anchors",()=>{
  const flows:PortKlangDataFlow[]=[],nodes:PortKlangNetworkNode[]=[];
  const stations=portKlangFloors.ground.assets.filter(asset=>portKlangModelType(asset)==="waterjet");
  for(const asset of stations) {
    const root=new Group();root.position.set(asset.x,0,asset.z);buildPortKlangModel(root,asset,flows,nodes);
    const parts:string[]=[];root.traverse(object=>{if(object.userData.partName)parts.push(object.userData.partName);});
    expect(parts.filter(name=>name==="Raspberry Pi board")).toHaveLength(1);
    expect(parts.filter(name=>name==="Dedicated waterjet TV")).toHaveLength(1);
    expect(parts.filter(name=>name==="Waterjet sensor / transmitter")).toHaveLength(1);
    const node=nodes.find(item=>item.assetId===asset.id)!;
    if(asset.id.endsWith("2"))expect(node.piPosition.z).toBeGreaterThan(asset.z+asset.depth*.3);
    else expect(node.piPosition.x).toBeGreaterThan(asset.x+asset.width*.3);
    root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
  }
  expect(nodes).toHaveLength(3);expect(flows).toHaveLength(3);
  const before=flows[0].dots[0].position.clone();animatePortKlangDataFlows(flows,.75);expect(flows[0].dots[0].position.equals(before)).toBe(false);
  expect(portKlangModelType(portKlangServer)).toBe("server");
  expect(portKlangServer.id).toBe("pk-first-ai-pc");
});

it("moves all six Port Klang arms while keeping their full motion inside their stations",()=>{
  for(const asset of portKlangFloors.ground.assets.filter(item=>portKlangModelType(item)==="waterjet")) {
    const root=new Group(),robots:RobotRig[]=[];buildPortKlangModel(root,asset,[],[],robots);expect(robots).toHaveLength(2);
    const before=robots[0].shoulder.rotation.z;robots.forEach(robot=>animateRobot(robot,.6));expect(robots[0].shoulder.rotation.z).not.toBe(before);
    for(let step=0;step<80;step++) {
      robots.forEach(robot=>animateRobot(robot,step*.37));const bounds=new Box3().setFromObject(root);
      expect(bounds.min.x,asset.name).toBeGreaterThanOrEqual(-asset.width/2-.01);expect(bounds.max.x,asset.name).toBeLessThanOrEqual(asset.width/2+.01);
      expect(bounds.min.z,asset.name).toBeGreaterThanOrEqual(-asset.depth/2-.01);expect(bounds.max.z,asset.name).toBeLessThanOrEqual(asset.depth/2+.01);
    }
    root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
  }
});

it("keeps every detailed model inside its traced footprint so it cannot extend across adjacent routes",()=>{
  for(const asset of Object.values(portKlangFloors).flatMap(floor=>floor.assets)) {
    const root=new Group();buildPortKlangModel(root,asset);
    const bounds=new Box3().setFromObject(root);
    expect(bounds.min.x,asset.name).toBeGreaterThanOrEqual(-asset.width/2-.01);
    expect(bounds.max.x,asset.name).toBeLessThanOrEqual(asset.width/2+.01);
    expect(bounds.min.z,asset.name).toBeGreaterThanOrEqual(-asset.depth/2-.01);
    expect(bounds.max.z,asset.name).toBeLessThanOrEqual(asset.depth/2+.01);
    expect(Number.isFinite(bounds.max.y),asset.name).toBe(true);
    expect(portKlangModelDescriptions[portKlangModelType(asset)]).toBeTruthy();
    root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
  }
});

it("removes retired Waterjet 3 and gives each remaining cutting station two same-side ABB arms",()=>{
  const assets=portKlangFloors.ground.assets;
  expect(assets.some(asset=>asset.id==="pk-ground-waterjet-3")).toBe(false);
  const stations=assets.filter(asset=>portKlangModelType(asset)==="waterjet");
  expect(stations.map(asset=>asset.id)).toEqual(["pk-ground-waterjet-2","pk-ground-waterjet-1","pk-ground-waterjet-4"]);
  for(const asset of stations) {
    const root=new Group();buildPortKlangModel(root,asset);const mounts:Group[]=[];
    root.traverse(object=>{if(object instanceof Group&&String(object.userData.partName).includes("ABB arm"))mounts.push(object);});
    expect(mounts).toHaveLength(2);
    expect(mounts[0].position.x).toBe(mounts[1].position.x);
    expect(mounts[0].position.z).not.toBe(mounts[1].position.z);
    root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
  }
});
