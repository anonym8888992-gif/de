import { bus, toast } from '../bus';
import { DAY, GANGS, ITEMS, type SupplyId } from '../config';
import { goonFrom, makeCandidate, map, money, nextId, playerBlocks, stars, state, type PhoneMsg, type PhoneOption } from '../state';
import { pick, randInt } from './rng';
import { bribe, orderFromSal } from './sim';
import { supplyUnlocked } from './story';

export function pushMsg(from: string, text: string, options: PhoneOption[] = [], ttlHours = 10) {
  const m: PhoneMsg = { id: nextId(), from, text, options, at: state.minutes, expires: state.minutes + ttlHours * 60, read: false };
  state.phone.unshift(m);
  if (state.phone.length > 12) state.phone.length = 12;
  bus.emit('ring', m);
  bus.emit('changed');
}

export function introCalls() {
  pushMsg('UNCLE VIC (COUNTY JAIL)',
    'Kid, it\'s Vic. They got me on a parking ticket, can you believe it? Two years. The place in Palmetto Flats is yours now. Sonny and Rico are good boys. My grow setup got seized, so start fresh: tents in the back room, Sal for supplies, the boys on the corner. And DON\'T let the Flamingos walk all over you.',
    [], 9999);
  pushMsg('SAL',
    'Sal here. Vic\'s nephew, huh? Seeds, soil, whatever you need, I got it. Hit SUPPLIES whenever. And kid, the Vice Squad drives around more when you get loud. Keep it quiet.',
    [], 9999);
}

export function unread() {
  return state.phone.filter((m) => !m.read).length;
}

export function phoneTick() {
  // drop expired offers
  const before = state.phone.length;
  state.phone = state.phone.filter((m) => m.expires > state.minutes || !m.options.length);
  if (state.phone.length !== before) bus.emit('changed');
  if (state.minutes < state.nextCall) return;
  state.nextCall = state.minutes + randInt(4, 9) * 60;
  generate();
}

function generate() {
  const s = stars();
  const roll = Math.random();
  const mine = playerBlocks();
  if (s >= 2 && roll < 0.25) {
    const cost = Math.round(1500 + state.heat * 60 + state.bribes * 800);
    pushMsg('CAPTAIN MORALES, MIAMI PD',
      `Hey friend. Lot of noise coming out of your neighbourhood lately. ${money(cost)} and my guys find something else to do for a while. Offer's good till tonight.`,
      [{ label: `PAY ${money(cost)}`, action: 'bribe', data: { cost } }, { label: 'HANG UP', action: 'decline' }], 8);
    return;
  }
  if (roll < 0.55 && mine.length) {
    const blocks = map.blocks.map((b) => b.id);
    const a = pick(blocks);
    let b = pick(blocks);
    while (b === a) b = pick(blocks);
    const reward = randInt(8, 22) * 100 + Math.round(Math.hypot(map.blocks[a].bx - map.blocks[b].bx, map.blocks[a].by - map.blocks[b].by) * 300);
    const who = pick(['MR. DELGADO', 'A LAWYER WHO WON\'T SAY HIS NAME', 'JIMMY FROM THE DOCKS', 'MADAME OKAFOR', 'SOME GUY NAMED BIFF']);
    const what = pick(['a briefcase', 'a cooler that is definitely not humming', 'a box of "VHS tapes"', 'a gym bag', 'a very heavy lamp']);
    pushMsg(who,
      `Need ${what} moved from ${map.blocks[a].name} to ${map.blocks[b].name}. ${money(reward)} on delivery. Don't open it. Send somebody smart, cops are everywhere.`,
      [{ label: 'TAKE THE JOB', action: 'contract', data: { from: a, to: b, reward } }, { label: 'PASS', action: 'decline' }], 10);
    return;
  }
  if (roll < 0.75) {
    const pool = (['seeds', 'soil', 'mashkit', 'chems', 'chems', 'binder', 'culture', 'paper', 'cocaleaf', 'opium'] as SupplyId[]).filter(supplyUnlocked);
    const p = pick(pool);
    const qty = ITEMS[p].step! * randInt(3, 8);
    const price = Math.max(1, Math.round(ITEMS[p].price! * (0.5 + Math.random() * 0.15)));
    pushMsg('SAL',
      `Kid! A truck fell off another truck. I got ${qty} ${ITEMS[p].name} at ${money(price)} each. That's a steal. Literally. Today only.`,
      [{ label: `BUY ${money(price * qty)}`, action: 'deal', data: { p, qty, price } }, { label: 'PASS', action: 'decline' }], 8);
    return;
  }
  if (roll < 0.87) {
    const alive = state.gangs.map((g, i) => (i > 0 && g.alive ? i : -1)).filter((i) => i > 0);
    if (!alive.length) return;
    const gi = pick(alive);
    const g = GANGS[gi];
    if (Math.random() < 0.5) {
      const cost = Math.round(3000 * state.gangs[gi].power + mine.length * 400);
      pushMsg(g.boss.toUpperCase(),
        `This is ${g.boss}. ${g.name} are businessmen. You pay us ${money(cost)}, we leave your blocks alone for two days. Think about it.`,
        [{ label: `PAY ${money(cost)}`, action: 'truce', data: { gang: gi, cost } }, { label: 'TELL HIM OFF', action: 'decline' }], 8);
    } else {
      pushMsg(g.boss.toUpperCase(), pick([
        `You think you can play in my city? ${g.name} were here before your uncle had teeth.`,
        `Nice little operation. Be a shame if somebody set it on fire. Just saying.`,
        `I saw your boys on the corner. Their shirts are ugly. Also we're coming for you.`,
      ]));
    }
    return;
  }
  const c = makeCandidate(2);
  pushMsg('YOUR COUSIN TITO',
    `Primo! My buddy ${c.name} "${c.nick}" needs work. Real tough guy, doesn't talk much. ${money(c.wage)} a day. Want him?`,
    [{ label: 'HIRE HIM', action: 'recruit', data: { c: JSON.stringify(c) } }, { label: 'NAH', action: 'decline' }], 10);
}

/** Returns 'pick-contract' when the UI must pick crew for a contract. */
export function answer(msgId: number, optIdx: number): { pick?: 'contract'; data?: Record<string, number | string> } {
  const m = state.phone.find((x) => x.id === msgId);
  if (!m) return {};
  const o = m.options[optIdx];
  if (!o) return {};
  const d = o.data ?? {};
  const done = () => { state.phone = state.phone.filter((x) => x !== m); bus.emit('changed'); };
  switch (o.action) {
    case 'decline':
      done();
      break;
    case 'bribe':
      if (bribe(Number(d.cost), 40)) done();
      break;
    case 'deal': {
      const order: Partial<Record<SupplyId, number>> = {};
      order[d.p as SupplyId] = Number(d.qty);
      if (orderFromSal(order, { [d.p as SupplyId]: Number(d.price) })) done();
      break;
    }
    case 'truce': {
      const cost = Number(d.cost);
      if (state.dirty < cost) { toast('Not enough dirty cash.', 'warn'); break; }
      state.dirty -= cost;
      state.gangs[Number(d.gang)].truceUntil = state.minutes + 2 * DAY;
      toast(`${GANGS[Number(d.gang)].name} agreed to back off for two days.`, 'good');
      done();
      break;
    }
    case 'recruit': {
      const c = JSON.parse(String(d.c));
      const g = goonFrom(c);
      state.goons.push(g);
      state.stats.hired++;
      toast(`${g.name} "${g.nick}" joined the crew.`, 'good');
      done();
      break;
    }
    case 'contract':
      return { pick: 'contract', data: { ...d, msg: m.id } };
  }
  return {};
}

export function removeMsg(id: number) {
  state.phone = state.phone.filter((x) => x.id !== id);
  bus.emit('changed');
}

