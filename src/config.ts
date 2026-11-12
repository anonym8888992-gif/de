/** City tile size in world pixels. The world is drawn at ~10px per metre. */
export const TILE = 32;
/** Interior grid size in pixels. */
export const ITILE = 16;
export const BLOCK = 12; // 2 road tiles + 10 block tiles
/** game minutes per real second at 1x: a day takes 12 min at >, 3 min at >>> */
export const GAME_MIN_PER_SEC = 2;
export const DAY = 1440;

// ---------------------------------------------------------------------------
// Palette (80s Miami / neon)

export const INK = 0x140a1e;
export const NEON = {
  pink: 0xff2a8a,
  cyan: 0x2de2e6,
  yellow: 0xffe14d,
  orange: 0xff8a1f,
  green: 0x7dff6a,
  purple: 0xa45cff,
  red: 0xff3b3b,
  white: 0xfff4fa,
};

// ---------------------------------------------------------------------------
// Items: supplies you buy, intermediates you make, products you sell.
// Production steps are deliberately game-abstract (no real chemistry).

export type ProductId = 'weed' | 'moonshine' | 'mdma' | 'meth' | 'lsd' | 'cocaine' | 'heroin';
export const PRODUCT_IDS: ProductId[] = ['weed', 'moonshine', 'mdma', 'meth', 'lsd', 'cocaine', 'heroin'];

export type SupplyId = 'seeds' | 'soil' | 'mashkit' | 'chems' | 'binder' | 'culture' | 'paper' | 'cocaleaf' | 'opium';
export const SUPPLY_IDS: SupplyId[] = ['seeds', 'soil', 'mashkit', 'chems', 'binder', 'culture', 'paper', 'cocaleaf', 'opium'];

export type MidId = 'wetbud' | 'drybud' | 'wash' | 'rawmeth' | 'mdmabase' | 'lsdliquid' | 'cocapaste' | 'opiumbase';
export const MID_IDS: MidId[] = ['wetbud', 'drybud', 'wash', 'rawmeth', 'mdmabase', 'lsdliquid', 'cocapaste', 'opiumbase'];

export type ItemId = ProductId | SupplyId | MidId;
export const ITEM_IDS: ItemId[] = [...SUPPLY_IDS, ...MID_IDS, ...PRODUCT_IDS];

export interface ItemDef {
  name: string;
  short: string;
  css: string;
  desc: string;
  /** supplies: Sal's price, step = order increment */
  price?: number;
  step?: number;
  /** supplies: import price through the Marina */
  marina?: number;
  /** products: street price and heat per sale */
  sell?: number;
  heat?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  seeds: { name: 'Seeds', short: 'SD', css: '#b8e070', desc: 'Strain: "Biscayne Haze".', price: 12, step: 5 },
  soil: { name: 'Soil Bag', short: 'SO', css: '#a07040', desc: 'Premium potting mix.', price: 6, step: 5 },
  mashkit: { name: 'Mash Kit', short: 'MK', css: '#f0d070', desc: 'Corn, sugar and yeast. Smells like a farm.', price: 30, step: 2 },
  chems: { name: 'Lab Chemicals', short: 'CH', css: '#9ff0ff', desc: 'An unlabeled drum from a guy at the port.', price: 70, step: 1 },
  binder: { name: 'Pill Binder', short: 'BI', css: '#ffffff', desc: 'Filler and dye. Comes in pink.', price: 8, step: 5 },
  culture: { name: 'Fungus Culture', short: 'FC', css: '#c8a0ff', desc: 'Grown by a very quiet biology student.', price: 140, step: 1 },
  paper: { name: 'Blotter Paper', short: 'BP', css: '#ffe0f0', desc: 'Sheets with a cartoon sun printed on.', price: 6, step: 5 },
  cocaleaf: { name: 'Coca Leaves', short: 'CL', css: '#58c858', desc: 'Bales of leaves, "imported".', price: 30, step: 10, marina: 9 },
  opium: { name: 'Raw Opium', short: 'RO', css: '#8a5a3a', desc: 'Sticky brown gum, wrapped in plastic.', price: 55, step: 4, marina: 16 },

  wetbud: { name: 'Wet Bud', short: 'WB', css: '#48c050', desc: 'Freshly cut. Needs drying.' },
  drybud: { name: 'Dry Bud', short: 'DB', css: '#90b048', desc: 'Dried. Needs trimming and bagging.' },
  wash: { name: 'Mash Wash', short: 'WA', css: '#e0c060', desc: 'Fermented mash, ready for the still.' },
  rawmeth: { name: 'Raw Batch', short: 'RB', css: '#b0e8ff', desc: 'Cloudy cook. Needs to crystallise.' },
  mdmabase: { name: 'MDMA Powder', short: 'MP', css: '#ffd0e8', desc: 'Needs pressing into pills.' },
  lsdliquid: { name: 'LSD Solution', short: 'LS', css: '#e0c0ff', desc: 'A few drops go a long way.' },
  cocapaste: { name: 'Coca Paste', short: 'CP', css: '#d8e0a0', desc: 'Greyish paste. Needs refining.' },
  opiumbase: { name: 'Opium Base', short: 'OB', css: '#c09060', desc: 'Boiled down. Needs refining.' },

  weed: { name: 'Weed', short: 'WE', css: '#7dff6a', desc: 'Bagged eighths.', sell: 35, heat: 0.08 },
  moonshine: { name: 'Moonshine', short: 'MS', css: '#ffe8a0', desc: '160 proof. Strips paint.', sell: 28, heat: 0.06 },
  mdma: { name: 'MDMA', short: 'XT', css: '#ff6fd0', desc: 'Pink pills with a dolphin stamp.', sell: 55, heat: 0.18 },
  meth: { name: 'Meth', short: 'ME', css: '#7fd8ff', desc: 'Blue-tinted crystal.', sell: 85, heat: 0.4 },
  lsd: { name: 'LSD', short: 'LD', css: '#c88cff', desc: 'Blotter tabs.', sell: 45, heat: 0.12 },
  cocaine: { name: 'Cocaine', short: 'CO', css: '#f4f4ff', desc: 'Pressed bricks, cut into grams.', sell: 150, heat: 0.5 },
  heroin: { name: 'Heroin', short: 'HE', css: '#d8a070', desc: 'Brown powder. The worst of it.', sell: 130, heat: 0.6 },
};

// ---------------------------------------------------------------------------
// Production stations (sizes in interior tiles)

export type StationId = 'tent' | 'rack' | 'trim' | 'barrel' | 'still' | 'reactor' | 'trays' | 'press' | 'blotter' | 'pit' | 'boiler' | 'refinery';

export interface Recipe {
  name: string;
  in: Partial<Record<ItemId, number>>;
  out: Partial<Record<ItemId, number>>;
  /** game minutes per batch */
  time: number;
  /** heat added when a batch starts */
  heat: number;
}

export interface StationDef {
  name: string;
  desc: string;
  cost: number;
  w: number;
  h: number;
  /** steam/smoke while running */
  fumes: boolean;
  recipes: Recipe[];
}

export const STATIONS: Record<StationId, StationDef> = {
  tent: { name: 'Grow Tent', desc: 'Grows weed under hot lamps.', cost: 600, w: 2, h: 2, fumes: false,
    recipes: [{ name: 'Grow', in: { seeds: 1, soil: 1 }, out: { wetbud: 8 }, time: 360, heat: 0.2 }] },
  rack: { name: 'Drying Rack', desc: 'Hangs wet bud to dry.', cost: 300, w: 2, h: 1, fumes: false,
    recipes: [{ name: 'Dry', in: { wetbud: 8 }, out: { drybud: 8 }, time: 180, heat: 0 }] },
  trim: { name: 'Trim Table', desc: 'Trim, weigh and bag.', cost: 250, w: 2, h: 1, fumes: false,
    recipes: [{ name: 'Trim & bag', in: { drybud: 4 }, out: { weed: 4 }, time: 45, heat: 0 }] },
  barrel: { name: 'Mash Barrel', desc: 'Ferments mash into wash.', cost: 400, w: 1, h: 1, fumes: false,
    recipes: [{ name: 'Ferment', in: { mashkit: 1 }, out: { wash: 6 }, time: 480, heat: 0.1 }] },
  still: { name: 'Copper Still', desc: 'Distils wash into moonshine.', cost: 1500, w: 2, h: 2, fumes: true,
    recipes: [{ name: 'Distil', in: { wash: 2 }, out: { moonshine: 3 }, time: 90, heat: 0.3 }] },
  reactor: { name: 'Lab Bench', desc: 'The heart of a lab. Cooks meth, MDMA or LSD.', cost: 7500, w: 3, h: 2, fumes: true,
    recipes: [
      { name: 'Cook meth', in: { chems: 1 }, out: { rawmeth: 6 }, time: 240, heat: 2.5 },
      { name: 'Make MDMA', in: { chems: 1 }, out: { mdmabase: 6 }, time: 240, heat: 1.5 },
      { name: 'Make LSD', in: { chems: 1, culture: 1 }, out: { lsdliquid: 4 }, time: 300, heat: 1 },
    ] },
  trays: { name: 'Cooling Trays', desc: 'Lets a raw batch crystallise.', cost: 1200, w: 2, h: 1, fumes: false,
    recipes: [{ name: 'Crystallise', in: { rawmeth: 6 }, out: { meth: 6 }, time: 120, heat: 0 }] },
  press: { name: 'Pill Press', desc: 'Presses powder into pills.', cost: 2200, w: 1, h: 1, fumes: false,
    recipes: [{ name: 'Press pills', in: { mdmabase: 2, binder: 1 }, out: { mdma: 8 }, time: 60, heat: 0 }] },
  blotter: { name: 'Blotter Bench', desc: 'Doses paper sheets and cuts tabs.', cost: 1600, w: 2, h: 1, fumes: false,
    recipes: [{ name: 'Dose sheets', in: { lsdliquid: 1, paper: 1 }, out: { lsd: 10 }, time: 60, heat: 0 }] },
  pit: { name: 'Leaf Pit', desc: 'Soaks and mashes coca leaves into paste.', cost: 3000, w: 2, h: 2, fumes: true,
    recipes: [{ name: 'Make paste', in: { cocaleaf: 10 }, out: { cocapaste: 4 }, time: 300, heat: 1 }] },
  boiler: { name: 'Boil Pot', desc: 'Boils raw opium down to base.', cost: 2500, w: 1, h: 1, fumes: true,
    recipes: [{ name: 'Boil down', in: { opium: 4 }, out: { opiumbase: 4 }, time: 180, heat: 1 }] },
  refinery: { name: 'Refinery', desc: 'Final step for cocaine and heroin.', cost: 12000, w: 3, h: 2, fumes: true,
    recipes: [
      { name: 'Refine cocaine', in: { cocapaste: 2 }, out: { cocaine: 2 }, time: 120, heat: 2 },
      { name: 'Refine heroin', in: { opiumbase: 2 }, out: { heroin: 2 }, time: 120, heat: 2.5 },
    ] },
};

export const STATION_IDS: StationId[] = ['tent', 'rack', 'trim', 'barrel', 'still', 'reactor', 'trays', 'press', 'blotter', 'pit', 'boiler', 'refinery'];

/** Production chains for the cookbook and build bar grouping. */
export const CHAINS: { product: ProductId; steps: StationId[]; supplies: SupplyId[] }[] = [
  { product: 'weed', steps: ['tent', 'rack', 'trim'], supplies: ['seeds', 'soil'] },
  { product: 'moonshine', steps: ['barrel', 'still'], supplies: ['mashkit'] },
  { product: 'meth', steps: ['reactor', 'trays'], supplies: ['chems'] },
  { product: 'mdma', steps: ['reactor', 'press'], supplies: ['chems', 'binder'] },
  { product: 'lsd', steps: ['reactor', 'blotter'], supplies: ['chems', 'culture', 'paper'] },
  { product: 'cocaine', steps: ['pit', 'refinery'], supplies: ['cocaleaf'] },
  { product: 'heroin', steps: ['boiler', 'refinery'], supplies: ['opium'] },
];

// ---------------------------------------------------------------------------
// City

export interface DistrictDef {
  id: number;
  name: string;
  demand: Record<ProductId, number>;
  price: number;
  police: number;
  blurb: string;
}

export const DISTRICTS: DistrictDef[] = [
  { id: 0, name: 'Little Havana', demand: { weed: 1.2, moonshine: 1.3, mdma: 0.8, meth: 0.7, lsd: 0.6, cocaine: 1.0, heroin: 1.0 }, price: 0.9, police: 0.9, blurb: 'Cafecito, dominoes and very long memories.' },
  { id: 1, name: 'Downtown', demand: { weed: 0.7, moonshine: 0.5, mdma: 1.0, meth: 0.8, lsd: 0.8, cocaine: 1.8, heroin: 0.8 }, price: 1.25, police: 1.3, blurb: 'Bankers who wire money and ask zero questions.' },
  { id: 2, name: 'Ocean Drive', demand: { weed: 1.0, moonshine: 0.6, mdma: 1.8, meth: 0.6, lsd: 1.5, cocaine: 1.4, heroin: 0.5 }, price: 1.15, police: 1.1, blurb: 'Neon, pastel suits and a party that never ends.' },
  { id: 3, name: 'Palmetto Flats', demand: { weed: 1.4, moonshine: 1.5, mdma: 0.7, meth: 1.3, lsd: 0.7, cocaine: 0.5, heroin: 0.9 }, price: 0.8, police: 0.7, blurb: 'Your uncle\'s old neighbourhood. Cheap rent, no witnesses.' },
  { id: 4, name: 'The Port', demand: { weed: 0.9, moonshine: 1.2, mdma: 0.6, meth: 1.4, lsd: 0.5, cocaine: 0.9, heroin: 1.5 }, price: 0.95, police: 0.6, blurb: 'Cranes, containers and customs officers on the take.' },
];

/** Vertical roads west -> east, horizontal roads north -> south. */
export const AVENUES = ['27th Ave', '17th Ave', '7th Ave', 'Miami Ave', 'Biscayne Blvd', 'Collins Ave', 'Ocean Dr'];
export const STREETS = ['36th St', '20th St', 'Flagler St', '8th St', 'Coral Way', 'Port Blvd'];

// ---------------------------------------------------------------------------
// Gangs

export interface GangDef {
  id: number;
  name: string;
  short: string;
  color: number;
  css: string;
  boss: string;
  home: number;
}

export const GANGS: GangDef[] = [
  { id: 0, name: 'Your Crew', short: 'YOU', color: NEON.yellow, css: '#ffe14d', boss: 'You', home: 3 },
  { id: 1, name: 'Los Flamingos', short: 'FLAMINGOS', color: NEON.pink, css: '#ff2a8a', boss: 'Rafa "Pink" Medina', home: 0 },
  { id: 2, name: 'The Barracudas', short: 'BARRACUDAS', color: NEON.cyan, css: '#2de2e6', boss: 'Mr. Kessler', home: 1 },
  { id: 3, name: 'Tiger Mob', short: 'TIGERS', color: NEON.orange, css: '#ff8a1f', boss: 'Big Lou Tigre', home: 2 },
];

// ---------------------------------------------------------------------------
// Businesses

export type BizKind =
  | 'safehouse' | 'motel' | 'warehouse' | 'nightclub' | 'arcade' | 'pawnshop'
  | 'laundromat' | 'videostore' | 'carlot' | 'diner' | 'marina';

export interface UpgradeFx {
  income?: number;
  launder?: number;
  stash?: number;
  defense?: number;
  sales?: number;
  recruits?: number;
  heat?: number;
  heal?: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  cost: number;
  desc: string;
  fx: UpgradeFx;
  sprite: string;
  slot: [number, number];
}

export type Floor = 'concrete' | 'checker' | 'carpet' | 'dance' | 'tile' | 'wood' | 'linoleum';

export interface BizDef {
  name: string;
  sign: string;
  price: number;
  income: number;
  launder: number;
  stash: number;
  perk: string;
  fx: UpgradeFx;
  roof: number;
  neon: number;
  room: [number, number];
  floor: Floor;
  names: string[];
  upgrades: UpgradeDef[];
  /** stations can be built inside */
  prod?: boolean;
}

export const BIZ: Record<BizKind, BizDef> = {
  safehouse: {
    name: 'Stash House', sign: 'APTS', price: 6000, income: 0, launder: 0, stash: 150, prod: true,
    perk: 'Production space. Stores 150 items.', fx: {}, roof: 0xc9b8a0, neon: NEON.cyan,
    room: [14, 10], floor: 'linoleum', names: ['Blue Door House', 'Unit 12', 'Casa Segura', 'The Bungalow'],
    upgrades: [
      { id: 'door', name: 'Steel Door', cost: 2500, desc: 'Raids are much less likely to succeed.', fx: { defense: 3 }, sprite: 'door', slot: [6, 9] },
      { id: 'shelves', name: 'False Wall Shelves', cost: 3000, desc: '+100 stash capacity.', fx: { stash: 100 }, sprite: 'shelves', slot: [1, 1] },
      { id: 'scanner', name: 'Police Scanner', cost: 4000, desc: 'Heat cools down 20% faster.', fx: { heat: 0.2 }, sprite: 'radio', slot: [10, 2] },
    ],
  },
  motel: {
    name: 'Motel', sign: 'MOTEL', price: 18000, income: 600, launder: 0, stash: 80, prod: true,
    perk: 'Production space in the back rooms. Hurt crew heal twice as fast.', fx: { heal: 1 }, roof: 0x7fd8c8, neon: NEON.pink,
    room: [16, 10], floor: 'carpet', names: ['Flamingo Motel', 'Sunset Inn', 'Palm Court Motel', 'Starlite Lodge'],
    upgrades: [
      { id: 'icemachine', name: 'Ice Machine', cost: 2000, desc: '+40% income. Tourists love ice.', fx: { income: 0.4 }, sprite: 'icebox', slot: [1, 7] },
      { id: 'doc', name: 'Back Room Doc', cost: 6000, desc: 'Crew heal even faster.', fx: { heal: 1 }, sprite: 'bed', slot: [12, 1] },
      { id: 'vacancy', name: 'Rooms By The Hour', cost: 5000, desc: '+60 stash capacity.', fx: { stash: 60 }, sprite: 'shelves', slot: [6, 1] },
    ],
  },
  warehouse: {
    name: 'Warehouse', sign: 'FREIGHT', price: 25000, income: 0, launder: 0, stash: 500, prod: true,
    perk: 'Huge production floor. Stores 500 items.', fx: {}, roof: 0x7a8fa0, neon: NEON.yellow,
    room: [20, 12], floor: 'concrete', names: ['Pier 7 Storage', 'Atlantic Freight', 'Coldbox Seafood'],
    upgrades: [
      { id: 'forklift', name: 'Forklift', cost: 4000, desc: '+150 stash capacity.', fx: { stash: 150 }, sprite: 'forklift', slot: [14, 7] },
      { id: 'guards', name: 'Night Watchman', cost: 5000, desc: '+4 defense for this block.', fx: { defense: 4 }, sprite: 'desk', slot: [2, 8] },
      { id: 'cold', name: 'Fish Smell Cover', cost: 3000, desc: 'Heat cools down 15% faster.', fx: { heat: 0.15 }, sprite: 'icebox', slot: [9, 1] },
    ],
  },
  nightclub: {
    name: 'Nightclub', sign: 'CLUB', price: 45000, income: 2500, launder: 6000, stash: 0,
    perk: 'Corners on this and neighbouring blocks sell 60% more. Launders cash.', fx: { sales: 0.6 }, roof: 0x2a1a3a, neon: NEON.pink,
    room: [18, 12], floor: 'dance', names: ['Club Neon', 'Paradise Club', 'Vice Lounge', 'Electric Palm'],
    upgrades: [
      { id: 'dj', name: 'Italo DJ', cost: 6000, desc: '+50% income.', fx: { income: 0.5 }, sprite: 'djbooth', slot: [8, 1] },
      { id: 'vip', name: 'VIP Room', cost: 12000, desc: 'Corners nearby sell another 40% more.', fx: { sales: 0.4 }, sprite: 'sofa', slot: [14, 8] },
      { id: 'bouncers', name: 'Bouncers', cost: 5000, desc: '+4 defense for this block.', fx: { defense: 4 }, sprite: 'desk', slot: [1, 9] },
    ],
  },
  arcade: {
    name: 'Arcade', sign: 'ARCADE', price: 14000, income: 700, launder: 0, stash: 0,
    perk: 'Kids hang out here. +2 recruits show up every day.', fx: { recruits: 2 }, roof: 0x5a3fa0, neon: NEON.cyan,
    room: [14, 10], floor: 'carpet', names: ['Laser Zone', 'Pixel Palace', 'Galaxy Arcade'],
    upgrades: [
      { id: 'cabinets', name: 'New Cabinets', cost: 3000, desc: '+60% income.', fx: { income: 0.6 }, sprite: 'cabinet', slot: [1, 1] },
      { id: 'backroom', name: 'Back Room Games', cost: 5000, desc: '+2 more recruits a day.', fx: { recruits: 2 }, sprite: 'table', slot: [10, 6] },
      { id: 'change', name: 'Change Machine', cost: 4000, desc: 'Launders $2,000 a day.', fx: { launder: 2000 }, sprite: 'atm', slot: [6, 1] },
    ],
  },
  pawnshop: {
    name: 'Pawn Shop', sign: 'PAWN', price: 10000, income: 900, launder: 0, stash: 0,
    perk: 'Fences goods: all street sales earn 10% more.', fx: {}, roof: 0xd9b86a, neon: NEON.yellow,
    room: [12, 9], floor: 'wood', names: ['Lucky Pawn', 'Gold Rush Pawn', 'Ace Pawn & Loan'],
    upgrades: [
      { id: 'safe', name: 'Walk-in Safe', cost: 4000, desc: '+3 defense for this block.', fx: { defense: 3 }, sprite: 'safe', slot: [9, 1] },
      { id: 'jewel', name: 'Jewelry Case', cost: 3500, desc: '+50% income.', fx: { income: 0.5 }, sprite: 'counter', slot: [3, 4] },
      { id: 'books', name: 'Second Set of Books', cost: 3000, desc: 'Launders $2,500 a day.', fx: { launder: 2500 }, sprite: 'desk', slot: [1, 1] },
    ],
  },
  laundromat: {
    name: 'Laundromat', sign: 'WASH', price: 12000, income: 300, launder: 4000, stash: 0,
    perk: 'Launders $4,000 of dirty cash a day.', fx: {}, roof: 0x9fd0ff, neon: NEON.cyan,
    room: [12, 9], floor: 'tile', names: ['Suds City', 'Spin Cycle', 'Wash World'],
    upgrades: [
      { id: 'washers', name: 'Industrial Washers', cost: 4000, desc: 'Launders +$3,000 a day.', fx: { launder: 3000 }, sprite: 'washer', slot: [1, 1] },
      { id: 'dryers', name: 'Tumble Dryers', cost: 3000, desc: 'Launders +$2,000 a day.', fx: { launder: 2000 }, sprite: 'washer', slot: [1, 6] },
      { id: 'vending', name: 'Vending Machine', cost: 1500, desc: '+80% income.', fx: { income: 0.8 }, sprite: 'atm', slot: [9, 1] },
    ],
  },
  videostore: {
    name: 'Video Store', sign: 'VIDEO', price: 9000, income: 300, launder: 2500, stash: 0,
    perk: 'Launders $2,500 a day. Be kind, rewind.', fx: {}, roof: 0xff6b6b, neon: NEON.yellow,
    room: [12, 9], floor: 'carpet', names: ['Rewind Video', 'VHS Heaven', 'Blockbusted'],
    upgrades: [
      { id: 'adult', name: 'Curtained Section', cost: 3000, desc: '+100% income.', fx: { income: 1 }, sprite: 'curtain', slot: [9, 1] },
      { id: 'racks', name: 'New Release Wall', cost: 2500, desc: 'Launders +$1,500 a day.', fx: { launder: 1500 }, sprite: 'shelves', slot: [1, 1] },
      { id: 'tvs', name: 'TV Wall', cost: 2000, desc: '+30% income.', fx: { income: 0.3 }, sprite: 'tv', slot: [5, 6] },
    ],
  },
  carlot: {
    name: 'Car Lot', sign: 'AUTOS', price: 30000, income: 1200, launder: 8000, stash: 0,
    perk: 'Launders $8,000 a day. Crew cars drive 30% faster.', fx: {}, roof: 0xf2f2f2, neon: NEON.orange,
    room: [18, 12], floor: 'concrete', names: ['Sunshine Autos', 'Big Al\'s Autos', 'Chop Top Motors'],
    upgrades: [
      { id: 'chop', name: 'Chop Shop', cost: 7000, desc: '+80% income.', fx: { income: 0.8 }, sprite: 'lift', slot: [12, 2] },
      { id: 'paint', name: 'Paint Booth', cost: 5000, desc: 'Heat cools down 15% faster.', fx: { heat: 0.15 }, sprite: 'booth', slot: [2, 2] },
      { id: 'finance', name: '"Financing" Office', cost: 6000, desc: 'Launders +$4,000 a day.', fx: { launder: 4000 }, sprite: 'desk', slot: [2, 8] },
    ],
  },
  diner: {
    name: 'Diner', sign: 'DINER', price: 8000, income: 500, launder: 1500, stash: 0,
    perk: 'Cops eat free. Heat cools down 25% faster.', fx: { heat: 0.25 }, roof: 0xf4f0e8, neon: NEON.red,
    room: [14, 9], floor: 'checker', names: ['Rosa\'s Diner', 'Eat at Joe\'s', 'Cafe Cubano', 'Moonlite Diner'],
    upgrades: [
      { id: 'jukebox', name: 'Jukebox', cost: 1500, desc: '+50% income.', fx: { income: 0.5 }, sprite: 'jukebox', slot: [12, 1] },
      { id: 'donuts', name: 'Free Donuts', cost: 3000, desc: 'Heat cools down another 20% faster.', fx: { heat: 0.2 }, sprite: 'counter', slot: [4, 1] },
      { id: 'booth', name: 'Back Booth', cost: 2500, desc: '+1 recruit a day.', fx: { recruits: 1 }, sprite: 'sofa', slot: [1, 6] },
    ],
  },
  marina: {
    name: 'Marina', sign: 'MARINA', price: 60000, income: 800, launder: 0, stash: 100,
    perk: 'Import coca leaves and raw opium by boat for a third of Sal\'s price.', fx: {}, roof: 0xe8e8f0, neon: NEON.cyan,
    room: [18, 11], floor: 'wood', names: ['Bayside Marina'],
    upgrades: [
      { id: 'speedboat', name: 'Cigarette Boat', cost: 15000, desc: 'Shipments arrive twice as fast.', fx: {}, sprite: 'boat', slot: [10, 5] },
      { id: 'customs', name: 'Friend in Customs', cost: 10000, desc: 'Shipments never get seized at sea.', fx: {}, sprite: 'desk', slot: [2, 2] },
      { id: 'cold2', name: 'Cold Storage', cost: 6000, desc: '+100 stash capacity.', fx: { stash: 100 }, sprite: 'icebox', slot: [2, 7] },
    ],
  },
};

export const LAUNDER_FEE = 0.2;

// ---------------------------------------------------------------------------
// Crew

export const FIRST = [
  'Tony', 'Rico', 'Manny', 'Vinnie', 'Dez', 'Marisol', 'Lupe', 'Earl', 'Sonny', 'Rosa', 'Dmitri', 'Jimmy',
  'Hector', 'Ray', 'Nina', 'Carlos', 'Frankie', 'Benny', 'Gloria', 'Teo', 'Lenny', 'Yolanda', 'Mickey', 'Gus',
];
export const NICKS = [
  'Knuckles', 'Two Beepers', 'Fingers', 'Velvet', 'Lucky', 'The Mouth', 'Shades', 'Sweats', 'Moonwalk', 'Gator',
  'Pastel', 'Hammer', 'Disco', 'Snake', 'Polaroid', 'Mullet', 'Jetski', 'Cassette', 'Nunchucks', 'Biscuit',
];
export const QUIRKS = [
  'Wears sunglasses at night. Indoors. Always.',
  'Owns eleven identical white linen suits.',
  'Claims he once sold a jet ski to Don Johnson.',
  'Carries a Walkman, only plays one Phil Collins song.',
  'Allergic to sunlight. Lives in Miami anyway.',
  'Learned to drive from watching car chases on TV.',
  'Has a pet alligator named Mr. Snuggles.',
  'Talks to his beeper like it is a person.',
  'Was a mall Santa. Got fired. Won\'t say why.',
  'Never blinks during a deal. It\'s unsettling.',
  'Moonlights as a roller-disco instructor.',
  'Thinks the Cold War is a weather thing.',
];

/** Which product a station recipe belongs to (used for story unlocks). */
export function recipeProduct(station: StationId, idx: number): ProductId {
  if (station === 'reactor') return (['meth', 'mdma', 'lsd'] as ProductId[])[idx];
  if (station === 'refinery') return (['cocaine', 'heroin'] as ProductId[])[idx];
  return CHAINS.find((c) => c.steps.includes(station))!.product;
}
