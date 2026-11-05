export type PortKlangFloor = "ground" | "first" | "roof";
export type PortKlangAsset = {
  id: string; name: string; kind: "machine" | "storage" | "room" | "tank" | "parking" | "assembly" | "chemical" | "roof";
  x: number; z: number; width: number; depth: number;
};
type Rect = [number, number, number, number];
// Coordinates traced from the supplied A3 PDF rendered at 2200px wide.
// One shared scale preserves drawing proportions; these are not measured metres.
const origins: Record<PortKlangFloor, number> = { ground: 414, first: 798, roof: 1130 };
export function portKlangPoint(floor: PortKlangFloor, x: number, y: number) { return { x: (x - 912) / 12, z: (y - origins[floor]) / 12 }; }
function area(floor: PortKlangFloor, id: string, name: string, kind: PortKlangAsset["kind"], [left, top, right, bottom]: Rect): PortKlangAsset {
  return { id: `pk-${floor}-${id}`, name, kind, ...portKlangPoint(floor, (left + right) / 2, (top + bottom) / 2), width: (right - left) / 12, depth: (bottom - top) / 12 };
}
const ground = (id: string, name: string, kind: PortKlangAsset["kind"], rect: Rect) => area("ground", id, name, kind, rect);
const first = (id: string, name: string, kind: PortKlangAsset["kind"], rect: Rect) => area("first", id, name, kind, rect);
export const portKlangFloors: Record<PortKlangFloor, { label: string; assets: PortKlangAsset[]; routes: [number, number][][] }> = {
  ground: { label: "Ground floor", assets: [
    ground("security", "Security / main gate", "room", [99,290,144,323]),
    ground("carpark", "Car park", "parking", [99,327,158,508]),
    ground("assembly", "Emergency assembly point", "assembly", [100,517,157,563]),
    ground("motorbikes", "Motorbike parking", "parking", [153,576,266,596]),
    ground("office-north", "Office · main entrance", "room", [170,287,227,313]),
    ground("toilets-north", "Toilets · main entrance", "room", [228,289,276,313]),
    ground("pantry", "Pantry", "room", [169,315,204,383]),
    ground("meeting", "Meeting room", "room", [237,329,276,383]),
    ground("office-south", "Office · ground floor", "room", [206,442,275,500]),
    ground("punch-card", "Punch card area", "room", [206,514,274,547]),
    ground("finished-1", "Finished goods · store 1", "storage", [299,292,450,367]),
    ground("finished-2", "Finished goods · store 2", "storage", [296,376,450,430]),
    ground("finished-3", "Finished goods · store 3", "storage", [471,292,590,430]),
    ground("waterjet-assy", "Waterjet assembly line", "machine", [606,377,692,428]),
    ground("waterjet-2", "3D waterjet machine 2", "machine", [631,301,675,373]),
    ground("waterjet-3", "3D waterjet machine 3", "machine", [694,384,735,429]),
    ground("forming-7", "Continuous forming machine 7", "machine", [710,325,867,380]),
    ground("forming-6", "Continuous forming machine 6", "machine", [753,381,879,429]),
    ground("latex", "Latex coating machine", "machine", [884,296,1038,340]),
    ground("coating", "Coating machine · west", "machine", [892,345,930,428]),
    ground("coating-hdpe", "HDPE coating machine", "machine", [945,374,977,428]),
    ground("hot-roller", "Hot roller machine", "machine", [1104,294,1152,350]),
    ground("needle", "Needle punch machine", "machine", [1103,355,1152,426]),
    ground("raw-north-1", "Raw material storage · northwest", "storage", [1240,287,1364,397]),
    ground("raw-north-2", "Raw material storage · north centre", "storage", [1374,287,1445,394]),
    ground("raw-north-3", "Raw material storage · northeast", "storage", [1468,316,1594,386]),
    ground("raw-east", "Raw material storage · east", "storage", [1466,388,1512,517]),
    ground("raw-centre", "Raw material storage · centre", "storage", [1342,410,1448,508]),
    ground("luggage", "Luggage mat · ground floor", "machine", [1245,411,1328,535]),
    ground("qc", "QC laboratory", "room", [1321,518,1407,540]),
    ground("sprinkler-pump", "Sprinkler pump", "room", [1516,419,1593,448]),
    ground("sprinkler-tank", "Sprinkler tank", "tank", [1597,368,1621,460]),
    ground("maintenance", "Maintenance area", "storage", [1583,464,1615,541]),
    ground("mould-maker", "Mould maker area", "storage", [1600,248,1640,285]),
    ground("storage", "Storage · southwest", "storage", [298,447,343,530]),
    ground("mould-jig", "CF mould / jig rack storage", "storage", [345,447,473,530]),
    ground("new-mf", "New MF", "machine", [484,468,524,506]),
    ground("mini-forming", "Mini forming", "machine", [546,482,633,504]),
    ground("waterjet-1", "3D waterjet machine 1", "machine", [546,452,620,478]),
    ...([4,1,2,3] as const).map((number,index) => ground(`oven-${number}`, `Mini forming oven ${number}`, "machine", [483 + index * 39,508,518 + index * 39,530])),
    ground("waterjet-4", "3D waterjet machine 4", "machine", [714,477,745,535]),
    ground("forming-4", "Forming 4 & oven", "machine", [751,456,822,488]),
    ground("forming-5", "Forming 5 & oven", "machine", [751,498,827,533]),
    ground("tube", "Tube store / roll forming", "storage", [829,451,872,541]),
    ground("toilets-central", "Toilets · production", "room", [902,507,945,539]),
    ground("hose-room", "Hose reel pump room", "room", [949,507,980,540]),
    ground("dilo", "DILO machine", "machine", [986,481,1016,520]),
    ground("needle-2", "Needle punch line", "machine", [1021,458,1101,514]),
    ground("chemical-waste", "Scheduled waste area (CSWA)", "chemical", [1125,542,1176,559]),
    ground("chemical-storage", "Chemical storage area", "chemical", [1561,228,1598,248]),
  ], routes: [
    [[1657,263],[168,263]], [[1657,263],[1657,561]], [[1657,561],[168,561]],
    [[168,561],[168,521]], [[168,263],[168,288]],
    [[465,294],[465,263]], [[601,297],[601,263]], [[1370,295],[1370,263]],
    [[304,529],[304,561]], [[690,529],[690,561]], [[894,526],[894,561]],
    [[1066,522],[1066,561]], [[1280,531],[1280,561]], [[1581,522],[1581,561]],
    [[1657,329],[1617,329]], [[1617,518],[1657,518]]
  ] },
  first: { label: "First floor", assets: [
    first("office-north", "Office · first floor north", "room", [204,677,276,747]),
    first("office-south", "Office · first floor south", "room", [204,800,276,924]),
    first("roll-form", "Roll form storage", "storage", [823,674,871,760]),
    first("office-centre", "Office · first floor centre", "room", [913,887,980,923]),
    first("old-parts", "Old part storage", "storage", [1092,675,1299,785]),
    first("raw", "Raw material storage · first floor", "storage", [1239,789,1401,922]),
    first("luggage", "Luggage mat · first floor", "machine", [1094,789,1235,922]),
    first("training", "Training centre", "room", [1404,675,1494,871]),
    first("toilets", "Toilets · first floor", "room", [1404,873,1494,923]),
    first("maintenance", "Maintenance area · first floor", "storage", [1521,676,1577,808]),
    first("surau", "Surau", "room", [1578,676,1611,720]),
    first("mould", "Mould maker area · first floor", "storage", [1578,723,1611,808]),
    first("canteen", "Canteen", "room", [1521,811,1611,923]),
  ], routes: [ [[243,817],[274,817]], [[882,714],[882,682]], [[1216,717],[1216,680]], [[1203,872],[1203,916]], [[1490,714],[1490,679]], [[1490,871],[1490,917]], [[986,892],[986,917]] ] },
  roof: { label: "Rooftop / second floor", assets: [
    area("roof", "document", "Document storage", "storage", [206,1150,275,1224]),
    area("roof", "solar", "Solar panel access", "room", [207,1108,257,1149]),
    area("roof", "roof", "Rooftop · second floor", "roof", [278,1035,1608,1235]),
  ], routes: [ [[245,1095],[290,1095]] ] }
};
