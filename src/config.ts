export const TILE = 32;
/** Game minutes that pass per real second at 1x speed. */
export const GAME_MIN_PER_SEC = 10;
export const DAY = 1440;

export type ProductId = 'herb' | 'crystal';
export const PRODUCT_IDS: ProductId[] = ['herb', 'crystal'];

export interface ProductDef {
  name: string;
  short: string;
  basePrice: number;
  heat: number;
  color: string;
  icon: string;
}

export const PRODUCTS: Record<ProductId, ProductDef> = {
  herb: { name: "Grandma's Oregano", short: 'Oregano', basePrice: 30, heat: 0.45, color: '#7bd35a', icon: '🌿' },
  crystal: { name: 'Blue Rock Candy', short: 'Rock Candy', basePrice: 85, heat: 1.2, color: '#5cc8ff', icon: '💎' },
};

export interface DistrictDef {
  id: number;
  name: string;
  police: number;
  demand: Record<ProductId, number>;
  color: string;
  blurb: string;
}

export const DISTRICTS: DistrictDef[] = [
  { id: 0, name: 'Old Town', police: 0.8, demand: { herb: 1.1, crystal: 0.9 }, color: '#e0915f', blurb: 'Cheap rent, nosy neighbours, mostly harmless.' },
  { id: 1, name: 'Downtown', police: 1.3, demand: { herb: 1.0, crystal: 1.5 }, color: '#9fb4d4', blurb: 'Finance bros with expense accounts and no sleep.' },
  { id: 2, name: 'Palm Heights', police: 1.25, demand: { herb: 1.5, crystal: 0.7 }, color: '#9bd17a', blurb: 'Soccer moms, HOA meetings and an insatiable appetite for oregano.' },
  { id: 3, name: 'The Docks', police: 0.6, demand: { herb: 0.8, crystal: 1.25 }, color: '#6fb3c4', blurb: 'Nobody here asks questions. Nobody here answers them either.' },
];

export type StationType = 'tent' | 'lab' | 'table' | 'stash';
export const STATION_TYPES: StationType[] = ['tent', 'table', 'stash', 'lab'];

export interface StationDef {
  name: string;
  cost: number;
  w: number;
  h: number;
  desc: string;
}

export const STATIONS: Record<StationType, StationDef> = {
  tent: { name: 'Grow Tent', cost: 800, w: 2, h: 2, desc: 'Grows "oregano". A Grower must water and harvest it.' },
  table: { name: 'Packing Table', cost: 350, w: 2, h: 1, desc: 'Packers bag raw product here so dealers can sell it.' },
  stash: { name: 'Stash Safe', cost: 600, w: 1, h: 1, desc: 'Holds bagged product and supplies. Dealers restock here.' },
  lab: { name: 'Kitchen Lab', cost: 3500, w: 3, h: 2, desc: 'A Cook turns Supplies into Blue Rock Candy. High value, high heat.' },
};

export type Role = 'grower' | 'cook' | 'packer' | 'dealer' | 'guard';
export const ROLE_IDS: Role[] = ['grower', 'packer', 'dealer', 'cook', 'guard'];

export interface RoleDef {
  name: string;
  wage: number;
  color: number;
  icon: string;
  desc: string;
}

export const ROLES: Record<Role, RoleDef> = {
  grower: { name: 'Grower', wage: 120, color: 0x4caf50, icon: '🪴', desc: 'Waters and harvests grow tents.' },
  packer: { name: 'Packer', wage: 100, color: 0xffb300, icon: '📦', desc: 'Bags raw product at packing tables and stores it in the stash.' },
  dealer: { name: 'Dealer', wage: 160, color: 0xe53935, icon: '🧢', desc: 'Takes product from the stash and sells it on the streets of a district.' },
  cook: { name: 'Cook', wage: 260, color: 0xeeeeee, icon: '🧪', desc: 'Runs the kitchen lab. Needs Supplies in the stash.' },
  guard: { name: 'Guard', wage: 150, color: 0x37474f, icon: '🛡️', desc: 'Makes police raids on this property much less likely to succeed.' },
};

export type PropKind =
  | 'garage'
  | 'apartment'
  | 'house'
  | 'warehouse'
  | 'bigwarehouse'
  | 'laundromat'
  | 'carwash'
  | 'restaurant'
  | 'decor';

export interface PropKindDef {
  name: string;
  price: number;
  interior?: [number, number];
  launder?: number;
  names: string[];
}

export const PROP_KINDS: Record<PropKind, PropKindDef> = {
  garage: { name: 'Garage', price: 5000, interior: [12, 8], names: ['Rusty Garage', "Uncle Sal's Garage", 'Lock-Up #7'] },
  apartment: { name: 'Apartment', price: 9000, interior: [14, 9], names: ['Sunset Apartments', 'Unit 4B', 'The Roach Motel', 'Cozy Studio', 'Vista Del Mold'] },
  house: { name: 'Suburban House', price: 16000, interior: [16, 10], names: ['The Johnson Place', 'Beige House', 'Picket Fence Manor', 'Totally Normal Home'] },
  warehouse: { name: 'Warehouse', price: 32000, interior: [20, 12], names: ['Pier 9 Storage', 'Fish Co. Warehouse', 'Definitely Fish', 'Crate & Barrel-ish'] },
  bigwarehouse: { name: 'Big Warehouse', price: 60000, interior: [26, 15], names: ['Dockside Logistics', 'Import / Export LLC', 'Big Blue Shed'] },
  laundromat: { name: 'Laundromat', price: 14000, launder: 4000, names: ['Clean Money Laundry', 'Spin City', 'Suds & Duds'] },
  carwash: { name: 'Car Wash', price: 26000, launder: 9000, names: ['Squeaky Clean Car Wash', 'Wash & Go', 'Bubble Bros'] },
  restaurant: { name: 'Restaurant', price: 48000, launder: 20000, names: ['Totally Real Tacos', 'Le Bistro Legit', 'Chicken Not Fried'] },
  decor: { name: 'Building', price: 0, names: ['Private Property'] },
};

export const LAUNDER_FEE = 0.15;
export const SUPPLY_PRICE = 18;

export const FIRST_NAMES = [
  'Tony', 'Kevin', 'Rosa', 'Dwayne', 'Pete', 'Marisol', 'Greg', 'Tyrone', 'Linda', 'Vinny', 'Chad', 'Brenda',
  'Hector', 'Dmitri', 'Karen', 'Jamal', 'Gus', 'Wanda', 'Marco', 'Nadia', 'Earl', 'Stacy', 'Luis', 'Gloria',
];
export const NICKNAMES = [
  'Big', 'Lil', 'Skinny', 'Two-Phones', 'Sweaty', 'Nana', 'Professor', 'Fast', 'Quiet', 'Lucky', 'Uncle', 'Smooth',
  'Sleepy', 'Crunchy', 'Doc', 'Cousin',
];
export const TRAITS = [
  'Says "no cap" unironically.',
  'Former substitute chemistry teacher.',
  'Has a podcast. Will tell you about it.',
  'Allergic to plants, but trying their best.',
  'Very punctual. Suspiciously punctual.',
  'Claims to know a guy.',
  'Cannot keep a secret. Or a houseplant.',
  'Moonlights as a mall cop.',
  'Drives a lime-green minivan.',
  'Got fired from three food trucks.',
  'Will work for exposure. Not really.',
  'Owns 14 cats.',
];
