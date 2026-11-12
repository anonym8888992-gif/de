import { bus, toast } from '../bus';
import { BIZ, DISTRICTS, ITEMS, STATIONS, type BizKind, type ItemId, type ProductId, type StationId } from '../config';
import { bizActive, map, nextId, stashCap, stashTotal, state, workersAt, type Station } from '../state';
import { spend } from './sim';

/** Each worker keeps this many stations running. */
export const STATIONS_PER_WORKER = 2;

const sum = (r: Partial<Record<ItemId, number>>) => Object.values(r).reduce((a, b) => a + (b ?? 0), 0);

export function canProduce(lotId: number) {
  const l = map.lots[lotId];
  return l.kind !== 'decor' && !!BIZ[l.kind as BizKind].prod && state.biz[lotId]?.mode === 'owned';
}

export function hasInputs(r: { in: Partial<Record<ItemId, number>> }) {
  return (Object.keys(r.in) as ItemId[]).every((k) => state.stash[k] >= (r.in[k] ?? 0));
}

export function tickProduction(dt: number) {
  for (const k of Object.keys(state.biz)) {
    const id = Number(k);
    const b = state.biz[id];
    if (!b.stations.length) continue;
    const active = bizActive(id);
    const workers = workersAt(id);
    const cap = workers.length * STATIONS_PER_WORKER;
    const smarts = workers.length ? workers.reduce((a, g) => a + g.smarts, 0) / workers.length : 0;
    const speed = 0.7 + smarts * 0.06;
    const police = DISTRICTS[map.blocks[map.lots[id].block].district].police;
    let staffed = 0;
    for (const st of b.stations) {
      const r = STATIONS[st.type].recipes[st.recipe];
      if (!active || staffed >= cap) {
        st.status = 'nostaff';
        continue;
      }
      if (!st.loaded) {
        if (!hasInputs(r)) {
          st.status = 'noinput';
          continue;
        }
        for (const [item, n] of Object.entries(r.in) as [ItemId, number][]) state.stash[item] -= n;
        st.loaded = true;
        st.progress = 0;
        state.heat = Math.min(100, state.heat + r.heat * police);
      }
      staffed++;
      if (st.progress < 1) {
        st.progress = Math.min(1, st.progress + (dt / r.time) * speed);
        st.status = 'running';
      }
      if (st.progress >= 1) {
        // outputs need room; inputs are already out of the stash
        if (stashCap() - stashTotal() < sum(r.out)) {
          st.status = 'full';
          continue;
        }
        for (const [item, n] of Object.entries(r.out) as [ItemId, number][]) {
          state.stash[item] += n;
          if (ITEMS[item].sell) state.stats.made[item as ProductId] = (state.stats.made[item as ProductId] ?? 0) + n;
        }
        st.loaded = false;
        st.progress = 0;
        st.status = 'idle';
        bus.emit('batch', { lot: id, station: st.id, out: r.out });
      }
    }
  }
}

export function placeStation(lotId: number, type: StationId, x: number, y: number) {
  const def = STATIONS[type];
  if (!canProduce(lotId)) return false;
  if (state.dirty + state.clean < def.cost) {
    toast(`A ${def.name} costs ${def.cost}. Not enough cash.`, 'warn');
    return false;
  }
  spend(def.cost);
  const st: Station = { id: nextId(), type, x, y, recipe: 0, progress: 0, loaded: false, status: 'idle' };
  state.biz[lotId].stations.push(st);
  bus.emit('changed');
  return true;
}

export function removeStation(lotId: number, stationId: number) {
  const b = state.biz[lotId];
  const st = b?.stations.find((s) => s.id === stationId);
  if (!st) return;
  b.stations = b.stations.filter((s) => s !== st);
  state.dirty += Math.round(STATIONS[st.type].cost * 0.5);
  toast(`Sold the ${STATIONS[st.type].name}${st.loaded ? '. The batch inside was lost' : ''}.`, 'info');
  bus.emit('changed');
}

export function setRecipe(lotId: number, stationId: number, idx: number) {
  const st = state.biz[lotId]?.stations.find((s) => s.id === stationId);
  if (!st || st.recipe === idx) return;
  if (st.loaded) {
    toast('Wait for the current batch to finish first.', 'warn');
    return;
  }
  st.recipe = idx;
  bus.emit('changed');
}

export function findStation(lotId: number, stationId: number) {
  return state.biz[lotId]?.stations.find((s) => s.id === stationId) ?? null;
}

export function statusText(st: Station) {
  switch (st.status) {
    case 'running': return 'WORKING';
    case 'nostaff': return 'NEEDS A WORKER';
    case 'noinput': return 'MISSING INPUTS';
    case 'full': return 'STASH FULL';
    default: return 'READY';
  }
}
