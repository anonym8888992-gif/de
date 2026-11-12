import { bus, toast } from '../bus';
import { BIZ, CHAINS, DISTRICTS, recipeProduct, STATIONS, type BizKind, type ProductId, type StationId, type SupplyId } from '../config';
import { clock, map, playerBlocks, state, view } from '../state';
import { pushMsg } from './phone';

/**
 * Story mode. Seven chapters, one sin and one product each. A chapter's goals must all be
 * done AND its successor's minDay reached before the next chapter (and its product) unlocks.
 * This is the main pacing lever: tune minDay and goal amounts here.
 */

export interface Goal {
  id: string;
  title: string;
  text: string;
  done: () => boolean;
  /** shows a progress counter like 12/40 */
  progress?: () => [number, number];
  /** SHOW ME button label; behaviour lives in ui.ts tutAction() keyed by goal id */
  action?: string;
  /** CSS selector pulsed while this goal is the active guided step */
  target?: string;
}

export interface Chapter {
  num: string;
  sin: string;
  title: string;
  product: ProductId;
  /** earliest in-game day this chapter can start */
  minDay: number;
  /** guided chapters show one goal at a time with SHOW ME buttons */
  guided?: boolean;
  from: string;
  story: string[];
  goals: Goal[];
}

const has = (t: StationId) => Object.values(state.biz).some((b) => b.stations.some((s) => s.type === t));
const made = (p: ProductId) => state.stats.made[p] ?? 0;
const blocks = () => playerBlocks().length;
const owns = (k: BizKind, mode?: 'owned') => Object.keys(state.biz).map(Number).some((id) => map.lots[id].kind === k && (!mode || state.biz[id].mode === mode));
const deadGangs = () => state.gangs.filter((g, i) => i > 0 && !g.alive).length;
const worth = () => state.clean + state.dirty;

const makeGoal = (id: string, p: ProductId, n: number, title: string, text: string): Goal => ({
  id, title, text, done: () => made(p) >= n, progress: () => [Math.min(n, made(p)), n],
});

export const CHAPTERS: Chapter[] = [
  {
    num: 'I', sin: 'SLOTH', title: 'Uncle Vic\'s Place', product: 'weed', minDay: 1, guided: true,
    from: 'UNCLE VIC, MIAMI-DADE COUNTY JAIL',
    story: [
      'Miami, 1986. Your uncle Vic got two years for a parking ticket. Long story. He left you his house in Palmetto Flats, two loyal idiots named Sonny and Rico, and one piece of advice:',
      '"Start small, kid. Grow a little green, sell it on the corner, don\'t get greedy. Greedy gets you a cell next to mine."',
      'The back room still smells like his last harvest. Time to get lazy and let the plants do the work.',
    ],
    goals: [
      { id: 'enter', title: 'Go to your stash house', text: 'Uncle Vic\'s place is in Palmetto Flats. This is where you cook.', done: () => view.scene === 'interior' || has('tent'), action: 'TAKE ME THERE', target: '[data-a=enter]' },
      { id: 'tent', title: 'Build a Grow Tent', text: 'Click GROW TENT in the build bar, then click an empty spot on the floor.', done: () => has('tent'), action: 'SELECT IT', target: '[data-a=place][data-v=tent]' },
      { id: 'dry', title: 'Build a Drying Rack and a Trim Table', text: 'Weed goes Grow Tent > Drying Rack > Trim Table. Place both.', done: () => has('rack') && has('trim'), action: 'SELECT NEXT', target: '[data-a=place][data-v=rack], [data-a=place][data-v=trim]' },
      { id: 'worker', title: 'Put Sonny to work', text: 'Stations only run with a worker. One worker keeps two stations busy.', done: () => state.goons.some((g) => g.post?.kind === 'work'), action: 'ASSIGN', target: '[data-a=pick][data-k=work]' },
      { id: 'seeds', title: 'Order seeds and soil from Sal', text: 'Sal sells supplies. His van drops them at your stash house.', done: () => state.stats.orders > 0, action: 'CALL SAL', target: '[data-a=order]' },
      { ...makeGoal('harvest', 'weed', 1, 'Bag your first weed', 'Grow, dry, trim. Press 3 or >>> to speed time up.'), action: 'SPEED UP', target: '.sp[data-v="4"]' },
      { id: 'corner', title: 'Put Rico on a corner', text: 'Dealers sell your product on the street for dirty cash.', done: () => state.goons.some((g) => g.post?.kind === 'corner'), action: 'SHOW ME', target: '[data-a=pick][data-k=corner]' },
      { id: 'earn1', title: 'Make $1,500 on the street', text: 'Keep the tent fed with seeds and soil. Hire more crew if you need hands.', done: () => state.stats.earned >= 1500, progress: () => [Math.min(1500, Math.floor(state.stats.earned)), 1500] },
    ],
  },
  {
    num: 'II', sin: 'GLUTTONY', title: 'White Lightning', product: 'moonshine', minDay: 3,
    from: 'EARL PRUITT, A VOICE LIKE GRAVEL',
    story: [
      'A pickup with Georgia plates parks outside. Earl Pruitt, seventy, one eye, smells like a burning distillery. He ran shine with Vic back when Vic still had hair.',
      '"Folks down here drink like the world\'s endin\'. Mash, barrel, copper still. Eight hours to ferment, ninety minutes to run. You make it, I\'ll teach you to sell it."',
      'He leaves you a crate of mash kits and a warning: "Don\'t drink the first jar. Nobody drinks the first jar."',
    ],
    goals: [
      { id: 'still', title: 'Set up a Mash Barrel and Copper Still', text: 'Both unlocked in the build bar. Mash Kits come from Sal.', done: () => has('barrel') && has('still'), action: 'SELECT IT', target: '[data-a=place][data-v=barrel], [data-a=place][data-v=still]' },
      makeGoal('shine40', 'moonshine', 40, 'Distil 40 jars of moonshine', 'Little Havana and Palmetto Flats drink the most.'),
      { id: 'take1', title: 'Take over a neighbouring block', text: 'More turf, more corners. Send muscle to a block next to yours.', done: () => blocks() >= 2, action: 'SHOW ME', target: '[data-a=pick][data-k=takeover]' },
      { id: 'hire1', title: 'Hire someone new', text: 'Open CREW and hire. Smart workers cook faster, tough ones fight better.', done: () => state.stats.hired > 0 },
    ],
  },
  {
    num: 'III', sin: 'WRATH', title: 'The Professor', product: 'meth', minDay: 5,
    from: 'PROF. LIONEL PIKE, FORMERLY OF DADE COMMUNITY COLLEGE',
    story: [
      'Lionel Pike taught chemistry for twenty-two years. Then the school replaced him with a filmstrip. He has been angry ever since.',
      '"I can teach your people to cook something blue and very, very profitable. Lab Bench, then cooling trays. It is loud. It is smelly. The police will notice."',
      '"Also, you will need clean money. Nobody buys a lab bench with a shoebox of twenties. Get yourself a laundromat."',
    ],
    goals: [
      { id: 'front', title: 'Buy a front business', text: 'Laundromats, video stores and diners launder dirty cash into clean.', done: () => Object.keys(state.biz).map(Number).some((id) => state.biz[id].mode === 'owned' && BIZ[map.lots[id].kind as BizKind].launder > 0) },
      { id: 'lab', title: 'Build a Lab Bench and Cooling Trays', text: 'The Lab Bench is expensive. Launder some money first.', done: () => has('reactor') && has('trays'), action: 'SELECT IT', target: '[data-a=place][data-v=reactor], [data-a=place][data-v=trays]' },
      makeGoal('meth36', 'meth', 36, 'Cook 36 bags of meth', 'Meth pays well and brings heat. Watch your wanted level.'),
      { id: 'blocks4', title: 'Control 4 blocks', text: 'Take turf from the gangs. Guards keep it.', done: () => blocks() >= 4, progress: () => [Math.min(4, blocks()), 4] },
    ],
  },
  {
    num: 'IV', sin: 'LUST', title: 'Velvet', product: 'mdma', minDay: 7,
    from: 'VELVET, PROMOTER, OCEAN DRIVE',
    story: [
      'Velvet wears sunglasses, a white suit and a smile that costs extra. She runs the door at every club on Ocean Drive worth getting into.',
      '"The kids don\'t want your swamp water, darling. They want to dance until Tuesday. Pills. Pink ones. With a little dolphin on."',
      '"Switch a Lab Bench to MDMA, buy a pill press, and get me a club. Then we talk."',
    ],
    goals: [
      { id: 'club', title: 'Own or shake down a nightclub', text: 'Clubs are Downtown and on Ocean Drive. Take the block first.', done: () => owns('nightclub') },
      { id: 'press', title: 'Get a Pill Press running', text: 'Switch a Lab Bench recipe to MDMA in its panel, add a Pill Press.', done: () => has('press'), action: 'SELECT IT', target: '[data-a=place][data-v=press]' },
      makeGoal('mdma120', 'mdma', 120, 'Press 120 pills', 'Ocean Drive goes crazy for these.'),
      { id: 'ocean', title: 'Hold a block on Ocean Drive', text: 'Tiger Mob runs Ocean Drive. Not for long.', done: () => map.blocks.some((b) => b.district === 2 && state.turf[b.id].owner === 0) },
    ],
  },
  {
    num: 'V', sin: 'PRIDE', title: 'Doctor Sunshine', product: 'lsd', minDay: 9,
    from: 'DOCTOR SUNSHINE (NOT A REAL DOCTOR)',
    story: [
      'A painted VW van rolls up the beach. Doctor Sunshine has a beard, no shoes and a PhD he describes as "spiritual".',
      '"Man, you\'re thinking too small. Small minds, small money. I can show you how to open the doors of perception. Also how to put it on paper."',
      'He tells you the only thing more dangerous than the cops is believing your own hype. Then he eats a sandwich he found in your car.',
    ],
    goals: [
      { id: 'blotter', title: 'Set up a Blotter Bench', text: 'Lab Bench on "Make LSD" plus Fungus Culture and Blotter Paper.', done: () => has('blotter'), action: 'SELECT IT', target: '[data-a=place][data-v=blotter]' },
      makeGoal('lsd150', 'lsd', 150, 'Dose 150 tabs', 'Ocean Drive and Downtown buy the most.'),
      { id: 'crew8', title: 'Grow your crew to 8', text: 'Arcades bring more recruits every morning.', done: () => state.goons.length >= 8, progress: () => [Math.min(8, state.goons.length), 8] },
      { id: 'worth60', title: 'Be worth $60,000', text: 'Clean plus dirty cash.', done: () => worth() >= 60000, progress: () => [Math.min(60000, Math.floor(worth())), 60000] },
    ],
  },
  {
    num: 'VI', sin: 'GREED', title: 'The Exporter', product: 'cocaine', minDay: 11,
    from: 'DON AURELIO, "IMPORT / EXPORT"',
    story: [
      'A yacht you could live on drops anchor off the Port. Don Aurelio is polite, soft-spoken and owns three of everything.',
      '"I have leaves. You have a city. If you buy the Marina, my boats bring you coca by the bale for a fraction of what your friend Sal charges."',
      '"Paste in a leaf pit, then refine. It is very simple. What is not simple is what happens if you cheat me."',
    ],
    goals: [
      { id: 'marina', title: 'Own the Marina', text: 'The Marina is at the Port. Take the block, then buy it.', done: () => owns('marina', 'owned') },
      { id: 'import1', title: 'Bring in a boat', text: 'SUPPLIES > MARINA tab. Coca leaves arrive by sea.', done: () => state.stats.imports > 0 },
      makeGoal('coke40', 'cocaine', 40, 'Refine 40 cocaine', 'Leaf Pit, then Refinery. Downtown pays top dollar.'),
      { id: 'wipe1', title: 'Wipe out a rival gang', text: 'Take every block they hold.', done: () => deadGangs() >= 1 },
    ],
  },
  {
    num: 'VII', sin: 'ENVY', title: 'Everyone Wants Your Crown', product: 'heroin', minDay: 14,
    from: 'THE DUTCHMAN, PIER 7',
    story: [
      'Word travels. Every crook from Key West to Jacksonville wants what you built. The Dutchman runs the old port and the old poison.',
      '"Raw opium, boil it down, refine it. It sells itself. It also ruins everything it touches, including you, eventually."',
      'Uncle Vic calls from jail. He sounds tired. "Kid... I said don\'t get greedy." Then the line goes dead.',
    ],
    goals: [
      { id: 'boil', title: 'Set up a Boil Pot', text: 'Raw Opium comes from Sal, or cheaper by boat.', done: () => has('boiler'), action: 'SELECT IT', target: '[data-a=place][data-v=boiler]' },
      makeGoal('heroin40', 'heroin', 40, 'Refine 40 heroin', 'The Port pays the most. So does the heat.'),
      { id: 'blocks20', title: 'Control 20 blocks', text: 'Push them back. All of them.', done: () => blocks() >= 20, progress: () => [Math.min(20, blocks()), 20] },
      { id: 'wipeall', title: 'Run the whole city', text: 'Wipe out Los Flamingos, the Barracudas and the Tiger Mob.', done: () => deadGangs() >= 3, progress: () => [deadGangs(), 3] },
    ],
  },
];

export const TUTORIAL_LEN = CHAPTERS[0].goals.length;

// ---------------------------------------------------------------------------
// unlocks

export function unlockedProducts(): ProductId[] {
  return CHAPTERS.slice(0, state.chapter + 1).map((c) => c.product);
}

export function productUnlocked(p: ProductId) {
  return unlockedProducts().includes(p);
}

export function stationUnlocked(t: StationId) {
  return STATIONS[t].recipes.some((_, i) => productUnlocked(recipeProduct(t, i)));
}

export function recipeUnlocked(t: StationId, idx: number) {
  return productUnlocked(recipeProduct(t, idx));
}

export function supplyUnlocked(s: SupplyId) {
  return CHAINS.some((c) => c.supplies.includes(s) && productUnlocked(c.product));
}

/** Chapter that unlocks a product (for "LOCKED: CHAPTER IV" labels). */
export function chapterFor(p: ProductId) {
  return CHAPTERS.find((c) => c.product === p)!;
}

// ---------------------------------------------------------------------------
// progression

export function chapter() {
  return CHAPTERS[Math.min(state.chapter, CHAPTERS.length - 1)];
}

export function goalDone(g: Goal) {
  return state.objectives.includes(g.id);
}

/** The single active goal in guided chapters, else the first unfinished one. */
export function currentGoal() {
  return chapter().goals.find((g) => !goalDone(g)) ?? null;
}

export function chapterComplete() {
  return chapter().goals.every(goalDone);
}

export function finished() {
  return state.chapter >= CHAPTERS.length - 1 && chapterComplete();
}

export function nextChapterDay() {
  return CHAPTERS[state.chapter + 1]?.minDay ?? 0;
}

export function checkObjectives() {
  const ch = chapter();
  const pending = ch.guided ? [currentGoal()].filter((g): g is Goal => !!g) : ch.goals.filter((g) => !goalDone(g));
  for (const g of pending) {
    if (!g.done()) continue;
    state.objectives.push(g.id);
    toast(`DONE: ${g.title}`, 'good');
    bus.emit('stepdone', g.id);
    bus.emit('changed');
    if (ch.guided) break;
  }
  if (!chapterComplete()) return;
  if (state.chapter >= CHAPTERS.length - 1) {
    if (!state.objectives.includes('__won')) {
      state.objectives.push('__won');
      bus.emit('victory');
    }
    return;
  }
  const next = CHAPTERS[state.chapter + 1];
  if (clock(state.minutes).day < next.minDay) return;
  state.chapter++;
  pushMsg(next.from, next.story.join(' '), [], 9999);
  toast(`CHAPTER ${next.num}: ${next.sin}. ${ITEMS_NAME[next.product]} UNLOCKED.`, 'good');
  bus.emit('changed');
  showChapterIfNeeded();
}

const ITEMS_NAME: Record<ProductId, string> = {
  weed: 'WEED', moonshine: 'MOONSHINE', meth: 'METH', mdma: 'MDMA', lsd: 'LSD', cocaine: 'COCAINE', heroin: 'HEROIN',
};

/** Shows the story card for the current chapter once. */
export function showChapterIfNeeded() {
  if (state.storySeen >= state.chapter) return;
  state.storySeen = state.chapter;
  bus.emit('story', state.chapter);
}

export function skipTutorial() {
  for (const g of CHAPTERS[0].goals.slice(0, TUTORIAL_LEN - 1)) if (!goalDone(g)) state.objectives.push(g.id);
  bus.emit('changed');
}

/** District with the highest demand for a product, for hints. */
export function bestDistrict(p: ProductId) {
  return [...DISTRICTS].sort((a, b) => b.demand[p] - a.demand[p])[0].name;
}
