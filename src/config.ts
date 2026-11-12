/** City tile size in world pixels. The world is drawn at ~10px per metre. */
export const TILE = 32;
/** Interior grid size in pixels. */
export const ITILE = 16;
export const BLOCK = 12; // 2 road tiles + 10 block tiles
export const GAME_MIN_PER_SEC = 4;
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
// Product

export type ProductId = 'green' | 'candy' | 'snow';
export const PRODUCT_IDS: ProductId[] = ['green', 'candy', 'snow'];

export interface ProductDef {
  name: string;
  desc: string;
  sell: number;
  sal: number;
  marina: number;
  heat: number;
  css: string;
}

export const PRODUCTS: Record<ProductId, ProductDef> = {
  green: { name: 'Green', desc: 'Cheap, mellow, nobody really cares.', sell: 40, sal: 16, marina: 7, heat: 0.12, css: '#7dff6a' },
  candy: { name: 'Candy', desc: 'Party pills for the club crowd.', sell: 95, sal: 42, marina: 18, heat: 0.3, css: '#ff5fd2' },
  snow: { name: 'Snow', desc: 'The good stuff. Cops hate it.', sell: 240, sal: 125, marina: 55, heat: 0.75, css: '#e8f4ff' },
};

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
  { id: 0, name: 'Little Havana', demand: { green: 1.2, candy: 0.8, snow: 0.9 }, price: 0.9, police: 0.9, blurb: 'Cafecito, dominoes and very long memories.' },
  { id: 1, name: 'Downtown', demand: { green: 0.7, candy: 1.1, snow: 1.6 }, price: 1.25, police: 1.3, blurb: 'Bankers who wire money and ask zero questions.' },
  { id: 2, name: 'Ocean Drive', demand: { green: 1.0, candy: 1.7, snow: 1.3 }, price: 1.15, police: 1.1, blurb: 'Neon, pastel suits and a party that never ends.' },
  { id: 3, name: 'Palmetto Flats', demand: { green: 1.4, candy: 1.0, snow: 0.5 }, price: 0.8, police: 0.7, blurb: 'Your uncle\'s old neighbourhood. Cheap rent, no witnesses.' },
  { id: 4, name: 'The Port', demand: { green: 0.9, candy: 0.7, snow: 1.0 }, price: 0.95, police: 0.6, blurb: 'Cranes, containers and customs officers on the take.' },
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
}

export const BIZ: Record<BizKind, BizDef> = {
  safehouse: {
    name: 'Stash House', sign: 'APTS', price: 6000, income: 0, launder: 0, stash: 60,
    perk: 'Stores 60 product. Crew operate out of here.', fx: {}, roof: 0xc9b8a0, neon: NEON.cyan,
    room: [14, 10], floor: 'linoleum', names: ['Blue Door House', 'Unit 12', 'Casa Segura', 'The Bungalow'],
    upgrades: [
      { id: 'door', name: 'Steel Door', cost: 2500, desc: 'Raids are much less likely to succeed.', fx: { defense: 3 }, sprite: 'door', slot: [6, 9] },
      { id: 'shelves', name: 'False Wall Shelves', cost: 3000, desc: '+60 stash capacity.', fx: { stash: 60 }, sprite: 'shelves', slot: [1, 1] },
      { id: 'scanner', name: 'Police Scanner', cost: 4000, desc: 'Heat cools down 20% faster.', fx: { heat: 0.2 }, sprite: 'radio', slot: [10, 2] },
    ],
  },
  motel: {
    name: 'Motel', sign: 'MOTEL', price: 18000, income: 600, launder: 0, stash: 30,
    perk: 'Hurt crew heal twice as fast. Stores 30 product.', fx: { heal: 1 }, roof: 0x7fd8c8, neon: NEON.pink,
    room: [16, 10], floor: 'carpet', names: ['Flamingo Motel', 'Sunset Inn', 'Palm Court Motel', 'Starlite Lodge'],
    upgrades: [
      { id: 'icemachine', name: 'Ice Machine', cost: 2000, desc: '+40% income. Tourists love ice.', fx: { income: 0.4 }, sprite: 'icebox', slot: [1, 7] },
      { id: 'doc', name: 'Back Room Doc', cost: 6000, desc: 'Crew heal even faster.', fx: { heal: 1 }, sprite: 'bed', slot: [12, 1] },
      { id: 'vacancy', name: 'Rooms By The Hour', cost: 5000, desc: '+30 stash capacity.', fx: { stash: 30 }, sprite: 'shelves', slot: [6, 1] },
    ],
  },
  warehouse: {
    name: 'Warehouse', sign: 'FREIGHT', price: 25000, income: 0, launder: 0, stash: 200,
    perk: 'Stores 200 product.', fx: {}, roof: 0x7a8fa0, neon: NEON.yellow,
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
    name: 'Marina', sign: 'MARINA', price: 60000, income: 800, launder: 0, stash: 40,
    perk: 'Import product by boat at ~45% of Sal\'s price.', fx: {}, roof: 0xe8e8f0, neon: NEON.cyan,
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
