import {
  DISTRICTS, FIRST_NAMES, NICKNAMES, PROP_KINDS, ROLES, ROLE_IDS, TRAITS,
  type ProductId, type Role, type StationType,
} from './config';
import { generateCity, type CityMap } from './sim/cityMap';
import { pick, randInt } from './sim/rng';

export interface Station {
  id: number;
  type: StationType;
  x: number;
  y: number;
  /** tent: 0..1 growth, lab: 0..1 cook progress */
  progress: number;
  water: number;
  labState: 'empty' | 'cooking' | 'done';
  raw: Record<ProductId, number>;
  claimedBy: number | null;
}

export interface Stash {
  herb: number;
  crystal: number;
  supplies: number;
}

export interface Property {
  lotId: number;
  stations: Station[];
  stash: Stash;
}

export type Carry = { item: 'raw' | 'supplies'; product: ProductId; n: number } | null;

export interface Task {
  action: 'water' | 'harvest' | 'deliver' | 'pack' | 'deposit' | 'take_supplies' | 'load' | 'collect' | 'restock' | 'leave' | 'wander';
  stationId: number;
  timer: number;
  arrived: boolean;
}

export interface Worker {
  id: number;
  name: string;
  role: Role;
  skill: number;
  wage: number;
  trait: string;
  propertyId: number;
  district: number;
  // interior (tile units, centre of tile = x + 0.5)
  x: number;
  y: number;
  path: { x: number; y: number }[];
  task: Task | null;
  carry: Carry;
  bag: Record<ProductId, number>;
  status: string;
  facing: number;
  moving: boolean;
  idle: number;
  // city (dealers only), pixel coords
  inCity: boolean;
  cx: number;
  cy: number;
  cpath: number[];
  phase: 'inside' | 'travel' | 'selling' | 'dealing' | 'returning';
  timer: number;
  sales: number;
}

export interface Candidate {
  name: string;
  role: Role;
  skill: number;
  wage: number;
  trait: string;
}

export interface GameState {
  version: number;
  clean: number;
  dirty: number;
  minutes: number;
  properties: Record<number, Property>;
  workers: Worker[];
  heat: number[];
  bribes: number[];
  prices: Record<ProductId, number>;
  candidates: Record<Role, Candidate[]>;
  nextId: number;
  stats: { earned: number; sold: number; laundered: number; arrests: number; raids: number };
  objectives: string[];
}

export interface View {
  scene: 'city' | 'interior';
  propertyId: number | null;
  selection: { type: 'lot' | 'station' | 'worker' | 'district'; id: number } | null;
  placing: StationType | null;
  speed: number;
  started: boolean;
}

export const SAVE_KEY = 'tlb-save-v1';
const VERSION = 1;

export const map: CityMap = generateCity();

export const view: View = { scene: 'city', propertyId: null, selection: null, placing: null, speed: 1, started: false };

export let state: GameState = newGame();

export function setState(s: GameState) {
  state = s;
}

export function nextId(): number {
  return state.nextId++;
}

export function makeCandidate(role: Role): Candidate {
  const skill = randInt(1, 5);
  const wage = Math.round((ROLES[role].wage * (0.7 + skill * 0.15) * (0.9 + Math.random() * 0.2)) / 5) * 5;
  const name = Math.random() < 0.6 ? `${pick(NICKNAMES)} ${pick(FIRST_NAMES)}` : pick(FIRST_NAMES);
  return { name, role, skill, wage, trait: pick(TRAITS) };
}

export function rollCandidates(): Record<Role, Candidate[]> {
  const out = {} as Record<Role, Candidate[]>;
  for (const r of ROLE_IDS) out[r] = [makeCandidate(r), makeCandidate(r), makeCandidate(r)];
  return out;
}

export function newGame(): GameState {
  const starter = map.lots.find((l) => l.name === "Grandma's Garage")!;
  return {
    version: VERSION,
    clean: 15000,
    dirty: 3000,
    minutes: 8 * 60,
    properties: { [starter.id]: emptyProperty(starter.id) },
    workers: [],
    heat: DISTRICTS.map(() => 5),
    bribes: DISTRICTS.map(() => 0),
    prices: { herb: 1, crystal: 1 },
    candidates: rollCandidates(),
    nextId: 1,
    stats: { earned: 0, sold: 0, laundered: 0, arrests: 0, raids: 0 },
    objectives: [],
  };
}

export function emptyProperty(lotId: number): Property {
  return { lotId, stations: [], stash: { herb: 0, crystal: 0, supplies: 0 } };
}

export function interiorSize(lotId: number): [number, number] {
  return PROP_KINDS[map.lots[lotId].kind].interior ?? [8, 6];
}

export function doorCell(lotId: number): { x: number; y: number } {
  const [w, h] = interiorSize(lotId);
  return { x: Math.floor(w / 2), y: h - 1 };
}

export function isFront(lotId: number): boolean {
  return !!PROP_KINDS[map.lots[lotId].kind].launder;
}

export function workersAt(lotId: number): Worker[] {
  return state.workers.filter((w) => w.propertyId === lotId);
}

export function saveGame(): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== VERSION) return false;
    state = s;
    return true;
  } catch {
    return false;
  }
}

export function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export function clock(minutes: number): { day: number; hh: string; mm: string; hour: number } {
  const day = Math.floor(minutes / 1440) + 1;
  const m = Math.floor(minutes % 1440);
  const hour = Math.floor(m / 60);
  return { day, hour, hh: String(hour).padStart(2, '0'), mm: String(m % 60).padStart(2, '0') };
}
