export type FactoryAsset = {
  id: string; name: string; kind: "forming" | "rolls" | "waterjet" | "glue" | "qc" | "pump" | "rack" | "area" | "room" | "tank" | "sensor" | "edge" | "attendance" | "entrance" | "seating" | "charger";
  x: number; z: number; width: number; depth: number; note?: string; line?: 1 | 2; system?: boolean; elevation?: number;
};

// Shared equipment sizes, with the Asano mould-change platform mirrored on Line 2.
export function productionLine(line: 1 | 2, z: number): FactoryAsset[] {
  const prefix = `Line ${line}`;
  return [
    { id: line === 1 ? "asano-lower" : "asano-upper", name: `${prefix} · Asano`, kind: "forming", x: -23, z, width: 16, depth: 16, line, note: `Car-floor-carpet forming line: loft layer and roll material feed in from the left, pass through the heating and forming sections, and leave as shaped floor carpet on the right. Includes a mould-change platform. Layout is an illustrative interpretation of your references. Line ${line} is the ${line === 1 ? "lower" : "upper"} Asano.` },
    ...[-4.5, 4.5].map((offset, i): FactoryAsset => ({ id: `line-${line}-waterjet-${i + 1}`, name: `${prefix} · Waterjet ${i + 1} · ABB`, kind: "waterjet", x: -9, z: z + offset, width: 8, depth: 7, line, note: "Waterjet mould with two animated ABB arms side by side on the same side, facing the mould together. Each production line has two waterjet sections and four ABB arms. Robot shapes and motion are illustrative." })),
    ...[-6.5, 6.5].map((offset, i): FactoryAsset => ({ id: `line-${line}-glue-${i + 1}`, name: `${prefix} · Auto glue ${i + 1} · UR`, kind: "glue", x: 1, z: z + offset, width: 7, depth: 4, line, note: "Universal Robots auto-glue station. Robot shape and motion are illustrative." })),
    { id: `line-${line}-qc`, name: `${prefix} · QC line`, kind: "qc", x: 3, z, width: 11, depth: 6, line, note: "QC inspection line with repeated overhead and side lighting frames, based on your lighting reference." },
  ];
}

// Approximate plan coordinates, not metres. Top of the supplied fire plan is negative Z.
export const sendayanAssets: FactoryAsset[] = [
  ...productionLine(1, 20),
  ...productionLine(2, -19.2),
  { id: "loft", name: "Loft layer area", kind: "rack", x: -38, z: -13, width: 6, depth: 23, note: "Tall storage racks, approximately two storeys high, with a central forklift aisle. The forklift travels forward and reverses within the aisle. Height and motion are illustrative, not measured or live." },
  { id: "rolls-upper", name: "Material rolls · upper staging", kind: "rolls", x: -24, z: -6, width: 10, depth: 4, note: "Upright material rolls grouped beside the upper Asano, based on the red circles in the fire plan." },
  { id: "rolls-west", name: "Material rolls · beside maintenance", kind: "rolls", x: -33, z: 4, width: 2.5, depth: 5, note: "Material rolls staged beside the maintenance office." },
  { id: "rolls-centre", name: "Material rolls · central staging", kind: "rolls", x: -26, z: 6.5, width: 12, depth: 3, note: "Grouped material rolls staged alongside the child-part transition area." },
  { id: "child-upper", name: "Child part transition · upper", kind: "area", x: 4, z: -6, width: 12, depth: 4 },
  { id: "child-centre", name: "Child part transition · centre", kind: "area", x: -15, z: 2.2, width: 17, depth: 5 },
  { id: "spare-tire", name: "Spare tire", kind: "rack", x: 2, z: 2.2, width: 4, depth: 5 },
  { id: "board-deck", name: "Board assy deck", kind: "rack", x: 7, z: 2.2, width: 5, depth: 5 },
  { id: "storage-upper", name: "Storage racks · upper", kind: "rack", x: 25, z: -15, width: 18, depth: 19 },
  { id: "storage-lower", name: "Storage racks · lower", kind: "rack", x: 25, z: 5.5, width: 18, depth: 11 },
  { id: "maintenance-office", name: "Maintenance office", kind: "room", x: -38, z: 3, width: 6, depth: 4 },
  { id: "maintenance-store", name: "Maintenance store", kind: "room", x: -37, z: 14, width: 8, depth: 5 },
  { id: "pump-room", name: "Pump room", kind: "room", x: -36, z: 20, width: 6, depth: 4 },
  { id: "fire-tank", name: "Tangki bomba", kind: "tank", x: -38, z: 26, width: 8, depth: 5 },
  { id: "office-west", name: "Office · west", kind: "room", ...firePlanRectangle([678, 532, 695, 600]) },
  { id: "meeting", name: "Meeting room", kind: "room", ...firePlanRectangle([696, 532, 745, 586]) },
  { id: "seating", name: "Tables & chairs · in front of meeting room", kind: "seating", ...firePlanRectangle([752, 532, 809, 585]), note: "Tables and chairs in front of the meeting room, as shown on the main fire plan." },
  { id: "office-east", name: "Office", kind: "room", ...firePlanRectangle([835, 555, 889, 620]), note: "L-shaped office footprint following the main fire plan." },
  { id: "toilets", name: "Toilets", kind: "room", ...firePlanRectangle([752, 555, 833, 620]), note: "L-shaped toilet block: long lower leg and narrow upright beside the office, following the main fire plan." },
  { id: "msb", name: "MSB", kind: "room", ...firePlanRectangle([840, 554, 862, 584]), note: "MSB in the office corner, positioned from the main fire plan." },
  { id: "carpark", name: "Car park", kind: "area", ...firePlanRectangle([890, 435, 920, 532]) },
  { id: "entrance-north", name: "Entrance · car park upper end", kind: "entrance", x: 43, z: .5, width: 2.8, depth: .4, note: "Entrance at the upper end of the car-park strip in your sketch." },
  { id: "entrance-office", name: "Entrance · office side", kind: "entrance", x: 43, z: 14, width: 2.8, depth: .4, note: "Office-side entrance beside the Smart Attendance point." },
  { id: "attendance", name: "Smart Attendance system", kind: "attendance", x: 41.5, z: 15.2, width: .8, depth: .6, system: true, note: "Smart Attendance terminal near the office-side entrance. Location follows your sketch; no live attendance data is connected." },
  { id: "guard", name: "Guard house", kind: "room", ...firePlanRectangle([1008, 414, 1035, 453]) },
  { id: "tnb", name: "TNB", kind: "room", ...firePlanRectangle([957, 593, 1035, 691]) },
  { id: "ev-bay", name: "EV parking bay", kind: "area", ...firePlanRectangle([979, 563, 1034, 590]), note: "EV parking bay between the empty rack and TNB, beside the road." },
  { id: "ev-charger", name: "EV charger", kind: "charger", x: 56.6, z: 19.15, width: .8, depth: .8, system: true, note: "EV charger beside the EV parking bay shown on the main fire plan. Display marker only; charging status is not connected." },
  { id: "empty-top", name: "Empty rack · north edge", kind: "rack", x: 31, z: -33, width: 34, depth: 3 },
  { id: "empty-bottom", name: "Empty rack · south edge", kind: "rack", x: 30, z: 35, width: 30, depth: 3 },
  { id: "empty-east", name: "Empty rack · east edge", kind: "rack", ...firePlanRectangle([979, 467, 1034, 561]) },
  { id: "mould-west-upper", name: "Mould storage · west upper", kind: "rack", x: -48, z: -23, width: 3, depth: 17 },
  { id: "mould-west-lower", name: "Mould storage · west lower", kind: "rack", x: -48, z: 26, width: 3, depth: 17 },
  { id: "mould-south", name: "Mould storage · south", kind: "rack", x: -17, z: 29, width: 17, depth: 2 },
  { id: "pump-waterjet", name: "Pump W/Jet", kind: "pump", x: -4, z: -28, width: 7, depth: 2, note: "Waterjet pump, separate from the ABB robot stations." },
];

export const assetColors: Record<FactoryAsset["kind"], string> = {
  forming: "#e4ad39", rolls: "#ac5652", waterjet: "#f08a38", glue: "#75b9d4", qc: "#e4efd6", pump: "#4bbbc5", rack: "#8297b4",
  area: "#538b82", room: "#a293bf", tank: "#55a8d3", sensor: "#00a5bf", edge: "#14a67a", attendance: "#7662c3", entrance: "#97a69f", seating: "#c4cec8", charger: "#21a086"
};

// Three sensors feed the Raspberry Pi inside each line's Asano control panel.
export const sendayanNetworks = ([1, 2] as const).map(line => {
  const forming = sendayanAssets.find(asset => asset.kind === "forming" && asset.line === line)!;
  const panelX = forming.x + (line === 2 ? -1 : 2.9);
  const edge: FactoryAsset = { id: `line-${line}-edge`, name: `Line ${line} · Raspberry Pi · control panel`, kind: "edge", x: panelX, z: forming.z - 3.47, elevation: 1.35, width: 1.2, depth: .3, line, system: true, note: "Raspberry Pi edge device inside the Asano control panel, shown as a cutaway board. Receives the two waterjet sensors and the forming-trolley sensor. Animated dots illustrate data direction; they are not live readings." };
  const sensors: FactoryAsset[] = [1, 2].map(number => {
    const station = sendayanAssets.find(asset => asset.id === `line-${line}-waterjet-${number}`)!;
    return { id: `line-${line}-sensor-waterjet-${number}`, name: `Line ${line} · Waterjet ${number} sensor`, kind: "sensor", x: station.x, z: station.z, elevation: 1.75, width: .55, depth: .55, line, system: true, note: `Sensor/transmitter on Waterjet ${number}, sending to the Raspberry Pi inside this line's control panel. Illustrative data flow.` };
  });
  sensors.push({ id: `line-${line}-sensor-forming`, name: `Line ${line} · Forming trolley sensor`, kind: "sensor", x: forming.x + 2.9, z: forming.z + 2.55, elevation: 1.2, width: .55, depth: .55, line, system: true, note: "Forming-trolley sensor sending to the Raspberry Pi inside this line's control panel. Illustrative data flow." });
  return { line, edge, sensors };
});
export const sendayanSystemAssets = [...sendayanAssets, ...sendayanNetworks.flatMap(network => [network.edge, ...network.sensors])];
export function isSystemAsset(asset: FactoryAsset) { return !!asset.system || asset.kind === "forming" || asset.kind === "waterjet"; }

// Manually traced filled-green lane boundaries in the supplied 1080 × 810 fire-plan
// photograph. Outside arrows are separate symbols, not a continuous painted lane.
// Photo coordinates are registered to the existing schematic scene, not metres.
export const firePlanWalkwayBounds = [
  [230, 248, 255, 431], // Wide loft-side aisle.
  [230, 406, 659, 431], // Wide main cross-aisle.
  [634, 248, 659, 622], // Wide north–south spine.
  [254, 346, 365, 356], // Narrow upper-Asano branch and its stepped bend.
  [355, 346, 365, 374],
  [355, 364, 432, 374],
  [422, 355, 432, 374],
  [422, 355, 646, 365],
  [211, 509, 646, 519], // Narrow lower cross-aisle.
  [658, 518, 889, 531], // Lower storage edge and car-park connection.
  [879, 435, 889, 531],
] as const;

function firePlanRectangle([left, top, right, bottom]: readonly number[]) {
  const scaleX = 46.25 / 404, scaleZ = 50 / 372;
  return { x: 13 + ((left + right) / 2 - 646) * scaleX, z: -25 + ((top + bottom) / 2 - 248) * scaleZ, width: (right - left) * scaleX, depth: (bottom - top) * scaleZ };
}

export const sendayanWalkways = firePlanWalkwayBounds.map(firePlanRectangle);
export const sendayanCrossings = [[634, 354, 659, 365], [634, 509, 659, 520]].map(firePlanRectangle);
// Correct the old schematic's stretched depth when rendering the registered plan.
// After this correction, one photo pixel has the same world length on both axes.
export const firePlanDepthScale = (46.25 / 404) / (50 / 372);
// Road, distinct from the filled green pedestrian lanes.
export const sendayanRoads = [[921, 200, 977, 593], [921, 593, 955, 622], [841, 399, 1008, 434], [105, 622, 955, 669]].map(firePlanRectangle);
