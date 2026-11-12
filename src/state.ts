import { BIZ, FIRST, GANGS, ITEM_IDS, NICKS, QUIRKS, type BizKind, type ItemId, type ProductId, type StationId } from './config';
import { generateCity, type CityMap, type Pt } from './sim/cityMap';
import { pick, randInt } from './sim/rng';

export const map: CityMap = generateCity();

export interface Turf {
  owner: number; // -1 neutral, 0 player, 1..3 gangs
  inf: number; // 0..100 grip on the block
}

export interface BizState {
  mode: 'owned' | 'extorted';
  upgrades: string[];
  stations: Station[];
}

export type GoonStatus = 'idle' | 'posted' | 'op' | 'hurt' | 'jail';

export interface Goon {
  id: number;
  name: string;
  nick: string;
  quirk: string;
  muscle: number;
  smarts: number;
  nerve: number;
  wage: number;
  hp: number;
  look: number;
  status: GoonStatus;
  post: { kind: 'corner' | 'guard' | 'work'; block: number; lot?: number } | null;
  opId: number | null;
  jailUntil: number;
  saleAcc: number;
  earned: number;
  note: string;
}

export interface Candidate {
  name: string;
  nick: string;
  quirk: string;
  muscle: number;
  smarts: number;
  nerve: number;
  wage: number;
  look: number;
}

export interface Vehicle {
  kind: 'crew' | 'van' | 'boat' | 'rival' | 'cop';
  x: number;
  y: number;
  route: Pt[];
  speed: number;
  angle: number;
  parked: boolean;
  gone: boolean;
}

export type OpKind = 'drop' | 'takeover' | 'extort' | 'delivery' | 'import' | 'contract' | 'attack' | 'bust';

export interface Op {
  id: number;
  kind: OpKind;
  gang: number;
  crew: number[];
  /** block id for most ops, lot id for extort */
  target: number;
  block: number;
  phase: 'drive' | 'work' | 'return' | 'sail' | 'leave';
  /** fight balance: +1 attacker wins, -1 defender wins */
  balance: number;
  timer: number;
  vehicle: Vehicle | null;
  cargo: Partial<Record<ItemId, number>> | null;
  reward: number;
  postAs: 'corner' | 'guard' | 'work' | null;
  legs: number[];
  power: number;
}

export interface PhoneOption {
  label: string;
  action: string;
  data?: Record<string, number | string>;
}

export interface PhoneMsg {
  id: number;
  from: string;
  text: string;
  options: PhoneOption[];
  at: number;
  expires: number;
  read: boolean;
}

export interface GangState {
  power: number;
  alive: boolean;
  truceUntil: number;
  aggression: number;
  nextMove: number;
}

export interface GameState {
  version: number;
  clean: number;
  dirty: number;
  minutes: number;
  turf: Turf[];
  biz: Record<number, BizState>;
  goons: Goon[];
  ops: Op[];
  stash: Record<ItemId, number>;
  heat: number;
  bribes: number;
  gangs: GangState[];
  candidates: Candidate[];
  phone: PhoneMsg[];
  nextId: number;
  nextCall: number;
  stats: { earned: number; sold: number; laundered: number; arrests: number; deaths: number; hired: number; imports: number; taken: number; orders: number; made: Partial<Record<ProductId, number>> };
  ledger: { street: number; biz: number; laundered: number; sold: number };
  objectives: string[];
  /** story chapter index (0-based) and highest chapter whose intro was shown */
  chapter: number;
  storySeen: number;
}

export interface View {
  scene: 'city' | 'interior';
  lot: number | null;
  selection: { type: 'block' | 'lot' | 'goon' | 'station'; id: number } | null;
  placing: StationId | null;
  speed: number;
  started: boolean;
  crt: boolean;
  wobble: boolean;
}

export const SAVE_KEY = 'seven-sins-v1';
const VERSION = 4;

export const view: View = { scene: 'city', lot: null, selection: null, placing: null, speed: 1, started: false, crt: true, wobble: true };

export let state: GameState = newGame();

export function setState(s: GameState) {
  state = s;
}

export function nextId() {
  return state.nextId++;
}

export function makeCandidate(boost = 0): Candidate {
  const roll = () => Math.min(10, randInt(2, 7) + (Math.random() < 0.2 ? 2 : 0) + boost);
  const muscle = roll();
  const smarts = roll();
  const nerve = roll();
  const wage = Math.round((60 + (muscle + smarts + nerve) * 9 + Math.random() * 30) / 5) * 5;
  return { name: pick(FIRST), nick: pick(NICKS), quirk: pick(QUIRKS), muscle, smarts, nerve, wage, look: randInt(0, 5) };
}

export function goonFrom(c: Candidate): Goon {
  return {
    id: nextId(), name: c.name, nick: c.nick, quirk: c.quirk, muscle: c.muscle, smarts: c.smarts, nerve: c.nerve,
    wage: c.wage, hp: 100, look: c.look, status: 'idle', post: null, opId: null, jailUntil: 0, saleAcc: 0, earned: 0, note: '',
  };
}

export function newGame(): GameState {
  const turf: Turf[] = map.blocks.map(() => ({ owner: -1, inf: 30 }));
  // each gang holds a cluster in its home district
  const homes: Record<number, [number, number][]> = {
    1: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
    2: [[2, 0], [3, 0], [2, 1], [3, 1], [3, 2]],
    3: [[4, 0], [5, 0], [5, 1], [4, 1], [5, 2]],
  };
  for (const g of [1, 2, 3]) for (const [bx, by] of homes[g]) turf[by * 6 + bx] = { owner: g, inf: 60 + Math.random() * 30 };
  const start = map.lots[map.starterLot].block;
  turf[start] = { owner: 0, inf: 70 };

  const s: GameState = {
    version: VERSION,
    clean: 8000,
    dirty: 2500,
    minutes: 20 * 60,
    turf,
    biz: { [map.starterLot]: { mode: 'owned', upgrades: [], stations: [] } },
    goons: [],
    ops: [],
    stash: emptyStash({ weed: 12 }),
    ledger: { street: 0, biz: 0, laundered: 0, sold: 0 },
    heat: 5,
    bribes: 0,
    gangs: GANGS.map((_, i) => ({ power: i === 0 ? 0 : 1, alive: i !== 0, truceUntil: 0, aggression: [0, 0.8, 0.6, 1][i], nextMove: 26 * 60 + i * 180 })),
    candidates: [],
    phone: [],
    nextId: 1,
    nextCall: 21 * 60,
    stats: { earned: 0, sold: 0, laundered: 0, arrests: 0, deaths: 0, hired: 0, imports: 0, taken: 0, orders: 0, made: {} },
    objectives: [],
    chapter: 0,
    storySeen: -1,
  };
  return s;
}

/** Called after newGame() becomes the live state, since helpers read `state`. */
export function seedNewGame() {
  const a = makeCandidate(1);
  a.name = 'Sonny';
  a.nick = 'Shades';
  a.quirk = 'Wears sunglasses at night. Indoors. Always.';
  const b = makeCandidate(0);
  b.name = 'Rico';
  b.nick = 'Knuckles';
  b.muscle = 8;
  state.goons.push(goonFrom(a), goonFrom(b));
  state.candidates = [makeCandidate(), makeCandidate(), makeCandidate()];
}

// ---------------------------------------------------------------------------
// derived helpers

export function blockOwner(blockId: number) {
  return state.turf[blockId].owner;
}

export function lotBlock(lotId: number) {
  return map.lots[lotId].block;
}

export function bizActive(lotId: number) {
  return !!state.biz[lotId] && blockOwner(lotBlock(lotId)) === 0;
}

export function bizFx(lotId: number) {
  const l = map.lots[lotId];
  const b = state.biz[lotId];
  if (!b || l.kind === 'decor') return null;
  const def = BIZ[l.kind as BizKind];
  const fx = { income: 1, launder: def.launder, stash: def.stash, defense: 0, sales: 0, recruits: 0, heat: 0, heal: 0 };
  const owned = b.mode === 'owned';
  if (!owned) {
    // protection money only
    return { ...fx, income: 0.5, launder: 0, stash: 0 };
  }
  const add = (f: Partial<typeof fx>) => {
    fx.income += f.income ?? 0;
    fx.launder += f.launder ?? 0;
    fx.stash += f.stash ?? 0;
    fx.defense += f.defense ?? 0;
    fx.sales += f.sales ?? 0;
    fx.recruits += f.recruits ?? 0;
    fx.heat += f.heat ?? 0;
    fx.heal += f.heal ?? 0;
  };
  add(def.fx);
  for (const u of def.upgrades) if (b.upgrades.includes(u.id)) add(u.fx);
  return fx;
}

export function stashCap() {
  let cap = 0;
  for (const k of Object.keys(state.biz)) {
    const id = Number(k);
    if (!bizActive(id)) continue;
    cap += bizFx(id)!.stash;
  }
  return cap;
}

export function stashTotal() {
  return ITEM_IDS.reduce((a, p) => a + state.stash[p], 0);
}

export function playerBlocks() {
  return state.turf.map((t, i) => (t.owner === 0 ? i : -1)).filter((i) => i >= 0);
}

export function goonName(g: { name: string; nick: string }) {
  return `${g.name} "${g.nick}"`;
}

export function stars() {
  return Math.min(5, Math.floor(state.heat / 20));
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

export function clock(minutes: number) {
  const day = Math.floor(minutes / 1440) + 1;
  const m = Math.floor(minutes % 1440);
  const hour = Math.floor(m / 60);
  return { day, hour, hh: String(hour).padStart(2, '0'), mm: String(m % 60).padStart(2, '0') };
}

export interface Station {
  id: number;
  type: StationId;
  x: number;
  y: number;
  recipe: number;
  /** 0..1 while a batch is loaded */
  progress: number;
  loaded: boolean;
  status: 'idle' | 'running' | 'nostaff' | 'noinput' | 'full';
}

export function emptyStash(init: Partial<Record<ItemId, number>> = {}): Record<ItemId, number> {
  const s = {} as Record<ItemId, number>;
  for (const k of ITEM_IDS) s[k] = init[k] ?? 0;
  return s;
}

/** Goons working inside a production building. */
export function workersAt(lotId: number) {
  return state.goons.filter((g) => g.status === 'posted' && g.post?.kind === 'work' && g.post.lot === lotId);
}
