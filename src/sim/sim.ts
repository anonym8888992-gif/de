import { bus, toast } from '../bus';
import {
  BIZ, DAY, DISTRICTS, GANGS, LAUNDER_FEE, PRODUCTS, PRODUCT_IDS, TILE,
  type BizKind, type ProductId,
} from '../config';
import {
  bizActive, bizFx, blockOwner, clock, goonFrom, goonName, makeCandidate, map, money, nextId, playerBlocks, saveGame,
  stars, stashCap, stashTotal, state, view, type Goon, type Op, type OpKind, type Vehicle,
} from '../state';
import { BY, curb, neighbours, node, routeBetween, routeFromNode, routeToNode, WORLD_W, type Pt } from './cityMap';
import { pick, randInt } from './rng';
import { phoneTick } from './phone';

// ---------------------------------------------------------------------------
// strength maths

export function goonPower(g: Goon) {
  return (g.muscle + g.nerve * 0.4 + g.smarts * 0.1) * Math.max(0.2, g.hp / 100);
}

export function crewPower(ids: number[]) {
  return ids.reduce((a, id) => {
    const g = state.goons.find((x) => x.id === id);
    return a + (g ? goonPower(g) : 0);
  }, 0);
}

export function guardsOn(block: number) {
  return state.goons.filter((g) => g.status === 'posted' && g.post?.block === block);
}

export function blockDefense(block: number) {
  const t = state.turf[block];
  if (t.owner === -1) return 3 + t.inf / 20;
  if (t.owner > 0) return 5 * state.gangs[t.owner].power * (0.6 + t.inf / 100) + 2;
  let d = t.inf / 12;
  for (const g of guardsOn(block)) d += goonPower(g) * (g.post!.kind === 'guard' ? 1 : 0.4);
  for (const l of map.lots) {
    if (l.block !== block || !state.biz[l.id]) continue;
    d += bizFx(l.id)!.defense;
  }
  return d;
}

/** Rough odds 0..1 that `atk` beats `def` in the random-walk fight. */
export function odds(atk: number, def: number) {
  const edge = (atk - def) / (atk + def || 1);
  return Math.max(0.03, Math.min(0.97, 0.5 + edge * 1.6));
}

export function adjacentToPlayer(block: number) {
  return neighbours(map, block).some((n) => blockOwner(n) === 0);
}

function carSpeed() {
  const lots = Object.keys(state.biz).map(Number).filter((id) => bizActive(id) && map.lots[id].kind === 'carlot');
  return 14 * (lots.length ? 1.3 : 1);
}

/** Owned stash building block closest to `target`, falling back to any owned block. */
export function baseBlock(target = map.lots[map.starterLot].block) {
  const tb = map.blocks[target];
  const stashBlocks = Object.keys(state.biz).map(Number)
    .filter((id) => bizActive(id) && bizFx(id)!.stash > 0)
    .map((id) => map.lots[id].block);
  const pool = stashBlocks.length ? stashBlocks : playerBlocks();
  if (!pool.length) return map.lots[map.starterLot].block;
  let best = pool[0];
  let bd = Infinity;
  for (const b of pool) {
    const d = Math.abs(map.blocks[b].bx - tb.bx) + Math.abs(map.blocks[b].by - tb.by);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// vehicles

function makeVehicle(kind: Vehicle['kind'], start: Pt, route: Pt[], speed: number): Vehicle {
  return { kind, x: start.x, y: start.y, route, speed, angle: 0, parked: false, gone: false };
}

function stepVehicle(v: Vehicle, dt: number) {
  let move = v.speed * dt;
  while (move > 0 && v.route.length) {
    const t = v.route[0];
    const dx = t.x - v.x;
    const dy = t.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) v.angle = Math.atan2(dy, dx);
    if (d <= move) {
      v.x = t.x;
      v.y = t.y;
      v.route.shift();
      move -= d;
    } else {
      v.x += (dx / d) * move;
      v.y += (dy / d) * move;
      move = 0;
    }
  }
  v.parked = v.route.length === 0;
}

function newOp(kind: OpKind, gang: number, crew: number[], target: number, block: number, vehicle: Vehicle | null): Op {
  const op: Op = {
    id: nextId(), kind, gang, crew, target, block, phase: 'drive', balance: 0, timer: 0, vehicle, cargo: null,
    reward: 0, postAs: null, legs: [], power: 0,
  };
  for (const id of crew) {
    const g = state.goons.find((x) => x.id === id);
    if (!g) continue;
    g.status = 'op';
    g.post = null;
    g.opId = op.id;
  }
  state.ops.push(op);
  return op;
}

function crewOf(op: Op) {
  return op.crew.map((id) => state.goons.find((g) => g.id === id)).filter((g): g is Goon => !!g);
}

function releaseCrew(op: Op, status: 'idle' = 'idle') {
  for (const g of crewOf(op)) {
    if (g.opId !== op.id) continue;
    g.opId = null;
    g.status = g.hp < 40 ? 'hurt' : status;
    g.note = g.status === 'hurt' ? 'Patching up' : '';
  }
  op.crew = [];
}

function goHome(op: Op) {
  op.phase = 'return';
  const base = baseBlock(op.block);
  op.vehicle!.route = routeBetween(op.block, base);
  op.vehicle!.parked = false;
  op.block = base;
}

function leaveMap(op: Op, from: number) {
  op.phase = 'leave';
  const j = randInt(0, BY);
  op.vehicle!.route = [...routeToNode(from, 0, j), { x: -40, y: node(0, j).y }];
  op.vehicle!.parked = false;
}

// ---------------------------------------------------------------------------
// casualties

function hurt(g: Goon, op: Op | null) {
  const dmg = randInt(15, 35) * (1.15 - g.nerve * 0.05);
  g.hp -= dmg;
  bus.emit('hit', { goon: g.id, block: op?.block ?? g.post?.block });
  if (g.hp > 0) return;
  if (Math.random() < 0.3) {
    killGoon(g, `${goonName(g)} got whacked.`);
    return;
  }
  g.hp = 10;
  g.status = 'hurt';
  g.post = null;
  g.note = 'Patching up';
  if (op) {
    op.crew = op.crew.filter((id) => id !== g.id);
    g.opId = null;
  }
  toast(`${goonName(g)} is hurt bad and limps home.`, 'warn');
}

function killGoon(g: Goon, msg: string) {
  state.goons = state.goons.filter((x) => x.id !== g.id);
  for (const op of state.ops) op.crew = op.crew.filter((id) => id !== g.id);
  state.stats.deaths++;
  if (view.selection?.type === 'goon' && view.selection.id === g.id) view.selection = null;
  toast(msg, 'bad');
  bus.emit('changed');
}

function arrest(g: Goon, msg: string) {
  g.status = 'jail';
  g.post = null;
  g.opId = null;
  g.jailUntil = state.minutes + 2 * DAY;
  g.note = 'In county lockup';
  state.stats.arrests++;
  for (const op of state.ops) op.crew = op.crew.filter((id) => id !== g.id);
  toast(msg, 'bad');
  bus.emit('changed');
}

export function bailCost(g: Goon) {
  return 1500 + (g.muscle + g.smarts + g.nerve) * 150;
}

// ---------------------------------------------------------------------------
// fight model: random walk of `balance` until +1 (attacker) or -1 (defender)

function fight(op: Op, atk: number, def: number, dt: number) {
  const edge = (atk - def) / (atk + def || 1);
  op.balance += (dt * (edge + (Math.random() - 0.5) * 0.9)) / 35;
  if (Math.random() < dt * 0.25) bus.emit('fx', { block: op.block, kind: 'flash' });
}

// ---------------------------------------------------------------------------
// op state machines

function stepOp(op: Op, dt: number) {
  const v = op.vehicle;
  if (v && !v.parked) stepVehicle(v, dt);

  switch (op.kind) {
    case 'drop': {
      if (op.phase === 'drive' && v!.parked) {
        if (blockOwner(op.block) === 0) {
          for (const g of crewOf(op)) {
            g.status = 'posted';
            g.post = { kind: op.postAs!, block: op.block };
            g.opId = null;
            g.note = '';
          }
          op.crew = [];
        }
        goHome(op);
      } else if (op.phase === 'return' && v!.parked) {
        releaseCrew(op);
        endOp(op);
      }
      break;
    }
    case 'takeover': {
      if (op.phase === 'drive' && v!.parked) {
        if (blockOwner(op.block) === 0) { goHome(op); break; }
        op.phase = 'work';
        op.balance = 0;
        bus.emit('changed');
      } else if (op.phase === 'work') {
        const crew = crewOf(op);
        const def = blockDefense(op.block);
        const atk = crewPower(op.crew);
        fight(op, atk, def, dt);
        state.heat = Math.min(100, state.heat + dt * 0.03);
        if (crew.length && Math.random() < dt * 0.02 * (def / (atk + def))) hurt(pick(crew), op);
        if (op.balance >= 1 && op.crew.length) winBlock(op);
        else if (op.balance <= -1 || !op.crew.length) {
          state.turf[op.block].inf = Math.min(100, state.turf[op.block].inf + 10);
          toast(`Takeover of ${map.blocks[op.block].name} failed. The crew is falling back.`, 'bad');
          goHome(op);
          bus.emit('changed');
        }
      } else if (op.phase === 'return' && v!.parked) {
        releaseCrew(op);
        endOp(op);
      }
      break;
    }
    case 'extort': {
      if (op.phase === 'drive' && v!.parked) {
        op.phase = 'work';
        op.timer = 45;
      } else if (op.phase === 'work') {
        op.timer -= dt;
        if (Math.random() < dt * 0.1) bus.emit('fx', { block: op.block, kind: 'shout' });
        if (op.timer <= 0) {
          const lot = map.lots[op.target];
          const power = crewOf(op).reduce((a, g) => a + g.muscle + g.nerve * 0.6, 0);
          const resist = 5 + lot.price / 4000;
          if (blockOwner(op.block) === 0 && !state.biz[op.target] && Math.random() < power / (power + resist)) {
            state.biz[op.target] = { mode: 'extorted', upgrades: [] };
            state.heat = Math.min(100, state.heat + 6);
            toast(`${lot.name} agreed to pay for "protection".`, 'good');
          } else {
            state.heat = Math.min(100, state.heat + 3);
            const c = crewOf(op);
            if (c.length && Math.random() < 0.4) hurt(pick(c), op);
            toast(`The owner of ${lot.name} told your crew to get lost.`, 'warn');
          }
          bus.emit('changed');
          goHome(op);
        }
      } else if (op.phase === 'return' && v!.parked) {
        releaseCrew(op);
        endOp(op);
      }
      break;
    }
    case 'delivery': {
      if (op.phase === 'drive') {
        if (Math.random() < dt * 0.00045 * stars()) {
          toast('Cops pulled over Sal\'s van. The whole load is gone.', 'bad');
          state.heat = Math.min(100, state.heat + 4);
          op.cargo = null;
          pulledOver(op);
          break;
        }
        if (v!.parked) {
          unload(op);
          leaveFrom(op);
        }
      } else if (op.phase === 'leave' && v!.parked) endOp(op);
      break;
    }
    case 'import': {
      if (op.phase === 'sail' && v!.parked) {
        const customs = state.biz[map.marinaLot]?.upgrades.includes('customs');
        if (!customs && Math.random() < 0.05 + stars() * 0.04) {
          toast('Coast Guard seized your shipment. Ouch.', 'bad');
          endOp(op);
          break;
        }
        const mb = map.lots[map.marinaLot].block;
        const base = baseBlock(mb);
        op.phase = 'drive';
        op.block = base;
        op.vehicle = makeVehicle('van', curb(mb), routeBetween(mb, base), 12);
        state.stats.imports++;
        toast('Boat\'s in. Van is moving the load from the Marina.', 'info');
      } else if (op.phase === 'drive' && v!.parked) {
        unload(op);
        endOp(op);
      }
      break;
    }
    case 'contract': {
      if (op.phase === 'drive') {
        const smart = crewOf(op).reduce((a, g) => a + g.smarts, 0) / Math.max(1, op.crew.length);
        if (Math.random() < dt * 0.0004 * stars() * (1.4 - smart * 0.1)) {
          for (const g of crewOf(op)) arrest(g, `${goonName(g)} got pulled over with the package. Arrested.`);
          pulledOver(op);
          break;
        }
        if (v!.parked) { op.phase = 'work'; op.timer = 25; }
      } else if (op.phase === 'work') {
        op.timer -= dt;
        if (op.timer > 0) break;
        if (op.legs.length) {
          const next = op.legs.shift()!;
          op.vehicle!.route = routeBetween(op.block, next);
          op.vehicle!.parked = false;
          op.block = next;
          op.phase = 'drive';
        } else {
          state.dirty += op.reward;
          state.stats.earned += op.reward;
          toast(`Package delivered. ${money(op.reward)} in your pocket.`, 'good');
          bus.emit('cash', { x: op.vehicle!.x, y: op.vehicle!.y, amount: op.reward });
          goHome(op);
        }
      } else if (op.phase === 'return' && v!.parked) {
        releaseCrew(op);
        endOp(op);
      } else if (op.phase === 'leave' && v!.parked) endOp(op);
      break;
    }
    case 'attack': {
      if (op.phase === 'drive' && v!.parked) {
        if (blockOwner(op.block) !== 0) { leaveFrom(op); break; }
        op.phase = 'work';
        op.balance = 0;
        toast(`${GANGS[op.gang].name} are hitting ${map.blocks[op.block].name}! Send guards!`, 'bad');
        bus.emit('changed');
      } else if (op.phase === 'work') {
        if (blockOwner(op.block) !== 0) { leaveFrom(op); break; }
        const def = blockDefense(op.block);
        fight(op, op.power, def, dt);
        const guards = guardsOn(op.block);
        if (guards.length && Math.random() < dt * 0.02 * (op.power / (op.power + def))) hurt(pick(guards), null);
        if (op.balance >= 1) {
          loseBlock(op.block, op.gang);
          leaveFrom(op);
        } else if (op.balance <= -1) {
          state.gangs[op.gang].power = Math.max(0.6, state.gangs[op.gang].power - 0.08);
          state.turf[op.block].inf = Math.min(100, state.turf[op.block].inf + 10);
          toast(`Your crew held ${map.blocks[op.block].name}. ${GANGS[op.gang].name} ran off.`, 'good');
          leaveFrom(op);
          bus.emit('changed');
        }
      } else if (op.phase === 'leave' && v!.parked) endOp(op);
      break;
    }
    case 'bust': {
      if (op.phase === 'drive' && v!.parked) {
        const g = state.goons.find((x) => x.id === op.target);
        if (g && g.status === 'posted' && g.post?.block === op.block) {
          arrest(g, `Vice squad busted ${goonName(g)} on ${map.blocks[op.block].name}.`);
          bus.emit('fx', { block: op.block, kind: 'bust' });
        }
        op.timer = 20;
        op.phase = 'work';
      } else if (op.phase === 'work') {
        op.timer -= dt;
        if (op.timer <= 0) leaveFrom(op);
      } else if (op.phase === 'leave' && v!.parked) endOp(op);
      break;
    }
  }
}

/** Only valid while parked at op.block. */
function leaveFrom(op: Op) {
  releaseCrew(op);
  leaveMap(op, op.block);
}

/** Vehicle gets pulled over mid-route: flashing lights, then it's gone. */
function pulledOver(op: Op) {
  const v = op.vehicle!;
  bus.emit('fx', { x: v.x, y: v.y, kind: 'pullover' });
  endOp(op);
}

function unload(op: Op) {
  if (!op.cargo) return;
  let free = stashCap() - stashTotal();
  let dumped = 0;
  for (const p of PRODUCT_IDS) {
    const n = Math.min(op.cargo[p], Math.max(0, free));
    state.stash[p] += n;
    free -= n;
    dumped += op.cargo[p] - n;
  }
  op.cargo = null;
  toast(dumped ? `Delivery in, but the stash is full: ${dumped} dumped in the canal.` : 'Delivery stashed.', dumped ? 'warn' : 'good');
  bus.emit('changed');
}

function endOp(op: Op) {
  releaseCrew(op);
  if (op.vehicle) op.vehicle.gone = true;
  state.ops = state.ops.filter((o) => o !== op);
  bus.emit('changed');
}

function winBlock(op: Op) {
  const prev = state.turf[op.block].owner;
  state.turf[op.block] = { owner: 0, inf: 35 };
  state.stats.taken++;
  state.heat = Math.min(100, state.heat + (prev > 0 ? 10 : 4));
  for (const g of crewOf(op)) {
    g.status = 'posted';
    g.post = { kind: 'guard', block: op.block };
    g.opId = null;
  }
  op.crew = [];
  toast(`${map.blocks[op.block].name} is yours now.`, 'good');
  bus.emit('fx', { block: op.block, kind: 'win' });
  if (prev > 0 && !state.turf.some((t) => t.owner === prev)) {
    state.gangs[prev].alive = false;
    toast(`${GANGS[prev].name} are finished. ${GANGS[prev].boss} skipped town.`, 'good');
  }
  goHome(op);
  bus.emit('changed');
}

function loseBlock(block: number, gang: number) {
  state.turf[block] = { owner: gang, inf: 40 };
  for (const g of guardsOn(block)) {
    g.status = g.hp < 40 ? 'hurt' : 'idle';
    g.post = null;
    g.note = 'Ran home';
  }
  // cancel our own ops heading there
  toast(`${GANGS[gang].name} took ${map.blocks[block].name}.`, 'bad');
  bus.emit('fx', { block, kind: 'lose' });
  if (!playerBlocks().length) bus.emit('gameover');
  bus.emit('changed');
}

// ---------------------------------------------------------------------------
// street sales

function salesBonus(block: number) {
  let s = 0;
  const near = [block, ...neighbours(map, block)];
  for (const k of Object.keys(state.biz)) {
    const id = Number(k);
    if (!bizActive(id) || !near.includes(map.lots[id].block)) continue;
    s += bizFx(id)!.sales;
  }
  return s;
}

function priceBonus() {
  return Object.keys(state.biz).map(Number).some((id) => bizActive(id) && map.lots[id].kind === 'pawnshop' && state.biz[id].mode === 'owned') ? 0.1 : 0;
}

function stepCorners(dt: number) {
  for (const g of state.goons) {
    if (g.status !== 'posted' || g.post?.kind !== 'corner') continue;
    const block = g.post.block;
    if (blockOwner(block) !== 0) continue;
    const d = DISTRICTS[map.blocks[block].district];
    const avail = PRODUCT_IDS.filter((p) => state.stash[p] > 0);
    if (!avail.length) { g.note = 'Dry. Needs product.'; continue; }
    g.note = 'Slinging';
    const dem = avail.reduce((a, p) => a + d.demand[p], 0) / avail.length;
    g.saleAcc += dt * 0.035 * dem * (1 + salesBonus(block)) * (0.6 + g.smarts * 0.06);
    while (g.saleAcc >= 1) {
      g.saleAcc -= 1;
      const pool = PRODUCT_IDS.filter((p) => state.stash[p] > 0);
      if (!pool.length) break;
      const weights = pool.map((p) => d.demand[p] * PRODUCTS[p].sell);
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let prod: ProductId = pool[0];
      for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { prod = pool[i]; break; } }
      state.stash[prod]--;
      const amount = Math.round(PRODUCTS[prod].sell * d.price * (1 + priceBonus()) * (0.9 + Math.random() * 0.2));
      state.dirty += amount;
      state.stats.earned += amount;
      state.stats.sold++;
      g.earned += amount;
      state.heat = Math.min(100, state.heat + PRODUCTS[prod].heat * d.police);
      bus.emit('sale', { goon: g.id, amount, product: prod });
    }
  }
}

// ---------------------------------------------------------------------------
// main loop

let lastHour = -1;

export function resetClock() {
  lastHour = Math.floor(state.minutes / 60);
}

export function update(dtGame: number) {
  const steps = Math.max(1, Math.ceil(dtGame / 2));
  const dt = dtGame / steps;
  for (let i = 0; i < steps; i++) tick(dt);
}

function tick(dt: number) {
  const prevDay = Math.floor(state.minutes / DAY);
  state.minutes += dt;

  for (const op of [...state.ops]) stepOp(op, dt);
  stepCorners(dt);

  // business income and laundering
  let launder = 0;
  for (const k of Object.keys(state.biz)) {
    const id = Number(k);
    if (!bizActive(id)) continue;
    const def = BIZ[map.lots[id].kind as BizKind];
    const fx = bizFx(id)!;
    const inc = (def.income * fx.income * dt) / DAY;
    state.dirty += inc;
    launder += fx.launder;
  }
  const amt = Math.min(state.dirty, (launder / DAY) * dt);
  if (amt > 0) {
    state.dirty -= amt;
    state.clean += amt * (1 - LAUNDER_FEE);
    state.stats.laundered += amt;
  }

  const hour = Math.floor(state.minutes / 60);
  if (hour !== lastHour) {
    if (lastHour !== -1) hourly();
    lastHour = hour;
  }
  if (Math.floor(state.minutes / DAY) !== prevDay) daily();
  phoneTick();
}

function heatDecayMult() {
  let m = 1;
  for (const k of Object.keys(state.biz)) {
    const id = Number(k);
    if (bizActive(id)) m += bizFx(id)!.heat;
  }
  return Math.min(3, m);
}

function hourly() {
  state.heat = Math.max(0, state.heat - 0.5 * heatDecayMult());
  const s = stars();

  // healing & jail
  let heal = 1;
  for (const k of Object.keys(state.biz)) if (bizActive(Number(k))) heal += bizFx(Number(k))!.heal;
  for (const g of state.goons) {
    if (g.status === 'hurt') {
      g.hp = Math.min(100, g.hp + 3 * heal);
      if (g.hp >= 70) { g.status = 'idle'; g.note = 'Back on his feet'; }
    } else if (g.status !== 'jail') g.hp = Math.min(100, g.hp + 1);
    if (g.status === 'jail' && state.minutes >= g.jailUntil) {
      g.status = 'idle';
      g.note = 'Out on parole';
      toast(`${goonName(g)} is out of jail.`, 'info');
    }
  }

  // influence
  state.turf.forEach((t, i) => {
    if (t.owner === 0) {
      const gs = guardsOn(i).filter((g) => g.post?.kind === 'guard').length;
      const threatened = neighbours(map, i).some((n) => state.turf[n].owner > 0);
      t.inf = Math.max(0, Math.min(100, t.inf + (gs ? 3 * gs : threatened ? -1.5 : 0.5)));
    } else if (t.owner > 0) t.inf = Math.min(100, t.inf + 0.5);
  });

  // police busts on corners
  if (s >= 2) {
    for (const g of state.goons) {
      if (g.status !== 'posted' || g.post?.kind !== 'corner') continue;
      if (state.ops.some((o) => o.kind === 'bust' && o.target === g.id)) continue;
      const p = ((state.heat - 30) / 70) * 0.07 * (1.3 - g.nerve * 0.08);
      if (Math.random() < p) dispatchCops(g);
    }
  }
  // raids on stash buildings
  if (s >= 4) {
    for (const k of Object.keys(state.biz)) {
      const id = Number(k);
      if (!bizActive(id) || bizFx(id)!.stash <= 0) continue;
      const def = bizFx(id)!.defense;
      if (Math.random() > (0.03 * (s - 3)) / (1 + def / 3)) continue;
      const lostFrac = Math.min(1, bizFx(id)!.stash / Math.max(1, stashCap()));
      let lost = 0;
      for (const p of PRODUCT_IDS) { const n = Math.round(state.stash[p] * lostFrac); state.stash[p] -= n; lost += n; }
      const fine = Math.round(state.dirty * 0.2);
      state.dirty -= fine;
      state.heat = Math.max(0, state.heat - 25);
      toast(`DEA raided ${map.lots[id].name}! Lost ${lost} product and ${money(fine)}.`, 'bad');
      bus.emit('fx', { block: map.lots[id].block, kind: 'bust' });
      break;
    }
  }

  rivalAI();
  bus.emit('changed');
}

function dispatchCops(g: Goon) {
  const block = g.post!.block;
  const j = randInt(0, BY);
  const start = { x: -40, y: node(0, j).y };
  const v = makeVehicle('cop', start, routeFromNode(0, j, block), 20);
  const op = newOp('bust', -1, [], g.id, block, v);
  op.target = g.id;
}

function rivalAI() {
  for (let gi = 1; gi < state.gangs.length; gi++) {
    const gs = state.gangs[gi];
    if (!gs.alive || state.minutes < gs.nextMove) continue;
    gs.nextMove = state.minutes + (randInt(5, 11) * 60) / gs.aggression;
    const theirs = state.turf.map((t, i) => (t.owner === gi ? i : -1)).filter((i) => i >= 0);
    const front = new Set<number>();
    for (const b of theirs) for (const n of neighbours(map, b)) front.add(n);
    const mine = [...front].filter((b) => state.turf[b].owner === 0);
    const neutral = [...front].filter((b) => state.turf[b].owner === -1);
    const attacking = state.ops.some((o) => o.kind === 'attack' && o.gang === gi);
    const truce = state.minutes < gs.truceUntil;
    if (mine.length && !attacking && !truce && Math.random() < 0.65 && state.minutes > 30 * 60) {
      const target = pick(mine);
      const from = theirs.find((b) => neighbours(map, b).includes(target)) ?? pick(theirs);
      const v = makeVehicle('rival', curb(from), routeBetween(from, target), 15);
      const op = newOp('attack', gi, [], target, target, v);
      op.power = 5 * gs.power * (0.8 + Math.random() * 0.6);
      bus.emit('changed');
    } else if (neutral.length && Math.random() < 0.5) {
      const target = pick(neutral);
      state.turf[target] = { owner: gi, inf: 40 };
      toast(`${GANGS[gi].name} moved into ${map.blocks[target].name}.`, 'warn');
    }
  }
}

function daily() {
  const total = state.goons.reduce((a, g) => a + (g.status === 'jail' ? 0 : g.wage), 0);
  let owed = total;
  const fromDirty = Math.min(state.dirty, owed);
  state.dirty -= fromDirty;
  owed -= fromDirty;
  const fromClean = Math.min(state.clean, owed);
  state.clean -= fromClean;
  owed -= fromClean;
  if (owed > 0) {
    const free = state.goons.filter((g) => g.status === 'idle' || g.status === 'posted');
    if (free.length) {
      const g = pick(free);
      state.goons = state.goons.filter((x) => x !== g);
      toast(`Payroll bounced. ${goonName(g)} walked out.`, 'bad');
    }
  }
  // rival gangs grow
  for (let gi = 1; gi < state.gangs.length; gi++) {
    const n = state.turf.filter((t) => t.owner === gi).length;
    if (state.gangs[gi].alive) state.gangs[gi].power = Math.min(3, state.gangs[gi].power + 0.03 * n);
  }
  let recruits = 3;
  for (const k of Object.keys(state.biz)) if (bizActive(Number(k))) recruits += bizFx(Number(k))!.recruits;
  state.candidates = Array.from({ length: Math.min(8, recruits) }, () => makeCandidate());
  const c = clock(state.minutes);
  toast(`DAY ${c.day}. Paid ${money(total - owed)} in wages.`, 'info');
  saveGame();
  bus.emit('saved');
}

// ---------------------------------------------------------------------------
// player actions

function idleGoons(ids: number[]) {
  return ids.map((id) => state.goons.find((g) => g.id === id)).filter((g): g is Goon => !!g && g.status === 'idle');
}

export function sendPost(ids: number[], block: number, kind: 'corner' | 'guard') {
  const crew = idleGoons(ids);
  if (!crew.length || blockOwner(block) !== 0) return false;
  const base = baseBlock(block);
  const v = makeVehicle('crew', curb(base), routeBetween(base, block), carSpeed());
  const op = newOp('drop', 0, crew.map((g) => g.id), block, block, v);
  op.postAs = kind;
  bus.emit('changed');
  return true;
}

export function recall(id: number) {
  const g = state.goons.find((x) => x.id === id);
  if (!g || g.status !== 'posted') return;
  g.status = 'idle';
  g.post = null;
  g.note = 'Back at the stash house';
  bus.emit('changed');
}

export function startTakeover(ids: number[], block: number) {
  const crew = idleGoons(ids);
  if (!crew.length || blockOwner(block) === 0 || !adjacentToPlayer(block)) return false;
  const base = baseBlock(block);
  const v = makeVehicle('crew', curb(base), routeBetween(base, block), carSpeed());
  newOp('takeover', 0, crew.map((g) => g.id), block, block, v);
  bus.emit('changed');
  return true;
}

export function startExtort(ids: number[], lotId: number) {
  const crew = idleGoons(ids);
  const block = map.lots[lotId].block;
  if (!crew.length || blockOwner(block) !== 0 || state.biz[lotId]) return false;
  const base = baseBlock(block);
  const v = makeVehicle('crew', curb(base), routeBetween(base, block), carSpeed());
  newOp('extort', 0, crew.map((g) => g.id), lotId, block, v);
  bus.emit('changed');
  return true;
}

export function startContract(ids: number[], from: number, to: number, reward: number) {
  const crew = idleGoons(ids);
  if (!crew.length) return false;
  const base = baseBlock(from);
  const v = makeVehicle('crew', curb(base), routeBetween(base, from), carSpeed());
  const op = newOp('contract', 0, crew.map((g) => g.id), from, from, v);
  op.legs = [to];
  op.reward = reward;
  bus.emit('changed');
  return true;
}

export function orderFromSal(order: Record<ProductId, number>, unitPrice?: Partial<Record<ProductId, number>>) {
  const cost = PRODUCT_IDS.reduce((a, p) => a + order[p] * (unitPrice?.[p] ?? PRODUCTS[p].sal), 0);
  const qty = PRODUCT_IDS.reduce((a, p) => a + order[p], 0);
  if (!qty) return false;
  if (state.dirty < cost) { toast('Sal only takes cash. Dirty cash. You don\'t have enough.', 'warn'); return false; }
  state.dirty -= cost;
  const base = baseBlock();
  const j = randInt(0, BY);
  const v = makeVehicle('van', { x: -40, y: node(0, j).y }, routeFromNode(0, j, base), 12);
  const op = newOp('delivery', -1, [], base, base, v);
  op.cargo = { ...order };
  state.stats.orders++;
  toast(`Sal's van is on the way with ${qty} product.`, 'info');
  bus.emit('changed');
  return true;
}

export function importShipment(order: Record<ProductId, number>) {
  if (!bizActive(map.marinaLot) || state.biz[map.marinaLot].mode !== 'owned') return false;
  const cost = PRODUCT_IDS.reduce((a, p) => a + order[p] * PRODUCTS[p].marina, 0);
  if (!PRODUCT_IDS.some((p) => order[p] > 0)) return false;
  if (state.dirty < cost) { toast('Not enough dirty cash for the shipment.', 'warn'); return false; }
  state.dirty -= cost;
  const ml = map.lots[map.marinaLot];
  const dock = { x: (ml.x + ml.w + 9) * TILE, y: (ml.y + ml.h / 2) * TILE };
  const fast = state.biz[map.marinaLot].upgrades.includes('speedboat');
  const v = makeVehicle('boat', { x: WORLD_W + 60, y: dock.y - 120 }, [{ x: WORLD_W - 120, y: dock.y - 60 }, dock], fast ? 2.2 : 1.1);
  const op = newOp('import', 0, [], map.marinaLot, ml.block, v);
  op.phase = 'sail';
  op.cargo = { ...order };
  toast('Shipment ordered. Watch the horizon.', 'info');
  bus.emit('changed');
  return true;
}

export function buyBiz(lotId: number) {
  const l = map.lots[lotId];
  const cur = state.biz[lotId];
  if (l.kind === 'decor' || cur?.mode === 'owned') return false;
  if (blockOwner(l.block) !== 0) { toast('You have to control the block first.', 'warn'); return false; }
  const price = cur ? Math.round(l.price * 0.6) : l.price;
  if (state.clean < price) { toast(`You need ${money(price)} in CLEAN money. Launder some first.`, 'warn'); return false; }
  state.clean -= price;
  state.biz[lotId] = { mode: 'owned', upgrades: cur?.upgrades ?? [] };
  toast(`You own ${l.name} now.`, 'good');
  bus.emit('changed');
  return true;
}

export function sellBiz(lotId: number) {
  const l = map.lots[lotId];
  const b = state.biz[lotId];
  if (!b || lotId === map.starterLot) return;
  delete state.biz[lotId];
  if (b.mode === 'owned') state.clean += Math.round(l.price * 0.5);
  toast(b.mode === 'owned' ? `Sold ${l.name}.` : `You stopped shaking down ${l.name}.`, 'info');
  bus.emit('changed');
}

export function buyUpgrade(lotId: number, upId: string) {
  const l = map.lots[lotId];
  const b = state.biz[lotId];
  if (!b || b.mode !== 'owned' || l.kind === 'decor') return false;
  const u = BIZ[l.kind].upgrades.find((x) => x.id === upId);
  if (!u || b.upgrades.includes(upId)) return false;
  if (state.dirty < u.cost) { toast('Not enough dirty cash.', 'warn'); return false; }
  state.dirty -= u.cost;
  b.upgrades.push(upId);
  toast(`Installed: ${u.name}.`, 'good');
  bus.emit('changed');
  return true;
}

export function hire(idx: number) {
  const c = state.candidates[idx];
  if (!c) return false;
  if (state.dirty + state.clean < c.wage) { toast('You can\'t even cover a day of wages.', 'warn'); return false; }
  const g = goonFrom(c);
  state.goons.push(g);
  state.candidates.splice(idx, 1);
  state.stats.hired++;
  toast(`${goonName(g)} joined the crew.`, 'good');
  bus.emit('changed');
  return true;
}

export function fire(id: number) {
  const g = state.goons.find((x) => x.id === id);
  if (!g || g.status === 'op') return;
  state.goons = state.goons.filter((x) => x !== g);
  if (view.selection?.type === 'goon' && view.selection.id === id) view.selection = null;
  toast(`${goonName(g)} is off the payroll.`, 'info');
  bus.emit('changed');
}

export function bail(id: number) {
  const g = state.goons.find((x) => x.id === id);
  if (!g || g.status !== 'jail') return;
  const cost = bailCost(g);
  if (state.clean < cost) { toast('The lawyer only takes clean money.', 'warn'); return; }
  state.clean -= cost;
  g.status = 'idle';
  g.note = 'Bailed out';
  toast(`${goonName(g)} is out on bail.`, 'good');
  bus.emit('changed');
}

export function bribeCost() {
  return Math.round(2500 * (1 + state.bribes * 0.4));
}

export function bribe(amount = bribeCost(), cut = 30) {
  if (state.dirty < amount) { toast('Not enough dirty cash for Captain Morales.', 'warn'); return false; }
  state.dirty -= amount;
  state.bribes++;
  state.heat = Math.max(0, state.heat - cut);
  toast(`Captain Morales "lost" a few files. Heat down.`, 'good');
  bus.emit('changed');
  return true;
}

// ---------------------------------------------------------------------------
// objectives

export interface Objective { id: string; text: string; done: () => boolean }

export const OBJECTIVES: Objective[] = [
  { id: 'corner', text: 'Put someone on a corner. Click your block.', done: () => state.goons.some((g) => g.post?.kind === 'corner') },
  { id: 'order', text: 'Call Sal and buy more product.', done: () => state.stats.orders > 0 },
  { id: 'earn', text: 'Make $2,500 on the street.', done: () => state.stats.earned >= 2500 },
  { id: 'hire', text: 'Hire some new muscle.', done: () => state.stats.hired > 0 },
  { id: 'take', text: 'Take over a neighbouring block.', done: () => playerBlocks().length >= 2 },
  { id: 'biz', text: 'Buy or shake down a business.', done: () => Object.keys(state.biz).length >= 2 },
  { id: 'launder', text: 'Own a business that launders money.', done: () => Object.keys(state.biz).map(Number).some((id) => state.biz[id].mode === 'owned' && BIZ[map.lots[id].kind as BizKind].launder > 0) },
  { id: 'blocks', text: 'Control 8 blocks.', done: () => playerBlocks().length >= 8 },
  { id: 'marina', text: 'Own the Marina and bring in a boat.', done: () => state.stats.imports > 0 },
  { id: 'wipe', text: 'Wipe out a rival gang.', done: () => state.gangs.some((g, i) => i > 0 && !g.alive) },
  { id: 'city', text: 'Run the whole city.', done: () => state.gangs.every((g, i) => i === 0 || !g.alive) },
];

export function checkObjectives() {
  for (const o of OBJECTIVES) {
    if (state.objectives.includes(o.id)) continue;
    if (o.done()) {
      state.objectives.push(o.id);
      toast(`GOAL DONE: ${o.text}`, 'good');
      bus.emit('changed');
    }
    break;
  }
}
