import Phaser from 'phaser';
import { bus } from '../bus';
import { DISTRICTS, PROP_KINDS, TILE } from '../config';
import { BLOCK, BLOCKS_X, BLOCKS_Y, MAP_H, MAP_W } from '../sim/cityMap';
import { map, state, view } from '../state';
import { CAR_COLORS } from '../gfx/textures';

const SEG = BLOCK * TILE; // 384px between road centres
const MAX_I = BLOCKS_X; // road column indices 0..6
const MAX_J = BLOCKS_Y; // road row indices 0..4
const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N

interface Car {
  spr: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
  siren?: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dir: number;
  speed: number;
  planCoord: number;
  planDir: number;
  cop: boolean;
}

interface Ped {
  spr: Phaser.GameObjects.Image;
  bx: number;
  by: number;
  t: number;
  speed: number;
  off: number;
}

function laneCoord(dir: number, idx: number) {
  switch (dir) {
    case 0: return (BLOCK * idx + 1.5) * TILE;
    case 2: return (BLOCK * idx + 0.5) * TILE;
    case 1: return (BLOCK * idx + 0.5) * TILE;
    default: return (BLOCK * idx + 1.5) * TILE;
  }
}

export function nightFactor(minutes: number) {
  const h = (minutes % 1440) / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3;
  if (h >= 21 || h < 5) return 1;
  return 1 - (h - 5) / 2;
}

export class CityScene extends Phaser.Scene {
  private cars: Car[] = [];
  private peds: Ped[] = [];
  private dealerSprites = new Map<number, { spr: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image }>();
  private lampGlows: Phaser.GameObjects.Image[] = [];
  private night!: Phaser.GameObjects.Rectangle;
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverG!: Phaser.GameObjects.Graphics;
  private markers: Phaser.GameObjects.GameObject[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private hoverLot = -1;
  private drag = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private flashT = 0;
  private offs: (() => void)[] = [];

  constructor() {
    super('City');
  }

  create() {
    const W = MAP_W * TILE;
    const H = MAP_H * TILE;
    this.add.image(0, 0, 'city').setOrigin(0).setDepth(0);
    this.overlay = this.add.graphics().setDepth(2);
    this.hoverG = this.add.graphics().setDepth(3);

    this.spawnTraffic();
    this.spawnPeds();

    this.night = this.add.rectangle(0, 0, W, H, 0x0a1030, 1).setOrigin(0).setDepth(20).setAlpha(0);
    for (const l of map.lamps) {
      const g = this.add.image(l.x * TILE + 16, l.y * TILE + 16, 'glow').setDepth(21).setScale(1.25).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.lampGlows.push(g);
    }

    for (const d of DISTRICTS) {
      const pos = this.districtCentre(d.id);
      const t = this.add.text(pos.x, pos.y, d.name.toUpperCase(), {
        fontFamily: 'Bungee, Impact, sans-serif', fontSize: '64px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 8,
      }).setOrigin(0.5).setDepth(30).setAlpha(0.0);
      this.labels.push(t);
    }

    const cam = this.cameras.main;
    cam.setBounds(-60, -60, W + 120, H + 120);
    cam.setBackgroundColor('#0d3a5c');
    const starter = map.lots.find((l) => l.name === "Grandma's Garage")!;
    cam.setZoom(1.1);
    cam.centerOn((starter.x + 2) * TILE + 420, (starter.y + 2) * TILE + 220);

    this.setupInput();
    this.refreshMarkers();

    this.offs.push(
      bus.on('changed', () => this.refreshMarkers()),
      bus.on('select', () => this.refreshMarkers()),
      bus.on('sale', (e) => this.floatText(e.x, e.y - 10, `+$${e.amount}`, e.product === 'crystal' ? '#7fdcff' : '#8dff7a')),
      bus.on('arrest', (e) => { if (e.inCity) this.floatText(e.x, e.y - 14, 'BUSTED!', '#ff5252', 22); }),
      bus.on('raid', (e) => this.raidFx(e.lotId)),
      bus.on('focusPoint', (pt: { x: number; y: number }) => this.cameras.main.pan(pt.x, pt.y, 500, 'Sine.easeInOut')),
      bus.on('focusLot', (id: number) => {
        const l = map.lots[id];
        this.cameras.main.pan((l.x + l.w / 2) * TILE, (l.y + l.h / 2) * TILE, 500, 'Sine.easeInOut');
      }),
    );
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.refreshMarkers());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offs.forEach((f) => f()));
  }

  private districtCentre(id: number) {
    const blocks = map.blocks.filter((b) => b.district === id);
    const x = blocks.reduce((a, b) => a + b.x + 5, 0) / blocks.length;
    const y = blocks.reduce((a, b) => a + b.y + 5, 0) / blocks.length;
    return { x: x * TILE, y: y * TILE };
  }

  // -------------------------------------------------------------------------
  // input

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
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
      this.setHover(this.lotAtWorld(wp.x, wp.y), p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.drag.down) return;
      this.drag.down = false;
      if (this.drag.moved || p.rightButtonReleased()) return;
      const dealer = over.find((o) => o.getData('workerId') !== undefined);
      if (dealer) {
        view.selection = { type: 'worker', id: dealer.getData('workerId') };
        bus.emit('select');
        return;
      }
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const lot = this.lotAtWorld(wp.x, wp.y);
      if (lot >= 0 && map.lots[lot].kind !== 'decor') {
        const prev = view.selection;
        if (prev?.type === 'lot' && prev.id === lot && state.properties[lot] && PROP_KINDS[map.lots[lot].kind].interior && p.getDuration() < 400) {
          bus.emit('enter', lot);
          return;
        }
        view.selection = { type: 'lot', id: lot };
      } else if (lot < 0) {
        const tx = Math.floor(wp.x / TILE);
        const ty = Math.floor(wp.y / TILE);
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) view.selection = { type: 'district', id: map.districtAt[ty * MAP_W + tx] };
        else view.selection = null;
      } else view.selection = null;
      bus.emit('select');
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, dy > 0 ? 0.88 : 1.14));
    this.input.on('gameout', () => this.setHover(-1));
  }

  zoomAt(sx: number, sy: number, f: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    const nz = Phaser.Math.Clamp(cam.zoom * f, 0.4, 2.4);
    cam.setZoom(nz);
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    cam.scrollX = before.x - cx - (sx - cx) / nz;
    cam.scrollY = before.y - cy - (sy - cy) / nz;
  }

  private lotAtWorld(x: number, y: number) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    return map.lotAt[ty * MAP_W + tx];
  }

  private setHover(lot: number, p?: Phaser.Input.Pointer) {
    if (lot >= 0 && map.lots[lot].kind === 'decor') lot = -1;
    if (lot !== this.hoverLot) {
      this.hoverLot = lot;
      this.hoverG.clear();
      if (lot >= 0) {
        const l = map.lots[lot];
        this.hoverG.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(l.x * TILE + 2, l.y * TILE + 2, l.w * TILE - 4, l.h * TILE - 4, 6);
        this.input.setDefaultCursor('pointer');
      } else this.input.setDefaultCursor('default');
    }
    bus.emit('hover', lot >= 0 && p ? { lot, x: p.event instanceof MouseEvent ? p.event.clientX : p.x, y: p.event instanceof MouseEvent ? p.event.clientY : p.y } : null);
  }

  // -------------------------------------------------------------------------
  // markers for owned / for-sale lots

  refreshMarkers() {
    this.markers.forEach((m) => m.destroy());
    this.markers = [];
    const g = this.overlay;
    g.clear();
    for (const l of map.lots) {
      if (l.kind === 'decor') continue;
      const owned = !!state.properties[l.id];
      const cx = (l.x + l.w / 2) * TILE;
      const cy = (l.y + l.h / 2) * TILE;
      if (owned) {
        const front = !!PROP_KINDS[l.kind].launder;
        const col = front ? 0x4fc3f7 : 0x5cff8a;
        g.lineStyle(8, col, 0.18).strokeRoundedRect(l.x * TILE + 1, l.y * TILE + 1, l.w * TILE - 2, l.h * TILE - 2, 8);
        g.lineStyle(2.5, col, 0.95).strokeRoundedRect(l.x * TILE + 3, l.y * TILE + 3, l.w * TILE - 6, l.h * TILE - 6, 6);
        const pin = this.add.image(cx, cy - 6, front ? 'pin_front' : 'pin').setOrigin(0.5, 1).setDepth(12);
        this.tweens.add({ targets: pin, y: cy - 14, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.markers.push(pin);
      } else {
        // sign at the lot edge facing the street
        const sx = l.x * TILE + 24;
        const sy = l.doorY < l.y ? l.y * TILE + 14 : l.doorY > l.y + l.h - 1 ? (l.y + l.h) * TILE - 4 : (l.y + l.h / 2) * TILE;
        const sign = this.add.image(sx, sy, 'sale_sign').setOrigin(0.5, 1).setDepth(11);
        this.markers.push(sign);
      }
    }
    const sel = view.selection;
    if (sel?.type === 'lot') {
      const l = map.lots[sel.id];
      g.lineStyle(4, 0xffd54f, 1).strokeRoundedRect(l.x * TILE, l.y * TILE, l.w * TILE, l.h * TILE, 8);
    }
  }

  // -------------------------------------------------------------------------
  // traffic

  private spawnTraffic() {
    for (let i = 0; i < 38; i++) this.spawnCar(false);
  }

  private spawnCar(cop: boolean, district?: number) {
    let x = 0;
    let y = 0;
    let dir = 0;
    for (let tries = 0; tries < 20; tries++) {
      const horizontal = Math.random() < 0.5;
      if (horizontal) {
        const j = Phaser.Math.Between(0, MAX_J);
        const c = Phaser.Math.Between(0, MAX_I - 1);
        dir = Math.random() < 0.5 ? 0 : 2;
        x = c * SEG + 64 + Math.random() * (SEG - 64);
        y = laneCoord(dir, j);
      } else {
        const i = Phaser.Math.Between(0, MAX_I);
        const r = Phaser.Math.Between(0, MAX_J - 1);
        dir = Math.random() < 0.5 ? 1 : 3;
        y = r * SEG + 64 + Math.random() * (SEG - 64);
        x = laneCoord(dir, i);
      }
      if (district === undefined) break;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (map.districtAt[ty * MAP_W + tx] === district) break;
    }
    const key = cop ? 'cop0' : `car${Phaser.Math.Between(0, CAR_COLORS.length - 1)}`;
    const spr = this.add.image(x, y, key).setDepth(5);
    const light = this.add.image(x, y, 'glow').setDepth(21).setScale(0.45, 0.3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const car: Car = { spr, light, x, y, dir, speed: cop ? 95 : 55 + Math.random() * 35, planCoord: 0, planDir: dir, cop };
    if (cop) car.siren = this.add.image(x, y, 'glow_red').setDepth(21).setScale(0.6).setBlendMode(Phaser.BlendModes.ADD);
    this.plan(car);
    this.cars.push(car);
    return car;
  }

  private plan(c: Car) {
    const opts: { dir: number; coord: number; w: number }[] = [];
    if (c.dir === 0 || c.dir === 2) {
      const j = Math.floor(c.y / SEG);
      const i = c.dir === 0 ? Math.floor((c.x + 1) / SEG) + 1 : Math.floor((c.x - 65) / SEG);
      if (c.dir === 0 ? i < MAX_I : i > 0) opts.push({ dir: c.dir, coord: c.dir === 0 ? SEG * i + 64 : SEG * i, w: 2 });
      if (j < MAX_J) opts.push({ dir: 1, coord: laneCoord(1, i), w: 1 });
      if (j > 0) opts.push({ dir: 3, coord: laneCoord(3, i), w: 1 });
    } else {
      const i = Math.floor(c.x / SEG);
      const j = c.dir === 1 ? Math.floor((c.y + 1) / SEG) + 1 : Math.floor((c.y - 65) / SEG);
      if (c.dir === 1 ? j < MAX_J : j > 0) opts.push({ dir: c.dir, coord: c.dir === 1 ? SEG * j + 64 : SEG * j, w: 2 });
      if (i < MAX_I) opts.push({ dir: 0, coord: laneCoord(0, j), w: 1 });
      if (i > 0) opts.push({ dir: 2, coord: laneCoord(2, j), w: 1 });
    }
    const total = opts.reduce((a, o) => a + o.w, 0);
    let r = Math.random() * total;
    let pickO = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pickO = o; break; } }
    c.planDir = pickO.dir;
    c.planCoord = pickO.coord;
  }

  private stepCar(c: Car, dt: number) {
    const [dx, dy] = DIRS[c.dir];
    const move = c.speed * dt;
    const along = dx !== 0 ? c.x : c.y;
    const sign = dx + dy;
    const next = along + sign * move;
    const reached = sign > 0 ? next >= c.planCoord : next <= c.planCoord;
    if (reached) {
      if (dx !== 0) c.x = c.planCoord;
      else c.y = c.planCoord;
      c.dir = c.planDir;
      this.plan(c);
    } else if (dx !== 0) c.x = next;
    else c.y = next;
    const targetAngle = c.dir * 90;
    const cur = c.spr.angle;
    const diff = Phaser.Math.Angle.ShortestBetween(cur, targetAngle);
    c.spr.setAngle(cur + diff * Math.min(1, dt * 12));
    c.spr.setPosition(c.x, c.y);
    const [ndx, ndy] = DIRS[c.dir];
    c.light.setPosition(c.x + ndx * 30, c.y + ndy * 30).setAngle(c.dir * 90);
    if (c.siren) c.siren.setPosition(c.x, c.y);
  }

  private spawnPeds() {
    const blocks = map.blocks;
    for (let i = 0; i < 70; i++) {
      const b = Phaser.Utils.Array.GetRandom(blocks);
      const spr = this.add.image(0, 0, `ped${Phaser.Math.Between(0, 7)}`).setScale(0.5).setDepth(6);
      this.peds.push({ spr, bx: b.x, by: b.y, t: Math.random() * 4 * 288, speed: (16 + Math.random() * 14) * (Math.random() < 0.5 ? -1 : 1), off: (Math.random() - 0.5) * 12 });
    }
  }

  private stepPed(p: Ped, dt: number) {
    const L = 288;
    p.t = (p.t + p.speed * dt + 4 * L) % (4 * L);
    const side = Math.floor(p.t / L);
    const u = p.t % L;
    const x0 = p.bx * TILE + 16;
    const y0 = p.by * TILE + 16;
    let x = 0;
    let y = 0;
    let ang = 0;
    if (side === 0) { x = x0 + u; y = y0 + p.off; ang = 0; }
    else if (side === 1) { x = x0 + L - p.off; y = y0 + u; ang = 90; }
    else if (side === 2) { x = x0 + L - u; y = y0 + L - p.off; ang = 180; }
    else { x = x0 + p.off; y = y0 + L - u; ang = 270; }
    if (p.speed < 0) ang += 180;
    p.spr.setPosition(x, y).setAngle(ang);
  }

  // -------------------------------------------------------------------------
  // fx

  private floatText(x: number, y: number, s: string, color: string, size = 16) {
    if (!this.scene.isActive()) return;
    const t = this.add.text(x, y, s, { fontFamily: 'Inter, sans-serif', fontStyle: '800', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private raidFx(lotId: number) {
    if (!this.scene.isActive()) return;
    const l = map.lots[lotId];
    const x = (l.x + l.w / 2) * TILE;
    const y = (l.y + l.h / 2) * TILE;
    const a = this.add.image(x, y, 'glow_red').setScale(3).setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
    const b = this.add.image(x, y, 'glow_blue').setScale(3).setDepth(22).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({ targets: a, alpha: 0, duration: 250, yoyo: true, repeat: 10, onComplete: () => a.destroy() });
    this.tweens.add({ targets: b, alpha: 1, duration: 250, yoyo: true, repeat: 10, onComplete: () => b.destroy() });
    this.floatText(x, y - 20, 'RAID!', '#ff5252', 30);
  }

  // -------------------------------------------------------------------------

  update(_t: number, deltaMs: number) {
    const dtReal = Math.min(0.1, deltaMs / 1000);
    const speed = view.speed;
    const dt = dtReal * (speed === 0 ? 0 : Math.sqrt(speed));
    this.flashT += dtReal;

    this.handleKeys(dtReal);

    // cops follow total heat
    const want = Math.min(10, state.heat.reduce((a, h) => a + Math.floor(h / 22), 0));
    const cops = this.cars.filter((c) => c.cop);
    if (cops.length < want) {
      const hot = state.heat.indexOf(Math.max(...state.heat));
      this.spawnCar(true, hot);
    } else if (cops.length > want) {
      const c = cops[0];
      c.spr.destroy();
      c.light.destroy();
      c.siren?.destroy();
      this.cars.splice(this.cars.indexOf(c), 1);
    }

    const night = nightFactor(state.minutes);
    this.night.setAlpha(night * 0.6);
    const flash = Math.floor(this.flashT * 4) % 2;
    for (const c of this.cars) {
      this.stepCar(c, dt);
      c.light.setAlpha(night * 0.7);
      if (c.cop) {
        c.spr.setTexture(flash ? 'cop1' : 'cop0');
        c.siren!.setTexture(flash ? 'glow_red' : 'glow_blue').setAlpha(0.25 + night * 0.6);
      }
    }
    for (const p of this.peds) this.stepPed(p, dt);
    for (const g of this.lampGlows) g.setAlpha(night * 0.55);

    this.syncDealers();

    const z = this.cameras.main.zoom;
    const la = Phaser.Math.Clamp((0.85 - z) * 1.6, 0, 0.55);
    for (const l of this.labels) l.setAlpha(la);

  }

  private handleKeys(dt: number) {
    const cam = this.cameras.main;
    const k = this.keys;
    const s = (700 / cam.zoom) * dt;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= s;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += s;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= s;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += s;
    if (k.Q.isDown) this.zoomAt(cam.width / 2, cam.height / 2, 1 - dt * 1.5);
    if (k.E.isDown) this.zoomAt(cam.width / 2, cam.height / 2, 1 + dt * 1.5);
  }

  private syncDealers() {
    const alive = new Set<number>();
    for (const w of state.workers) {
      if (w.role !== 'dealer' || !w.inCity) continue;
      alive.add(w.id);
      let d = this.dealerSprites.get(w.id);
      if (!d) {
        const ring = this.add.image(w.cx, w.cy, 'ring').setDepth(7).setScale(0.6);
        const spr = this.add.image(w.cx, w.cy, 'worker_dealer').setDepth(8).setScale(0.35).setInteractive({ useHandCursor: true });
        spr.setData('workerId', w.id);
        d = { spr, ring };
        this.dealerSprites.set(w.id, d);
      }
      const bob = w.moving ? Math.sin(this.flashT * 14) * 0.05 : 0;
      d.spr.setPosition(w.cx, w.cy).setRotation(w.facing).setScale(0.35 + bob / 2);
      const sel = view.selection?.type === 'worker' && view.selection.id === w.id;
      d.ring.setPosition(w.cx, w.cy).setScale(sel ? 0.8 + Math.sin(this.flashT * 6) * 0.08 : 0.6).setTint(sel ? 0xffd54f : 0xffffff);
    }
    for (const [id, d] of this.dealerSprites) {
      if (alive.has(id)) continue;
      d.spr.destroy();
      d.ring.destroy();
      this.dealerSprites.delete(id);
    }
  }
}
