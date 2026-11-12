import { toast, bus } from '../bus';
import { BIZ, type BizKind, type StationId } from '../config';
import { map, playerBlocks, state, view } from '../state';

export interface Step {
  id: string;
  title: string;
  text: string;
  done: () => boolean;
  /** label for the SHOW ME button, handled in the UI by step id */
  action?: string;
  /** CSS selector to pulse while this step is active */
  target?: string;
}

const hasStation = (t: StationId) => Object.values(state.biz).some((b) => b.stations.some((s) => s.type === t));
const made = (p: keyof typeof state.stats.made) => (state.stats.made[p] ?? 0) > 0;
const working = () => state.goons.some((g) => g.post?.kind === 'work');

export const STEPS: Step[] = [
  {
    id: 'enter', title: 'Go to your stash house',
    text: 'Uncle Vic left you his place in Palmetto Flats. This is where you cook.',
    done: () => view.scene === 'interior' || hasStation('tent'), action: 'TAKE ME THERE', target: '[data-a=enter]',
  },
  {
    id: 'tent', title: 'Build a Grow Tent',
    text: 'Click GROW TENT in the build bar, then click an empty spot on the floor.',
    done: () => hasStation('tent'), action: 'SELECT IT', target: '[data-a=place][data-v=tent]',
  },
  {
    id: 'dry', title: 'Build a Drying Rack and a Trim Table',
    text: 'Weed goes Grow Tent -> Drying Rack -> Trim Table. Place both in the room.',
    done: () => hasStation('rack') && hasStation('trim'), action: 'SELECT NEXT', target: '[data-a=place][data-v=rack], [data-a=place][data-v=trim]',
  },
  {
    id: 'worker', title: 'Put Sonny to work',
    text: 'Stations only run with a worker. Each worker runs 2 stations.',
    done: working, action: 'ASSIGN', target: '[data-a=pick][data-k=work]',
  },
  {
    id: 'seeds', title: 'Order seeds and soil from Sal',
    text: 'Sal sells supplies. His van drops them at your stash house.',
    done: () => state.stats.orders > 0, action: 'CALL SAL', target: '[data-a=order]',
  },
  {
    id: 'harvest', title: 'Bag your first weed',
    text: 'Wait for grow -> dry -> trim. Press 3 or >>> to speed up time.',
    done: () => made('weed'), action: 'SPEED UP', target: '.sp[data-v="4"]',
  },
  {
    id: 'corner', title: 'Put Rico on a corner',
    text: 'Dealers sell your product on the street for dirty cash.',
    done: () => state.goons.some((g) => g.post?.kind === 'corner'), action: 'SHOW ME', target: '[data-a=pick][data-k=corner]',
  },
  {
    id: 'earn', title: 'Make $1,500 on the street',
    text: 'Keep the chain fed with seeds and soil. Hire more crew in CREW if you need hands.',
    done: () => state.stats.earned >= 1500,
  },
  {
    id: 'shine', title: 'Start a moonshine still',
    text: 'Build a Mash Barrel and a Copper Still, then order Mash Kits from Sal.',
    done: () => made('moonshine'), action: 'SELECT IT', target: '[data-a=place][data-v=barrel], [data-a=place][data-v=still]',
  },
  {
    id: 'take', title: 'Take over a neighbouring block',
    text: 'More turf means more corners. Send muscle to a block next to yours.',
    done: () => playerBlocks().length >= 2, action: 'SHOW ME', target: '[data-a=pick][data-k=takeover]',
  },
  {
    id: 'front', title: 'Buy a front to launder money',
    text: 'Laundromats, video stores and diners turn dirty cash into clean cash.',
    done: () => Object.keys(state.biz).map(Number).some((id) => state.biz[id].mode === 'owned' && BIZ[map.lots[id].kind as BizKind].launder > 0),
  },
  {
    id: 'meth', title: 'Cook your first meth',
    text: 'Build a Lab Bench (Cook meth) and Cooling Trays. Order Lab Chemicals.',
    done: () => made('meth'), action: 'SELECT IT', target: '[data-a=place][data-v=reactor], [data-a=place][data-v=trays]',
  },
  {
    id: 'party', title: 'Make MDMA or LSD',
    text: 'Switch a Lab Bench recipe, then press pills or dose blotter.',
    done: () => made('mdma') || made('lsd'),
  },
  {
    id: 'import', title: 'Own the Marina and import',
    text: 'Coca leaves and raw opium are cheap by boat. The Marina is at the Port.',
    done: () => state.stats.imports > 0,
  },
  {
    id: 'hard', title: 'Refine cocaine or heroin',
    text: 'Leaf Pit or Boil Pot, then a Refinery. Big money, big heat.',
    done: () => made('cocaine') || made('heroin'),
  },
  {
    id: 'city', title: 'Run the whole city',
    text: 'Wipe out Los Flamingos, the Barracudas and the Tiger Mob.',
    done: () => state.gangs.every((g, i) => i === 0 || !g.alive),
  },
];

export const TUTORIAL_LEN = 7;

export function currentStep() {
  return STEPS.find((s) => !state.objectives.includes(s.id)) ?? null;
}

export function checkObjectives() {
  const s = currentStep();
  if (!s || !s.done()) return;
  state.objectives.push(s.id);
  const idx = STEPS.indexOf(s);
  toast(idx < TUTORIAL_LEN ? `DONE: ${s.title}` : `GOAL DONE: ${s.title}`, 'good');
  bus.emit('stepdone', s.id);
  bus.emit('changed');
}

export function skipTutorial() {
  for (const s of STEPS.slice(0, TUTORIAL_LEN)) if (!state.objectives.includes(s.id)) state.objectives.push(s.id);
  bus.emit('changed');
}
