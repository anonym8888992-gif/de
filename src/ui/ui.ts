import { audio, initAudio, setMusic, setSfx, sfx } from '../audio';
import { bus, type ToastKind } from '../bus';
import {
  BIZ, CHAINS, DISTRICTS, GANGS, ITEMS, LAUNDER_FEE, MID_IDS, PRODUCT_IDS, STATIONS, STATION_IDS, SUPPLY_IDS, TILE,
  type BizKind, type ItemId, type StationId, type SupplyId,
} from '../config';
import { answer, introCalls, removeMsg, unread } from '../sim/phone';
import { STATIONS_PER_WORKER, canProduce, findStation, removeStation, setRecipe, statusText as stationStatus } from '../sim/production';
import {
  adjacentToPlayer, bail, bailCost, blockDefense, bribe, bribeCost, buyBiz, buyUpgrade, crewPower, fire,
  guardsOn, hire, importShipment, odds, orderCost, orderFromSal, recall, sellBiz, sendPost, sendToWork, startContract, startExtort, startTakeover,
  type Order,
} from '../sim/sim';
import {
  CHAPTERS, TUTORIAL_LEN, chapter, chapterComplete, chapterFor, currentGoal, finished, goalDone, productUnlocked, recipeUnlocked,
  showChapterIfNeeded, skipTutorial, stationUnlocked, supplyUnlocked, type Goal,
} from '../sim/story';
import {
  bizActive, bizFx, clock, goonName, hasSave, loadGame, map, money, newGame, playerBlocks, saveGame, seedNewGame,
  setState, stars, stashCap, stashTotal, state, view, workersAt, type Goon,
} from '../state';
import { nightFactor } from '../scenes/CityScene';

const $ = (id: string) => document.getElementById(id)!;
const last: Record<string, string> = {};

function set(id: string, html: string) {
  if (last[id] === html) return;
  last[id] = html;
  $(id).innerHTML = html;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

type Modal = null | 'phone' | 'sal' | 'crew' | 'city' | 'help' | 'options' | 'recipes';

interface Picker {
  kind: 'corner' | 'guard' | 'takeover' | 'extort' | 'contract' | 'work';
  target: number;
  max: number;
  selected: number[];
  data?: Record<string, number | string>;
}

const ui = {
  modal: null as Modal,
  crewTab: 'roster' as 'roster' | 'hire',
  salTab: 'sal' as 'sal' | 'marina' | 'stash',
  order: {} as Order,
  openMsg: -1,
  picker: null as Picker | null,
  upgradeFocus: '',
  over: false,
};

/** Coloured item chip, e.g. "8 WET BUD". */
function chip(item: ItemId, n?: number) {
  return `<span class="ichip" style="--ic:${ITEMS[item].css}">${n !== undefined ? `<b>${n}</b> ` : ''}${ITEMS[item].name.toUpperCase()}</span>`;
}

function recipeLine(r: { in: Partial<Record<ItemId, number>>; out: Partial<Record<ItemId, number>> }) {
  const ins = (Object.entries(r.in) as [ItemId, number][]).map(([k, n]) => chip(k, n)).join(' + ');
  const outs = (Object.entries(r.out) as [ItemId, number][]).map(([k, n]) => chip(k, n)).join(' + ');
  return `<div class="recipe">${ins} <i>&gt;&gt;</i> ${outs}</div>`;
}

function seg(v: number, max = 10, col = 'var(--pink)') {
  let s = '<span class="seg">';
  for (let i = 0; i < max; i++) s += `<i style="${i < v ? `background:${col}` : ''}"></i>`;
  return s + '</span>';
}

function bar(frac: number, col: string) {
  return `<div class="bar"><div style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(0)}%;background:${col}"></div></div>`;
}

function starsHtml() {
  const s = stars();
  let out = '';
  for (let i = 0; i < 5; i++) out += `<b class="star ${i < s ? 'on' : ''}">★</b>`;
  return out;
}

// ---------------------------------------------------------------------------

export function initUI() {
  const root = $('ui');
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  bus.on('toast', ({ msg, kind, block }) => addToast(msg, kind, block));
  bus.on('report', showReport);
  bus.on('alarm', () => { const a = $('alarm'); a.classList.remove('on'); void a.offsetWidth; a.classList.add('on'); });
  bus.on('select', () => { ui.picker = null; render(); });
  bus.on('placing', render);
  bus.on('stepdone', () => { sfx('win'); const o = $('objective'); o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); });
  bus.on('changed', render);
  bus.on('scene', () => { ui.picker = null; ui.modal = null; render(); });
  bus.on('saved', () => addToast('SAVED.', 'info'));
  bus.on('ring', (m) => { if (view.started) { addToast(`NEW MESSAGE FROM ${m.from}`, 'warn'); sfx('ring'); } });
  bus.on('hover', tooltip);
  bus.on('upgradeFocus', (id: string) => { ui.upgradeFocus = id; render(); });
  bus.on('gameover', () => { ui.over = true; view.speed = 0; render(); });
  bus.on('story', (i: number) => showStory(i));
  bus.on('victory', showVictory);
  setInterval(render, 300);
  renderTitle();
}

function onKey(e: KeyboardEvent) {
  if (!view.started || ui.over) return;
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') { view.speed = view.speed === 0 ? 1 : 0; e.preventDefault(); }
  else if (e.key === '1') view.speed = 1;
  else if (e.key === '2') view.speed = 2;
  else if (e.key === '3') view.speed = 4;
  else if (e.key === 'p' || e.key === 'P') toggle('phone');
  else if (e.key === 'c' || e.key === 'C') toggle('crew');
  else if (e.key === 'Tab') { e.preventDefault(); toggle('city'); }
  else if (e.key === 'm' || e.key === 'M') setMusic(!audio.music);
  else if (e.key === 'b' || e.key === 'B') toggle('sal');
  else if (e.key === 'r' || e.key === 'R') toggle('recipes');
  else if (e.key === 'Escape') {
    if (ui.picker) ui.picker = null;
    else if (ui.modal) ui.modal = null;
    else if (view.scene === 'city') view.selection = null;
  }
  render();
}

function toggle(m: Modal) {
  ui.modal = ui.modal === m ? null : m;
  ui.picker = null;
}

function render() {
  if (!view.started) return;
  renderTop();
  renderObjective();
  renderPanel();
  renderModal();
  renderBottom();
  renderOver();
}

// ---------------------------------------------------------------------------
// top bar

function renderTop() {
  const c = clock(state.minutes);
  const night = nightFactor(state.minutes) > 0.5;
  const sp = (n: number, label: string) => `<button class="sp ${view.speed === n ? 'on' : ''}" data-a="speed" data-v="${n}">${label}</button>`;
  const cap = stashCap();
  const tot = stashTotal();
  const unr = unread();
  set('topbar', `
    <div class="logo-sm">Neon Kingpin</div>
    <div class="st"><small>DIRTY</small><b class="dirty">${money(state.dirty)}</b></div>
    <div class="st"><small>CLEAN</small><b class="clean">${money(state.clean)}</b></div>
    <div class="st prod" data-a="modal" data-v="sal" data-tab="stash"><small>STASH ${tot}/${cap}</small><b>${PRODUCT_IDS.filter((p) => state.stash[p] > 0).map((p) => `<span class="pd" style="--ic:${ITEMS[p].css}" title="${ITEMS[p].name}">${ITEMS[p].short} ${state.stash[p]}</span>`).join('') || '<span class="dim">NO PRODUCT</span>'}</b></div>
    <div class="st"><small>TURF</small><b>${playerBlocks().length}<span class="dim">/30</span></b></div>
    <div class="st"><small>WANTED</small><b class="stars">${starsHtml()}</b></div>
    <div class="grow"></div>
    <div class="st clock"><small>DAY ${c.day} ${night ? 'NIGHT' : 'DAY'}</small><b>${c.hh}:${c.mm}</b></div>
    <div class="speeds">${sp(0, 'II')}${sp(1, '>')}${sp(2, '>>')}${sp(4, '>>>')}</div>
  `);
  set('menu', `
    <button class="mb ${ui.modal === 'phone' ? 'on' : ''}" data-a="modal" data-v="phone">PHONE${unr ? `<em class="led">${unr}</em>` : ''}<kbd>P</kbd></button>
    <button class="mb ${ui.modal === 'sal' ? 'on' : ''}" data-a="modal" data-v="sal">SUPPLIES<kbd>B</kbd></button>
    <button class="mb ${ui.modal === 'recipes' ? 'on' : ''}" data-a="modal" data-v="recipes">RECIPES<kbd>R</kbd></button>
    <button class="mb ${ui.modal === 'crew' ? 'on' : ''}" data-a="modal" data-v="crew">CREW ${state.goons.length}<kbd>C</kbd></button>
    <button class="mb ${ui.modal === 'city' ? 'on' : ''}" data-a="modal" data-v="city">THE CITY<kbd>TAB</kbd></button>
    <button class="mb sm ${ui.modal === 'help' ? 'on' : ''}" data-a="modal" data-v="help">?</button>
    <button class="mb sm ${ui.modal === 'options' ? 'on' : ''}" data-a="modal" data-v="options">OPT</button>
  `);
}

let tutTarget = '';

function renderObjective() {
  const ch = chapter();
  const idx = CHAPTERS.indexOf(ch);
  if (finished()) {
    return set('objective', `<div class="obj done"><h4>THE END</h4><p class="ot">Miami is yours.</p><p class="od">Seven sins, one city. Keep playing as long as you like.</p></div>`);
  }
  const head = `<div class="chhead"><span class="chnum">${ch.num}</span><div><h4>CHAPTER ${ch.num} · ${ch.sin}</h4><p class="ct">${esc(ch.title)}</p></div><button class="btn tiny" data-a="story" title="Read the story again">STORY</button></div>`;
  let body = '';
  let action = '';
  if (ch.guided) {
    const g = currentGoal();
    if (g) {
      const n = ch.goals.indexOf(g);
      body = `<p class="ot">${g.title}</p><p class="od">${g.text}</p>${progressBar(g)}
        <div class="ob">${g.action ? `<button class="btn gold" data-a="tutAct">${g.action}</button>` : ''}${n < TUTORIAL_LEN - 1 ? '<button class="btn tiny" data-a="tutSkip">SKIP TUTORIAL</button>' : ''}</div>
        <div class="opips">${ch.goals.map((_, i) => `<i class="${i < n ? 'd' : i === n ? 'c' : ''}"></i>`).join('')}</div>`;
      action = g.target ?? '';
    }
  } else {
    body = `<ul class="goals">${ch.goals.map((g) => {
      const done = goalDone(g);
      const pr = !done && g.progress ? g.progress() : null;
      return `<li class="${done ? 'd' : ''}"><i>${done ? 'X' : ''}</i><div><b>${g.title}</b>${!done ? `<small>${g.text}</small>` : ''}${pr ? `<span class="gp">${pr[0].toLocaleString('en-US')} / ${pr[1].toLocaleString('en-US')}</span>` : ''}</div>${!done && g.action ? `<button class="btn tiny gold" data-a="goalAct" data-v="${g.id}">GO</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  if (chapterComplete() && idx < CHAPTERS.length - 1) {
    const next = CHAPTERS[idx + 1];
    body += `<div class="nextch">CHAPTER ${next.num} ARRIVES ON DAY ${next.minDay}.<br><span>Expand, launder, stock up.</span></div>`;
  }
  set('objective', `<div class="obj ${ch.guided ? 'tut' : ''}">${head}${body}</div>`);
  document.querySelectorAll('.tut-glow').forEach((el) => el.classList.remove('tut-glow'));
  tutTarget = action;
  if (tutTarget) document.querySelectorAll(tutTarget).forEach((el) => el.classList.add('tut-glow'));
}

function progressBar(g: Goal) {
  if (!g.progress) return '';
  const [a, b] = g.progress();
  return `<div class="gbar"><div style="width:${(a / b) * 100}%"></div><span>${a.toLocaleString('en-US')} / ${b.toLocaleString('en-US')}</span></div>`;
}

/** SHOW ME: take the player to wherever a goal happens. */
function tutAction(goalId = currentGoal()?.id) {
  if (!goalId) return;
  const hq = map.starterLot;
  const goHQ = () => { if (view.scene !== 'interior' || view.lot !== hq) bus.emit('enter', hq); };
  const place = (t: StationId) => { goHQ(); view.placing = t; bus.emit('placing'); };
  const has = (t: StationId) => Object.values(state.biz).some((b) => b.stations.some((x) => x.type === t));
  const toBlock = (id: number | undefined) => {
    if (id === undefined) return;
    if (view.scene === 'interior') bus.emit('exit');
    const b = map.blocks[id];
    view.selection = { type: 'block', id };
    bus.emit('focus', { x: (b.x + 5) * TILE, y: (b.y + 5) * TILE });
    bus.emit('select');
  };
  switch (goalId) {
    case 'enter': goHQ(); break;
    case 'tent': place('tent'); break;
    case 'dry': place(has('rack') ? 'trim' : 'rack'); break;
    case 'worker': goHQ(); window.setTimeout(() => { ui.picker = { kind: 'work', target: hq, max: 2, selected: [] }; render(); }, 30); break;
    case 'seeds': ui.salTab = 'sal'; ui.order = { seeds: 5, soil: 5 }; ui.modal = 'sal'; break;
    case 'harvest': view.speed = 4; break;
    case 'corner': toBlock(map.lots[hq].block); break;
    case 'still': place(has('barrel') ? 'still' : 'barrel'); break;
    case 'take1': toBlock(map.blocks.find((b) => state.turf[b.id].owner !== 0 && adjacentToPlayer(b.id))?.id); break;
    case 'lab': place(has('reactor') ? 'trays' : 'reactor'); break;
    case 'press': place('press'); break;
    case 'blotter': place('blotter'); break;
    case 'boil': place('boiler'); break;
  }
  render();
}

// ---------------------------------------------------------------------------
// story card & victory

function showStory(idx: number) {
  const ch = CHAPTERS[idx];
  const prev = view.speed;
  view.speed = 0;
  sfx('win');
  const el = $('story');
  el.innerHTML = `<div class="bars"></div><div class="scard">
    <div class="snum">${ch.num}</div>
    <div class="ssin">${ch.sin}</div>
    <h1>${esc(ch.title)}</h1>
    <div class="sfrom">${esc(ch.from)}</div>
    ${ch.story.map((p) => `<p>${esc(p)}</p>`).join('')}
    <div class="sunlock">UNLOCKED: <span class="pd" style="--ic:${ITEMS[ch.product].css}">${ITEMS[ch.product].name.toUpperCase()}</span></div>
    <button class="btn gold big" data-a="storyClose" data-v="${prev || 1}">CONTINUE</button>
  </div>`;
  el.classList.remove('hidden');
}

function showVictory() {
  view.speed = 0;
  sfx('win');
  const c = clock(state.minutes);
  $('story').innerHTML = `<div class="bars"></div><div class="scard win">
    <div class="ssin">EPILOGUE</div><h1>Kingpin</h1>
    <p>Seven sins, one city. The gangs are gone, the cops are paid and Uncle Vic gets out next spring. He is going to have so many questions.</p>
    <div class="grid"><div><small>DAYS</small><b>${c.day}</b></div><div><small>STREET SALES</small><b>${money(state.stats.earned)}</b></div><div><small>BLOCKS TAKEN</small><b>${state.stats.taken}</b></div>
    <div><small>ARRESTS</small><b>${state.stats.arrests}</b></div><div><small>FUNERALS</small><b>${state.stats.deaths}</b></div><div><small>LAUNDERED</small><b>${money(state.stats.laundered)}</b></div></div>
    <button class="btn gold big" data-a="storyClose" data-v="1">KEEP PLAYING</button></div>`;
  $('story').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// right panel: selection / picker

function renderPanel() {
  let html = '';
  if (ui.picker) html = pickerPanel(ui.picker);
  else if (view.scene === 'interior' && view.lot !== null) html = interiorPanel(view.lot);
  else {
    const s = view.selection;
    if (s?.type === 'block') html = blockPanel(s.id);
    else if (s?.type === 'lot') html = lotPanel(s.id);
    else if (s?.type === 'goon') html = goonPanel(s.id);
  }
  if (view.scene === 'interior' && !ui.picker) {
    if (view.selection?.type === 'goon') html = goonPanel(view.selection.id) || html;
    else if (view.selection?.type === 'station' && view.lot !== null) html = stationPanel(view.lot, view.selection.id) || html;
  }
  $('panel').classList.toggle('hidden', !html);
  if (document.activeElement?.closest('#panel')?.tagName === 'INPUT') return;
  set('panel', html);
}

function head(tag: string, title: string, sub = '', col = 'var(--pink)') {
  return `<button class="x" data-a="close">X</button><div class="ph"><span class="tag" style="background:${col}">${tag}</span><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
}

function ownerTag(o: number) {
  if (o < 0) return `<span class="otag" style="color:#b9a8b8">NOBODY</span>`;
  return `<span class="otag" style="color:${GANGS[o].css}">${GANGS[o].short}</span>`;
}

function blockPanel(id: number) {
  const b = map.blocks[id];
  const t = state.turf[id];
  const d = DISTRICTS[b.district];
  const lots = map.lots.filter((l) => l.block === id && l.kind !== 'decor');
  const guards = guardsOn(id).filter((g) => g.post?.kind !== 'work');
  const def = blockDefense(id);
  const attack = state.ops.find((o) => o.kind === 'attack' && o.block === id && o.phase === 'work');
  const takeover = state.ops.find((o) => o.kind === 'takeover' && o.block === id);
  let h = head(d.name.toUpperCase(), b.name, d.blurb, t.owner >= 0 ? GANGS[t.owner].css : '#b9a8b8');
  h += `<div class="kv"><span>CONTROLLED BY</span>${ownerTag(t.owner)}</div>`;
  h += `<div class="kv"><span>GRIP</span><b>${t.inf.toFixed(0)}%</b></div>${bar(t.inf / 100, t.owner >= 0 ? GANGS[t.owner].css : '#888')}`;
  h += `<div class="kv"><span>DEFENSE</span><b>${def.toFixed(1)}</b></div>`;
  h += `<div class="lbl">WHAT SELLS HERE</div><div class="demand">${[...PRODUCT_IDS].sort((a, b2) => d.demand[b2] - d.demand[a]).map((p) => `<span class="pd" style="--ic:${ITEMS[p].css}">${ITEMS[p].name.toUpperCase()} ${d.demand[p] >= 1.3 ? '+++' : d.demand[p] >= 1 ? '++' : '+'}</span>`).join('')}</div>`;
  if (attack) h += `<div class="alert">UNDER ATTACK BY ${GANGS[attack.gang].short}. SEND GUARDS NOW.</div>`;
  if (takeover) h += `<div class="alert y">YOUR CREW IS ${takeover.phase === 'work' ? 'FIGHTING FOR' : 'HEADING TO'} THIS BLOCK.</div>`;
  if (lots.length) {
    h += `<div class="lbl">BUSINESSES</div>`;
    for (const l of lots) {
      const st = state.biz[l.id];
      h += `<div class="row-item" data-a="selLot" data-id="${l.id}"><b>${esc(l.name)}</b><small>${BIZ[l.kind as BizKind].name}${st ? ` · <span class="y">${st.mode === 'owned' ? 'YOURS' : 'PAYING YOU'}</span>` : ''}</small></div>`;
    }
  }
  if (t.owner === 0) {
    h += `<div class="lbl">YOUR PEOPLE HERE (${guards.length})</div>`;
    for (const g of guards) h += goonRow(g, `<button class="btn tiny" data-a="recall" data-id="${g.id}">RECALL</button>`);
    h += `<div class="btns"><button class="btn" data-a="pick" data-k="corner" data-id="${id}">+ CORNER DEALER</button><button class="btn alt" data-a="pick" data-k="guard" data-id="${id}">+ GUARD</button></div>`;
    h += `<p class="hint">Dealers sell from your stash. Guards raise your grip and fight off attacks.</p>`;
  } else if (!takeover) {
    if (adjacentToPlayer(id)) {
      h += `<div class="btns"><button class="btn gold big" data-a="pick" data-k="takeover" data-id="${id}">TAKE OVER THIS BLOCK</button></div>`;
      h += `<p class="hint">Send muscle. Winners stay behind as guards.</p>`;
    } else h += `<p class="hint">Too far. You can only move on blocks next to your turf.</p>`;
  }
  return h;
}

function lotPanel(id: number) {
  const l = map.lots[id];
  if (l.kind === 'decor') return '';
  const def = BIZ[l.kind];
  const st = state.biz[id];
  const owner = state.turf[l.block].owner;
  const ours = owner === 0;
  let h = head(def.name.toUpperCase(), l.name, def.perk, 'var(--cyan)');
  h += `<div class="kv"><span>BLOCK</span><b class="link" data-a="selBlock" data-id="${l.block}">${esc(map.blocks[l.block].name)}</b></div>`;
  h += `<div class="kv"><span>TURF</span>${ownerTag(owner)}</div>`;
  if (def.income) h += `<div class="kv"><span>INCOME</span><b>${money(def.income)}/day</b></div>`;
  if (def.launder) h += `<div class="kv"><span>LAUNDERS</span><b>${money(def.launder)}/day <small class="dim">(${LAUNDER_FEE * 100}% cut)</small></b></div>`;
  if (def.stash) h += `<div class="kv"><span>STASH</span><b>${def.stash}</b></div>`;
  if (st?.mode === 'owned') {
    const fx = bizFx(id)!;
    h += `<div class="alert y">YOU OWN THIS.${bizActive(id) ? '' : ' BUT YOU LOST THE BLOCK. IT MAKES NOTHING UNTIL YOU TAKE IT BACK.'}</div>`;
    h += `<div class="kv"><span>NOW EARNS</span><b>${money(def.income * fx.income)}/day</b></div>`;
    h += `<div class="btns"><button class="btn gold big" data-a="enter" data-id="${id}">GO INSIDE</button></div>`;
    if (id !== map.starterLot) h += `<div class="btns"><button class="btn tiny danger" data-a="sellBiz" data-id="${id}">SELL FOR ${money(l.price * 0.5)}</button></div>`;
  } else if (st?.mode === 'extorted') {
    h += `<div class="alert y">PAYS YOU ${money(def.income * 0.5)}/DAY FOR "PROTECTION".</div>`;
    h += `<div class="btns"><button class="btn gold" data-a="buyBiz" data-id="${id}" ${state.clean >= l.price * 0.6 && ours ? '' : 'disabled'}>BUY OUT ${money(l.price * 0.6)}</button></div>`;
    h += `<p class="hint">Owning it unlocks the perk, laundering and upgrades.</p>`;
  } else if (ours) {
    h += `<div class="price">${money(l.price)} <small>CLEAN</small></div>`;
    h += `<div class="btns"><button class="btn gold" data-a="buyBiz" data-id="${id}" ${state.clean >= l.price ? '' : 'disabled'}>BUY IT</button><button class="btn danger" data-a="pick" data-k="extort" data-id="${id}">SHAKE DOWN</button></div>`;
    if (state.clean < l.price) h += `<p class="hint">You need ${money(l.price - state.clean)} more clean money. Launder it through a front.</p>`;
    h += `<p class="hint">Shaking down is free and pays half the income, but no perks. Raises heat.</p>`;
  } else h += `<p class="hint">Take over ${esc(map.blocks[l.block].name)} first.</p>`;
  return h;
}

function goonRow(g: Goon, actions = '') {
  return `<div class="goon" data-a="selGoon" data-id="${g.id}">
    <div class="gn"><b>${esc(goonName(g))}</b><small>${statusText(g)}</small></div>
    <div class="gs"><span>M</span>${seg(g.muscle, 10, 'var(--pink)')}<span>S</span>${seg(g.smarts, 10, 'var(--cyan)')}<span>N</span>${seg(g.nerve, 10, 'var(--yellow)')}</div>
    ${actions}</div>`;
}

function statusText(g: Goon) {
  switch (g.status) {
    case 'idle': return 'AT THE STASH HOUSE';
    case 'posted': return g.post!.kind === 'work' ? `COOKING · ${esc(map.lots[g.post!.lot!].name)}` : `${g.post!.kind === 'corner' ? 'DEALING' : 'GUARDING'} · ${esc(map.blocks[g.post!.block].name)}${g.note && g.post!.kind === 'corner' ? ` · ${esc(g.note.toUpperCase())}` : ''}`;
    case 'op': {
      const op = state.ops.find((o) => o.id === g.opId);
      const what = op ? { drop: 'ON THE WAY', takeover: 'TAKEOVER', extort: 'SHAKEDOWN', contract: 'RUNNING A JOB' }[op.kind as 'drop'] ?? 'BUSY' : 'BUSY';
      return `${what}${op ? ` · ${esc(map.blocks[op.block].name)}` : ''}`;
    }
    case 'hurt': return `<span class="r">HURT ${Math.round(g.hp)}%</span>`;
    case 'jail': return `<span class="r">IN JAIL</span>`;
  }
}

function goonPanel(id: number) {
  const g = state.goons.find((x) => x.id === id);
  if (!g) return '';
  let h = head('CREW', goonName(g), `"${esc(g.quirk)}"`, 'var(--yellow)');
  h += `<div class="kv"><span>MUSCLE</span>${seg(g.muscle, 10, 'var(--pink)')}</div>`;
  h += `<div class="kv"><span>SMARTS</span>${seg(g.smarts, 10, 'var(--cyan)')}</div>`;
  h += `<div class="kv"><span>NERVE</span>${seg(g.nerve, 10, 'var(--yellow)')}</div>`;
  h += `<div class="kv"><span>HEALTH</span><b>${Math.round(g.hp)}%</b></div>${bar(g.hp / 100, g.hp < 40 ? 'var(--red)' : 'var(--green)')}`;
  h += `<div class="kv"><span>WAGE</span><b>${money(g.wage)}/day</b></div>`;
  h += `<div class="kv"><span>MADE YOU</span><b>${money(g.earned)}</b></div>`;
  h += `<div class="status">${statusText(g)}</div>`;
  const btns: string[] = [];
  if (g.status === 'posted') {
    btns.push(`<button class="btn" data-a="recall" data-id="${g.id}">RECALL</button>`);
    btns.push(`<button class="btn alt" data-a="selBlock" data-id="${g.post!.block}">SHOW BLOCK</button>`);
  }
  if (g.status === 'jail') btns.push(`<button class="btn gold" data-a="bail" data-id="${g.id}" ${state.clean >= bailCost(g) ? '' : 'disabled'}>BAIL ${money(bailCost(g))} CLEAN</button>`);
  if (g.status !== 'op') btns.push(`<button class="btn danger" data-a="fire" data-id="${g.id}">FIRE</button>`);
  h += `<div class="btns">${btns.join('')}</div>`;
  if (g.status === 'idle') h += `<p class="hint">Click one of your blocks to put ${esc(g.name)} to work.</p>`;
  return h;
}

function pickerPanel(pk: Picker) {
  const idle = state.goons.filter((g) => g.status === 'idle');
  const titles = { corner: 'PICK A DEALER', guard: 'PICK GUARDS', takeover: 'PICK YOUR MUSCLE', extort: 'WHO DOES THE TALKING?', contract: 'WHO DRIVES?', work: 'WHO WORKS HERE?' };
  const where = pk.kind === 'extort' || pk.kind === 'work' ? map.lots[pk.target].name : pk.kind === 'contract' ? 'The package job' : map.blocks[pk.target].name;
  let h = `<button class="x" data-a="cancelPick">X</button><div class="ph"><span class="tag" style="background:var(--yellow)">${pk.kind.toUpperCase()}</span><h2>${titles[pk.kind]}</h2><p class="sub">${esc(where)}</p></div>`;
  if (!idle.length) h += `<p class="hint">Nobody is free. Recall someone, wait for the hurt to heal, or hire more crew.</p><div class="btns"><button class="btn" data-a="modal" data-v="crew">HIRE CREW</button></div>`;
  for (const g of idle) {
    const on = pk.selected.includes(g.id);
    h += `<div class="goon pick ${on ? 'on' : ''}" data-a="toggleGoon" data-id="${g.id}">
      <div class="gn"><b>${on ? '[X]' : '[ ]'} ${esc(goonName(g))}</b><small>HP ${Math.round(g.hp)}%</small></div>
      <div class="gs"><span>M</span>${seg(g.muscle, 10, 'var(--pink)')}<span>S</span>${seg(g.smarts, 10, 'var(--cyan)')}<span>N</span>${seg(g.nerve, 10, 'var(--yellow)')}</div></div>`;
  }
  if (pk.kind === 'takeover') {
    const atk = crewPower(pk.selected);
    const def = blockDefense(pk.target);
    const o = odds(atk, def);
    h += `<div class="kv"><span>YOUR MUSCLE</span><b>${atk.toFixed(1)}</b></div><div class="kv"><span>THEIR DEFENSE</span><b>${def.toFixed(1)}</b></div>`;
    h += `<div class="kv"><span>ODDS</span><b class="${o > 0.6 ? 'g' : o > 0.4 ? 'y' : 'r'}">${Math.round(o * 100)}%</b></div>${bar(o, o > 0.6 ? 'var(--green)' : o > 0.4 ? 'var(--yellow)' : 'var(--red)')}`;
  }
  if (pk.kind === 'contract') h += `<p class="hint">Smart drivers are less likely to get pulled over. Pays ${money(Number(pk.data?.reward ?? 0))}.</p>`;
  h += `<div class="btns"><button class="btn gold big" data-a="go" ${pk.selected.length ? '' : 'disabled'}>GO (${pk.selected.length}/${pk.max})</button></div>`;
  return h;
}

function interiorPanel(id: number) {
  const l = map.lots[id];
  const def = BIZ[l.kind as BizKind];
  const st = state.biz[id];
  if (!st) return '';
  const fx = bizFx(id)!;
  const prod = canProduce(id);
  let h = `<div class="ph"><span class="tag" style="background:var(--cyan)">${def.name.toUpperCase()}</span><h2>${esc(l.name)}</h2><p class="sub">${def.perk}</p></div>`;
  if (prod) {
    const workers = workersAt(id);
    const cap = workers.length * STATIONS_PER_WORKER;
    h += `<div class="lbl">WORKERS ${workers.length} <span class="dim">· RUNS ${cap} OF ${st.stations.length} STATIONS</span></div>`;
    for (const g of workers) h += goonRow(g, `<button class="btn tiny" data-a="recall" data-id="${g.id}">SEND HOME</button>`);
    if (!workers.length || st.stations.some((s) => s.status === 'nostaff')) h += `<p class="hint r">${workers.length ? 'Not enough hands. ' : 'Nobody works here yet. '}Each worker keeps ${STATIONS_PER_WORKER} stations busy.</p>`;
    h += `<div class="btns"><button class="btn alt" data-a="pick" data-k="work" data-id="${id}">+ ASSIGN WORKER</button></div>`;
    h += `<div class="lbl">STATIONS</div>`;
    if (!st.stations.length) h += `<p class="hint">Empty room. Pick something from the build bar below and click the floor.</p>`;
    st.stations.forEach((s) => {
      const d = STATIONS[s.type];
      const r = d.recipes[s.recipe];
      h += `<div class="strow ${s.status}" data-a="selStation" data-id="${s.id}">
        <div><b>${d.name}</b><small>${r.name.toUpperCase()} · <span class="${s.status === 'running' ? 'g' : s.status === 'idle' ? '' : 'r'}">${stationStatus(s)}</span></small></div>
        ${s.loaded ? `<span class="pct">${Math.floor(s.progress * 100)}%</span>` : ''}
      </div>`;
    });
  }
  if (def.income) h += `<div class="kv"><span>INCOME</span><b>${money(def.income * fx.income)}/day</b></div>`;
  if (fx.launder) h += `<div class="kv"><span>LAUNDERS</span><b>${money(fx.launder)}/day</b></div>`;
  if (fx.stash) h += `<div class="kv"><span>STASH SPACE</span><b>${fx.stash}</b></div>`;
  if (fx.defense) h += `<div class="kv"><span>DEFENSE BONUS</span><b>+${fx.defense}</b></div>`;
  h += `<div class="lbl">UPGRADES</div>`;
  for (const u of def.upgrades) {
    const has = st.upgrades.includes(u.id);
    h += `<div class="upg ${has ? 'has' : ''} ${ui.upgradeFocus === u.id ? 'focus' : ''}">
      <div><b>${u.name}</b><small>${u.desc}</small></div>
      ${has ? '<span class="y">INSTALLED</span>' : `<button class="btn tiny gold" data-a="upgrade" data-v="${u.id}" ${state.dirty >= u.cost ? '' : 'disabled'}>${money(u.cost)}</button>`}
    </div>`;
  }
  return h;
}

function stationPanel(lotId: number, stId: number) {
  const s = findStation(lotId, stId);
  if (!s) return '';
  const d = STATIONS[s.type];
  const r = d.recipes[s.recipe];
  let h = head('STATION', d.name, d.desc, 'var(--yellow)');
  h += `<div class="kv"><span>STATUS</span><b class="${s.status === 'running' ? 'g' : s.status === 'idle' ? '' : 'r'}">${stationStatus(s)}</b></div>`;
  if (s.loaded) h += bar(s.progress, 'var(--green)');
  if (d.recipes.length > 1) {
    h += `<div class="lbl">RECIPE</div><div class="chips">${d.recipes.map((rc, i) => `<button class="chip ${i === s.recipe ? 'on' : ''}" data-a="recipe" data-id="${s.id}" data-v="${i}">${rc.name.toUpperCase()}</button>`).join('')}</div>`;
  }
  h += `<div class="lbl">MAKES (${Math.round(r.time / 60 * 10) / 10}H PER BATCH)</div>${recipeLine(r)}`;
  const missing = (Object.entries(r.in) as [ItemId, number][]).filter(([k, n]) => state.stash[k] < n);
  if (!s.loaded && missing.length) {
    h += `<p class="hint r">Missing: ${missing.map(([k, n]) => `${n - state.stash[k]} ${ITEMS[k].name}`).join(', ')}.</p>`;
    const buyable = missing.filter(([k]) => ITEMS[k].price);
    if (buyable.length) h += `<div class="btns"><button class="btn gold" data-a="quickBuy" data-v="${buyable.map(([k]) => k).join(',')}">ORDER FROM SAL</button></div>`;
    else h += `<p class="hint">Another station makes those. Check RECIPES.</p>`;
  }
  if (s.status === 'nostaff') h += `<p class="hint r">Nobody is running this. Assign another worker.</p>`;
  if (s.status === 'full') h += `<p class="hint r">The stash is full. Sell product or buy storage.</p>`;
  h += `<div class="btns"><button class="btn tiny danger" data-a="sellStation" data-id="${s.id}">SELL ${money(d.cost * 0.5)}</button></div>`;
  return h;
}

// ---------------------------------------------------------------------------
// modals

function renderModal() {
  const m = ui.modal;
  $('modal').classList.toggle('hidden', !m);
  if (!m) return set('modal', '');
  let h = '';
  if (m === 'phone') h = phoneModal();
  else if (m === 'sal') h = salModal();
  else if (m === 'crew') h = crewModal();
  else if (m === 'city') h = cityModal();
  else if (m === 'help') h = helpModal();
  else if (m === 'options') h = optionsModal();
  else if (m === 'recipes') h = recipesModal();
  set('modal', `<div class="mwin ${m}"><button class="x" data-a="closeModal">X</button>${h}</div>`);
}

function phoneModal() {
  const msgs = state.phone;
  let h = `<h1 class="mt">ANSWERING MACHINE</h1><div class="tape"><span class="reel"></span><span class="reel"></span><b>${msgs.length} MESSAGE${msgs.length === 1 ? '' : 'S'}</b></div>`;
  if (!msgs.length) h += `<p class="hint">Nobody called. Enjoy the silence.</p>`;
  for (const m of msgs) {
    const open = ui.openMsg === m.id;
    const c = clock(m.at);
    const left = m.options.length ? Math.max(0, Math.round((m.expires - state.minutes) / 60)) : -1;
    h += `<div class="msg ${m.read ? '' : 'new'} ${open ? 'open' : ''}">
      <div class="mh" data-a="openMsg" data-id="${m.id}"><b>${m.read ? '' : '● '}${esc(m.from)}</b><small>DAY ${c.day} ${c.hh}:${c.mm}${left >= 0 ? ` · EXPIRES IN ${left}H` : ''}</small></div>
      ${open ? `<p class="mtxt">"${esc(m.text)}"</p><div class="btns">${m.options.map((o, i) => `<button class="btn ${i === 0 ? 'gold' : ''}" data-a="answer" data-id="${m.id}" data-v="${i}">${esc(o.label)}</button>`).join('')}${m.options.length ? '' : `<button class="btn tiny" data-a="delMsg" data-id="${m.id}">DELETE</button>`}</div>` : ''}
    </div>`;
  }
  return h;
}

function salModal() {
  const ownsMarina = state.biz[map.marinaLot]?.mode === 'owned' && bizActive(map.marinaLot);
  const tab = (id: typeof ui.salTab, label: string, ok = true) => `<button class="tab ${ui.salTab === id ? 'on' : ''}" data-a="salTab" data-v="${id}" ${ok ? '' : 'disabled'}>${label}</button>`;
  let h = `<h1 class="mt">${ui.salTab === 'stash' ? 'Your stash' : ui.salTab === 'marina' ? 'Import by sea' : 'Call Sal'}</h1>`;
  h += `<div class="tabs">${tab('sal', 'SAL (VAN)')}${tab('marina', ownsMarina ? 'MARINA (BOAT)' : 'MARINA (LOCKED)', ownsMarina)}${tab('stash', `STASH ${stashTotal()}/${stashCap()}`)}</div>`;
  if (ui.salTab === 'stash') return h + stashTab();
  const marina = ui.salTab === 'marina' && ownsMarina;
  const list = marina ? (['cocaleaf', 'opium'] as SupplyId[]) : SUPPLY_IDS;
  const free = stashCap() - stashTotal();
  const order: Order = {};
  for (const s of list) if (ui.order[s]) order[s] = ui.order[s];
  const qty = list.reduce((a, s) => a + (ui.order[s] ?? 0), 0);
  const cost = orderCost(order, marina);
  h += `<p class="sub">${marina ? 'A boat brings it in from the Bahamas. Cheap, but the Coast Guard is out there.' : 'Sal\'s van drives your supplies in from the highway. If the cops pull it over, the load is gone.'}</p>`;
  for (const s of list) {
    const d = ITEMS[s];
    const uses = CHAINS.filter((c) => c.supplies.includes(s)).map((c) => ITEMS[c.product].name).join(', ');
    const n = ui.order[s] ?? 0;
    h += `<div class="ord"><div><b style="color:${d.css}">${d.name.toUpperCase()}</b><small>FOR ${uses.toUpperCase()} · HAVE ${state.stash[s]}</small></div>
      <span class="pr">${money(marina ? d.marina! : d.price!)}</span>
      <button class="btn tiny" data-a="qty" data-p="${s}" data-v="${-d.step!}">-</button><b class="q">${n}</b><button class="btn tiny" data-a="qty" data-p="${s}" data-v="${d.step}">+</button></div>`;
  }
  h += `<div class="kv"><span>STASH SPACE FREE</span><b class="${qty > free ? 'r' : ''}">${free}</b></div>`;
  h += `<div class="kv"><span>TOTAL</span><b>${money(cost)}</b></div>`;
  if (qty > free) h += `<p class="hint r">That won't fit. The extra gets dumped.</p>`;
  h += `<div class="btns"><button class="btn gold big" data-a="order" ${qty && state.dirty + state.clean >= cost ? '' : 'disabled'}>${marina ? 'SEND THE BOAT' : 'PLACE ORDER'}</button></div>`;
  return h;
}

function stashTab() {
  const group = (title: string, ids: ItemId[]) => {
    const have = ids.filter((k) => state.stash[k] > 0);
    return `<div class="lbl">${title}</div><div class="demand">${have.length ? have.map((k) => chip(k, state.stash[k])).join('') : '<span class="dim">NOTHING</span>'}</div>`;
  };
  let h = group('PRODUCT (READY TO SELL)', PRODUCT_IDS);
  h += group('IN PROGRESS', MID_IDS);
  h += group('SUPPLIES', SUPPLY_IDS);
  const worth = PRODUCT_IDS.reduce((a, p) => a + state.stash[p] * ITEMS[p].sell!, 0);
  h += `<div class="kv"><span>STREET VALUE</span><b class="g">${money(worth)}</b></div>`;
  h += `<p class="hint">Corner dealers sell anything in the PRODUCT row. Different districts want different stuff.</p>`;
  return h;
}

/** Which recipe a multi-recipe station (lab bench, refinery) uses for a product. */
const MULTI_RECIPE: Partial<Record<string, number>> = { meth: 0, mdma: 1, lsd: 2, cocaine: 0, heroin: 1 };

function recipesModal() {
  let h = `<h1 class="mt">Recipes</h1><p class="sub">Every product, start to finish. Build the stations in a stash house, warehouse or motel, assign workers, keep supplies coming.</p>`;
  for (const c of CHAINS) {
    const p = ITEMS[c.product];
    h += `<div class="chain" style="--ic:${p.css}"><div class="ch"><b>${p.name.toUpperCase()}</b><small>SELLS ~${money(p.sell!)} · HEAT ${'!'.repeat(Math.max(1, Math.round(p.heat! * 5)))}</small></div>`;
    for (const sid of c.steps) {
      const d = STATIONS[sid];
      const r = d.recipes.length > 1 ? d.recipes[MULTI_RECIPE[c.product] ?? 0] : d.recipes[0];
      h += `<div class="cstep"><span class="sn">${d.name.toUpperCase()} <small>${money(d.cost)}</small></span>${recipeLine(r)}</div>`;
    }
    h += `</div>`;
  }
  return h;
}

function crewModal() {
  const tab = (id: 'roster' | 'hire', label: string) => `<button class="tab ${ui.crewTab === id ? 'on' : ''}" data-a="crewTab" data-v="${id}">${label}</button>`;
  let h = `<h1 class="mt">THE CREW</h1><div class="tabs">${tab('roster', `ROSTER (${state.goons.length})`)}${tab('hire', `HIRE (${state.candidates.length})`)}</div>`;
  if (ui.crewTab === 'roster') {
    const wages = state.goons.reduce((a, g) => a + g.wage, 0);
    h += `<div class="kv"><span>DAILY WAGES</span><b>${money(wages)}</b></div>`;
    for (const g of state.goons) h += goonRow(g, `<span class="wage">${money(g.wage)}</span>`);
    if (!state.goons.length) h += `<p class="hint">Nobody works for you. That's a problem.</p>`;
  } else {
    h += `<p class="sub">New faces show up every morning. Arcades bring more.</p>`;
    state.candidates.forEach((c, i) => {
      h += `<div class="goon"><div class="gn"><b>${esc(c.name)} "${esc(c.nick)}"</b><small>"${esc(c.quirk)}"</small></div>
        <div class="gs"><span>M</span>${seg(c.muscle, 10, 'var(--pink)')}<span>S</span>${seg(c.smarts, 10, 'var(--cyan)')}<span>N</span>${seg(c.nerve, 10, 'var(--yellow)')}</div>
        <button class="btn tiny gold" data-a="hire" data-v="${i}">HIRE ${money(c.wage)}/D</button></div>`;
    });
    if (!state.candidates.length) h += `<p class="hint">Nobody's looking for work today.</p>`;
  }
  return h;
}

function cityModal() {
  let h = `<h1 class="mt">THE CITY</h1>`;
  for (let i = 0; i < GANGS.length; i++) {
    const g = GANGS[i];
    const gs = state.gangs[i];
    const blocks = state.turf.filter((t) => t.owner === i).length;
    const dead = i > 0 && !gs.alive;
    h += `<div class="gang ${dead ? 'dead' : ''}" style="--gc:${g.css}"><div><b>${g.name.toUpperCase()}</b><small>${i === 0 ? 'THAT\'S YOU' : `BOSS: ${g.boss}`}${dead ? ' · WIPED OUT' : ''}${gs.truceUntil > state.minutes ? ' · TRUCE' : ''}</small></div>
      <div class="gb">${seg(Math.round(blocks / 3), 10, g.css)}<small>${blocks} BLOCKS${i > 0 ? ` · STRENGTH ${gs.power.toFixed(1)}` : ''}</small></div></div>`;
  }
  h += `<div class="lbl">HEAT</div><div class="kv"><span>WANTED LEVEL</span><b class="stars">${starsHtml()}</b></div>${bar(state.heat / 100, 'var(--red)')}`;
  h += `<p class="hint">2+ stars: dealers get busted. 4+ stars: the DEA raids your stash houses.</p>`;
  h += `<div class="btns"><button class="btn danger" data-a="bribe" ${state.dirty >= bribeCost() ? '' : 'disabled'}>PAY OFF CAPTAIN MORALES ${money(bribeCost())}</button></div>`;
  h += `<div class="lbl">BOOKS</div>`;
  const income = Object.keys(state.biz).map(Number).filter(bizActive).reduce((a, id) => a + BIZ[map.lots[id].kind as BizKind].income * bizFx(id)!.income, 0);
  const laund = Object.keys(state.biz).map(Number).filter(bizActive).reduce((a, id) => a + bizFx(id)!.launder, 0);
  h += `<div class="grid"><div><small>STREET SALES</small><b>${money(state.stats.earned)}</b></div><div><small>BUSINESS INCOME</small><b>${money(income)}/D</b></div>
    <div><small>LAUNDERING</small><b>${money(laund)}/D</b></div><div><small>BLOCKS TAKEN</small><b>${state.stats.taken}</b></div>
    <div><small>ARRESTS</small><b>${state.stats.arrests}</b></div><div><small>FUNERALS</small><b>${state.stats.deaths}</b></div></div>`;
  return h;
}

function helpModal() {
  return `<h1 class="mt">HOW IT WORKS</h1><div class="help">
  <p><b class="y">THE CITY.</b> Miami is cut into 30 blocks. Three gangs hold turf: <b style="color:${GANGS[1].css}">LOS FLAMINGOS</b> in Little Havana, <b style="color:${GANGS[2].css}">THE BARRACUDAS</b> Downtown and the <b style="color:${GANGS[3].css}">TIGER MOB</b> on Ocean Drive. You start with one block in Palmetto Flats.</p>
  <p><b class="y">COOKING.</b> Go inside a stash house, warehouse or motel and build stations. Each product has a chain: weed is Grow Tent, Drying Rack, Trim Table. Check RECIPES for all seven.</p>
  <p><b class="y">WORKERS.</b> Stations only run with crew assigned. One worker runs two stations. Smarter workers are faster.</p>
  <p><b class="y">SUPPLIES.</b> Seeds, mash kits, lab chemicals and the rest come from Sal. Own the Marina to import coca leaves and raw opium cheaply.</p>
  <p><b class="y">CORNERS.</b> Click your block and post a dealer. Dealers sell finished product from your stash for dirty cash. Each district wants different stuff.</p>
  <p><b class="y">TURF.</b> Click a block next to yours and send muscle to take it. Rivals will hit back, so post guards. Guards raise your grip on a block.</p>
  <p><b class="y">BUSINESSES.</b> On your turf you can buy businesses with clean money or shake them down for protection. Fronts launder dirty cash into clean.</p>
  <p><b class="y">HEAT.</b> Every deal, fight and running lab raises your wanted level. Labs and refineries are loud. Pay off the cops, own a diner, or cool it.</p>
  <p><b class="y">PHONE.</b> People call with jobs, deals and threats. Check your messages.</p>
  <p><b class="y">CONTROLS.</b> Drag / WASD to move. Wheel or Q/E to zoom. Double-click a business you own to go inside. SPACE pause, 1/2/3 speed, P phone, C crew, TAB city.</p></div>`;
}

function optionsModal() {
  return `<h1 class="mt">OPTIONS</h1>
  <div class="opt" data-a="optCrt"><b>CRT FILTER</b><span class="${view.crt ? 'g' : 'r'}">${view.crt ? 'ON' : 'OFF'}</span></div>
  <div class="opt" data-a="optWobble"><b>SCREEN SWAY</b><span class="${view.wobble ? 'g' : 'r'}">${view.wobble ? 'ON' : 'OFF'}</span></div>
  <div class="opt" data-a="optMusic"><b>MUSIC (M)</b><span class="${audio.music ? 'g' : 'r'}">${audio.music ? 'ON' : 'OFF'}</span></div>
  <div class="opt" data-a="optSfx"><b>SOUND FX</b><span class="${audio.sfx ? 'g' : 'r'}">${audio.sfx ? 'ON' : 'OFF'}</span></div>
  <div class="btns"><button class="btn" data-a="save">SAVE NOW</button><button class="btn danger" data-a="quit">QUIT TO TITLE</button></div>`;
}

// ---------------------------------------------------------------------------

const STATION_ICON: Record<StationId, string> = {
  tent: 'WE', rack: 'WE', trim: 'WE', barrel: 'MS', still: 'MS', reactor: 'LAB', trays: 'ME', press: 'XT', blotter: 'LD', pit: 'CO', boiler: 'HE', refinery: 'CO/HE',
};

function renderBottom() {
  const inside = view.scene === 'interior' && view.lot !== null;
  $('bottom').classList.toggle('build', inside && canProduce(view.lot!));
  if (!inside) return set('bottom', `<span>DRAG TO MOVE · WHEEL TO ZOOM · CLICK A BLOCK OR BUSINESS</span>`);
  let h = `<button class="btn" data-a="exit">&lt; STREET</button>`;
  if (canProduce(view.lot!)) {
    const cash = state.dirty + state.clean;
    h += `<div class="buildbar">${STATION_IDS.map((t) => {
      const d = STATIONS[t];
      return `<button class="bt ${view.placing === t ? 'on' : ''}" data-a="place" data-v="${t}" ${cash >= d.cost ? '' : 'disabled'} title="${esc(d.desc)}">
        <span class="bi" style="--ic:${ITEMS[CHAINS.find((c) => c.steps.includes(t))!.product].css}">${STATION_ICON[t]}</span><b>${d.name.toUpperCase()}</b><small>${money(d.cost)}</small></button>`;
    }).join('')}</div>`;
    if (view.placing) h += `<div class="placing">PLACING ${STATIONS[view.placing].name.toUpperCase()}: CLICK THE FLOOR · RIGHT-CLICK / ESC TO STOP</div>`;
  } else h += `<span>ESC TO LEAVE</span>`;
  set('bottom', h);
}

function renderOver() {
  $('over').classList.toggle('hidden', !ui.over);
  if (!ui.over) return;
  set('over', `<div class="over-card"><h1>YOU'RE FINISHED</h1><p>The last block fell. Uncle Vic will hear about this in the yard.</p>
    <p class="dim">DAY ${clock(state.minutes).day} · ${money(state.stats.earned)} MADE · ${state.stats.taken} BLOCKS TAKEN</p>
    <button class="btn gold big" data-a="new">TRY AGAIN</button></div>`);
}

// ---------------------------------------------------------------------------
// events

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  sfx('click');
  const a = el.dataset.a!;
  const id = Number(el.dataset.id);
  const v = el.dataset.v!;
  switch (a) {
    case 'speed': view.speed = Number(v); break;
    case 'modal': toggle(v as Modal); if (ui.modal === 'phone') markRead(); if (ui.modal === 'sal' && el.dataset.tab) ui.salTab = el.dataset.tab as typeof ui.salTab; break;
    case 'closeModal': ui.modal = null; break;
    case 'close': view.selection = null; bus.emit('select'); break;
    case 'selLot': view.selection = { type: 'lot', id }; bus.emit('select'); break;
    case 'selBlock': {
      view.selection = { type: 'block', id };
      const b = map.blocks[id];
      bus.emit('focus', { x: (b.x + 5) * TILE, y: (b.y + 5) * TILE });
      bus.emit('select');
      break;
    }
    case 'selGoon': {
      view.selection = { type: 'goon', id };
      ui.modal = null;
      const g = state.goons.find((x) => x.id === id);
      if (g?.post) { const b = map.blocks[g.post.block]; bus.emit('focus', { x: (b.x + 5) * TILE, y: (b.y + 5) * TILE }); }
      bus.emit('select');
      break;
    }
    case 'enter': bus.emit('enter', id); break;
    case 'exit': bus.emit('exit'); break;
    case 'recall': recall(id); break;
    case 'pick': {
      const k = el.dataset.k as Picker['kind'];
      const max = k === 'corner' ? 1 : k === 'guard' ? 3 : k === 'takeover' ? 4 : k === 'work' ? 4 : 2;
      ui.picker = { kind: k, target: id, max, selected: [] };
      break;
    }
    case 'cancelPick': ui.picker = null; break;
    case 'toggleGoon': {
      const pk = ui.picker!;
      if (pk.selected.includes(id)) pk.selected = pk.selected.filter((x) => x !== id);
      else if (pk.max === 1) pk.selected = [id];
      else if (pk.selected.length < pk.max) pk.selected.push(id);
      break;
    }
    case 'go': {
      const pk = ui.picker!;
      let ok = false;
      if (pk.kind === 'corner' || pk.kind === 'guard') ok = sendPost(pk.selected, pk.target, pk.kind);
      else if (pk.kind === 'work') ok = sendToWork(pk.selected, pk.target);
      else if (pk.kind === 'takeover') ok = startTakeover(pk.selected, pk.target);
      else if (pk.kind === 'extort') ok = startExtort(pk.selected, pk.target);
      else if (pk.kind === 'contract') {
        ok = startContract(pk.selected, Number(pk.data!.from), Number(pk.data!.to), Number(pk.data!.reward));
        if (ok) removeMsg(Number(pk.data!.msg));
      }
      if (ok) ui.picker = null;
      break;
    }
    case 'buyBiz': buyBiz(id); break;
    case 'sellBiz': if (confirm(`Sell ${map.lots[id].name}?`)) sellBiz(id); break;
    case 'upgrade': if (view.lot !== null) buyUpgrade(view.lot, v); break;
    case 'bribe': bribe(); break;
    case 'bail': bail(id); break;
    case 'fire': if (confirm('Fire this guy?')) fire(id); break;
    case 'hire': hire(Number(v)); break;
    case 'crewTab': ui.crewTab = v as typeof ui.crewTab; break;
    case 'salTab': ui.salTab = v as typeof ui.salTab; break;
    case 'qty': {
      const p = el.dataset.p as SupplyId;
      ui.order[p] = Math.max(0, (ui.order[p] ?? 0) + Number(v));
      break;
    }
    case 'order': {
      const ok = ui.salTab === 'marina' ? importShipment({ ...ui.order }) : orderSal();
      if (ok) { ui.order = {}; ui.modal = null; }
      break;
    }
    case 'openMsg': {
      ui.openMsg = ui.openMsg === id ? -1 : id;
      const m = state.phone.find((x) => x.id === id);
      if (m) m.read = true;
      break;
    }
    case 'answer': {
      const r = answer(id, Number(v));
      if (r.pick === 'contract') {
        ui.modal = null;
        ui.picker = { kind: 'contract', target: Number(r.data!.from), max: 1, selected: [], data: r.data };
      }
      break;
    }
    case 'delMsg': removeMsg(id); break;
    case 'optCrt': view.crt = !view.crt; bus.emit('crt'); break;
    case 'optWobble': view.wobble = !view.wobble; break;
    case 'optMusic': setMusic(!audio.music); break;
    case 'closeReport': $('report').classList.add('hidden'); break;
    case 'tutAct': tutAction(); return;
    case 'tutSkip': skipTutorial(); break;
    case 'goalAct': tutAction(v); return;
    case 'story': showStory(state.chapter); return;
    case 'storyClose': $('story').classList.add('hidden'); view.speed = Number(v) || 1; break;
    case 'place': view.placing = view.placing === v ? null : (v as StationId); ui.picker = null; bus.emit('placing'); break;
    case 'selStation': view.selection = { type: 'station', id }; ui.picker = null; break;
    case 'recipe': if (view.lot !== null) setRecipe(view.lot, id, Number(v)); break;
    case 'sellStation': if (view.lot !== null && confirm('Sell this station for half price?')) { removeStation(view.lot, id); view.selection = null; } break;
    case 'quickBuy': { const o: Order = {}; for (const k of v.split(',') as SupplyId[]) o[k] = ITEMS[k].step! * 2; ui.order = o; ui.salTab = 'sal'; ui.modal = 'sal'; break; }
    case 'optSfx': setSfx(!audio.sfx); break;
    case 'save': if (saveGame()) addToast('SAVED.', 'info'); break;
    case 'quit': location.reload(); return;
    case 'new': startGame(false); return;
    case 'continue': startGame(true); return;
  }
  render();
}

function orderSal() {
  return orderFromSal({ ...ui.order });
}

function markRead() {
  if (state.phone.length && ui.openMsg === -1) {
    ui.openMsg = state.phone[0].id;
    state.phone[0].read = true;
  }
}

// ---------------------------------------------------------------------------
// toasts, tooltip, title

function addToast(msg: string, kind: ToastKind, block?: number) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  if (block !== undefined) {
    el.classList.add('go');
    el.title = 'Show me';
    el.addEventListener('click', () => {
      if (view.scene === 'interior') bus.emit('exit');
      const b = map.blocks[block];
      view.selection = { type: 'block', id: block };
      bus.emit('focus', { x: (b.x + 5) * TILE, y: (b.y + 5) * TILE });
      bus.emit('select');
      el.remove();
    });
  }
  box.prepend(el);
  while (box.children.length > 5) box.lastElementChild!.remove();
  setTimeout(() => el.classList.add('out'), 7000);
  setTimeout(() => el.remove(), 7500);
}

let reportTimer = 0;

function showReport(r: { day: number; street: number; biz: number; laundered: number; sold: number; wages: number; net: number }) {
  const el = $('report');
  el.innerHTML = `<div class="rep" data-a="closeReport">
    <h3>Day ${r.day} wrap-up</h3>
    <div class="rl"><span>STREET SALES (${r.sold})</span><b class="g">${money(r.street)}</b></div>
    <div class="rl"><span>BUSINESSES</span><b class="g">${money(r.biz)}</b></div>
    <div class="rl"><span>WAGES</span><b class="r">-${money(r.wages)}</b></div>
    <div class="rl"><span>LAUNDERED</span><b class="c">${money(r.laundered)}</b></div>
    <div class="rl tot"><span>NET</span><b class="${r.net >= 0 ? 'g' : 'r'}">${money(r.net)}</b></div>
  </div>`;
  el.classList.remove('hidden');
  sfx(r.net >= 0 ? 'cash' : 'lose');
  window.clearTimeout(reportTimer);
  reportTimer = window.setTimeout(() => el.classList.add('hidden'), 9000);
}

function tooltip(h: { type: 'block' | 'lot'; id: number; x: number; y: number } | null) {
  const el = $('tooltip');
  if (!h || view.scene !== 'city' || !view.started) return el.classList.add('hidden');
  if (h.type === 'lot') {
    const l = map.lots[h.id];
    const st = state.biz[h.id];
    el.innerHTML = `<b>${esc(l.name)}</b><small>${BIZ[l.kind as BizKind].name}${st ? (st.mode === 'owned' ? ' · YOURS' : ' · PAYS YOU') : ''}</small>`;
  } else {
    const b = map.blocks[h.id];
    const o = state.turf[h.id].owner;
    const hint = o === 0 ? `${guardsOn(h.id).length} OF YOUR PEOPLE HERE` : adjacentToPlayer(h.id) ? `DEFENSE ${blockDefense(h.id).toFixed(1)} · CLICK TO TAKE IT` : "NOT NEXT TO YOUR TURF";
    el.innerHTML = `<b>${esc(b.name)}</b><small>${DISTRICTS[b.district].name.toUpperCase()} · ${ownerTag(o)}</small><small class="th">${hint}</small>`;
  }
  el.style.left = `${h.x + 18}px`;
  el.style.top = `${h.y + 18}px`;
  el.classList.remove('hidden');
}

function renderTitle() {
  const save = hasSave();
  $('title').innerHTML = `
    <div class="waves"></div>
    <div class="title-card">
      <div class="logo"><span class="l1">Neon</span><span class="l2">Kingpin</span></div>
      <div class="sub2">MIAMI 1986</div>
      <div class="menu">
        ${save ? '<button data-a="continue">CONTINUE</button>' : ''}
        <button data-a="new">NEW GAME</button>
      </div>
      <p class="fine">A satirical crime management game. Everyone in it is made up. Don't do crimes.</p>
    </div>`;
}

function startGame(cont: boolean) {
  ui.over = false;
  if (!(cont && loadGame())) {
    setState(newGame());
    seedNewGame();
    introCalls();
  }
  view.started = true;
  initAudio();
  view.speed = 1;
  view.selection = { type: 'block', id: map.lots[map.starterLot].block };
  $('title').classList.add('gone');
  document.body.classList.add('playing');
  bus.emit('started');
  render();
}

export { ui };
