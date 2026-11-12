import { bus } from '../bus';
import {
  DISTRICTS, LAUNDER_FEE, PRODUCTS, PRODUCT_IDS, PROP_KINDS, ROLES, ROLE_IDS, STATIONS, STATION_TYPES, SUPPLY_PRICE,
  type Role, type StationType,
} from '../config';
import {
  bribe, bribeCost, buyProperty, buySupplies, hire, moveWorker, OBJECTIVES, removeStation, removeWorker, sellProperty,
  setDealerDistrict,
} from '../sim/sim';
import {
  clock, hasSave, isFront, loadGame, map, money, newGame, saveGame, setState, state, view, workersAt,
} from '../state';
import { nightFactor } from '../scenes/CityScene';

const $ = (id: string) => document.getElementById(id)!;
const STATION_ICON: Record<StationType, string> = { tent: '⛺', table: '🧰', stash: '🔐', lab: '⚗️' };

let hireRole: Role | null = null;
let modal: 'empire' | 'help' | null = null;
let empireTab: 'overview' | 'prices' | 'districts' | 'properties' | 'crew' = 'overview';
const last: Record<string, string> = {};

function set(id: string, html: string) {
  if (last[id] === html) return;
  last[id] = html;
  $(id).innerHTML = html;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function stars(n: number) {
  return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';
}

function heatBar(h: number) {
  const col = h > 70 ? '#ff4d4d' : h > 40 ? '#ffb74d' : '#66bb6a';
  return `<div class="bar"><div style="width:${h.toFixed(0)}%;background:${col}"></div></div>`;
}

// ---------------------------------------------------------------------------

export function initUI() {
  document.getElementById('ui')!.addEventListener('click', onClick);
  document.getElementById('ui')!.addEventListener('input', onInput);
  window.addEventListener('keydown', (e) => {
    if (!view.started || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.code === 'Space') { view.speed = view.speed === 0 ? 1 : 0; e.preventDefault(); }
    if (e.key === '1') view.speed = 1;
    if (e.key === '2') view.speed = 3;
    if (e.key === '3') view.speed = 8;
    if (e.key === 'Tab') { e.preventDefault(); modal = modal ? null : 'empire'; render(); }
  });
  bus.on('toast', ({ msg, kind }) => addToast(msg, kind));
  bus.on('select', () => { hireRole = null; render(); });
  bus.on('changed', render);
  bus.on('placing', render);
  bus.on('scene', render);
  bus.on('saved', () => flashSaved());
  bus.on('hover', (h: { lot: number; x: number; y: number } | null) => tooltip(h));
  setInterval(render, 400);
  renderTitle();
  render();
}

function render() {
  if (!view.started) return;
  renderTop();
  renderObjectives();
  renderPanel();
  renderToolbar();
}

// ---------------------------------------------------------------------------
// top bar

function renderTop() {
  const c = clock(state.minutes);
  const stock = Object.values(state.properties).reduce((a, p) => a + p.stash.herb + p.stash.crystal, 0)
    + state.workers.reduce((a, w) => a + w.bag.herb + w.bag.crystal, 0);
  const night = nightFactor(state.minutes) > 0.5;
  const sp = (n: number, label: string, title: string) => `<button class="sp ${view.speed === n ? 'on' : ''}" data-action="speed" data-v="${n}" title="${title}">${label}</button>`;
  set('topbar', `
    <div class="brand"><span class="b1">TOTALLY LEGIT</span><span class="b2">BUSINESS CO.</span></div>
    <div class="stat clean" title="Clean money: buys property. Get it by laundering dirty money through fronts."><i>🧼</i><div><small>CLEAN</small><b>${money(state.clean)}</b></div></div>
    <div class="stat dirty" title="Dirty money: from street sales. Pays for equipment, wages and bribes."><i>💵</i><div><small>DIRTY</small><b>${money(state.dirty)}</b></div></div>
    <div class="stat"><i>🛍️</i><div><small>PRODUCT</small><b>${stock}</b></div></div>
    <div class="stat"><i>👥</i><div><small>CREW</small><b>${state.workers.length}</b></div></div>
    <div class="spacer"></div>
    <div class="clock"><i>${night ? '🌙' : '☀️'}</i><div><small>DAY ${c.day}</small><b>${c.hh}:${c.mm}</b></div></div>
    <div class="speeds">${sp(0, '❚❚', 'Pause (Space)')}${sp(1, '▶', 'Normal (1)')}${sp(3, '▶▶', 'Fast (2)')}${sp(8, '▶▶▶', 'Very fast (3)')}</div>
    <button class="btn ghost" data-action="empire" title="Empire overview (Tab)">📊 Empire</button>
    <button class="btn ghost" data-action="save" title="Save game">💾</button>
    <button class="btn ghost" data-action="help" title="How to play">❓</button>
  `);
}

function flashSaved() {
  addToast('💾 Game saved.', 'info');
}

function renderObjectives() {
  const idx = OBJECTIVES.findIndex((o) => !state.objectives.includes(o.id));
  if (idx < 0) return set('objectives', `<div class="obj done">🏆 You are a kingpin. Keep expanding!</div>`);
  const o = OBJECTIVES[idx];
  set('objectives', `
    <div class="obj">
      <div class="obj-h">GOAL ${idx + 1}/${OBJECTIVES.length}</div>
      <div class="obj-t">${o.text}</div>
      <div class="obj-p"><div style="width:${(idx / OBJECTIVES.length) * 100}%"></div></div>
    </div>`);
}

// ---------------------------------------------------------------------------
// side panel

function renderPanel() {
  const sel = view.selection;
  let html = '';
  if (modal) html = '';
  else if (sel?.type === 'lot') html = view.scene === 'interior' && sel.id === view.propertyId ? interiorPanel(sel.id) : lotPanel(sel.id);
  else if (sel?.type === 'district') html = districtPanel(sel.id);
  else if (sel?.type === 'worker') html = workerPanel(sel.id);
  else if (sel?.type === 'station') html = stationPanel(sel.id);
  else if (view.scene === 'interior' && view.propertyId !== null) html = interiorPanel(view.propertyId);
  if (hireRole && view.scene === 'interior') html = hirePanel(hireRole);
  if (modal === 'empire') html = '';
  $('panel').classList.toggle('hidden', !html && !modal);
  $('panel').classList.toggle('wide', !!modal);
  if (modal) {
    if (document.activeElement?.tagName === 'INPUT') return;
    set('panel', modal === 'empire' ? empireModal() : helpModal());
    return;
  }
  set('panel', html);
}

function closeBtn() {
  return `<button class="x" data-action="close">✕</button>`;
}

function lotPanel(id: number) {
  const l = map.lots[id];
  const def = PROP_KINDS[l.kind];
  const owned = !!state.properties[id];
  const d = DISTRICTS[l.district];
  const front = !!def.launder;
  let body = '';
  if (front) {
    body += `<div class="kv"><span>Launders</span><b>${money(def.launder!)}/day</b></div>
      <div class="kv"><span>Fee</span><b>${LAUNDER_FEE * 100}%</b></div>
      <p class="hint">Fronts turn dirty cash into clean cash automatically and make cops in ${d.name} a little less curious.</p>`;
  } else {
    const [w, h] = def.interior!;
    body += `<div class="kv"><span>Floor space</span><b>${w} × ${h}</b></div>`;
    body += `<p class="hint">A production site. Build grow tents, labs and packing tables inside and hire a crew.</p>`;
  }
  if (owned && !front) {
    const p = state.properties[id];
    const crew = workersAt(id);
    body += `<div class="kv"><span>Crew</span><b>${crew.length}</b></div>
      <div class="kv"><span>Stash</span><b>🌿${p.stash.herb} 💎${p.stash.crystal} 📦${p.stash.supplies}</b></div>
      <button class="btn primary big" data-action="enter" data-id="${id}">🚪 Go inside</button>`;
  }
  if (!owned) {
    const can = state.clean >= l.price;
    body += `<div class="price">${money(l.price)} <small>clean</small></div>
      <button class="btn primary big" data-action="buy" data-id="${id}" ${can ? '' : 'disabled'}>🔑 Buy property</button>
      ${can ? '' : `<p class="warn">You need ${money(l.price - state.clean)} more clean money.</p>`}`;
  } else if (l.name !== "Grandma's Garage") {
    body += `<button class="btn danger small" data-action="sell" data-id="${id}">Sell for ${money(l.price * 0.6)}</button>`;
  }
  return `${closeBtn()}<div class="ph"><div class="tag" style="background:${d.color}">${d.name}</div><h2>${esc(l.name)}</h2><div class="sub">${def.name}${owned ? ' · <span class="ok">OWNED</span>' : ''}</div></div>${body}`;
}

function districtPanel(id: number) {
  const d = DISTRICTS[id];
  const h = state.heat[id];
  const dealers = state.workers.filter((w) => w.role === 'dealer' && w.district === id).length;
  const demand = PRODUCT_IDS.map((p) => `<div class="kv"><span>${PRODUCTS[p].icon} ${PRODUCTS[p].short} demand</span><b>${demandLabel(d.demand[p])}</b></div>`).join('');
  return `${closeBtn()}<div class="ph"><div class="tag" style="background:${d.color}">DISTRICT</div><h2>${d.name}</h2><div class="sub">${d.blurb}</div></div>
    <div class="kv"><span>Police heat</span><b>${h.toFixed(0)}/100</b></div>${heatBar(h)}
    <div class="kv"><span>Police presence</span><b>${d.police >= 1.2 ? 'Heavy' : d.police >= 0.9 ? 'Normal' : 'Light'}</b></div>
    ${demand}
    <div class="kv"><span>Your dealers here</span><b>${dealers}</b></div>
    <p class="hint">Above 40 heat dealers start getting arrested. Above 60 the cops raid production sites in this district.</p>
    <button class="btn primary" data-action="bribe" data-id="${id}" ${state.dirty >= bribeCost(id) ? '' : 'disabled'}>🍩 Bribe police (−25 heat) · ${money(bribeCost(id))}</button>`;
}

function demandLabel(v: number) {
  return v >= 1.4 ? '<span class="ok">Huge</span>' : v >= 1.1 ? 'High' : v >= 0.85 ? 'Normal' : '<span class="dim">Low</span>';
}

function workerPanel(id: number) {
  const w = state.workers.find((x) => x.id === id);
  if (!w) return '';
  const r = ROLES[w.role];
  const lot = map.lots[w.propertyId];
  let extra = '';
  if (w.role === 'dealer') {
    extra += `<div class="kv"><span>Carrying</span><b>🌿${w.bag.herb} 💎${w.bag.crystal}</b></div>
      <div class="kv"><span>Sales so far</span><b>${money(w.sales)}</b></div>
      <div class="label">Sells in</div><div class="chips">${DISTRICTS.map((d) => `<button class="chip ${w.district === d.id ? 'on' : ''}" data-action="district" data-id="${w.id}" data-v="${d.id}">${d.name}</button>`).join('')}</div>`;
    if (w.inCity) extra += `<button class="btn" data-action="focusWorker" data-id="${w.id}">📍 Find on map</button>`;
  }
  const others = Object.keys(state.properties).map(Number).filter((k) => k !== w.propertyId && !isFront(k));
  if (others.length) {
    extra += `<div class="label">Transfer to</div><div class="chips">${others.map((k) => `<button class="chip" data-action="transfer" data-id="${w.id}" data-v="${k}">${esc(map.lots[k].name)}</button>`).join('')}</div>`;
  }
  return `${closeBtn()}<div class="ph"><div class="tag" style="background:#${r.color.toString(16).padStart(6, '0')};color:#111">${r.icon} ${r.name.toUpperCase()}</div><h2>${esc(w.name)}</h2><div class="sub">"${esc(w.trait)}"</div></div>
    <div class="kv"><span>Skill</span><b class="stars">${stars(w.skill)}</b></div>
    <div class="kv"><span>Wage</span><b>${money(w.wage)}/day</b></div>
    <div class="kv"><span>Works at</span><b>${esc(lot.name)}</b></div>
    <div class="status">${esc(w.status)}</div>
    ${extra}
    <button class="btn danger small" data-action="fire" data-id="${w.id}">Fire ${esc(w.name.split(' ').pop()!)}</button>`;
}

function stationPanel(id: number) {
  const p = view.propertyId !== null ? state.properties[view.propertyId] : null;
  const s = p?.stations.find((x) => x.id === id);
  if (!p || !s) return '';
  const d = STATIONS[s.type];
  let body = `<p class="hint">${d.desc}</p>`;
  if (s.type === 'tent') {
    body += `<div class="kv"><span>Growth</span><b>${Math.floor(s.progress * 100)}%</b></div><div class="bar"><div style="width:${s.progress * 100}%;background:#66bb6a"></div></div>
      <div class="kv"><span>Water</span><b>${Math.floor(s.water)}%</b></div><div class="bar"><div style="width:${s.water}%;background:#4fc3f7"></div></div>`;
    if (!workersAt(p.lotId).some((w) => w.role === 'grower')) body += `<p class="warn">No grower here — plants won't get watered or harvested.</p>`;
  } else if (s.type === 'lab') {
    body += `<div class="kv"><span>State</span><b>${s.labState === 'cooking' ? `Cooking ${Math.floor(s.progress * 100)}%` : s.labState === 'done' ? 'Batch ready' : 'Idle'}</b></div>
      <div class="kv"><span>Supplies in stash</span><b>📦 ${p.stash.supplies}</b></div>
      <p class="hint">Each batch uses 4 supplies (${money(SUPPLY_PRICE)} each).</p>
      <div class="row"><button class="btn" data-action="supplies" data-v="8">Buy 8 · ${money(8 * SUPPLY_PRICE)}</button><button class="btn" data-action="supplies" data-v="40">Buy 40 · ${money(40 * SUPPLY_PRICE)}</button></div>`;
    if (!workersAt(p.lotId).some((w) => w.role === 'cook')) body += `<p class="warn">No cook here. Hire one!</p>`;
  } else if (s.type === 'table') {
    body += `<div class="kv"><span>Raw waiting</span><b>🌿${s.raw.herb} 💎${s.raw.crystal}</b></div>`;
    if (!workersAt(p.lotId).some((w) => w.role === 'packer')) body += `<p class="warn">No packer here. Raw product will pile up.</p>`;
  } else if (s.type === 'stash') {
    body += `<div class="kv"><span>Contents</span><b>🌿${p.stash.herb} 💎${p.stash.crystal} 📦${p.stash.supplies}</b></div>`;
  }
  return `${closeBtn()}<div class="ph"><div class="tag">${STATION_ICON[s.type]} STATION</div><h2>${d.name}</h2></div>${body}
    <button class="btn danger small" data-action="removeStation" data-id="${s.id}">Sell for ${money(d.cost * 0.5)}</button>`;
}

function interiorPanel(id: number) {
  const l = map.lots[id];
  const p = state.properties[id];
  if (!p) return '';
  const crew = workersAt(id);
  const list = crew.length
    ? crew.map((w) => `<div class="crew" data-action="selectWorker" data-id="${w.id}"><span class="ci">${ROLES[w.role].icon}</span><div><b>${esc(w.name)}</b><small>${esc(w.status)}</small></div></div>`).join('')
    : `<p class="hint">No crew yet. Hire someone from the bar below.</p>`;
  return `<div class="ph"><div class="tag" style="background:${DISTRICTS[l.district].color}">${DISTRICTS[l.district].name}</div><h2>${esc(l.name)}</h2><div class="sub">Click stations or workers for details</div></div>
    <div class="kv"><span>Stash</span><b>🌿${p.stash.herb} 💎${p.stash.crystal} 📦${p.stash.supplies}</b></div>
    <div class="row"><button class="btn small" data-action="supplies" data-v="8">Buy 8 supplies · ${money(8 * SUPPLY_PRICE)}</button></div>
    <div class="label">Crew (${crew.length})</div>${list}`;
}

function hirePanel(role: Role) {
  const r = ROLES[role];
  const cands = state.candidates[role];
  const cards = cands.length
    ? cands.map((c, i) => `<div class="cand">
        <div class="cand-h"><b>${esc(c.name)}</b><span class="stars">${stars(c.skill)}</span></div>
        <div class="sub">"${esc(c.trait)}"</div>
        <button class="btn primary" data-action="hire" data-v="${i}">Hire · ${money(c.wage)}/day</button>
      </div>`).join('')
    : `<p class="hint">Nobody else is looking for work today. New applicants arrive tomorrow.</p>`;
  return `<button class="x" data-action="closeHire">✕</button><div class="ph"><div class="tag">${r.icon} HIRING</div><h2>${r.name}</h2><div class="sub">${r.desc}</div></div>${cards}`;
}

// ---------------------------------------------------------------------------
// modal

function empireModal() {
  const tab = (id: typeof empireTab, label: string) => `<button class="tab ${empireTab === id ? 'on' : ''}" data-action="tab" data-v="${id}">${label}</button>`;
  let body = '';
  if (empireTab === 'overview') {
    const wages = state.workers.reduce((a, w) => a + w.wage, 0);
    const laundry = Object.keys(state.properties).map(Number).reduce((a, k) => a + (PROP_KINDS[map.lots[k].kind].launder ?? 0), 0);
    body = `<div class="grid2">
      <div class="card"><small>Net worth</small><b>${money(state.clean + state.dirty)}</b></div>
      <div class="card"><small>Street revenue (all time)</small><b>${money(state.stats.earned)}</b></div>
      <div class="card"><small>Bags sold</small><b>${state.stats.sold}</b></div>
      <div class="card"><small>Laundered</small><b>${money(state.stats.laundered)}</b></div>
      <div class="card"><small>Daily wages</small><b>${money(wages)}</b></div>
      <div class="card"><small>Laundering capacity</small><b>${money(laundry)}/day</b></div>
      <div class="card"><small>Arrests</small><b>${state.stats.arrests}</b></div>
      <div class="card"><small>Raids</small><b>${state.stats.raids}</b></div>
    </div>`;
  } else if (empireTab === 'prices') {
    body = PRODUCT_IDS.map((p) => {
      const v = state.prices[p];
      const price = Math.round(PRODUCTS[p].basePrice * v);
      return `<div class="pricecard"><div class="kv"><span>${PRODUCTS[p].icon} <b>${PRODUCTS[p].name}</b></span><b id="pv-${p}">${money(price)}/bag</b></div>
        <input type="range" min="0.5" max="2" step="0.05" value="${v}" data-action="price" data-p="${p}">
        <div class="kv dim"><span>Cheap = sells fast</span><span>Pricey = fewer buyers</span></div></div>`;
    }).join('') + `<p class="hint">Higher prices mean more money per bag but customers say no more often. Heat comes from every sale, so premium pricing is a way to stay under the radar.</p>`;
  } else if (empireTab === 'districts') {
    body = DISTRICTS.map((d) => `<div class="drow"><div class="tag" style="background:${d.color}">${d.name}</div>
      <div class="dh">${heatBar(state.heat[d.id])}<small>Heat ${state.heat[d.id].toFixed(0)} · 🌿 ${demandLabel(d.demand.herb)} · 💎 ${demandLabel(d.demand.crystal)}</small></div>
      <button class="btn small" data-action="bribe" data-id="${d.id}" ${state.dirty >= bribeCost(d.id) ? '' : 'disabled'}>🍩 ${money(bribeCost(d.id))}</button></div>`).join('');
  } else if (empireTab === 'properties') {
    body = Object.keys(state.properties).map(Number).map((k) => {
      const l = map.lots[k];
      const p = state.properties[k];
      const front = isFront(k);
      return `<div class="drow"><div class="tag" style="background:${DISTRICTS[l.district].color}">${DISTRICTS[l.district].name}</div>
        <div class="dh"><b>${esc(l.name)}</b><small>${front ? `Launders ${money(PROP_KINDS[l.kind].launder!)}/day` : `${workersAt(k).length} crew · ${p.stations.length} stations · 🌿${p.stash.herb} 💎${p.stash.crystal}`}</small></div>
        <button class="btn small" data-action="${front ? 'goto' : 'enter'}" data-id="${k}">${front ? '📍 Show' : '🚪 Enter'}</button></div>`;
    }).join('');
  } else {
    body = state.workers.length ? state.workers.map((w) => `<div class="crew" data-action="selectWorker" data-id="${w.id}"><span class="ci">${ROLES[w.role].icon}</span><div><b>${esc(w.name)}</b> <span class="dim">${ROLES[w.role].name} · ${esc(map.lots[w.propertyId].name)}</span><small>${esc(w.status)}</small></div><span class="wage">${money(w.wage)}</span></div>`).join('') : '<p class="hint">No crew yet.</p>';
  }
  return `${closeBtn()}<div class="ph"><h2>📊 Empire</h2></div>
    <div class="tabs">${tab('overview', 'Overview')}${tab('prices', 'Prices')}${tab('districts', 'Districts')}${tab('properties', 'Properties')}${tab('crew', 'Crew')}</div>
    <div class="tabbody">${body}</div>`;
}

function helpModal() {
  return `${closeBtn()}<div class="ph"><h2>❓ How to run a totally legit business</h2></div>
  <div class="help">
    <p><b>Camera:</b> drag or WASD to move, scroll or Q/E to zoom. Click a building to inspect it, click it again to step inside. Click a street to see that district.</p>
    <p><b>Production:</b> build a ⛺ Grow Tent and hire a Grower. They water and harvest, then carry it to a 🧰 Packing Table. A Packer bags it and puts it in the 🔐 Stash.</p>
    <p><b>Sales:</b> Dealers take bags from the stash and walk to the district you assign. Each sale earns <b>dirty</b> money and raises police <b>heat</b>.</p>
    <p><b>Laundering:</b> buy a front (laundromat, car wash, restaurant) to turn dirty cash into <b>clean</b> money. Clean money buys property.</p>
    <p><b>Heat:</b> too much heat gets dealers arrested and production sites raided. Bribe the police, hire Guards, raise prices or spread your dealers out.</p>
    <p><b>Keys:</b> Space pauses, 1/2/3 sets speed, Tab opens the Empire screen, Esc leaves a building.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// bottom toolbar

function renderToolbar() {
  if (view.scene === 'interior' && view.propertyId !== null) {
    const total = state.dirty + state.clean;
    const build = STATION_TYPES.map((t) => {
      const d = STATIONS[t];
      return `<button class="tool ${view.placing === t ? 'on' : ''}" data-action="place" data-v="${t}" ${total >= d.cost ? '' : 'disabled'} title="${esc(d.desc)}">
        <span class="ti">${STATION_ICON[t]}</span><span class="tn">${d.name}</span><span class="tc">${money(d.cost)}</span></button>`;
    }).join('');
    const hires = ROLE_IDS.map((r) => `<button class="tool ${hireRole === r ? 'on' : ''}" data-action="hireRole" data-v="${r}" title="${esc(ROLES[r].desc)}">
      <span class="ti">${ROLES[r].icon}</span><span class="tn">${ROLES[r].name}</span><span class="tc">~${money(ROLES[r].wage)}/d</span></button>`).join('');
    set('toolbar', `<div class="tb">
      <button class="tool back" data-action="exit"><span class="ti">🏙️</span><span class="tn">Back to city</span><span class="tc">Esc</span></button>
      <div class="group"><div class="gl">BUILD</div><div class="gi">${build}</div></div>
      <div class="group"><div class="gl">HIRE</div><div class="gi">${hires}</div></div>
    </div>${view.placing ? `<div class="placing">Placing <b>${STATIONS[view.placing].name}</b> — click to build, right-click / Esc to stop</div>` : ''}`);
  } else {
    const owned = Object.keys(state.properties).map(Number);
    set('toolbar', `<div class="tb city">
      <div class="hint-pill">🖱️ Drag to move · Scroll to zoom · Click a building to inspect · Click again to enter</div>
      <div class="group"><div class="gl">MY PROPERTIES</div><div class="gi">${owned.map((k) => `<button class="tool slim" data-action="${isFront(k) ? 'goto' : 'enter'}" data-id="${k}"><span class="ti">${isFront(k) ? '🧺' : '🏚️'}</span><span class="tn">${esc(map.lots[k].name)}</span></button>`).join('')}</div></div>
    </div>`);
  }
}

// ---------------------------------------------------------------------------
// events

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  const a = el.dataset.action!;
  const id = Number(el.dataset.id);
  const v = el.dataset.v!;
  switch (a) {
    case 'speed': view.speed = Number(v); break;
    case 'empire': modal = modal === 'empire' ? null : 'empire'; break;
    case 'help': modal = modal === 'help' ? null : 'help'; break;
    case 'tab': empireTab = v as typeof empireTab; break;
    case 'save': if (saveGame()) bus.emit('saved'); break;
    case 'close':
      if (modal) modal = null;
      else view.selection = null;
      bus.emit('select');
      break;
    case 'buy': buyProperty(id); break;
    case 'sell': if (confirm(`Sell ${map.lots[id].name}? Its crew will be let go.`)) { sellProperty(id); view.selection = null; } break;
    case 'enter': modal = null; bus.emit('enter', id); break;
    case 'goto': modal = null; view.selection = { type: 'lot', id }; if (view.scene === 'interior') bus.emit('exit'); bus.emit('focusLot', id); bus.emit('select'); break;
    case 'exit': bus.emit('exit'); break;
    case 'bribe': bribe(id); break;
    case 'district': setDealerDistrict(id, Number(v)); break;
    case 'transfer': moveWorker(id, Number(v)); break;
    case 'fire': if (confirm('Fire this employee?')) removeWorker(id); break;
    case 'focusWorker': {
      const w = state.workers.find((x) => x.id === id);
      if (w) bus.emit('focusPoint', { x: w.cx, y: w.cy });
      break;
    }
    case 'selectWorker': {
      const w = state.workers.find((x) => x.id === id);
      if (!w) break;
      modal = null;
      view.selection = { type: 'worker', id };
      if (view.scene === 'interior' && view.propertyId !== w.propertyId && !w.inCity) bus.emit('enter', w.propertyId);
      view.selection = { type: 'worker', id };
      bus.emit('select');
      break;
    }
    case 'removeStation': if (view.propertyId !== null) removeStation(view.propertyId, id); break;
    case 'supplies': if (view.propertyId !== null) buySupplies(view.propertyId, Number(v)); break;
    case 'place':
      view.placing = view.placing === v ? null : (v as StationType);
      hireRole = null;
      bus.emit('placing');
      break;
    case 'hireRole':
      hireRole = hireRole === v ? null : (v as Role);
      view.placing = null;
      bus.emit('placing');
      break;
    case 'closeHire': hireRole = null; break;
    case 'hire': if (hireRole && view.propertyId !== null) hire(view.propertyId, hireRole, Number(v)); break;
    case 'new': startGame(false); return;
    case 'continue': startGame(true); return;
  }
  render();
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action !== 'price') return;
  const p = el.dataset.p as 'herb' | 'crystal';
  state.prices[p] = Number(el.value);
  const out = document.getElementById(`pv-${p}`);
  if (out) out.textContent = `${money(PRODUCTS[p].basePrice * state.prices[p])}/bag`;
}

// ---------------------------------------------------------------------------
// toasts, tooltip, title

function addToast(msg: string, kind: string) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.prepend(el);
  while (box.children.length > 6) box.lastElementChild!.remove();
  setTimeout(() => el.classList.add('out'), 5500);
  setTimeout(() => el.remove(), 6000);
}

function tooltip(h: { lot: number; x: number; y: number } | null) {
  const el = $('tooltip');
  if (!h || view.scene !== 'city') return el.classList.add('hidden');
  const l = map.lots[h.lot];
  const owned = !!state.properties[h.lot];
  el.innerHTML = `<b>${esc(l.name)}</b><small>${PROP_KINDS[l.kind].name} · ${DISTRICTS[l.district].name}</small>${owned ? '<span class="ok">Owned</span>' : `<span>${money(l.price)}</span>`}`;
  el.style.left = `${h.x + 16}px`;
  el.style.top = `${h.y + 16}px`;
  el.classList.remove('hidden');
}

function renderTitle() {
  const save = hasSave();
  $('title').innerHTML = `<div class="title-card">
    <div class="logo"><span class="b1">TOTALLY LEGIT</span><span class="b2">BUSINESS CO.</span></div>
    <p class="tag-line">Grandma left you her garage, a few thousand dollars and a jar of "oregano".<br>Build an empire. Launder the profits. Keep the cops guessing.</p>
    <div class="title-btns">
      ${save ? '<button class="btn primary big" data-action="continue">▶ Continue</button>' : ''}
      <button class="btn ${save ? '' : 'primary'} big" data-action="new">✦ New Game</button>
    </div>
    <p class="fine">A satirical management game. All products are fictional. Crime doesn't pay (in real life).</p>
  </div>`;
}

function startGame(cont: boolean) {
  if (!(cont && loadGame())) setState(newGame());
  view.started = true;
  view.speed = 1;
  view.selection = null;
  $('title').classList.add('gone');
  bus.emit('started');
  render();
}

