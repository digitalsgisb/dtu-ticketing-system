export type FactoryAsset = {
  id: string; name: string; kind: "forming" | "rolls" | "waterjet" | "glue" | "qc" | "pump" | "rack" | "area" | "room" | "tank";
  x: number; z: number; width: number; depth: number; note?: string; line?: 1 | 2;
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
  { id: "office-west", name: "Office · west", kind: "room", x: 18, z: 22, width: 3, depth: 9 },
  { id: "meeting", name: "Meeting room", kind: "room", x: 23, z: 20, width: 6, depth: 7 },
  { id: "office-east", name: "Office · east", kind: "room", x: 36, z: 24, width: 7, depth: 6 },
  { id: "toilets", name: "Toilets", kind: "room", x: 29, z: 26, width: 5, depth: 3 },
  { id: "carpark", name: "Car park", kind: "area", x: 43, z: 7, width: 3, depth: 12 },
  { id: "guard", name: "Guard house", kind: "room", x: 50, z: 1, width: 4, depth: 4 },
  { id: "tnb", name: "TNB", kind: "room", x: 49, z: 29, width: 8, depth: 12 },
  { id: "empty-top", name: "Empty rack · north edge", kind: "rack", x: 31, z: -33, width: 34, depth: 3 },
  { id: "empty-bottom", name: "Empty rack · south edge", kind: "rack", x: 30, z: 35, width: 30, depth: 3 },
  { id: "empty-east", name: "Empty rack · east edge", kind: "rack", x: 49, z: 14, width: 6, depth: 11 },
  { id: "mould-west-upper", name: "Mould storage · west upper", kind: "rack", x: -48, z: -23, width: 3, depth: 17 },
  { id: "mould-west-lower", name: "Mould storage · west lower", kind: "rack", x: -48, z: 26, width: 3, depth: 17 },
  { id: "mould-south", name: "Mould storage · south", kind: "rack", x: -17, z: 29, width: 17, depth: 2 },
  { id: "pump-waterjet", name: "Pump W/Jet", kind: "pump", x: -4, z: -28, width: 7, depth: 2, note: "Waterjet pump, separate from the ABB robot stations." },
];

export const assetColors: Record<FactoryAsset["kind"], string> = {
  forming: "#e4ad39", rolls: "#ac5652", waterjet: "#f08a38", glue: "#75b9d4", qc: "#e4efd6", pump: "#4bbbc5", rack: "#8297b4",
  area: "#538b82", room: "#a293bf", tank: "#55a8d3"
};

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
