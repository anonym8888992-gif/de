import Phaser from 'phaser';
import { bus } from '../bus';
import { GANGS, NEON, TILE } from '../config';
import { BX, BY, WORLD_H, WORLD_W, node, type Pt } from '../sim/cityMap';
import { map, state, stars, view, type Op } from '../state';
import type { Sign } from '../gfx/cityArt';

const S = 10 * TILE;

interface Amb {
  spr: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
  siren?: Phaser.GameObjects.Image;
  i: number;
  j: number;
  x: number;
  y: number;
  route: Pt[];
  speed: number;
  rx: number;
  ry: number;
  angle: number;
  cop: boolean;
}

interface Ped {
  spr: Phaser.GameObjects.Image;
  block: number;
  t: number;
  speed: number;
  off: number;
}

interface OpView {
  spr: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
  siren?: Phaser.GameObjects.Image;
  rx: number;
  ry: number;
  init: boolean;
  people: Phaser.GameObjects.Image[];
  kind: string;
}

const KEYS: [number, number][] = [
  [0, 0x4a3c8a], [4.5, 0x4a3c8a], [6, 0xffa0c0], [7.5, 0xffffff], [16.5, 0xffffff], [18, 0xffb890], [19.3, 0xff8ab0], [20.5, 0x6a52b8], [22, 0x4a3c8a], [24, 0x4a3c8a],
];

export function skyTint(minutes: number) {
  const h = (minutes % 1440) / 60;
  for (let k = 0; k < KEYS.length - 1; k++) {
    const [h0, c0] = KEYS[k];
    const [h1, c1] = KEYS[k + 1];
    if (h < h0 || h > h1) continue;
    const t = (h - h0) / (h1 - h0 || 1);
    const a = Phaser.Display.Color.IntegerToColor(c0);
    const b = Phaser.Display.Color.IntegerToColor(c1);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, t * 100);
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }
  return 0xffffff;
}

export function nightFactor(minutes: number) {
  const h = (minutes % 1440) / 60;
  if (h >= 7 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3;
  if (h >= 20.5 || h < 5) return 1;
  return 1 - (h - 5) / 2;
}

export class CityScene extends Phaser.Scene {
  private turfG!: Phaser.GameObjects.Graphics;
  private selG!: Phaser.GameObjects.Graphics;
  private tint!: Phaser.GameObjects.Rectangle;
  private amb: Amb[] = [];
  private peds: Ped[] = [];
  private opViews = new Map<number, OpView>();
  private goonSprites = new Map<number, Phaser.GameObjects.Image>();
  private gangIdle: Phaser.GameObjects.Image[] = [];
  private tags: Phaser.GameObjects.Image[] = [];
  private neon: { img: Phaser.GameObjects.Image; base: number; seed: number }[] = [];
  private lampGlows: Phaser.GameObjects.Image[] = [];
  private palms: { img: Phaser.GameObjects.Image; seed: number }[] = [];
  private decals: Phaser.GameObjects.Image[] = [];
  private hq!: Phaser.GameObjects.Image;
  private hover: { type: 'block' | 'lot'; id: number } | null = null;
  private drag = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private t = 0;
  private lastClick = { t: 0, lot: -1 };
  private offs: (() => void)[] = [];
  private turfKey = '';

  constructor() {
    super('City');
  }

  create(data: { signs: Sign[] }) {
    this.add.image(0, 0, 'city').setOrigin(0).setDepth(0);
    this.turfG = this.add.graphics().setDepth(2);
    this.selG = this.add.graphics().setDepth(30);

    for (const s of data.signs) {
      const key = s.color === NEON.pink ? 'glow_pink' : s.color === NEON.cyan ? 'glow_cyan' : s.color === NEON.yellow ? 'glow_yellow' : s.color === NEON.orange ? 'glow_orange' : 'glow_red';
      const img = this.add.image(s.x, s.y, key).setDepth(26).setBlendMode(Phaser.BlendModes.ADD).setScale((s.w + 30) / 64, 0.9).setAlpha(0);
      this.neon.push({ img, base: 0.9, seed: Math.random() * 10 });
    }
    for (const l of map.lamps) this.lampGlows.push(this.add.image(l.x, l.y, 'glow').setDepth(26).setBlendMode(Phaser.BlendModes.ADD).setScale(0.75).setAlpha(0));

    this.spawnTraffic();
    this.spawnPeds();

    for (const pm of map.palms) {
      const img = this.add.image(pm.x, pm.y, `palm${Math.floor(pm.s * 10) % 3}`).setDepth(20).setScale(pm.s);
      this.add.image(pm.x + 4, pm.y + 4, `palm${Math.floor(pm.s * 10) % 3}`).setDepth(1).setScale(pm.s).setTint(0x000000).setAlpha(0.3);
      this.palms.push({ img, seed: Math.random() * 10 });
    }

    // multiply tint for time of day sits above the world but below glows
    this.tint = this.add.rectangle(-200, -200, WORLD_W + 400, WORLD_H + 400, 0xffffff).setOrigin(0).setDepth(25).setBlendMode(Phaser.BlendModes.MULTIPLY);

    const starter = map.lots[map.starterLot];
    this.hq = this.add.image((starter.x + starter.w / 2) * TILE, starter.y * TILE + 4, 'hq').setDepth(31).setOrigin(0.5, 1);

    const cam = this.cameras.main;
    cam.setBounds(-120, -120, WORLD_W + 240, WORLD_H + 240);
    cam.setBackgroundColor('#0b0614');
    cam.setZoom(2);
    cam.centerOn((starter.x + 2) * TILE + 60, (starter.y) * TILE - 40);
    cam.setRoundPixels(true);

    this.setupInput();
    this.refreshTurf();

    this.offs.push(
      bus.on('changed', () => this.refreshTurf()),
      bus.on('sale', (e) => {
        const s = this.goonSprites.get(e.goon);
        if (s) this.float(s.x, s.y - 8, `+$${e.amount}`, e.product === 'snow' ? '#e8f4ff' : e.product === 'candy' ? '#ff5fd2' : '#7dff6a');
      }),
      bus.on('cash', (e) => this.float(e.x, e.y - 10, `+$${e.amount}`, '#ffe14d', 10)),
      bus.on('fx', (e) => this.fx(e)),
      bus.on('hit', (e) => this.blood(e.block)),
      bus.on('focus', (pt: Pt) => cam.pan(pt.x, pt.y, 450, 'Sine.easeInOut')),
    );
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.refreshTurf(true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offs.forEach((f) => f()));
    bus.emit('crt');
  }

  // -------------------------------------------------------------------------
  // input

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,E', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { down: true, moved: false, x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      if (this.drag.down && p.isDown) {
        const dx = p.x - this.drag.x;
        const dy = p.y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          cam.scrollX = this.drag.sx - dx / cam.zoom;
          cam.scrollY = this.drag.sy - dy / cam.zoom;
        }
      }
      const wp = cam.getWorldPoint(p.x, p.y);
      this.hover = this.pick(wp.x, wp.y);
      const ev = p.event as MouseEvent;
      bus.emit('hover', this.hover ? { ...this.hover, x: ev.clientX ?? p.x, y: ev.clientY ?? p.y } : null);
      this.input.setDefaultCursor(this.hover ? 'pointer' : 'default');
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.drag.down) return;
      this.drag.down = false;
      if (this.drag.moved || p.rightButtonReleased()) return;
      const g = over.find((o) => o.getData('goon') !== undefined);
      if (g) {
        view.selection = { type: 'goon', id: g.getData('goon') };
        bus.emit('select');
        return;
      }
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const hit = this.pick(wp.x, wp.y);
      if (hit?.type === 'lot') {
        const now = this.time.now;
        const dbl = this.lastClick.lot === hit.id && now - this.lastClick.t < 400;
        this.lastClick = { t: now, lot: hit.id };
        if (dbl && state.biz[hit.id]?.mode === 'owned') { bus.emit('enter', hit.id); return; }
      }
      view.selection = hit;
      bus.emit('select');
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomStep(dy > 0 ? -1 : 1, p.x, p.y));
    this.input.on('gameout', () => { this.hover = null; bus.emit('hover', null); });
    kb.on('keydown-Q', () => this.zoomStep(-1));
    kb.on('keydown-E', () => this.zoomStep(1));
  }

  zoomStep(dir: number, sx?: number, sy?: number) {
    const cam = this.cameras.main;
    const nz = Phaser.Math.Clamp(Math.round(cam.zoom) + dir, 1, 4);
    if (nz === cam.zoom) return;
    sx ??= cam.width / 2;
    sy ??= cam.height / 2;
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(nz);
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    cam.scrollX = before.x - cx - (sx - cx) / nz;
    cam.scrollY = before.y - cy - (sy - cy) / nz;
  }

  private pick(x: number, y: number): { type: 'block' | 'lot'; id: number } | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= map.lotAt.length) return null;
    const W = WORLD_W / TILE;
    if (tx >= W) return null;
    const lot = map.lotAt[ty * W + tx];
    if (lot >= 0 && map.lots[lot].kind !== 'decor') return { type: 'lot', id: lot };
    const b = map.blockAt[ty * W + tx];
    if (b >= 0) return { type: 'block', id: b };
    return null;
  }

  // -------------------------------------------------------------------------
  // turf overlay

  refreshTurf(force = false) {
    const key = state.turf.map((t) => t.owner).join(',') + '|' + state.goons.map((g) => `${g.id}:${g.status}:${g.post?.block ?? -1}`).join(',');
    if (!force && key === this.turfKey) return;
    this.turfKey = key;
    const g = this.turfG;
    g.clear();
    this.tags.forEach((t) => t.destroy());
    this.tags = [];
    this.gangIdle.forEach((s) => s.destroy());
    this.gangIdle = [];
    for (const b of map.blocks) {
      const o = state.turf[b.id].owner;
      if (o < 0) continue;
      const col = GANGS[o].color;
      const x = b.x * TILE;
      const y = b.y * TILE;
      g.fillStyle(col, 0.1).fillRect(x, y, S, S);
      // dashed border
      g.fillStyle(col, 0.95);
      for (let k = 0; k < S; k += 8) {
        g.fillRect(x + k, y, 5, 2);
        g.fillRect(x + k, y + S - 2, 5, 2);
        g.fillRect(x, y + k, 2, 5);
        g.fillRect(x + S - 2, y + k, 2, 5);
      }
      this.tags.push(this.add.image(x + 3, y + 3, `tag${o}`).setOrigin(0).setDepth(28));
      if (o > 0) {
        for (const [sx, sy] of [[S - 8, S - 8], [8, S - 8]].slice(0, 1 + (b.id % 2))) {
          const s = this.add.image(x + sx, y + sy, `gang${o}_${(b.id + sx) % 2}`).setDepth(8).setRotation(Math.atan2(sy - S / 2, sx - S / 2));
          this.gangIdle.push(s);
        }
      }
    }
    // HQ marker follows the starter house while we hold it
    const starter = map.lots[map.starterLot];
    this.hq.setVisible(state.turf[starter.block].owner === 0);
  }

  // -------------------------------------------------------------------------
  // traffic & pedestrians

  private spawnTraffic() {
    for (let k = 0; k < 36; k++) this.spawnAmb(false);
  }

  private spawnAmb(cop: boolean) {
    const i = Phaser.Math.Between(0, BX);
    const j = Phaser.Math.Between(0, BY);
    const n = node(i, j);
    const key = cop ? 'cop0' : `car${Phaser.Math.Between(0, 9)}`;
    const spr = this.add.image(n.x, n.y, key).setDepth(10);
    const light = this.add.image(n.x, n.y, 'glow_white').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6, 0.35).setAlpha(0);
    const a: Amb = { spr, light, i, j, x: n.x, y: n.y, route: [], speed: cop ? 70 : 34 + Math.random() * 20, rx: n.x, ry: n.y, angle: 0, cop };
    if (cop) a.siren = this.add.image(n.x, n.y, 'glow_red').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9);
    this.nextLeg(a);
    this.amb.push(a);
    return a;
  }

  private nextLeg(a: Amb) {
    const opts: [number, number][] = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = a.i + di;
      const nj = a.j + dj;
      if (ni < 0 || nj < 0 || ni > BX || nj > BY) continue;
      const back = a.angle !== 0 && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dj, di) - a.angle)) > 3;
      if (back && Math.random() < 0.9) continue;
      opts.push([ni, nj]);
    }
    const [ni, nj] = Phaser.Utils.Array.GetRandom(opts);
    a.i = ni;
    a.j = nj;
    a.route.push(node(ni, nj));
  }

  private spawnPeds() {
    for (let k = 0; k < 90; k++) {
      const block = Phaser.Math.Between(0, map.blocks.length - 1);
      const spr = this.add.image(0, 0, `civ${Phaser.Math.Between(0, 9)}`).setDepth(9);
      this.peds.push({ spr, block, t: Math.random() * 4 * (S - 16), speed: (9 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1), off: Math.round((Math.random() - 0.5) * 6) });
    }
  }

  private stepPed(p: Ped, dt: number) {
    const L = S - 16;
    p.t = (p.t + p.speed * dt + 4 * L) % (4 * L);
    const side = Math.floor(p.t / L);
    const u = p.t % L;
    const b = map.blocks[p.block];
    const x0 = b.x * TILE + 8;
    const y0 = b.y * TILE + 8;
    let x = 0;
    let y = 0;
    let ang = 0;
    if (side === 0) { x = x0 + u; y = y0 + p.off; ang = 0; }
    else if (side === 1) { x = x0 + L - p.off; y = y0 + u; ang = 90; }
    else if (side === 2) { x = x0 + L - u; y = y0 + L - p.off; ang = 180; }
    else { x = x0 + p.off; y = y0 + L - u; ang = 270; }
    if (p.speed < 0) ang += 180;
    const bob = Math.sin(this.t * 10 + p.off) > 0 ? 0 : 0.5;
    p.spr.setPosition(Math.round(x), Math.round(y + bob)).setAngle(ang);
  }

  private moveAlong(o: { x: number; y: number; route: Pt[]; angle: number }, dist: number) {
    while (dist > 0 && o.route.length) {
      const t = o.route[0];
      const dx = t.x - o.x;
      const dy = t.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) o.angle = Math.atan2(dy, dx);
      if (d <= dist) { o.x = t.x; o.y = t.y; o.route.shift(); dist -= d; }
      else { o.x += (dx / d) * dist; o.y += (dy / d) * dist; dist = 0; }
    }
  }

  // -------------------------------------------------------------------------
  // fx

  private float(x: number, y: number, s: string, color: string, size = 8) {
    const t = this.add.text(Math.round(x), Math.round(y), s, {
      fontFamily: '"Press Start 2P", monospace', fontSize: `${size}px`, color, stroke: '#140a1e', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private blockCentre(id: number) {
    const b = map.blocks[id];
    return { x: b.x * TILE + S / 2, y: b.y * TILE + S / 2, x0: b.x * TILE, y0: b.y * TILE };
  }

  private fx(e: { block?: number; x?: number; y?: number; kind: string }) {
    if (!this.scene.isActive()) return;
    if (e.kind === 'pullover') {
      this.sirenBurst(e.x!, e.y!);
      this.float(e.x!, e.y! - 12, 'PULLED OVER', '#ff3b3b');
      return;
    }
    const c = this.blockCentre(e.block!);
    switch (e.kind) {
      case 'flash': {
        const fx = c.x0 + 20 + Math.random() * (S - 40);
        const fy = c.y0 - 8 + Math.random() * 24;
        const f = this.add.image(fx, fy, 'flash').setDepth(35).setAngle(Math.random() * 90);
        this.tweens.add({ targets: f, alpha: 0, scale: 1.6, duration: 160, onComplete: () => f.destroy() });
        if (Math.random() < 0.3) this.float(fx, fy - 6, Phaser.Utils.Array.GetRandom(['POW', 'BANG', 'CRACK', 'WHAM']), '#ffe14d');
        this.cameras.main.shake(60, 0.0015);
        break;
      }
      case 'shout':
        this.float(c.x0 + S / 2, c.y0 + 10, Phaser.Utils.Array.GetRandom(['PAY UP', 'NICE PLACE...', 'INSURANCE?', 'BE A SHAME...']), '#ff2a8a');
        break;
      case 'win':
      case 'lose': {
        const col = e.kind === 'win' ? 0xffe14d : 0xff3b3b;
        const r = this.add.rectangle(c.x, c.y, S, S).setStrokeStyle(4, col).setDepth(36);
        this.tweens.add({ targets: r, scale: 1.25, alpha: 0, duration: 700, onComplete: () => r.destroy() });
        this.float(c.x, c.y, e.kind === 'win' ? 'BLOCK TAKEN' : 'BLOCK LOST', e.kind === 'win' ? '#ffe14d' : '#ff3b3b', 10);
        this.cameras.main.flash(120, e.kind === 'win' ? 255 : 255, e.kind === 'win' ? 225 : 40, 60);
        break;
      }
      case 'bust':
        this.sirenBurst(c.x, c.y0 - 8);
        this.float(c.x, c.y0 + 6, 'BUSTED', '#ff3b3b', 10);
        break;
    }
  }

  private sirenBurst(x: number, y: number) {
    const a = this.add.image(x, y, 'glow_red').setScale(2.5).setDepth(36).setBlendMode(Phaser.BlendModes.ADD);
    const b = this.add.image(x, y, 'glow_blue').setScale(2.5).setDepth(36).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({ targets: a, alpha: 0, duration: 200, yoyo: true, repeat: 6, onComplete: () => a.destroy() });
    this.tweens.add({ targets: b, alpha: 1, duration: 200, yoyo: true, repeat: 6, onComplete: () => b.destroy() });
  }

  private blood(block: number | undefined) {
    if (block === undefined || !this.scene.isActive()) return;
    const c = this.blockCentre(block);
    const d = this.add.image(c.x0 + 12 + Math.random() * (S - 24), c.y0 + 4 + Math.random() * 10, 'blood').setDepth(3).setAngle(Math.random() * 360);
    this.decals.push(d);
    this.tweens.add({ targets: d, alpha: 0, delay: 40000, duration: 4000, onComplete: () => { d.destroy(); this.decals = this.decals.filter((x) => x !== d); } });
  }

  // -------------------------------------------------------------------------

  update(_t: number, deltaMs: number) {
    const dtReal = Math.min(0.1, deltaMs / 1000);
    this.t += dtReal;
    const speed = view.speed === 0 ? 0 : Math.min(3, view.speed);
    const dt = dtReal * speed;
    this.handleKeys(dtReal);

    const cam = this.cameras.main;
    cam.setRotation(view.wobble ? Math.sin(this.t * 0.35) * 0.008 : 0);

    // time of day
    const night = nightFactor(state.minutes);
    this.tint.setFillStyle(skyTint(state.minutes));
    for (const n of this.neon) {
      const flick = Math.sin(this.t * 37 + n.seed) > 0.97 ? 0.3 : 1;
      n.img.setAlpha((0.25 + night * 0.75) * flick);
    }
    for (const g of this.lampGlows) g.setAlpha(night * 0.35);
    for (const p of this.palms) p.img.setAngle(Math.sin(this.t * 0.8 + p.seed) * 3);

    // cops scale with heat
    const want = stars() * 2;
    const cops = this.amb.filter((a) => a.cop);
    if (cops.length < want) this.spawnAmb(true);
    else if (cops.length > want) {
      const c = cops[0];
      c.spr.destroy();
      c.light.destroy();
      c.siren?.destroy();
      this.amb.splice(this.amb.indexOf(c), 1);
    }
    const flash = Math.floor(this.t * 5) % 2;
    for (const a of this.amb) {
      this.moveAlong(a, a.speed * dt);
      if (!a.route.length) this.nextLeg(a);
      this.renderCar(a, a.spr, a.light, a.siren, dtReal, night, flash, true);
    }
    for (const p of this.peds) this.stepPed(p, dt);

    this.syncOps(dtReal, night, flash);
    this.syncGoons();
    this.drawSelection();
    this.hq.setY(map.lots[map.starterLot].y * TILE + 4 + Math.round(Math.sin(this.t * 3) * 2));
  }

  private renderCar(o: { x: number; y: number; angle: number; rx: number; ry: number }, spr: Phaser.GameObjects.Image, light: Phaser.GameObjects.Image, siren: Phaser.GameObjects.Image | undefined, dt: number, night: number, flash: number, lane: boolean) {
    const ox = lane ? -Math.sin(o.angle) * 7 : 0;
    const oy = lane ? Math.cos(o.angle) * 7 : 0;
    const k = Math.min(1, dt * 10);
    o.rx += (o.x + ox - o.rx) * k;
    o.ry += (o.y + oy - o.ry) * k;
    spr.setPosition(Math.round(o.rx), Math.round(o.ry));
    const cur = spr.rotation;
    spr.setRotation(cur + Phaser.Math.Angle.Wrap(o.angle - cur) * Math.min(1, dt * 12));
    light.setPosition(o.rx + Math.cos(o.angle) * 22, o.ry + Math.sin(o.angle) * 22).setRotation(o.angle).setAlpha(night * 0.55);
    if (siren) {
      spr.setTexture(flash ? 'cop1' : 'cop0');
      siren.setPosition(o.rx, o.ry).setTexture(flash ? 'glow_red' : 'glow_blue').setAlpha(0.3 + night * 0.5);
    }
  }

  private syncOps(dt: number, night: number, flash: number) {
    const alive = new Set<number>();
    for (const op of state.ops) {
      const v = op.vehicle;
      if (!v || v.gone) continue;
      alive.add(op.id);
      const key = v.kind === 'crew' ? 'car_crew' : v.kind === 'van' ? 'van' : v.kind === 'boat' ? 'boat3' : v.kind === 'cop' ? 'cop0' : `car_gang${op.gang}`;
      let ov = this.opViews.get(op.id);
      if (!ov || ov.kind !== v.kind) {
        if (ov) this.destroyOpView(ov);
        const spr = this.add.image(v.x, v.y, key).setDepth(11);
        const light = this.add.image(v.x, v.y, 'glow_white').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6, 0.35);
        ov = { spr, light, rx: v.x, ry: v.y, init: false, people: [], kind: v.kind };
        if (v.kind === 'cop') ov.siren = this.add.image(v.x, v.y, 'glow_red').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9);
        this.opViews.set(op.id, ov);
      }
      const o = { x: v.x, y: v.y, angle: v.angle, rx: ov.rx, ry: ov.ry };
      if (!ov.init) { o.rx = v.x; o.ry = v.y; ov.init = true; }
      this.renderCar(o, ov.spr, ov.light, ov.siren, dt, night, flash, v.kind !== 'boat');
      ov.rx = o.rx;
      ov.ry = o.ry;
      if (v.kind === 'boat') ov.light.setAlpha(0);
      this.syncOpPeople(op, ov);
    }
    for (const [id, ov] of this.opViews) {
      if (alive.has(id)) continue;
      this.destroyOpView(ov);
      this.opViews.delete(id);
    }
  }

  /** People standing around a parked op car (fights, shake-downs, pickups). */
  private syncOpPeople(op: Op, ov: OpView) {
    const working = op.phase === 'work' && ov.spr.visible;
    const want: string[] = [];
    if (working) {
      if (op.kind === 'attack') for (let i = 0; i < 3; i++) want.push(`gang${op.gang}_${i % 2}`);
      else if (op.kind !== 'bust') for (const id of op.crew) { const g = state.goons.find((x) => x.id === id); if (g) want.push(`crew${g.look}`); }
      if (op.kind === 'bust') want.push('copman', 'copman');
      if (op.kind === 'takeover') {
        const o = state.turf[op.block].owner;
        for (let i = 0; i < 3; i++) want.push(o > 0 ? `gang${o}_${i % 2}#def` : `civ${(op.block + i) % 10}#def`);
      }
    }
    if (ov.people.length !== want.length) {
      ov.people.forEach((p) => p.destroy());
      ov.people = want.map((k, i) => {
        const def = k.endsWith('#def');
        const img = this.add.image(0, 0, k.replace('#def', '')).setDepth(12);
        img.setData('def', def);
        img.setData('i', i);
        return img;
      });
    }
    const c = this.blockCentre(op.block);
    ov.people.forEach((p, i) => {
      const def = p.getData('def');
      const jitter = Math.sin(this.t * 6 + i * 2) * (op.kind === 'takeover' || op.kind === 'attack' ? 2 : 0.5);
      const x = ov.rx - 18 + i * 12 + jitter;
      const y = def ? c.y0 + 10 : ov.ry + 12;
      const tx = def ? ov.rx : c.x;
      const ty = def ? ov.ry : c.y0 + 10;
      p.setPosition(Math.round(def ? c.x - 20 + (i % 3) * 18 + jitter : x), Math.round(y)).setRotation(Math.atan2(ty - y, tx - x));
    });
  }

  private destroyOpView(ov: OpView) {
    const s = ov.spr;
    this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
    ov.light.destroy();
    ov.siren?.destroy();
    ov.people.forEach((p) => p.destroy());
  }

  private syncGoons() {
    const alive = new Set<number>();
    const perBlock = new Map<number, number>();
    for (const g of state.goons) {
      if (g.status !== 'posted' || !g.post) continue;
      alive.add(g.id);
      const idx = perBlock.get(g.post.block) ?? 0;
      perBlock.set(g.post.block, idx + 1);
      let s = this.goonSprites.get(g.id);
      if (!s) {
        s = this.add.image(0, 0, `crew${g.look}`).setDepth(13).setInteractive({ useHandCursor: true });
        s.setData('goon', g.id);
        this.goonSprites.set(g.id, s);
      }
      const b = map.blocks[g.post.block];
      const spots: [number, number][] = g.post.kind === 'corner'
        ? [[8, 8], [S - 8, S - 8], [S - 8, 8], [8, S - 8]]
        : [[S / 2, 8], [S / 2, S - 8], [8, S / 2], [S - 8, S / 2]];
      const [sx, sy] = spots[idx % 4];
      const x = b.x * TILE + sx + (idx >= 4 ? 6 : 0);
      const y = b.y * TILE + sy;
      const face = Math.atan2(sy - S / 2, sx - S / 2) + Math.sin(this.t * 0.7 + g.id) * 0.5;
      s.setPosition(x, y).setRotation(face);
    }
    for (const [id, s] of this.goonSprites) {
      if (alive.has(id)) continue;
      s.destroy();
      this.goonSprites.delete(id);
    }
  }

  private drawSelection() {
    const g = this.selG;
    g.clear();
    const pulse = 0.6 + Math.sin(this.t * 6) * 0.4;
    // contested blocks blink red
    for (const op of state.ops) {
      if (op.phase !== 'work' || (op.kind !== 'takeover' && op.kind !== 'attack')) continue;
      const c = this.blockCentre(op.block);
      if (Math.floor(this.t * 4) % 2) g.lineStyle(2, NEON.red, 1).strokeRect(c.x0 - 2, c.y0 - 2, S + 4, S + 4);
      // fight balance bar
      const w = 60;
      const bx = c.x - w / 2;
      const by = c.y0 - 26;
      const bal = Phaser.Math.Clamp((op.balance + 1) / 2, 0, 1);
      const ourSide = op.kind === 'takeover';
      g.fillStyle(0x140a1e, 1).fillRect(bx - 1, by - 1, w + 2, 6);
      g.fillStyle(ourSide ? NEON.yellow : GANGS[op.gang].color, 1).fillRect(bx, by, w * bal, 4);
      g.fillStyle(ourSide ? GANGS[Math.max(0, state.turf[op.block].owner)]?.color ?? 0x888888 : NEON.yellow, 1).fillRect(bx + w * bal, by, w * (1 - bal), 4);
    }
    const draw = (sel: { type: string; id: number }, col: number, a: number) => {
      if (sel.type === 'lot') {
        const l = map.lots[sel.id];
        g.lineStyle(2, col, a).strokeRect(l.x * TILE - 1, l.y * TILE - 1, l.w * TILE + 2, l.h * TILE + 2);
      } else if (sel.type === 'block') {
        const b = map.blocks[sel.id];
        g.lineStyle(2, col, a).strokeRect(b.x * TILE - 2, b.y * TILE - 2, S + 4, S + 4);
      }
    };
    if (this.hover && view.scene === 'city') draw(this.hover, 0xffffff, 0.7);
    const sel = view.selection;
    if (sel && sel.type !== 'goon') draw(sel, NEON.yellow, pulse);
    if (sel?.type === 'goon') {
      const s = this.goonSprites.get(sel.id);
      if (s) g.lineStyle(1, NEON.yellow, pulse).strokeCircle(s.x, s.y, 9);
    }
  }

  private handleKeys(dt: number) {
    if (document.activeElement?.tagName === 'INPUT') return;
    const cam = this.cameras.main;
    const k = this.keys;
    const s = (520 / cam.zoom) * dt;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= s;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += s;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= s;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += s;
  }
}


