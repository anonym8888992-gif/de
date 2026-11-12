import Phaser from 'phaser';
import { sfx } from '../audio';
import { bus } from '../bus';
import { BIZ, INK, ITEMS, NEON, STATIONS, ITILE as TILE, type BizKind, type Floor, type ItemId, type StationId } from '../config';
import { placeStation } from '../sim/production';
import { mulberry32 } from '../sim/rng';
import { Pix, shade, toTexture } from '../gfx/pix';
import { Shadows } from '../gfx/shadows';
import { map, state, view, workersAt } from '../state';

const WALL = 10;

interface StationView {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  over?: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
}

interface Furn { key: string; x: number; y: number; rot?: number }
interface Npc {
  spr: Phaser.GameObjects.Image;
  mode: 'dance' | 'sit' | 'stand' | 'walk';
  x: number;
  y: number;
  path: { x: number; y: number }[];
  wait: number;
  seed: number;
  face: number;
  target?: number;
}

/** Fixed furniture per business type, in tile units. */
const BASE: Record<BizKind, Furn[]> = {
  safehouse: [
    { key: 'f_sofa', x: 10, y: 8 }, { key: 'f_plant', x: 13, y: 1 },
  ],
  motel: [
    { key: 'f_bed', x: 1, y: 1 }, { key: 'f_bed', x: 3, y: 1 },
    { key: 'f_plant', x: 14, y: 8 },
  ],
  warehouse: [
    { key: 'f_crate', x: 1, y: 1 }, { key: 'f_crate', x: 2, y: 1 }, { key: 'f_crate', x: 1, y: 2 },
    { key: 'f_crate', x: 18, y: 10 }, { key: 'f_crate', x: 17, y: 10 },
  ],
  nightclub: [
    { key: 'f_bar', x: 1, y: 1 }, { key: 'f_stool', x: 1, y: 2 }, { key: 'f_stool', x: 2, y: 2 }, { key: 'f_stool', x: 3, y: 2 },
    { key: 'f_table', x: 1, y: 5 }, { key: 'f_table', x: 15, y: 3 }, { key: 'f_plant', x: 16, y: 1 },
  ],
  arcade: [
    { key: 'f_cabinet', x: 12, y: 3 }, { key: 'f_cabinet', x: 12, y: 4 }, { key: 'f_cabinet', x: 12, y: 5 }, { key: 'f_cabinet', x: 12, y: 6 },
    { key: 'f_pool', x: 5, y: 3 }, { key: 'f_jukebox', x: 1, y: 8 },
  ],
  pawnshop: [
    { key: 'f_shelves', x: 1, y: 7 }, { key: 'f_shelves', x: 7, y: 7 }, { key: 'f_tv', x: 6, y: 1 }, { key: 'f_plant', x: 10, y: 4 },
  ],
  laundromat: [
    { key: 'f_washer', x: 5, y: 1 }, { key: 'f_washer', x: 6, y: 1 }, { key: 'f_washer', x: 7, y: 1 },
    { key: 'f_sofa', x: 5, y: 6 }, { key: 'f_plant', x: 10, y: 6 },
  ],
  videostore: [
    { key: 'f_shelves', x: 1, y: 3 }, { key: 'f_shelves', x: 5, y: 3 }, { key: 'f_counter', x: 7, y: 7 }, { key: 'f_plant', x: 10, y: 4 },
  ],
  carlot: [
    { key: 'f_car', x: 6, y: 2 }, { key: 'f_car2', x: 6, y: 5 }, { key: 'f_car3', x: 10, y: 8 }, { key: 'f_crate', x: 16, y: 9 },
  ],
  diner: [
    { key: 'f_counter', x: 3, y: 2 },
    { key: 'f_stool', x: 4, y: 3 }, { key: 'f_stool', x: 5, y: 3 }, { key: 'f_stool', x: 6, y: 3 }, { key: 'f_stool', x: 7, y: 3 },
    { key: 'f_table', x: 6, y: 6 }, { key: 'f_table', x: 9, y: 5 }, { key: 'f_plant', x: 12, y: 7 },
  ],
  marina: [
    { key: 'f_crate', x: 2, y: 5 }, { key: 'f_crate', x: 3, y: 5 }, { key: 'f_boat', x: 12, y: 2 },
  ],
};

const FLOORS: Record<BizKind, { floor: Floor; color: number }> = {
  safehouse: { floor: 'linoleum', color: 0x6f8f86 },
  motel: { floor: 'carpet', color: 0x14806c },
  warehouse: { floor: 'concrete', color: 0x8a8a92 },
  nightclub: { floor: 'dance', color: 0x1a1024 },
  arcade: { floor: 'carpet', color: 0x2a1490 },
  pawnshop: { floor: 'wood', color: 0xb0602c },
  laundromat: { floor: 'tile', color: 0xe8f0f4 },
  videostore: { floor: 'carpet', color: 0x9a1438 },
  carlot: { floor: 'concrete', color: 0x9a9aa2 },
  diner: { floor: 'checker', color: 0xf0ece4 },
  marina: { floor: 'wood', color: 0x9a6a3e },
};

export class InteriorScene extends Phaser.Scene {
  private lotId = -1;
  private kind!: BizKind;
  private w = 0;
  private h = 0;
  private blocked!: Uint8Array;
  /** furniture + upgrade slots */
  private fixed!: Uint8Array;
  /** walkable but can't build on (doorway) */
  private reserved!: Uint8Array;
  private stationViews = new Map<number, StationView>();
  private gridG!: Phaser.GameObjects.Graphics;
  private barsG!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private ghostCell = { x: 0, y: 0 };
  private fumeT = 0;
  private npcs: Npc[] = [];
  private crew = new Map<number, Npc>();
  private upgrades = new Map<string, Phaser.GameObjects.Image>();
  private danceTiles: Phaser.GameObjects.Rectangle[] = [];

  private t = 0;
  private shadows!: Shadows;
  private offs: (() => void)[] = [];
  private drag = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 };

  constructor() {
    super('Interior');
  }

  init(data: { lotId: number }) {
    this.lotId = data.lotId;
    this.kind = map.lots[data.lotId].kind as BizKind;
    [this.w, this.h] = BIZ[this.kind].room;
    this.npcs = [];
    this.crew.clear();
    this.upgrades.clear();
    this.stationViews.clear();
    this.danceTiles = [];

  }

  create() {
    const key = `room_${this.lotId}`;
    toTexture(this, key, drawRoom(this.kind, this.w, this.h, this.lotId));
    this.add.image(-WALL, -WALL, key).setOrigin(0).setDepth(0);
    this.shadows = new Shadows(this, 4);

    this.blocked = new Uint8Array(this.w * this.h);
    this.fixed = new Uint8Array(this.w * this.h);
    this.reserved = new Uint8Array(this.w * this.h);
    // keep the doorway and the tile in front of it walkable
    const dx = Math.floor(this.w / 2);
    this.reserved[(this.h - 1) * this.w + dx] = 1;
    this.reserved[(this.h - 2) * this.w + dx] = 1;
    if (this.kind === 'nightclub') this.makeDanceFloor();
    if (this.kind === 'marina') for (let y = 0; y < this.h; y++) for (let x = 10; x < this.w; x++) this.fixed[y * this.w + x] = 1;
    for (const f of BASE[this.kind]) this.placeFurn(f);
    this.gridG = this.add.graphics().setDepth(2);
    this.barsG = this.add.graphics().setDepth(30);
    this.ghost = this.add.image(0, 0, 'st_tent').setOrigin(0).setDepth(29).setAlpha(0.7).setVisible(false);
    this.syncUpgrades();
    this.syncStations();
    this.spawnNpcs();

    const cam = this.cameras.main;
    cam.setBackgroundColor('#2a0a3a');
    cam.setRoundPixels(true);
    this.fit();
    this.scale.on('resize', this.fit, this);

    this.setupInput();
    this.offs.push(
      bus.on('changed', () => { this.syncUpgrades(); this.syncStations(); }),
      bus.on('placing', () => this.updateGhost()),
      bus.on('batch', (e: { lot: number; station: number; out: Record<string, number> }) => {
        if (e.lot !== this.lotId) return;
        const st = state.biz[this.lotId]?.stations.find((s) => s.id === e.station);
        if (!st) return;
        const [item, n] = Object.entries(e.out)[0];
        this.float(st.x * TILE + STATIONS[st.type].w * 8, st.y * TILE - 2, `+${n} ${ITEMS[item as ItemId].name.toUpperCase()}`, ITEMS[item as ItemId].css);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offs.forEach((f) => f());
      this.scale.off('resize', this.fit, this);
    });
    bus.emit('crt');
  }

  private fit() {
    const cam = this.cameras.main;
    const roomW = this.w * TILE + WALL * 2;
    const roomH = this.h * TILE + WALL * 2;
    const z = Math.max(1, Math.min(4, Math.floor(Math.min((this.scale.width - 420) / roomW, (this.scale.height - 200) / roomH))));
    cam.setZoom(z);
    cam.centerOn((this.w * TILE) / 2 + 190 / z, (this.h * TILE) / 2 + 10 / z);
  }

  private setupInput() {
    this.input.keyboard!.on('keydown-ESC', () => {
      if (view.placing) { view.placing = null; bus.emit('placing'); }
      else bus.emit('exit');
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { down: true, moved: false, x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      if (view.placing) {
        const wp = cam.getWorldPoint(p.x, p.y);
        this.updateGhost(wp.x, wp.y);
        return;
      }
      if (!this.drag.down || !p.isDown) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
      if (this.drag.moved) { cam.scrollX = this.drag.sx - dx / cam.zoom; cam.scrollY = this.drag.sy - dy / cam.zoom; }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.drag.down) return;
      this.drag.down = false;
      if (p.rightButtonReleased()) {
        if (view.placing) { view.placing = null; bus.emit('placing'); }
        return;
      }
      if (view.placing) {
        const type = view.placing;
        if (this.canPlace(type, this.ghostCell.x, this.ghostCell.y) && placeStation(this.lotId, type, this.ghostCell.x, this.ghostCell.y)) {
          sfx('cash');
          this.cameras.main.shake(70, 0.002);
          // keep placing only if they can afford another one
          if (state.dirty + state.clean < STATIONS[type].cost) view.placing = null;
          bus.emit('placing');
        } else sfx('lose');
        return;
      }
      if (this.drag.moved) return;
      const up = over.find((o) => o.getData('upgrade'));
      if (up) bus.emit('upgradeFocus', up.getData('upgrade'));
      const g = over.find((o) => o.getData('goon') !== undefined);
      const st = over.find((o) => o.getData('station') !== undefined);
      if (g) { view.selection = { type: 'goon', id: g.getData('goon') }; bus.emit('select'); }
      else if (st) { view.selection = { type: 'station', id: st.getData('station') }; bus.emit('select'); }
      else if (view.selection) { view.selection = null; bus.emit('select'); }
    });
  }

  private placeFurn(f: Furn) {
    const img = this.add.image(f.x * TILE, f.y * TILE, f.key).setOrigin(0).setDepth(5);
    this.add.image(f.x * TILE + 4, f.y * TILE + 4, f.key).setOrigin(0).setDepth(4).setTintFill(0x140a1e).setAlpha(0.5);
    const tw = Math.ceil(img.width / TILE);
    const th = Math.ceil(img.height / TILE);
    if (f.key !== 'f_stool') {
      for (let y = f.y; y < Math.min(this.h, f.y + th); y++) for (let x = f.x; x < Math.min(this.w, f.x + tw); x++) this.fixed[y * this.w + x] = 1;
    }
    return img;
  }

  private makeDanceFloor() {
    const x0 = 5;
    const y0 = 4;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) {
      this.danceTiles.push(this.add.rectangle((x0 + x) * TILE + 1, (y0 + y) * TILE + 1, TILE - 2, TILE - 2, 0xffffff).setOrigin(0).setDepth(1));
    }
  }

  private syncUpgrades() {
    const b = state.biz[this.lotId];
    if (!b) return;
    for (const u of BIZ[this.kind].upgrades) {
      const has = b.upgrades.includes(u.id);
      const cur = this.upgrades.get(u.id);
      const want = has ? `f_${u.sprite}` : 'f_slot';
      if (cur && cur.texture.key === want) continue;
      cur?.destroy();
      const img = this.add.image(u.slot[0] * TILE, u.slot[1] * TILE, want).setOrigin(0).setDepth(has ? 5 : 3).setInteractive({ useHandCursor: true });
      img.setData('upgrade', u.id);
      if (!has) this.tweens.add({ targets: img, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
      else {
        img.setScale(0.5);
        this.tweens.add({ targets: img, scale: 1, duration: 250, ease: 'Back.easeOut' });
      }
      // slots stay reserved whether or not the upgrade is bought, so stations never sit on them
      const tex = this.textures.get(`f_${u.sprite}`).getSourceImage();
      for (let y = u.slot[1]; y < Math.min(this.h, u.slot[1] + Math.ceil(tex.height / TILE)); y++) {
        for (let x = u.slot[0]; x < Math.min(this.w, u.slot[0] + Math.ceil(tex.width / TILE)); x++) this.fixed[y * this.w + x] = 1;
      }
      this.upgrades.set(u.id, img);
    }
    this.rebuildBlocked();
  }

  private rebuildBlocked() {
    this.blocked = new Uint8Array(this.fixed);
    for (const st of state.biz[this.lotId]?.stations ?? []) {
      const d = STATIONS[st.type];
      for (let y = st.y; y < st.y + d.h; y++) for (let x = st.x; x < st.x + d.w; x++) this.blocked[y * this.w + x] = 1;
    }
  }

  canPlace(type: StationId, x: number, y: number) {
    const d = STATIONS[type];
    if (x < 0 || y < 0 || x + d.w > this.w || y + d.h > this.h) return false;
    for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) if (this.blocked[yy * this.w + xx] || this.reserved[yy * this.w + xx]) return false;
    return true;
  }

  private syncStations() {
    const b = state.biz[this.lotId];
    if (!b) return;
    const ids = new Set(b.stations.map((s) => s.id));
    for (const [id, v] of this.stationViews) {
      if (ids.has(id)) continue;
      v.img.destroy();
      v.shadow.destroy();
      v.over?.destroy();
      v.glow?.destroy();
      v.icon.destroy();
      this.stationViews.delete(id);
    }
    for (const st of b.stations) {
      if (this.stationViews.has(st.id)) continue;
      const d = STATIONS[st.type];
      const px = st.x * TILE;
      const py = st.y * TILE;
      const shadow = this.add.image(px + 4, py + 4, `st_${st.type}`).setOrigin(0).setDepth(4).setTintFill(INK).setAlpha(0.5);
      const img = this.add.image(px, py, `st_${st.type}`).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      img.setData('station', st.id);
      const v: StationView = { img, shadow, icon: this.add.image(px + d.w * TILE - 2, py + 2, 'warn').setDepth(31).setVisible(false) };
      if (st.type === 'tent') {
        v.over = this.add.image(px + 16, py + 16, 'st_plants').setDepth(6);
        v.glow = this.add.image(px + 16, py + 16, 'glow_pink').setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9);
      } else if (st.type === 'rack') v.over = this.add.image(px + 2, py + 1, 'st_rack_full').setOrigin(0).setDepth(6);
      else if (st.type === 'trays') v.over = this.add.image(px + 2, py + 2, 'st_trays_full').setOrigin(0).setDepth(6);
      if (d.fumes) v.glow = this.add.image(px + d.w * 8, py + d.h * 8, 'glow_orange').setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setScale(d.w * 0.5);
      img.setScale(0.6);
      this.tweens.add({ targets: img, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.stationViews.set(st.id, v);
    }
    this.rebuildBlocked();
  }

  private drawStations(dt: number) {
    const g = this.barsG;
    g.clear();
    const b = state.biz[this.lotId];
    if (!b) return;
    this.fumeT -= dt;
    const puff = this.fumeT <= 0;
    if (puff) this.fumeT = 0.35;
    for (const st of b.stations) {
      const v = this.stationViews.get(st.id);
      if (!v) continue;
      const d = STATIONS[st.type];
      const px = st.x * TILE;
      const py = st.y * TILE;
      const running = st.status === 'running';
      const W = d.w * TILE;
      // progress bar under the station
      if (st.loaded) {
        g.fillStyle(INK, 1).fillRect(px + 2, py + d.h * TILE + 1, W - 4, 4);
        g.fillStyle(running ? NEON.green : NEON.yellow, 1).fillRect(px + 3, py + d.h * TILE + 2, (W - 6) * st.progress, 2);
      }
      v.icon.setVisible(st.status === 'noinput' || st.status === 'nostaff' || st.status === 'full');
      v.icon.setTexture(st.status === 'nostaff' ? 'zzz' : 'warn').setY(py + 2 + (Math.floor(this.t * 3) % 2));
      if (st.type === 'tent') {
        const grow = st.loaded ? st.progress : 0;
        v.over!.setScale(0.2 + grow * 0.8).setAlpha(st.loaded ? 1 : 0).setAngle(Math.sin(this.t + st.id) * 4);
        v.glow!.setAlpha(running ? 0.35 + Math.sin(this.t * 2) * 0.05 : 0.05);
      } else if (st.type === 'rack' || st.type === 'trays') {
        v.over!.setAlpha(st.loaded ? 1 : 0).setTint(st.type === 'rack' && st.progress > 0.5 ? 0xb8c870 : 0xffffff);
      }
      if (d.fumes && v.glow) v.glow.setAlpha(running ? 0.3 + Math.sin(this.t * 9 + st.id) * 0.12 : 0);
      if (d.fumes && running && puff) this.fume(px + W / 2 + (Math.random() - 0.5) * W * 0.5, py + 6);
      if (view.selection?.type === 'station' && view.selection.id === st.id) {
        g.lineStyle(2, NEON.yellow, 0.6 + Math.sin(this.t * 6) * 0.4).strokeRect(px - 2, py - 2, W + 4, d.h * TILE + 4);
      }
    }
  }

  private fume(x: number, y: number) {
    const s = this.add.image(x, y, 'smoke').setDepth(30).setAlpha(0.55).setScale(0.6);
    this.tweens.add({ targets: s, y: y - 22 - Math.random() * 10, x: x + (Math.random() - 0.5) * 10, alpha: 0, scale: 1.6, duration: 1600, onComplete: () => s.destroy() });
  }

  private updateGhost(px?: number, py?: number) {
    const type = view.placing;
    this.gridG.clear();
    if (!type) {
      this.ghost.setVisible(false);
      return;
    }
    const d = STATIONS[type];
    if (px !== undefined && py !== undefined) this.ghostCell = { x: Math.round(px / TILE - d.w / 2), y: Math.round(py / TILE - d.h / 2) };
    this.gridG.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= this.w; x++) this.gridG.lineBetween(x * TILE, 0, x * TILE, this.h * TILE);
    for (let y = 0; y <= this.h; y++) this.gridG.lineBetween(0, y * TILE, this.w * TILE, y * TILE);
    for (let i = 0; i < this.w * this.h; i++) if (this.blocked[i] || this.reserved[i]) this.gridG.fillStyle(NEON.red, 0.12).fillRect((i % this.w) * TILE, Math.floor(i / this.w) * TILE, TILE, TILE);
    const ok = this.canPlace(type, this.ghostCell.x, this.ghostCell.y) && state.dirty + state.clean >= d.cost;
    this.ghost.setTexture(`st_${type}`).setVisible(true).setPosition(this.ghostCell.x * TILE, this.ghostCell.y * TILE).setTint(ok ? 0x9cff9c : 0xff6a6a);
  }

  private freeCell(rng = Math.random): { x: number; y: number } {
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(rng() * this.w);
      const y = Math.floor(rng() * this.h);
      if (!this.blocked[y * this.w + x]) return { x, y };
    }
    return { x: Math.floor(this.w / 2), y: this.h - 1 };
  }

  private spawnNpcs() {
    const k = this.kind;
    const add = (key: string, x: number, y: number, mode: Npc['mode'], face = 0) => {
      const spr = this.shadows.add(this.add.image(x, y, key).setDepth(10), 3);
      const n: Npc = { spr, mode, x, y, path: [], wait: Math.random() * 3, seed: Math.random() * 10, face };
      this.npcs.push(n);
      return n;
    };
    const civ = () => `civ${Math.floor(Math.random() * 10)}`;
    if (k === 'nightclub') {
      for (let i = 0; i < 14; i++) add(civ(), (5.5 + Math.random() * 7) * TILE, (4.5 + Math.random() * 4) * TILE, 'dance');
      add(civ(), 2 * TILE, 3 * TILE, 'sit', -Math.PI / 2);
      add(civ(), 3 * TILE, 3 * TILE, 'sit', -Math.PI / 2);
    } else if (k === 'arcade') {
      for (let i = 0; i < 4; i++) add(civ(), 11.3 * TILE, (3.5 + i) * TILE, 'stand', 0);
      add(civ(), 4.5 * TILE, 4 * TILE, 'stand', 0);
      add(civ(), 7.5 * TILE, 6 * TILE, 'stand', Math.PI);
    } else if (k === 'diner') {
      for (let i = 0; i < 3; i++) add(civ(), (4.4 + i) * TILE, 3.4 * TILE, 'sit', -Math.PI / 2);
      add(civ(), 5.5 * TILE, 1.6 * TILE, 'walk');
    } else if (k === 'laundromat') {
      add(civ(), 6 * TILE, 5.6 * TILE, 'sit', -Math.PI / 2);
      add(civ(), 6 * TILE, 2.6 * TILE, 'stand', -Math.PI / 2);
    } else if (k === 'motel' || k === 'videostore' || k === 'pawnshop') {
      add(civ(), (this.w - 4) * TILE, (this.h - 3) * TILE, 'walk');
      add(civ(), 3 * TILE, (this.h - 2) * TILE, 'walk');
    } else if (k === 'carlot' || k === 'marina' || k === 'warehouse') {
      add('civ8', 9 * TILE, 4 * TILE, 'walk');
    }
  }

  // -------------------------------------------------------------------------

  private path(from: { x: number; y: number }, to: { x: number; y: number }) {
    const W = this.w;
    const sx = Phaser.Math.Clamp(Math.floor(from.x / TILE), 0, W - 1);
    const sy = Phaser.Math.Clamp(Math.floor(from.y / TILE), 0, this.h - 1);
    const start = sy * W + sx;
    const goal = to.y * W + to.x;
    const prev = new Int32Array(W * this.h).fill(-1);
    prev[start] = start;
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c === goal) break;
      const cx = c % W;
      const cy = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.h) continue;
        const n = ny * W + nx;
        if (prev[n] !== -1 || (this.blocked[n] && n !== goal)) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    if (prev[goal] === -1) return [];
    const out: { x: number; y: number }[] = [];
    for (let c = goal; c !== start; c = prev[c]) out.push({ x: (c % W) * TILE + 8, y: Math.floor(c / W) * TILE + 8 });
    return out.reverse();
  }

  private walkFrame(spr: Phaser.GameObjects.Image, moving: boolean) {
    const base = (spr.getData('key') as string | undefined) ?? spr.texture.key.replace(/_w$/, '');
    spr.setData('key', base);
    const want = moving && Math.floor(this.t / 0.16) % 2 ? `${base}_w` : base;
    if (spr.texture.key !== want && this.textures.exists(want)) spr.setTexture(want);
  }

  private stepWalker(n: Npc, dt: number) {
    if (n.path.length) {
      const t = n.path[0];
      const dx = t.x - n.x;
      const dy = t.y - n.y;
      const d = Math.hypot(dx, dy);
      const mv = 40 * dt;
      n.face = Math.atan2(dy, dx);
      if (d <= mv) { n.x = t.x; n.y = t.y; n.path.shift(); }
      else { n.x += (dx / d) * mv; n.y += (dy / d) * mv; }
      const bob = Math.sin(this.t * 14 + n.seed) * 0.08;
      n.spr.setPosition(Math.round(n.x), Math.round(n.y)).setRotation(n.face + bob);
      this.walkFrame(n.spr, true);
      return;
    }
    n.wait -= dt;
    this.walkFrame(n.spr, false);
    n.spr.setRotation(n.face + Math.sin(this.t * 0.8 + n.seed) * 0.3);
    if (n.wait > 0) return;
    n.wait = 2 + Math.random() * 5;
    n.path = this.path(n, this.freeCell());
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.t += dt;
    const cam = this.cameras.main;
    cam.setRotation(view.wobble ? Math.sin(this.t * 0.45) * 0.03 : 0);

    // dance floor colour cycling
    const cols = [NEON.pink, NEON.cyan, NEON.yellow, NEON.purple, NEON.orange];
    this.danceTiles.forEach((r, i) => {
      const k = Math.floor(this.t * 2.5 + ((i % 8) + Math.floor(i / 8)) * 0.5) % cols.length;
      r.setFillStyle(cols[(k + i) % cols.length], 0.55 + 0.3 * Math.sin(this.t * 4 + i));
    });

    for (const n of this.npcs) {
      if (n.mode === 'dance') {
        const beat = Math.abs(Math.sin(this.t * 4.2 + n.seed));
        n.spr.setPosition(Math.round(n.x + Math.sin(this.t * 2 + n.seed) * 3), Math.round(n.y - beat * 2)).setRotation(this.t * 2 + n.seed);
      } else if (n.mode === 'sit' || n.mode === 'stand') {
        n.spr.setPosition(Math.round(n.x), Math.round(n.y)).setRotation(n.face + Math.sin(this.t * 1.2 + n.seed) * 0.15);
      } else this.stepWalker(n, dt);
    }

    this.syncCrew(dt);
    this.drawStations(dt);
    this.shadows.update();
  }

  private float(x: number, y: number, s: string, color: string) {
    const t = this.add.text(Math.round(x), Math.round(y), s, {
      fontFamily: '"Press Start 2P", monospace', fontSize: '6px', color, stroke: '#140a1e', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40).setResolution(4);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 1600, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** Free tile next to a station for a worker to stand on. */
  private standSpot(stId: number) {
    const st = state.biz[this.lotId]?.stations.find((s) => s.id === stId);
    if (!st) return null;
    const d = STATIONS[st.type];
    const opts: { x: number; y: number; fx: number; fy: number }[] = [];
    for (let x = st.x; x < st.x + d.w; x++) { opts.push({ x, y: st.y + d.h, fx: x, fy: st.y + d.h - 1 }, { x, y: st.y - 1, fx: x, fy: st.y }); }
    for (let y = st.y; y < st.y + d.h; y++) { opts.push({ x: st.x - 1, y, fx: st.x, fy: y }, { x: st.x + d.w, y, fx: st.x + d.w - 1, fy: y }); }
    const ok = opts.filter((o) => o.x >= 0 && o.y >= 0 && o.x < this.w && o.y < this.h && !this.blocked[o.y * this.w + o.x]);
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  private syncCrew(dt: number) {
    const workers = workersAt(this.lotId);
    const lounging = this.lotId === map.starterLot ? state.goons.filter((g) => g.status === 'idle' || g.status === 'hurt') : [];
    const here = [...workers, ...lounging];
    const ids = new Set(here.map((g) => g.id));
    const stations = state.biz[this.lotId]?.stations ?? [];
    for (const g of here) {
      let n = this.crew.get(g.id);
      if (!n) {
        const dx = Math.floor(this.w / 2);
        const spr = this.shadows.add(this.add.image(dx * TILE + 8, (this.h - 1) * TILE + 8, `crew${g.look}`).setDepth(11).setInteractive({ useHandCursor: true }), 3);
        spr.setData('goon', g.id);
        n = { spr, mode: 'walk', x: dx * TILE + 8, y: (this.h - 1) * TILE + 8, path: [], wait: Math.random(), seed: Math.random() * 10, face: -Math.PI / 2 };
        this.crew.set(g.id, n);
      }
      n.spr.setTint(g.status === 'hurt' ? 0xff8080 : 0xffffff);
      const wi = workers.indexOf(g);
      if (wi < 0) {
        this.stepWalker(n, dt * (g.status === 'hurt' ? 0.4 : 1));
        continue;
      }
      // each worker shuttles between their two stations
      const active = stations.filter((s) => s.loaded);
      const mine = active.slice(wi * 2, wi * 2 + 2);
      if (!mine.length) { this.stepWalker(n, dt); continue; }
      if (n.path.length) { this.stepWalker(n, dt); continue; }
      n.wait -= dt;
      const tgt = n.target ? stations.find((s) => s.id === n!.target) : null;
      if (tgt) {
        const d = STATIONS[tgt.type];
        n.face = Math.atan2((tgt.y + d.h / 2) * TILE - n.y, (tgt.x + d.w / 2) * TILE - n.x);
        // working motion
        const busy = tgt.status === 'running';
        n.spr.setRotation(n.face + (busy ? Math.sin(this.t * 10 + n.seed) * 0.25 : 0));
        n.spr.setTexture(busy && Math.floor(this.t * 4 + n.seed) % 2 ? `crew${g.look}_w` : `crew${g.look}`);
      }
      if (n.wait > 0 && tgt) continue;
      n.wait = 5 + Math.random() * 6;
      const next = mine[(mine.findIndex((s) => s.id === n!.target) + 1) % mine.length];
      const spot = this.standSpot(next.id);
      if (!spot) continue;
      n.target = next.id;
      n.path = this.path(n, spot);
    }
    for (const [id, n] of this.crew) {
      if (ids.has(id)) continue;
      n.spr.destroy();
      this.crew.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------

function drawRoom(kind: BizKind, w: number, h: number, seed: number) {
  const W = w * TILE;
  const H = h * TILE;
  const p = new Pix(W + WALL * 2, H + WALL * 2 + 6);
  const rng = mulberry32(seed * 977 + 13);
  const ox = WALL;
  const oy = WALL;
  const { floor, color } = FLOORS[kind];
  p.rect(ox, oy, W, H, color);
  switch (floor) {
    case 'concrete':
      for (let i = 0; i < 8; i++) p.ellipse(ox + rng() * W, oy + rng() * H, 4 + rng() * 8, 2 + rng() * 5, 0x3a3a40, 90);
      for (let x = ox + 32; x < ox + W; x += 64) for (let y = oy; y < oy + H; y += 6) p.rect(x, y, 2, 3, NEON.yellow, 160);
      break;
    case 'checker':
      p.checker(ox, oy, W, H, 0x1a1a22, 12);
      break;
    case 'carpet': {
      const hi = kind === 'arcade' ? NEON.cyan : shade(color, 0.35);
      const lo = kind === 'arcade' ? NEON.pink : shade(color, -0.3);
      for (let y = oy; y < oy + H; y += 12) for (let x = ox + (((y - oy) / 12) % 2 ? 6 : 0); x < ox + W; x += 12) {
        p.rect(x + 5, y + 3, 2, 6, hi);
        p.rect(x + 3, y + 5, 6, 2, hi);
        p.set(x + 6, y + 6, lo);
      }
      p.frame(ox + 4, oy + 4, W - 8, H - 8, lo);
      p.frame(ox + 6, oy + 6, W - 12, H - 12, hi);
      break;
    }
    case 'dance':
      for (let x = ox; x <= ox + W; x += 16) p.rect(x, oy, 1, H, 0x2a2038);
      for (let y = oy; y <= oy + H; y += 16) p.rect(ox, y, W, 1, 0x2a2038);
      break;
    case 'tile':
      for (let x = ox; x <= ox + W; x += 12) p.rect(x, oy, 2, H, 0xa8c0d0);
      for (let y = oy; y <= oy + H; y += 12) p.rect(ox, y, W, 2, 0xa8c0d0);
      break;
    case 'wood':
      for (let y = oy; y < oy + H; y += 5) {
        p.rect(ox, y + 4, W, 1, shade(color, -0.3));
        let x = ox - Math.floor(rng() * 30);
        while (x < ox + W) { const len = 24 + rng() * 30; p.rect(x, y, 1, 4, shade(color, -0.25)); p.rect(x + 1, y, len - 1, 4, shade(color, (rng() - 0.5) * 0.12)); x += len; }
      }
      break;
    case 'linoleum':
      p.checker(ox, oy, W, H, shade(color, -0.25), 12);
      for (let i = 0; i < 5; i++) p.ellipse(ox + rng() * W, oy + rng() * H, 3 + rng() * 6, 2 + rng() * 4, 0x6a5a3a, 70);
      break;
  }
  if (kind === 'marina') {
    p.rect(ox + 10 * TILE, oy, W - 10 * TILE, H, 0x1fa8c4);
    for (let i = 0; i < 40; i++) p.rect(ox + 10 * TILE + rng() * (W - 10 * TILE), oy + rng() * H, 4, 1, 0x8ff0e0);
    p.rect(ox + 10 * TILE - 2, oy, 2, H, 0x5a3a1a);
  }
  // inner shadow along the top & left walls
  p.rect(ox, oy, W, 4, INK, 90);
  p.rect(ox, oy, 3, H, INK, 70);

  // walls
  const wc = 0xf0e4f4;
  p.rect(0, 0, W + WALL * 2, WALL, wc);
  p.rect(0, H + WALL, W + WALL * 2, WALL, wc);
  p.rect(0, 0, WALL, H + WALL * 2, wc);
  p.rect(W + WALL, 0, WALL, H + WALL * 2, wc);
  p.frame(WALL - 1, WALL - 1, W + 2, H + 2, INK);
  p.frame(WALL - 2, WALL - 2, W + 4, H + 4, 0x8a7a9a);
  p.frame(0, 0, W + WALL * 2, H + WALL * 2, INK);
  // windows with blinds
  for (let x = ox + 24; x < ox + W - 24; x += 64) {
    p.rect(x, 2, 26, 4, 0x6fd1f8);
    for (let k = 0; k < 26; k += 3) p.rect(x + k, 2, 1, 4, 0xe8f4ff);
  }
  // door
  const dx = ox + Math.floor(w / 2) * TILE;
  p.rect(dx, H + WALL, TILE, WALL, shade(color, -0.2));
  p.rect(dx + 2, H + WALL - 4, TILE - 4, 3, 0x8a2a4a);
  p.text('EXIT', dx, H + WALL * 2 - 1, NEON.yellow);
  return p;
}
