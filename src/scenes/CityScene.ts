import Phaser from 'phaser';
import { sfx } from '../audio';
import { bus } from '../bus';
import { GANGS, NEON, TILE } from '../config';
import { BX, BY, WORLD_H, WORLD_W, node, type Pt } from '../sim/cityMap';
import { map, state, stars, view, type Op } from '../state';
import type { Sign } from '../gfx/cityArt';
import { Shadows } from '../gfx/shadows';

const S = 10 * TILE;
const LANE = 16;
const WALK = 0.16; // seconds per walk frame

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
  key: string;
  block: number;
  t: number;
  speed: number;
  off: number;
  pause: number;
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
  block: number;
}

const KEYS: [number, number][] = [
  [0, 0x8676d8], [4.5, 0x8676d8], [6, 0xffa0c0], [7.5, 0xffffff], [16.5, 0xffffff], [18, 0xffb890], [19.3, 0xff8ab0], [20.5, 0x9a86e0], [22, 0x8676d8], [24, 0x8676d8],
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
  private fxG!: Phaser.GameObjects.Graphics;
  private tint!: Phaser.GameObjects.Rectangle;
  private shadows!: Shadows;
  private amb: Amb[] = [];
  private peds: Ped[] = [];
  private opViews = new Map<number, OpView>();
  private goonSprites = new Map<number, Phaser.GameObjects.Image>();
  private gangIdle: Phaser.GameObjects.Image[] = [];
  private tags: Phaser.GameObjects.Image[] = [];
  private neon: { img: Phaser.GameObjects.Image; seed: number }[] = [];
  private lampGlows: Phaser.GameObjects.Image[] = [];
  private palms: { img: Phaser.GameObjects.Image; seed: number }[] = [];
  private tracers: { x0: number; y0: number; x1: number; y1: number; life: number }[] = [];
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
    this.shadows = new Shadows(this, 4);
    this.turfG = this.add.graphics().setDepth(2);
    this.selG = this.add.graphics().setDepth(30);
    this.fxG = this.add.graphics().setDepth(34);

    for (const s of data.signs) {
      const key = s.color === NEON.pink ? 'glow_pink' : s.color === NEON.cyan ? 'glow_cyan' : s.color === NEON.yellow ? 'glow_yellow' : s.color === NEON.orange ? 'glow_orange' : 'glow_red';
      const img = this.add.image(s.x, s.y, key).setDepth(26).setBlendMode(Phaser.BlendModes.ADD).setScale((s.w + 40) / 64, (s.h + 40) / 64).setAlpha(0);
      this.neon.push({ img, seed: Math.random() * 10 });
    }
    for (const l of map.lamps) this.lampGlows.push(this.add.image(l.x, l.y, 'glow').setDepth(26).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setAlpha(0));

    this.spawnTraffic();
    this.spawnPeds();

    for (const pm of map.palms) {
      const key = `palm${Math.floor(pm.s * 10) % 3}`;
      this.add.image(pm.x + 9, pm.y + 9, key).setDepth(4).setTintFill(0x140a1e).setAlpha(0.5);
      this.palms.push({ img: this.add.image(pm.x, pm.y, key).setDepth(20), seed: Math.random() * 10 });
    }

    this.tint = this.add.rectangle(-300, -300, WORLD_W + 600, WORLD_H + 600, 0xffffff).setOrigin(0).setDepth(25).setBlendMode(Phaser.BlendModes.MULTIPLY);

    const starter = map.lots[map.starterLot];
    this.hq = this.add.image((starter.x + starter.w / 2) * TILE, starter.y * TILE + 8, 'hq').setDepth(31).setOrigin(0.5, 1);

    const cam = this.cameras.main;
    cam.setBounds(-160, -160, WORLD_W + 320, WORLD_H + 320);
    cam.setZoom(2);
    cam.centerOn((starter.x + starter.w / 2) * TILE + 90, (starter.y + starter.h / 2) * TILE - 40);
    cam.setRoundPixels(true);

    this.setupInput();
    this.refreshTurf();

    this.offs.push(
      bus.on('changed', () => this.refreshTurf()),
      bus.on('sale', (e) => {
        const s = this.goonSprites.get(e.goon);
        if (s) this.float(s.x, s.y - 10, `+$${e.amount}`, e.product === 'snow' ? '#e8f4ff' : e.product === 'candy' ? '#ff5fd2' : '#7dff6a');
        sfx('sale');
      }),
      bus.on('cash', (e) => { this.float(e.x, e.y - 14, `+$${e.amount}`, '#ffe14d', 10); sfx('cash'); }),
      bus.on('fx', (e) => this.fx(e)),
      bus.on('hit', (e) => this.hit(e.block)),
      bus.on('alarm', (block: number) => this.alarm(block)),
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
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
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
      sfx('click');
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
    // computed directly: cam.getWorldPoint uses last frame's matrix, which is stale
    // when several zoom steps arrive in one frame
    const z0 = cam.zoom;
    const wx = cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / z0;
    const wy = cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / z0;
    cam.setZoom(nz);
    cam.scrollX = wx - cam.width / 2 - (sx - cam.width / 2) / nz;
    cam.scrollY = wy - cam.height / 2 - (sy - cam.height / 2) / nz;
  }

  private pick(x: number, y: number): { type: 'block' | 'lot'; id: number } | null {
    const W = WORLD_W / TILE;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= W || ty >= WORLD_H / TILE) return null;
    const lot = map.lotAt[ty * W + tx];
    if (lot >= 0 && map.lots[lot].kind !== 'decor') return { type: 'lot', id: lot };
    const b = map.blockAt[ty * W + tx];
    if (b >= 0) return { type: 'block', id: b };
    return null;
  }

  // -------------------------------------------------------------------------
  // turf overlay

  refreshTurf(force = false) {
    const key = state.turf.map((t) => t.owner).join(',');
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
      g.fillStyle(col, 0.08).fillRect(x, y, S, S);
      g.fillStyle(col, 0.95);
      for (let k = 0; k < S; k += 16) {
        g.fillRect(x + k, y, 10, 3);
        g.fillRect(x + k, y + S - 3, 10, 3);
        g.fillRect(x, y + k, 3, 10);
        g.fillRect(x + S - 3, y + k, 3, 10);
      }
      this.tags.push(this.add.image(x + 6, y + 6, `tag${o}`).setOrigin(0).setDepth(28));
      if (o > 0) {
        // a couple of gang members loitering on the corners
        const spots: [number, number][] = [[S - 18, S - 16], [S - 30, S - 14], [16, S - 18]];
        for (let k = 0; k < 2 + (b.id % 2); k++) {
          const [sx, sy] = spots[k];
          const s = this.shadows.add(this.add.image(x + sx, y + sy, `gang${o}_${(b.id + k) % 2}`).setDepth(8), 2);
          s.setRotation(Math.atan2(sy - S / 2, sx - S / 2) + k);
          s.setData('seed', Math.random() * 10);
          this.gangIdle.push(s);
        }
      }
    }
    const starter = map.lots[map.starterLot];
    this.hq.setVisible(state.turf[starter.block].owner === 0);
  }

  // -------------------------------------------------------------------------
  // traffic & pedestrians

  private spawnTraffic() {
    for (let k = 0; k < 44; k++) this.spawnAmb(false);
  }

  private spawnAmb(cop: boolean) {
    const i = Phaser.Math.Between(0, BX);
    const j = Phaser.Math.Between(0, BY);
    const n = node(i, j);
    const key = cop ? 'cop0' : `car${Phaser.Math.Between(0, 9)}`;
    const spr = this.shadows.add(this.add.image(n.x, n.y, key).setDepth(10), 4);
    const light = this.add.image(n.x, n.y, 'glow_white').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9, 0.5).setAlpha(0);
    const a: Amb = { spr, light, i, j, x: n.x, y: n.y, route: [], speed: cop ? 140 : 70 + Math.random() * 40, rx: n.x, ry: n.y, angle: 0, cop };
    if (cop) a.siren = this.add.image(n.x, n.y, 'glow_red').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4);
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
      const back = a.route.length === 0 && a.angle !== 0 && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dj, di) - a.angle)) > 3;
      if (back && Math.random() < 0.9) continue;
      opts.push([ni, nj]);
    }
    const [ni, nj] = Phaser.Utils.Array.GetRandom(opts);
    a.i = ni;
    a.j = nj;
    a.route.push(node(ni, nj));
  }

  private spawnPeds() {
    for (let k = 0; k < 120; k++) {
      const block = Phaser.Math.Between(0, map.blocks.length - 1);
      const key = `civ${Phaser.Math.Between(0, 9)}`;
      const spr = this.shadows.add(this.add.image(0, 0, key).setDepth(9), 2);
      this.peds.push({ spr, key, block, t: Math.random() * 4 * (S - 32), speed: (12 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1), off: Math.round((Math.random() - 0.5) * 12), pause: 0 });
    }
  }

  private stepPed(p: Ped, dt: number) {
    const L = S - 32;
    if (p.pause > 0) {
      p.pause -= dt;
      p.spr.setTexture(p.key);
      return;
    }
    if (Math.random() < dt * 0.04) p.pause = 1 + Math.random() * 4;
    p.t = (p.t + p.speed * dt + 4 * L) % (4 * L);
    const side = Math.floor(p.t / L);
    const u = p.t % L;
    const b = map.blocks[p.block];
    const x0 = b.x * TILE + 16;
    const y0 = b.y * TILE + 16;
    let x = 0;
    let y = 0;
    let ang = 0;
    if (side === 0) { x = x0 + u; y = y0 + p.off; ang = 0; }
    else if (side === 1) { x = x0 + L - p.off; y = y0 + u; ang = 90; }
    else if (side === 2) { x = x0 + L - u; y = y0 + L - p.off; ang = 180; }
    else { x = x0 + p.off; y = y0 + L - u; ang = 270; }
    if (p.speed < 0) ang += 180;
    p.spr.setPosition(Math.round(x), Math.round(y)).setAngle(ang);
    p.spr.setTexture(Math.floor(this.t / WALK + p.off) % 2 ? `${p.key}_w` : p.key);
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
    this.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private blockCentre(id: number) {
    const b = map.blocks[id];
    return { x: b.x * TILE + S / 2, y: b.y * TILE + S / 2, x0: b.x * TILE, y0: b.y * TILE };
  }

  private viewOn(block: number) {
    for (const ov of this.opViews.values()) if (ov.block === block && ov.people.length) return ov;
    return null;
  }

  private fx(e: { block?: number; x?: number; y?: number; kind: string }) {
    if (!this.scene.isActive()) return;
    if (e.kind === 'pullover') {
      this.sirenBurst(e.x!, e.y!);
      this.float(e.x!, e.y! - 14, 'PULLED OVER', '#ff3b3b');
      sfx('siren');
      return;
    }
    const c = this.blockCentre(e.block!);
    switch (e.kind) {
      case 'flash': {
        const ov = this.viewOn(e.block!);
        const ppl = ov?.people ?? [];
        const atk = ppl.filter((p) => !p.getData('def'));
        const def = ppl.filter((p) => p.getData('def'));
        if (!atk.length || !def.length) break;
        const fromAtk = Math.random() < 0.5;
        const shooter = Phaser.Utils.Array.GetRandom(fromAtk ? atk : def);
        const target = Phaser.Utils.Array.GetRandom(fromAtk ? def : atk);
        const a = Math.atan2(target.y - shooter.y, target.x - shooter.x);
        shooter.setRotation(a);
        const mx = shooter.x + Math.cos(a) * 7;
        const my = shooter.y + Math.sin(a) * 7;
        const f = this.add.image(mx, my, 'flash').setDepth(35).setRotation(a);
        this.tweens.add({ targets: f, alpha: 0, duration: 90, onComplete: () => f.destroy() });
        this.tracers.push({ x0: mx, y0: my, x1: target.x + (Math.random() - 0.5) * 8, y1: target.y + (Math.random() - 0.5) * 8, life: 0.08 });
        const lit = this.add.image(mx, my, 'glow_yellow').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8);
        this.tweens.add({ targets: lit, alpha: 0, duration: 120, onComplete: () => lit.destroy() });
        if (Math.random() < 0.25) this.float(mx, my - 8, Phaser.Utils.Array.GetRandom(['POW', 'BANG', 'BLAM']), '#ffe14d');
        this.cameras.main.shake(50, 0.0012);
        sfx('shot');
        break;
      }
      case 'shout':
        this.float(c.x, c.y0 + 8, Phaser.Utils.Array.GetRandom(['PAY UP', 'NICE PLACE...', 'INSURANCE?', 'BE A SHAME...']), '#ff2a8a');
        break;
      case 'win':
      case 'lose': {
        const win = e.kind === 'win';
        const r = this.add.rectangle(c.x, c.y, S, S).setStrokeStyle(6, win ? 0xffe14d : 0xff3b3b).setDepth(36);
        this.tweens.add({ targets: r, scale: 1.2, alpha: 0, duration: 700, onComplete: () => r.destroy() });
        this.float(c.x, c.y, win ? 'BLOCK TAKEN' : 'BLOCK LOST', win ? '#ffe14d' : '#ff3b3b', 14);
        this.cameras.main.flash(140, 255, win ? 225 : 40, 60);
        sfx(win ? 'win' : 'lose');
        break;
      }
      case 'bust':
        this.sirenBurst(c.x, c.y0 + 16);
        this.float(c.x, c.y0 + 4, 'BUSTED', '#ff3b3b', 10);
        sfx('siren');
        break;
    }
  }

  private alarm(block: number) {
    if (!this.scene.isActive()) return;
    const c = this.blockCentre(block);
    this.sirenBurst(c.x, c.y);
    sfx('alarm');
  }

  private sirenBurst(x: number, y: number) {
    const a = this.add.image(x, y, 'glow_red').setScale(3).setDepth(36).setBlendMode(Phaser.BlendModes.ADD);
    const b = this.add.image(x, y, 'glow_blue').setScale(3).setDepth(36).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({ targets: a, alpha: 0, duration: 200, yoyo: true, repeat: 6, onComplete: () => a.destroy() });
    this.tweens.add({ targets: b, alpha: 1, duration: 200, yoyo: true, repeat: 6, onComplete: () => b.destroy() });
  }

  private hit(block: number | undefined) {
    if (block === undefined || !this.scene.isActive()) return;
    const ov = this.viewOn(block);
    let x: number;
    let y: number;
    if (ov && ov.people.length) {
      const p = Phaser.Utils.Array.GetRandom(ov.people);
      x = p.x;
      y = p.y;
      p.setTintFill(0xffffff);
      this.time.delayedCall(80, () => p.active && p.clearTint());
    } else {
      const c = this.blockCentre(block);
      x = c.x0 + 20 + Math.random() * (S - 40);
      y = c.y0 + 10 + Math.random() * 12;
    }
    const d = this.add.image(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, 'blood').setDepth(3).setAngle(Math.random() * 360);
    this.tweens.add({ targets: d, alpha: 0, delay: 45000, duration: 4000, onComplete: () => d.destroy() });
  }

  // -------------------------------------------------------------------------

  update(_t: number, deltaMs: number) {
    const dtReal = Math.min(0.1, deltaMs / 1000);
    this.t += dtReal;
    const speed = view.speed === 0 ? 0 : Math.min(3, view.speed);
    const dt = dtReal * speed;
    this.handleKeys(dtReal);

    const cam = this.cameras.main;
    cam.setRotation(view.wobble ? Math.sin(this.t * 0.45) * 0.025 : 0);
    const k = 50 + Math.sin(this.t * 1.3) * 50;
    const bg = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(42, 10, 58), new Phaser.Display.Color(110, 14, 80), 100, k);
    cam.setBackgroundColor(bg);

    const night = nightFactor(state.minutes);
    this.tint.setFillStyle(skyTint(state.minutes));
    for (const n of this.neon) {
      const flick = Math.sin(this.t * 37 + n.seed) > 0.97 ? 0.3 : 1;
      n.img.setAlpha((0.2 + night * 0.8) * flick);
    }
    for (const g of this.lampGlows) g.setAlpha(night * 0.4);
    for (const p of this.palms) p.img.setAngle(Math.sin(this.t * 0.8 + p.seed) * 3);
    for (const s of this.gangIdle) s.setRotation(s.rotation + Math.sin(this.t * 0.6 + (s.getData('seed') as number)) * 0.004);

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
    this.drawTracers(dtReal);
    this.shadows.update();
    this.hq.setY(map.lots[map.starterLot].y * TILE + 8 + Math.round(Math.sin(this.t * 3) * 3));
  }

  private drawTracers(dt: number) {
    const g = this.fxG;
    g.clear();
    this.tracers = this.tracers.filter((tr) => (tr.life -= dt) > 0);
    for (const tr of this.tracers) g.lineStyle(1, 0xfff2a0, 1).lineBetween(tr.x0, tr.y0, tr.x1, tr.y1);
  }

  private renderCar(o: { x: number; y: number; angle: number; rx: number; ry: number }, spr: Phaser.GameObjects.Image, light: Phaser.GameObjects.Image, siren: Phaser.GameObjects.Image | undefined, dt: number, night: number, flash: number, lane: boolean) {
    const ox = lane ? -Math.sin(o.angle) * LANE : 0;
    const oy = lane ? Math.cos(o.angle) * LANE : 0;
    const k = Math.min(1, dt * 10);
    o.rx += (o.x + ox - o.rx) * k;
    o.ry += (o.y + oy - o.ry) * k;
    spr.setPosition(Math.round(o.rx), Math.round(o.ry));
    const cur = spr.rotation;
    spr.setRotation(cur + Phaser.Math.Angle.Wrap(o.angle - cur) * Math.min(1, dt * 12));
    light.setPosition(o.rx + Math.cos(o.angle) * 34, o.ry + Math.sin(o.angle) * 34).setRotation(o.angle).setAlpha(night * 0.5);
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
        const spr = this.shadows.add(this.add.image(v.x, v.y, key).setDepth(11), v.kind === 'boat' ? 6 : 4);
        const light = this.add.image(v.x, v.y, 'glow_white').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9, 0.5);
        ov = { spr, light, rx: v.x, ry: v.y, init: false, people: [], kind: v.kind, block: op.block };
        if (v.kind === 'cop') ov.siren = this.add.image(v.x, v.y, 'glow_red').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4);
        this.opViews.set(op.id, ov);
      }
      ov.block = op.block;
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

  /** People out of a parked op car: crew on the sidewalk, defenders inside the block. */
  private syncOpPeople(op: Op, ov: OpView) {
    const working = op.phase === 'work';
    const want: { key: string; def: boolean }[] = [];
    if (working) {
      if (op.kind === 'attack') for (let i = 0; i < 3; i++) want.push({ key: `gang${op.gang}_${i % 2}`, def: false });
      else if (op.kind !== 'bust') for (const id of op.crew) { const g = state.goons.find((x) => x.id === id); if (g) want.push({ key: `crew${g.look}`, def: false }); }
      if (op.kind === 'bust') want.push({ key: 'copman', def: false }, { key: 'copman', def: false });
      if (op.kind === 'takeover') {
        const o = state.turf[op.block].owner;
        for (let i = 0; i < 3; i++) want.push({ key: o > 0 ? `gang${o}_${i % 2}` : `civ${(op.block + i) % 10}`, def: true });
      }
      if (op.kind === 'attack') {
        const guards = state.goons.filter((g) => g.status === 'posted' && g.post?.block === op.block);
        for (const g of guards) want.push({ key: `crew${g.look}`, def: true });
        if (!guards.length) want.push({ key: 'civ5', def: true });
      }
    }
    if (ov.people.length !== want.length) {
      ov.people.forEach((p) => p.destroy());
      ov.people = want.map((w, i) => {
        const img = this.shadows.add(this.add.image(ov.rx, ov.ry, w.key).setDepth(12), 2);
        img.setData('def', w.def);
        img.setData('i', i);
        return img;
      });
    }
    const c = this.blockCentre(op.block);
    let ai = 0;
    let di = 0;
    for (const p of ov.people) {
      const def = p.getData('def') as boolean;
      const i = def ? di++ : ai++;
      const jitter = Math.sin(this.t * 5 + i * 2) * 1.5;
      const x = def ? c.x - 36 + i * 24 + jitter : ov.rx - 20 + i * 16 + jitter;
      const y = def ? c.y0 + 52 + (i % 2) * 8 : c.y0 + 12 + (i % 2) * 6;
      p.setPosition(Math.round(x), Math.round(y));
      if (Math.random() < 0.02) p.setRotation(Math.atan2(def ? c.y0 + 12 - y : c.y0 + 52 - y, (def ? ov.rx : c.x) - x));
    }
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
        s = this.shadows.add(this.add.image(0, 0, `crew${g.look}`).setDepth(13).setInteractive({ useHandCursor: true }), 2);
        s.setData('goon', g.id);
        this.goonSprites.set(g.id, s);
      }
      const b = map.blocks[g.post.block];
      const spots: [number, number][] = g.post.kind === 'corner'
        ? [[18, 18], [S - 18, S - 18], [S - 18, 18], [18, S - 18]]
        : [[S / 2, 16], [S / 2, S - 16], [16, S / 2], [S - 16, S / 2]];
      const [sx, sy] = spots[idx % 4];
      const x = b.x * TILE + sx + (idx >= 4 ? 10 : 0);
      const y = b.y * TILE + sy;
      const face = Math.atan2(sy - S / 2, sx - S / 2) + Math.sin(this.t * 0.7 + g.id) * 0.6;
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
    for (const op of state.ops) {
      if (op.phase !== 'work' || (op.kind !== 'takeover' && op.kind !== 'attack')) continue;
      const c = this.blockCentre(op.block);
      if (Math.floor(this.t * 4) % 2) g.lineStyle(3, NEON.red, 1).strokeRect(c.x0 - 3, c.y0 - 3, S + 6, S + 6);
      const w = 100;
      const bx = c.x - w / 2;
      const by = c.y0 - 52;
      const bal = Phaser.Math.Clamp((op.balance + 1) / 2, 0, 1);
      const ours = op.kind === 'takeover';
      const them = ours ? GANGS[Math.max(0, state.turf[op.block].owner)]?.color ?? 0x888888 : GANGS[op.gang].color;
      g.fillStyle(0x140a1e, 1).fillRect(bx - 2, by - 2, w + 4, 10);
      g.fillStyle(ours ? NEON.yellow : them, 1).fillRect(bx, by, w * bal, 6);
      g.fillStyle(ours ? them : NEON.yellow, 1).fillRect(bx + w * bal, by, w * (1 - bal), 6);
    }
    const draw = (sel: { type: string; id: number }, col: number, a: number) => {
      if (sel.type === 'lot') {
        const l = map.lots[sel.id];
        g.lineStyle(3, col, a).strokeRect(l.x * TILE - 2, l.y * TILE - 2, l.w * TILE + 4, l.h * TILE + 4);
      } else if (sel.type === 'block') {
        const b = map.blocks[sel.id];
        g.lineStyle(3, col, a).strokeRect(b.x * TILE - 4, b.y * TILE - 4, S + 8, S + 8);
      }
    };
    if (this.hover && view.scene === 'city') draw(this.hover, 0xffffff, 0.7);
    const sel = view.selection;
    if (sel && sel.type !== 'goon') draw(sel, NEON.yellow, pulse);
    if (sel?.type === 'goon') {
      const s = this.goonSprites.get(sel.id);
      if (s) g.lineStyle(2, NEON.yellow, pulse).strokeCircle(s.x, s.y, 10);
    }
  }

  private handleKeys(dt: number) {
    if (document.activeElement?.tagName === 'INPUT') return;
    const cam = this.cameras.main;
    const k = this.keys;
    const s = (900 / cam.zoom) * dt;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= s;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += s;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= s;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += s;
  }
}
