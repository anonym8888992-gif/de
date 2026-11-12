import { bus, toast } from '../bus';
import { BIZ, CHAINS, DISTRICTS, recipeProduct, STATIONS, type BizKind, type ItemId, type ProductId, type StationId, type SupplyId } from '../config';
import { clock, map, money, playerBlocks, state, view } from '../state';
import { pushMsg } from './phone';
import { fire } from './sim';

/**
 * Story mode. Seven chapters, one sin and one product each. A chapter's goals must all be
 * done AND its successor's minDay reached before the next chapter (and its product) unlocks.
 *
 * Pacing target: ~9-12 real hours for a fast player. At >>> a game day is ~3 real minutes
 * (GAME_MIN_PER_SEC = 2), so the campaign is sized to roughly 160-180 game days. minDay gates
 * are a floor; goal amounts are sized so an efficient player hits them close to the gate.
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
  /** tutorial step: shown one at a time with SHOW ME before the rest of the chapter */
  tut?: boolean;
}

export interface BeatChoice {
  label: string;
  /** return false to keep the message open (e.g. can't afford it) */
  effect: () => boolean | void;
}

/** Mid-chapter phone story: fires after a goal is done or N days into the chapter. */
export interface Beat {
  id: string;
  after?: string;
  day?: number;
  from: string;
  text: string;
  choices?: BeatChoice[];
  effect?: () => void;
}

export interface Chapter {
  num: string;
  sin: string;
  title: string;
  product: ProductId;
  /** earliest in-game day this chapter can start */
  minDay: number;
  /** chapter opens with one-at-a-time tutorial goals (tut: true) */
  guided?: boolean;
  from: string;
  story: string[];
  goals: Goal[];
  beats: Beat[];
}

const stations = () => Object.values(state.biz).flatMap((b) => b.stations);
const count = (t: StationId) => stations().filter((s) => s.type === t).length;
const has = (t: StationId) => count(t) > 0;
const made = (p: ProductId) => state.stats.made[p] ?? 0;
const blocks = () => playerBlocks().length;
const ownedIds = () => Object.keys(state.biz).map(Number).filter((id) => state.biz[id].mode === 'owned');
const owns = (k: BizKind, mode?: 'owned') => Object.keys(state.biz).map(Number).some((id) => map.lots[id].kind === k && (!mode || state.biz[id].mode === mode));
const fronts = () => ownedIds().filter((id) => BIZ[map.lots[id].kind as BizKind].launder > 0).length;
const upgrades = () => ownedIds().reduce((a, id) => a + state.biz[id].upgrades.length, 0);
const guards = () => state.goons.filter((g) => g.post?.kind === 'guard').length;
const deadGangs = () => state.gangs.filter((g, i) => i > 0 && !g.alive).length;
const fmt = (n: number) => n.toLocaleString('en-US');

const makeGoal = (id: string, p: ProductId, n: number, title: string, text: string): Goal => ({
  id, title, text, done: () => made(p) >= n, progress: () => [Math.min(n, made(p)), n],
});
const counter = (id: string, n: number, get: () => number, title: string, text: string, isMoney = false): Goal => ({
  id, title: title.replace('#', isMoney ? money(n) : fmt(n)), text, done: () => get() >= n, progress: () => [Math.min(n, Math.floor(get())), n],
});

// beat effects
const payDirty = (n: number) => {
  if (state.dirty < n) { toast(`You need ${money(n)} in dirty cash.`, 'warn'); return false; }
  state.dirty -= n;
  return true;
};
const heat = (d: number) => { state.heat = Math.max(0, Math.min(100, state.heat + d)); };
const give = (item: ItemId, n: number) => { state.stash[item] += n; };
const gangPower = (gi: number, d: number) => { const g = state.gangs[gi]; if (g?.alive) g.power = Math.max(0.6, Math.min(3, g.power + d)); };
const nick = (n: string) => state.goons.find((g) => g.nick === n);

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
      { tut: true, id: 'enter', title: 'Go to your stash house', text: 'Uncle Vic\'s place is in Palmetto Flats. This is where you cook.', done: () => view.scene === 'interior' || has('tent'), action: 'TAKE ME THERE', target: '[data-a=enter]' },
      { tut: true, id: 'tent', title: 'Build a Grow Tent', text: 'Click GROW TENT in the build bar, then click an empty spot on the floor.', done: () => has('tent'), action: 'SELECT IT', target: '[data-a=place][data-v=tent]' },
      { tut: true, id: 'dry', title: 'Build a Drying Rack and a Trim Table', text: 'Weed goes Grow Tent > Drying Rack > Trim Table. Place both.', done: () => has('rack') && has('trim'), action: 'SELECT NEXT', target: '[data-a=place][data-v=rack], [data-a=place][data-v=trim]' },
      { tut: true, id: 'worker', title: 'Put Sonny to work', text: 'Stations only run with a worker. One worker keeps two stations busy.', done: () => state.goons.some((g) => g.post?.kind === 'work'), action: 'ASSIGN', target: '[data-a=pick][data-k=work]' },
      { tut: true, id: 'seeds', title: 'Order seeds and soil from Sal', text: 'Sal sells supplies. His van drops them at your stash house.', done: () => state.stats.orders > 0, action: 'CALL SAL', target: '[data-a=order]' },
      { tut: true, ...makeGoal('harvest', 'weed', 1, 'Bag your first weed', 'Grow, dry, trim. Press 3 or >>> to speed time up.'), action: 'SPEED UP', target: '.sp[data-v="4"]' },
      { tut: true, id: 'corner', title: 'Put Rico on a corner', text: 'Dealers sell your product on the street for dirty cash.', done: () => state.goons.some((g) => g.post?.kind === 'corner'), action: 'SHOW ME', target: '[data-a=pick][data-k=corner]' },
      { tut: true, id: 'earn1', title: 'Make $1,500 on the street', text: 'Keep the tent fed with seeds and soil.', done: () => state.stats.earned >= 1500, progress: () => [Math.min(1500, Math.floor(state.stats.earned)), 1500] },
      { id: 'hire1', title: 'Hire someone new', text: 'Open CREW and hire. Smart workers cook faster, tough ones fight better.', done: () => state.stats.hired > 0 },
      { id: 'tents2', title: 'Run two Grow Tents', text: 'One worker keeps two stations busy. Put a second worker on the line.', done: () => count('tent') >= 2, progress: () => [Math.min(2, count('tent')), 2], action: 'BUILD' },
      makeGoal('weed200', 'weed', 200, 'Bag 200 weed', 'Palmetto Flats and Little Havana smoke the most.'),
      counter('earn6k', 6000, () => state.stats.earned, 'Make # on the street', 'Lifetime street sales. Vic\'s lawyer isn\'t cheap.', true),
    ],
    beats: [
      { id: 'vic1', after: 'harvest', from: 'UNCLE VIC (COUNTY JAIL)', text: 'Your first bag? I can smell it through the phone, kid. Now listen: Sal delivers, the boys sell, you count. Don\'t sample the merchandise. That\'s how I lost my eyebrows in \'79.' },
      { id: 'sal1', after: 'earn1', from: 'SAL', text: 'Heard you\'re moving product. Good. Little tip from your uncle Sal: a second tent pays for itself in a couple of days. And hire somebody, you can\'t run a business on two guys named after a hairstyle.' },
      {
        id: 'rico', day: 4, from: 'RICO "KNUCKLES"',
        text: 'Boss, there\'s a gold chain at the pawn shop. Real gold. Almost. $500. A man on a corner needs respect, you know? People see the chain, they don\'t mess with Rico.',
        choices: [
          { label: 'BUY IT ($500)', effect: () => { if (!payDirty(500)) return false; const g = nick('Knuckles'); if (g) g.nerve = Math.min(10, g.nerve + 2); toast('Rico won\'t stop touching the chain. His nerve is up.', 'good'); } },
          { label: 'NO', effect: () => toast('Rico sulks. He\'ll live.', 'info') },
        ],
      },
    ],
  },
  {
    num: 'II', sin: 'GLUTTONY', title: 'White Lightning', product: 'moonshine', minDay: 8,
    from: 'EARL PRUITT, A VOICE LIKE GRAVEL',
    story: [
      'A pickup with Georgia plates parks outside. Earl Pruitt, seventy, one eye, smells like a burning distillery. He ran shine with Vic back when Vic still had hair.',
      '"Folks down here drink like the world\'s endin\'. Mash, barrel, copper still. You make it, I\'ll teach you to sell it."',
      'He leaves you a crate of mash kits and a warning: "Don\'t drink the first jar. Nobody drinks the first jar."',
    ],
    goals: [
      { id: 'still', title: 'Set up a Mash Barrel and Copper Still', text: 'Both unlocked in the build bar. Mash Kits come from Sal.', done: () => has('barrel') && has('still'), action: 'SELECT IT', target: '[data-a=place][data-v=barrel], [data-a=place][data-v=still]' },
      { id: 'barrels3', title: 'Run three Mash Barrels', text: 'A still drinks faster than one barrel can ferment.', done: () => count('barrel') >= 3, progress: () => [Math.min(3, count('barrel')), 3], action: 'BUILD' },
      { id: 'take1', title: 'Take over a neighbouring block', text: 'More turf, more corners. Send muscle to a block next to yours.', done: () => blocks() >= 2, action: 'SHOW ME', target: '[data-a=pick][data-k=takeover]' },
      counter('crew4', 4, () => state.goons.length, 'Grow your crew to #', 'Workers, dealers, muscle. Everybody wants a job.'),
      makeGoal('shine400', 'moonshine', 400, 'Distil 400 jars of moonshine', 'Little Havana and Palmetto Flats drink the most.'),
      counter('blocks3', 3, blocks, 'Control # blocks', 'Guards make turf stick.'),
      counter('earn25k', 25000, () => state.stats.earned, 'Make # on the street', 'Lifetime street sales.', true),
    ],
    beats: [
      { id: 'earl1', after: 'still', from: 'EARL PRUITT', text: 'Smell that? That\'s the smell of money and a little bit of brain damage. Three barrels to one still, that\'s the ratio. One barrel just makes a still sad.', effect: () => give('mashkit', 4) },
      {
        id: 'revenue', day: 6, from: 'EARL PRUITT',
        text: 'Revenue man named Dwight\'s been sniffin\' round the Flats askin\' about "agricultural odours". Fifteen hundred and he forgets the whole county. Or we tell him to git, and he tells everybody.',
        choices: [
          { label: 'PAY DWIGHT ($1,500)', effect: () => { if (!payDirty(1500)) return false; heat(-15); toast('Dwight bought a boat. Heat down.', 'good'); } },
          { label: 'RUN HIM OFF', effect: () => { heat(15); toast('Dwight filed a report. Heat up.', 'bad'); } },
        ],
      },
      { id: 'earl2', after: 'shine400', from: 'EARL PRUITT', text: 'Four hundred jars. Vic\'d be proud, then he\'d drink half of \'em. I\'m headin\' back to Georgia. There\'s a professor fella askin\' about you. Talks like a dictionary. Be careful, he\'s got that look.' },
    ],
  },
  {
    num: 'III', sin: 'WRATH', title: 'The Professor', product: 'meth', minDay: 20,
    from: 'PROF. LIONEL PIKE, FORMERLY OF DADE COMMUNITY COLLEGE',
    story: [
      'Lionel Pike taught chemistry for twenty-two years. Then the school replaced him with a filmstrip. He has been angry ever since.',
      '"I can teach your people to cook something blue and very, very profitable. Lab Bench, then cooling trays. It is loud. It is smelly. The police will notice."',
      '"Also, you will need clean money. Nobody buys a lab bench with a shoebox of twenties. Get yourself a laundromat."',
    ],
    goals: [
      { id: 'front', title: 'Buy a front business', text: 'Laundromats, video stores and diners launder dirty cash into clean.', done: () => fronts() > 0 },
      counter('launder15', 15000, () => state.stats.laundered, 'Launder #', 'Fronts wash a little every hour. Clean money buys the big stuff.', true),
      { id: 'lab', title: 'Build a Lab Bench and Cooling Trays', text: 'The Lab Bench is expensive. Launder some money first.', done: () => has('reactor') && has('trays'), action: 'SELECT IT', target: '[data-a=place][data-v=reactor], [data-a=place][data-v=trays]' },
      counter('guards2', 2, guards, 'Keep # guards posted', 'Meth makes enemies. Guards keep your blocks.'),
      makeGoal('meth400', 'meth', 400, 'Cook 400 bags of meth', 'Meth pays well and brings heat. Watch your wanted level.'),
      counter('blocks5', 5, blocks, 'Control # blocks', 'Take turf from the gangs.'),
    ],
    beats: [
      { id: 'pike1', after: 'lab', from: 'PROF. PIKE', text: 'A bench! Splendid. Now, a lecture. The trays must never be rushed, the workers must never be stupid, and you must never, ever let anyone call it "cooking" in front of me. It is SCIENCE. Mostly.' },
      {
        id: 'tenure', day: 7, from: 'PROF. PIKE',
        text: 'I have been reviewing my compensation package. Twenty-two years and the college gave me a mug. I want tenure. Tenure is $4,000. In return I will "find" some lab supplies. Refuse and I will complain. Loudly. In diners.',
        choices: [
          { label: 'GIVE HIM TENURE ($4,000)', effect: () => { if (!payDirty(4000)) return false; give('chems', 8); toast('Pike found 8 Lab Chemicals "in storage".', 'good'); } },
          { label: 'REFUSE', effect: () => { heat(20); toast('Pike ranted about "blue product" at the Coral Diner. Heat up.', 'bad'); } },
        ],
      },
      { id: 'vic3', after: 'meth400', from: 'UNCLE VIC (COUNTY JAIL)', text: 'Kid. Guys in here are talking about blue product from Palmetto Flats. In HERE. You know what that means? It means you\'re loud. I said start small. I didn\'t say start a war. ...But I\'m a little proud.' },
    ],
  },
  {
    num: 'IV', sin: 'LUST', title: 'Velvet', product: 'mdma', minDay: 36,
    from: 'VELVET, PROMOTER, OCEAN DRIVE',
    story: [
      'Velvet wears sunglasses, a white suit and a smile that costs extra. She runs the door at every club on Ocean Drive worth getting into.',
      '"The kids don\'t want your swamp water, darling. They want to dance until Tuesday. Pills. Pink ones. With a little dolphin on."',
      '"Switch a Lab Bench to MDMA, buy a pill press, and get me a club. Then we talk."',
    ],
    goals: [
      { id: 'press', title: 'Get a Pill Press running', text: 'Switch a Lab Bench recipe to MDMA in its panel, add a Pill Press.', done: () => has('press'), action: 'SELECT IT', target: '[data-a=place][data-v=press]' },
      { id: 'club', title: 'Own or shake down a nightclub', text: 'Clubs are Downtown and on Ocean Drive. Take the block first.', done: () => owns('nightclub') },
      { id: 'ocean', title: 'Hold a block on Ocean Drive', text: 'Tiger Mob runs Ocean Drive. Not for long.', done: () => map.blocks.some((b) => b.district === 2 && state.turf[b.id].owner === 0) },
      counter('fronts2', 2, fronts, 'Own # laundering fronts', 'Pills make a lot of dirty cash. Wash it.'),
      counter('crew8', 8, () => state.goons.length, 'Grow your crew to #', 'Arcades bring more recruits every morning.'),
      makeGoal('mdma2000', 'mdma', 2000, 'Press 2,000 pills', 'Ocean Drive goes crazy for these.'),
    ],
    beats: [
      { id: 'velvet1', after: 'club', from: 'VELVET', text: 'A club! Look at you, all grown up. Velvet rope, velvet booth, Velvet. Keep the pills pink and the bouncers stupid and we\'ll get along beautifully.' },
      {
        id: 'biglou', day: 8, from: 'VELVET',
        text: 'Darling, small problem. Big Lou from the Tiger Mob says Ocean Drive is "his beach". He wants $8,000 to stay off it for a while. Personally I think he wants a fight. Personally I think you could give him one.',
        choices: [
          { label: 'PAY BIG LOU ($8,000)', effect: () => { if (!payDirty(8000)) return false; state.gangs[3].truceUntil = state.minutes + 3 * 1440; toast('Tiger Mob backs off for three days.', 'good'); } },
          { label: 'TELL HIM TO SWIM', effect: () => { gangPower(3, 0.4); toast('Tiger Mob is arming up. They\'re coming.', 'bad'); } },
        ],
      },
      { id: 'velvet2', after: 'mdma2000', from: 'VELVET', text: 'Two thousand pills and not one fatality. That\'s a record on this beach. Here\'s a little something from the door.', effect: () => { state.clean += 3000; } },
    ],
  },
  {
    num: 'V', sin: 'PRIDE', title: 'Doctor Sunshine', product: 'lsd', minDay: 56,
    from: 'DOCTOR SUNSHINE (NOT A REAL DOCTOR)',
    story: [
      'A painted VW van rolls up the beach. Doctor Sunshine has a beard, no shoes and a PhD he describes as "spiritual".',
      '"Man, you\'re thinking too small. Small minds, small money. I can show you how to open the doors of perception. Also how to put it on paper."',
      'He tells you the only thing more dangerous than the cops is believing your own hype. Then he eats a sandwich he found in your car.',
    ],
    goals: [
      { id: 'blotter', title: 'Set up a Blotter Bench', text: 'Lab Bench on "Make LSD" plus Fungus Culture and Blotter Paper.', done: () => has('blotter'), action: 'SELECT IT', target: '[data-a=place][data-v=blotter]' },
      counter('upg3', 3, upgrades, 'Own # business upgrades', 'Open a business you own and buy upgrades.'),
      counter('crew10', 10, () => state.goons.length, 'Grow your crew to #', 'An empire needs a payroll.'),
      counter('blocks8', 8, blocks, 'Control # blocks', 'Pride says take more. For once, listen.'),
      makeGoal('lsd3000', 'lsd', 3000, 'Dose 3,000 tabs', 'Ocean Drive and Downtown buy the most.'),
      counter('earn250k', 250000, () => state.stats.earned, 'Make # on the street', 'Lifetime street sales.', true),
    ],
    beats: [
      { id: 'doc1', after: 'blotter', from: 'DOCTOR SUNSHINE', text: 'Groovy. Little squares of happiness, man. Every sheet is a tiny sun. Don\'t look directly at it. Actually don\'t look at it at all, the cops can tell.' },
      { id: 'vic5', day: 6, from: 'UNCLE VIC (COUNTY JAIL)', text: 'The guards asked me for your autograph today. THE GUARDS, kid. You know what happens to guys who get famous? They get a documentary. And then they get a cell. Stay humble.' },
      {
        id: 'festival', day: 12, from: 'DOCTOR SUNSHINE',
        text: 'Man, I had a vision. The Sunshine Festival. Bands on the beach, free love, and every cop in Miami working overtime directing traffic instead of watching you. Needs $15,000. For the vibes.',
        choices: [
          { label: 'SPONSOR IT ($15,000)', effect: () => { if (!payDirty(15000)) return false; heat(-35); toast('Every cop in town is directing festival traffic. Heat way down.', 'good'); } },
          { label: 'NO VIBES', effect: () => toast('Doctor Sunshine says your aura is "beige".', 'info') },
        ],
      },
    ],
  },
  {
    num: 'VI', sin: 'GREED', title: 'The Exporter', product: 'cocaine', minDay: 80,
    from: 'DON AURELIO, "IMPORT / EXPORT"',
    story: [
      'A yacht you could live on drops anchor off the Port. Don Aurelio is polite, soft-spoken and owns three of everything.',
      '"I have leaves. You have a city. If you buy the Marina, my boats bring you coca by the bale for a fraction of what your friend Sal charges."',
      '"Paste in a leaf pit, then refine. It is very simple. What is not simple is what happens if you cheat me."',
    ],
    goals: [
      { id: 'marina', title: 'Own the Marina', text: 'The Marina is at the Port. Take the block, then buy it.', done: () => owns('marina', 'owned') },
      counter('imports4', 4, () => state.stats.imports, 'Bring in # boats', 'SUPPLIES > MARINA tab. Coca leaves arrive by sea.'),
      counter('blocks12', 12, blocks, 'Control # blocks', 'Aurelio only works with people who own the street.'),
      { id: 'wipe1', title: 'Wipe out a rival gang', text: 'Take every block they hold.', done: () => deadGangs() >= 1 },
      makeGoal('coke500', 'cocaine', 500, 'Refine 500 cocaine', 'Leaf Pit, then Refinery. Downtown pays top dollar.'),
      counter('launder250', 250000, () => state.stats.laundered, 'Launder #', 'Greed needs a clean paper trail.', true),
    ],
    beats: [
      { id: 'don1', after: 'marina', from: 'DON AURELIO', text: 'Welcome to the import business. My captains are punctual, my bales are dry, and my patience is a rumour. Please enjoy the view from the pier.' },
      {
        id: 'rat', day: 8, from: 'RICO "KNUCKLES"',
        text: 'Boss. Your newest guy. I saw him at the Coral Diner with a man in a cheap suit. Federal cheap. I\'m not saying he\'s a rat. I\'m saying he ordered the fish, and nobody orders the fish.',
        choices: [
          { label: 'CUT HIM LOOSE', effect: () => {
            const g = [...state.goons].reverse().find((x) => x.status !== 'op' && x.nick !== 'Knuckles' && x.nick !== 'Shades');
            if (g) fire(g.id);
            toast('Problem solved. Quietly.', 'info');
          } },
          { label: 'TRUST HIM', effect: () => { heat(30); toast('He was a rat. The DEA knows things now. Heat way up.', 'bad'); } },
        ],
      },
      { id: 'don2', after: 'wipe1', from: 'DON AURELIO', text: 'One gang fewer. Impressive. In my country we have a saying: the shark who eats every fish ends up alone in a very large ocean. Anyway. More boats are coming.' },
    ],
  },
  {
    num: 'VII', sin: 'ENVY', title: 'Everyone Wants Your Crown', product: 'heroin', minDay: 106,
    from: 'THE DUTCHMAN, PIER 7',
    story: [
      'Word travels. Every crook from Key West to Jacksonville wants what you built. The Dutchman runs the old port and the old poison.',
      '"Raw opium, boil it down, refine it. It sells itself. It also ruins everything it touches, including you, eventually."',
      'Uncle Vic calls from jail. He sounds tired. "Kid... I said don\'t get greedy." Then the line goes dead.',
    ],
    goals: [
      { id: 'boil', title: 'Set up a Boil Pot', text: 'Raw Opium comes from Sal, or cheaper by boat.', done: () => has('boiler'), action: 'SELECT IT', target: '[data-a=place][data-v=boiler]' },
      { id: 'ref2', title: 'Run two Refineries', text: 'Cocaine and heroin both need refining. One refinery won\'t cut it.', done: () => count('refinery') >= 2, progress: () => [Math.min(2, count('refinery')), 2], action: 'BUILD' },
      counter('blocks20', 20, blocks, 'Control # blocks', 'Push them back. All of them.'),
      makeGoal('heroin600', 'heroin', 600, 'Refine 600 heroin', 'The Port pays the most. So does the heat.'),
      counter('earn1m', 1000000, () => state.stats.earned, 'Make # on the street', 'Lifetime street sales. A million, kid.', true),
      { id: 'wipeall', title: 'Run the whole city', text: 'Wipe out Los Flamingos, the Barracudas and the Tiger Mob.', done: () => deadGangs() >= 3, progress: () => [deadGangs(), 3] },
    ],
    beats: [
      { id: 'dutch1', after: 'boil', from: 'THE DUTCHMAN', text: 'So. You boil now. Everybody boils eventually. I give you a free lesson: the poison is never the product. The poison is wanting more.' },
      {
        id: 'tribute', day: 12, from: 'THE DUTCHMAN',
        text: 'The others are jealous of you. Envy is expensive. For $50,000 I tell my friends on the docks to stop selling guns to your enemies. Or keep your money, and see how jealous they get.',
        choices: [
          { label: 'PAY ($50,000)', effect: () => { if (!payDirty(50000)) return false; for (let i = 1; i < 4; i++) gangPower(i, -0.4); toast('The gun shipments dry up. Rivals are weaker.', 'good'); } },
          { label: 'KEEP IT', effect: () => { for (let i = 1; i < 4; i++) gangPower(i, 0.3); toast('Fresh crates arrive at every rival hideout.', 'bad'); } },
        ],
      },
      { id: 'vic7', day: 24, from: 'UNCLE VIC (COUNTY JAIL)', text: 'Parole hearing\'s coming up. My lawyer says "good behaviour". I said I been nothing but good. Kid... when I get out, is there gonna be anything left of Miami? Or just you?' },
    ],
  },
];

export const TUT_GOALS = CHAPTERS[0].goals.filter((g) => g.tut);

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

/** True while the chapter I tutorial steps are still running. */
export function guidedNow() {
  const ch = chapter();
  return !!ch.guided && ch.goals.some((g) => g.tut && !goalDone(g));
}

/** The active tutorial step while guided, else the first unfinished goal. */
export function currentGoal() {
  const ch = chapter();
  if (guidedNow()) return ch.goals.find((g) => g.tut && !goalDone(g)) ?? null;
  return ch.goals.find((g) => !goalDone(g)) ?? null;
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

/** Days since the current chapter began. */
function chapterDays() {
  return (state.minutes - (state.chapterAt ?? 0)) / 1440;
}

function fireBeat(b: Beat) {
  const key = `beat:${b.id}`;
  if (state.objectives.includes(key)) return;
  state.objectives.push(key);
  b.effect?.();
  pushMsg(b.from, b.text, (b.choices ?? []).map((c, i) => ({ label: c.label, action: 'story', data: { beat: b.id, choice: i } })), 9999);
  toast(`CALL: ${b.from}${b.choices ? ' needs an answer' : ''}`, b.choices ? 'warn' : 'info');
}

/** Phone answer for a story choice. Returns true when the message can be removed. */
export function resolveBeat(id: string, idx: number) {
  const b = CHAPTERS.flatMap((c) => c.beats).find((x) => x.id === id);
  const c = b?.choices?.[idx];
  if (!c) return true;
  const ok = c.effect() !== false;
  if (ok) bus.emit('changed');
  return ok;
}

export function checkObjectives() {
  const ch = chapter();
  const guided = guidedNow();
  const pending = guided ? [currentGoal()].filter((g): g is Goal => !!g) : ch.goals.filter((g) => !goalDone(g));
  for (const g of pending) {
    if (!g.done()) continue;
    state.objectives.push(g.id);
    toast(`DONE: ${g.title}`, 'good');
    bus.emit('stepdone', g.id);
    bus.emit('changed');
    for (const b of ch.beats) if (b.after === g.id) fireBeat(b);
    if (guided) break;
  }
  if (!guidedNow()) for (const b of ch.beats) if (b.day !== undefined && chapterDays() >= b.day) fireBeat(b);
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
  state.chapterAt = state.minutes;
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
  for (const g of TUT_GOALS.slice(0, -1)) if (!goalDone(g)) state.objectives.push(g.id);
  bus.emit('changed');
}

/** District with the highest demand for a product, for hints. */
export function bestDistrict(p: ProductId) {
  return [...DISTRICTS].sort((a, b) => b.demand[p] - a.demand[p])[0].name;
}
