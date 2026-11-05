export type FactoryAsset = {
  id: string; name: string; kind: "forming" | "waterjet" | "glue" | "rack" | "area" | "room" | "tank";
  x: number; z: number; width: number; depth: number; note?: string;
};

// Approximate plan coordinates, not metres. Top of the supplied fire plan is negative Z.
export const sendayanAssets: FactoryAsset[] = [
  { id: "asano-upper", name: "Asano · upper", kind: "forming", x: -20, z: -16, width: 16, depth: 12 },
  { id: "asano-lower", name: "Asano · lower", kind: "forming", x: -20, z: 16, width: 16, depth: 10 },
  ...[-19, -11, 13, 21].map((z, i): FactoryAsset => ({ id: `auto-glue-${i + 1}`, name: `Auto glue ${i + 1}`, kind: "glue", x: -2, z, width: 4, depth: 3, note: "Position interpreted from the fire plan; equipment count to be confirmed." })),
  { id: "loft", name: "Loft layer area", kind: "rack", x: -38, z: -13, width: 6, depth: 23 },
  { id: "child-upper", name: "Child part transition · upper", kind: "area", x: 4, z: -4, width: 12, depth: 5 },
  { id: "child-centre", name: "Child part transition · centre", kind: "area", x: -11, z: 7, width: 17, depth: 9 },
  { id: "spare-tire", name: "Spare tire", kind: "rack", x: 2, z: 7, width: 4, depth: 9 },
  { id: "board-deck", name: "Board assy deck", kind: "rack", x: 7, z: 7, width: 5, depth: 9 },
  { id: "storage-upper", name: "Storage racks · upper", kind: "rack", x: 25, z: -15, width: 18, depth: 19 },
  { id: "storage-lower", name: "Storage racks · lower", kind: "rack", x: 25, z: 8, width: 18, depth: 11 },
  { id: "maintenance-office", name: "Maintenance office", kind: "room", x: -38, z: 3, width: 6, depth: 4 },
  { id: "maintenance-store", name: "Maintenance store", kind: "room", x: -37, z: 14, width: 8, depth: 5 },
  { id: "pump-room", name: "Pump room", kind: "room", x: -36, z: 20, width: 6, depth: 4 },
  { id: "fire-tank", name: "Tangki bomba", kind: "tank", x: -38, z: 26, width: 8, depth: 5 },
  { id: "office-west", name: "Office · west", kind: "room", x: 18, z: 22, width: 3, depth: 9 },
  { id: "meeting", name: "Meeting room", kind: "room", x: 23, z: 20, width: 6, depth: 7 },
  { id: "office-east", name: "Office · east", kind: "room", x: 36, z: 24, width: 7, depth: 6 },
  { id: "toilets", name: "Toilets", kind: "room", x: 29, z: 26, width: 5, depth: 3 },
  { id: "carpark", name: "Car park", kind: "area", x: 41, z: 7, width: 4, depth: 12 },
  { id: "guard", name: "Guard house", kind: "room", x: 50, z: 1, width: 4, depth: 4 },
  { id: "tnb", name: "TNB", kind: "room", x: 49, z: 29, width: 8, depth: 12 },
  { id: "empty-top", name: "Empty rack · north edge", kind: "rack", x: 31, z: -33, width: 34, depth: 3 },
  { id: "empty-bottom", name: "Empty rack · south edge", kind: "rack", x: 30, z: 35, width: 30, depth: 3 },
  { id: "empty-east", name: "Empty rack · east edge", kind: "rack", x: 49, z: 14, width: 6, depth: 11 },
  { id: "mould-west-upper", name: "Mould storage · west upper", kind: "rack", x: -48, z: -23, width: 3, depth: 17 },
  { id: "mould-west-lower", name: "Mould storage · west lower", kind: "rack", x: -48, z: 26, width: 3, depth: 17 },
  { id: "mould-south", name: "Mould storage · south", kind: "rack", x: -17, z: 29, width: 17, depth: 2 },
  { id: "pump-waterjet", name: "Pump W/Jet", kind: "waterjet", x: -4, z: -28, width: 7, depth: 2, note: "Fire plan label: Pump W/Jet. Waterjet machine positions still need confirmation." },
];

export const assetColors: Record<FactoryAsset["kind"], string> = {
  forming: "#e4ad39", waterjet: "#4bbbc5", glue: "#68bba1", rack: "#8297b4",
  area: "#538b82", room: "#a293bf", tank: "#55a8d3"
};
