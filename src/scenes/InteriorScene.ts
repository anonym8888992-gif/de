import Phaser from 'phaser';
import { bus } from '../bus';
import { STATIONS, TILE } from '../config';
import { ACTION_TIME, canPlace, placeStation } from '../sim/sim';
import { mulberry32 } from '../sim/rng';
import { doorCell, interiorSize, map, state, view, type Station, type Worker } from '../state';
import { HI, makeTex, rr } from '../gfx/textures';

const WALL = 18;

interface StationView {
  img: Phaser.GameObjects.Image;
  plants?: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

interface WorkerView {
  spr: Phaser.GameObjects.Image;
  carry: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
}

export class InteriorScene extends Phaser.Scene {
  private lotId = -1;
  private stations = new Map<number, StationView>();
  private workers = new Map<number, WorkerView>();
  private bars!: Phaser.GameObjects.Graphics;
  private gridG!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private ghostCell = { x: -1, y: -1 };
  private t = 0;
  private offs: (() => void)[] = [];
  private drag = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 };

  constructor() {
    super('Interior');
  }

  init(data: { lotId: number }) {
    this.lotId = data.lotId;
    this.stations.clear();
    this.workers.clear();
  }

  create() {
    const [w, h] = interiorSize(this.lotId);
    const key = `floor_${this.lotId}`;
    makeTex(this, key, w * TILE + WALL * 2, h * TILE + WALL * 2 + 10, (ctx) => drawRoom(ctx, this.lotId, w, h), HI);
    this.add.image(-WALL, -WALL, key).setOrigin(0).setScale(1 / HI).setDepth(0);
    this.gridG = this.add.graphics().setDepth(1);
    this.bars = this.add.graphics().setDepth(30);
    this.ghost = this.add.image(0, 0, 'st_tent').setOrigin(0).setScale(1 / HI).setDepth(25).setAlpha(0.65).setVisible(false);

    this.cameras.main.setBackgroundColor('#121418');
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);

    this.rebuildStations();
    this.setupInput();

    this.offs.push(
      bus.on('changed', () => this.rebuildStations()),
      bus.on('placing', () => this.updateGhost()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offs.forEach((f) => f());
      this.scale.off('resize', this.fitCamera, this);
    });
  }

  private fitCamera() {
    const [w, h] = interiorSize(this.lotId);
    const cam = this.cameras.main;
    const availW = this.scale.width - 380;
    const availH = this.scale.height - 200;
    const z = Phaser.Math.Clamp(Math.min(availW / (w * TILE + WALL * 2), availH / (h * TILE + WALL * 2)), 0.6, 1.7);
    cam.setZoom(z);
    // offset so the room sits left of the side panel and above the toolbar
    cam.centerOn((w * TILE) / 2 + 170 / z, (h * TILE) / 2 + 20 / z);
  }

  private setupInput() {
    this.input.mouse?.disableContextMenu();
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => {
      if (view.placing) {
        view.placing = null;
        bus.emit('placing');
      } else bus.emit('exit');
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        if (view.placing) { view.placing = null; bus.emit('placing'); }
        return;
      }
      this.drag = { down: true, moved: false, x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      if (this.drag.down && p.isDown && !view.placing) {
        const dx = p.x - this.drag.x;
        const dy = p.y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          cam.scrollX = this.drag.sx - dx / cam.zoom;
          cam.scrollY = this.drag.sy - dy / cam.zoom;
        }
      }
      if (view.placing) {
        const wp = cam.getWorldPoint(p.x, p.y);
        const d = STATIONS[view.placing];
        this.ghostCell = { x: Math.round(wp.x / TILE - d.w / 2), y: Math.round(wp.y / TILE - d.h / 2) };
        this.updateGhost();
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.drag.down) return;
      this.drag.down = false;
      if (this.drag.moved) return;
      if (view.placing) {
        const type = view.placing;
        if (placeStation(this.lotId, type, this.ghostCell.x, this.ghostCell.y)) {
          this.cameras.main.shake(80, 0.002);
          if (state.dirty + state.clean < STATIONS[type].cost) view.placing = null;
          bus.emit('placing');
        }
        return;
      }
      const wk = over.find((o) => o.getData('workerId') !== undefined);
      const st = over.find((o) => o.getData('stationId') !== undefined);
      if (wk) view.selection = { type: 'worker', id: wk.getData('workerId') };
      else if (st) view.selection = { type: 'station', id: st.getData('stationId') };
      else view.selection = { type: 'lot', id: this.lotId };
      bus.emit('select');
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      const nz = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 3);
      cam.setZoom(nz);
      cam.scrollX = before.x - cam.width / 2 - (p.x - cam.width / 2) / nz;
      cam.scrollY = before.y - cam.height / 2 - (p.y - cam.height / 2) / nz;
    });
  }

  private updateGhost() {
    const type = view.placing;
    this.gridG.clear();
    if (!type) {
      this.ghost.setVisible(false);
      return;
    }
    const [w, h] = interiorSize(this.lotId);
    this.gridG.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= w; x++) this.gridG.lineBetween(x * TILE, 0, x * TILE, h * TILE);
    for (let y = 0; y <= h; y++) this.gridG.lineBetween(0, y * TILE, w * TILE, y * TILE);
    const door = doorCell(this.lotId);
    this.gridG.fillStyle(0xffd54f, 0.15).fillRect(door.x * TILE, (door.y - 1) * TILE, TILE, TILE * 2);
    const p = state.properties[this.lotId];
    const ok = !!p && canPlace(p, type, this.ghostCell.x, this.ghostCell.y) && state.dirty + state.clean >= STATIONS[type].cost;
    this.ghost.setTexture(`st_${type}`).setVisible(this.ghostCell.x > -50).setPosition(this.ghostCell.x * TILE, this.ghostCell.y * TILE).setTint(ok ? 0x88ff99 : 0xff6666);
  }

  private rebuildStations() {
    const p = state.properties[this.lotId];
    if (!p) return;
    const ids = new Set(p.stations.map((s) => s.id));
    for (const [id, v] of this.stations) {
      if (ids.has(id)) continue;
      v.img.destroy();
      v.plants?.destroy();
      v.glow?.destroy();
      v.label.destroy();
      this.stations.delete(id);
    }
    for (const s of p.stations) {
      if (this.stations.has(s.id)) continue;
      const d = STATIONS[s.type];
      const img = this.add.image(s.x * TILE, s.y * TILE, `st_${s.type}`).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      img.setData('stationId', s.id);
      const v: StationView = {
        img,
        label: this.add.text(s.x * TILE + (d.w * TILE) / 2, s.y * TILE - 4, '', {
          fontFamily: 'Inter, sans-serif', fontStyle: '700', fontSize: '11px', color: '#fff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setDepth(31),
      };
      if (s.type === 'tent') v.plants = this.add.image(s.x * TILE + 32, s.y * TILE + 32, 'plants').setDepth(6);
      if (s.type === 'lab') v.glow = this.add.image(s.x * TILE + 26, s.y * TILE + 30, 'glow_blue').setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      if (s.type === 'tent') v.glow = this.add.image(s.x * TILE + 32, s.y * TILE + 32, 'glow_green').setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.9);
      this.stations.set(s.id, v);
      img.setScale(0.6 / HI);
      this.tweens.add({ targets: img, scale: 1 / HI, duration: 260, ease: 'Back.easeOut' });
    }
  }

  update(_t: number, deltaMs: number) {
    this.t += deltaMs / 1000;
    const p = state.properties[this.lotId];
    if (!p) return;
    const g = this.bars;
    g.clear();

    for (const s of p.stations) {
      const v = this.stations.get(s.id);
      if (!v) continue;
      this.drawStationState(s, v, g);
    }
    const sel = view.selection;
    if (sel?.type === 'station') {
      const s = p.stations.find((st) => st.id === sel.id);
      if (s) {
        const d = STATIONS[s.type];
        g.lineStyle(3, 0xffd54f, 0.6 + Math.sin(this.t * 6) * 0.4).strokeRoundedRect(s.x * TILE - 2, s.y * TILE - 2, d.w * TILE + 4, d.h * TILE + 4, 6);
      }
    }

    this.syncWorkers(g);
  }

  private drawStationState(s: Station, v: StationView, g: Phaser.GameObjects.Graphics) {
    const d = STATIONS[s.type];
    const x = s.x * TILE;
    const y = s.y * TILE;
    const bw = d.w * TILE - 8;
    const bar = (yy: number, frac: number, col: number) => {
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x + 4, yy, bw, 6, 3);
      g.fillStyle(col, 1).fillRoundedRect(x + 5, yy + 1, Math.max(0, (bw - 2) * Phaser.Math.Clamp(frac, 0, 1)), 4, 2);
    };
    if (s.type === 'tent') {
      const grow = s.progress;
      v.plants!.setScale((0.25 + grow * 0.8) / HI).setAlpha(grow > 0.01 ? 1 : 0.3).setTint(grow >= 1 ? 0xb6ff8a : 0xffffff);
      v.plants!.setAngle(Math.sin(this.t * 1.5 + s.id) * 3);
      v.glow!.setAlpha(grow >= 1 ? 0.35 + Math.sin(this.t * 4) * 0.2 : 0);
      bar(y + d.h * TILE + 2, s.water / 100, s.water < 25 ? 0xff5252 : 0x4fc3f7);
      bar(y + d.h * TILE + 9, grow, grow >= 1 ? 0x8dff7a : 0x66bb6a);
      v.label.setText(grow >= 1 ? 'READY' : s.water <= 0 ? 'THIRSTY!' : '');
    } else if (s.type === 'lab') {
      const cooking = s.labState === 'cooking';
      v.glow!.setAlpha(cooking ? 0.45 + Math.sin(this.t * 8) * 0.25 : s.labState === 'done' ? 0.6 : 0);
      if (cooking) bar(y + d.h * TILE + 2, s.progress, 0x5cc8ff);
      v.label.setText(s.labState === 'done' ? 'BATCH READY' : cooking ? 'COOKING' : '');
    } else if (s.type === 'table') {
      const raw = s.raw.herb + s.raw.crystal;
      v.label.setText(raw ? `${s.raw.herb ? `🌿${s.raw.herb} ` : ''}${s.raw.crystal ? `💎${s.raw.crystal}` : ''} raw` : '');
    } else if (s.type === 'stash') {
      const st = state.properties[this.lotId].stash;
      const parts = [];
      if (st.herb) parts.push(`🌿${st.herb}`);
      if (st.crystal) parts.push(`💎${st.crystal}`);
      if (st.supplies) parts.push(`📦${st.supplies}`);
      v.label.setText(parts.join(' '));
    }
  }

  private syncWorkers(g: Phaser.GameObjects.Graphics) {
    const alive = new Set<number>();
    for (const w of state.workers) {
      if (w.propertyId !== this.lotId || w.inCity) continue;
      alive.add(w.id);
      let v = this.workers.get(w.id);
      if (!v) v = this.makeWorker(w);
      const px = w.x * TILE;
      const py = w.y * TILE;
      const bob = w.moving ? Math.sin(this.t * 16 + w.id) * 0.06 : 0;
      v.spr.setPosition(px, py).setRotation(w.facing).setScale((1 + bob) / HI);
      const sel = view.selection?.type === 'worker' && view.selection.id === w.id;
      v.ring.setPosition(px, py).setVisible(sel).setScale(0.9 + Math.sin(this.t * 6) * 0.06);
      v.name.setPosition(px, py + 15).setVisible(sel || this.cameras.main.zoom > 2.2);
      const carryKey = w.carry ? (w.carry.item === 'supplies' ? 'crate' : w.carry.product === 'herb' ? 'leafpile' : 'rocks')
        : w.bag.herb + w.bag.crystal > 0 ? (w.bag.crystal ? 'bag_crystal' : 'bag_herb') : null;
      if (carryKey) v.carry.setTexture(carryKey).setVisible(true).setPosition(px + Math.cos(w.facing) * 11, py + Math.sin(w.facing) * 11);
      else v.carry.setVisible(false);
      if (w.task && w.task.arrived && !w.path.length && w.task.action !== 'wander' && w.task.action !== 'leave') {
        const frac = 1 - w.task.timer / Math.max(1, timeOf(w.task.action));
        g.fillStyle(0x000000, 0.6).fillRoundedRect(px - 13, py - 22, 26, 6, 3);
        g.fillStyle(0xffd54f, 1).fillRoundedRect(px - 12, py - 21, 24 * Phaser.Math.Clamp(frac, 0, 1), 4, 2);
      }
    }
    for (const [id, v] of this.workers) {
      if (alive.has(id)) continue;
      v.spr.destroy();
      v.carry.destroy();
      v.ring.destroy();
      v.name.destroy();
      this.workers.delete(id);
    }
  }

  private makeWorker(w: Worker): WorkerView {
    const spr = this.add.image(0, 0, `worker_${w.role}`).setDepth(20).setInteractive({ useHandCursor: true });
    spr.setData('workerId', w.id);
    const v: WorkerView = {
      spr,
      carry: this.add.image(0, 0, 'crate').setScale(1 / HI).setDepth(21).setVisible(false),
      ring: this.add.image(0, 0, 'ring').setDepth(19).setTint(0xffd54f).setVisible(false),
      name: this.add.text(0, 0, w.name, { fontFamily: 'Inter, sans-serif', fontStyle: '700', fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(31),
    };
    this.workers.set(w.id, v);
    return v;
  }
}

function timeOf(a: keyof typeof ACTION_TIME) {
  return ACTION_TIME[a] || 10;
}

function drawRoom(ctx: CanvasRenderingContext2D, lotId: number, w: number, h: number) {
  const lot = map.lots[lotId];
  const r = mulberry32(lotId * 7919 + 3);
  const W = w * TILE;
  const H = h * TILE;
  ctx.translate(WALL, WALL);
  const kind = lot.kind;
  // floor
  if (kind === 'apartment' || kind === 'house') {
    const plank = kind === 'house' ? ['#b98b5e', '#a97c51', '#c39568'] : ['#8b6a4b', '#7d5e42', '#97755a'];
    for (let y = 0; y < H; y += 12) {
      let x = -((y / 12) % 3) * 22;
      while (x < W) {
        const len = 50 + r() * 40;
        ctx.fillStyle = plank[Math.floor(r() * plank.length)];
        ctx.fillRect(x, y, len, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x, y + 11, len, 1);
        ctx.fillRect(x + len - 1, y, 1, 12);
        x += len;
      }
    }
    // rug
    ctx.fillStyle = kind === 'house' ? '#7a3b3b' : '#3b5a7a';
    rr(ctx, W * 0.15, H * 0.2, W * 0.3, H * 0.35, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    rr(ctx, W * 0.15 + 5, H * 0.2 + 5, W * 0.3 - 10, H * 0.35 - 10, 6);
    ctx.stroke();
  } else {
    ctx.fillStyle = kind === 'garage' ? '#6f7377' : '#787d82';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < (W * H) / 6; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 * r()})`;
      ctx.fillRect(r() * W, r() * H, 2, 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += TILE * 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += TILE * 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // oil stains
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(20,20,25,0.25)';
      ctx.beginPath();
      ctx.ellipse(r() * W, r() * H, 5 + r() * 9, 3 + r() * 6, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind !== 'garage') {
      ctx.strokeStyle = 'rgba(255,214,79,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(TILE * 0.5, TILE * 0.5, W - TILE, H - TILE);
    }
  }
  // ambient vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // walls
  const wallCol = kind === 'apartment' || kind === 'house' ? '#d8cfc0' : '#5b6168';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, 0, 8, H);
  ctx.fillStyle = wallCol;
  ctx.fillRect(-WALL, -WALL, W + WALL * 2, WALL);
  ctx.fillRect(-WALL, H, W + WALL * 2, WALL);
  ctx.fillRect(-WALL, -WALL, WALL, H + WALL * 2);
  ctx.fillRect(W, -WALL, WALL, H + WALL * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-1, -1, W + 2, H + 2);
  ctx.strokeRect(-WALL + 1, -WALL + 1, W + WALL * 2 - 2, H + WALL * 2 - 2);
  // windows
  ctx.fillStyle = '#8fd3ff';
  for (let x = TILE * 1.5; x < W - TILE; x += TILE * 3) {
    ctx.fillRect(x, -WALL + 5, TILE * 1.4, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x + 3, -WALL + 6, 6, 2);
    ctx.fillStyle = '#8fd3ff';
  }
  // door
  const door = doorCell(lotId);
  ctx.fillStyle = kind === 'garage' ? '#bfc3c7' : '#6b4a2b';
  ctx.fillRect(door.x * TILE + 2, H, TILE - 4, WALL);
  ctx.fillStyle = 'rgba(255,214,79,0.25)';
  ctx.fillRect(door.x * TILE, H - TILE, TILE, TILE);
  ctx.font = 'bold 9px Inter, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', door.x * TILE + TILE / 2, H + 12);
}
