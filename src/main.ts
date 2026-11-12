import Phaser from 'phaser';
import './style.css';
import { bus } from './bus';
import { GAME_MIN_PER_SEC, GANGS, INK } from './config';
import { drawCity, type Sign } from './gfx/cityArt';
import { CrtPipeline } from './gfx/crt';
import { Pix, textWidth, toTexture } from './gfx/pix';
import { generateSprites } from './gfx/sprites';
import { CityScene } from './scenes/CityScene';
import { InteriorScene } from './scenes/InteriorScene';
import { checkObjectives, resetClock, update } from './sim/sim';
import { map, state, view } from './state';
import { initUI } from './ui/ui';

let signs: Sign[] = [];

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create() {
    generateSprites(this);
    GANGS.forEach((g, i) => {
      const w = textWidth(g.short) + 6;
      const p = new Pix(w, 9);
      p.rect(0, 0, w, 9, INK);
      p.text(g.short, 3, 2, g.color);
      toTexture(this, `tag${i}`, p);
    });
    const art = drawCity(map);
    signs = art.signs;
    toTexture(this, 'city', art.pix);
    this.scene.start('Sim');
    this.scene.launch('City', { signs });
  }
}

/** Runs the simulation regardless of which view is on screen. */
class SimScene extends Phaser.Scene {
  private acc = 0;
  constructor() {
    super('Sim');
  }
  create() {
    bus.on('enter', (lotId: number) => this.enter(lotId));
    bus.on('exit', () => this.exit());
    bus.on('started', () => {
      if (view.scene === 'interior') this.exit();
      resetClock();
      bus.emit('changed');
    });
    bus.on('crt', () => this.applyCrt());
    this.applyCrt();
  }
  private applyCrt() {
    for (const key of ['City', 'Interior']) {
      const sc = this.scene.get(key);
      const cam = sc?.cameras?.main;
      if (!cam) continue;
      cam.resetPostPipeline();
      if (view.crt && this.game.renderer.type === Phaser.WEBGL) cam.setPostPipeline(CrtPipeline);
    }
  }
  private enter(lotId: number) {
    if (state.biz[lotId]?.mode !== 'owned') return;
    if (this.scene.isActive('Interior') || this.scene.isSleeping('Interior')) this.scene.stop('Interior');
    if (this.scene.isActive('City')) this.scene.sleep('City');
    view.scene = 'interior';
    view.lot = lotId;
    view.selection = null;
    this.scene.launch('Interior', { lotId });
    bus.emit('scene');
  }
  private exit() {
    if (view.scene !== 'interior') return;
    this.scene.stop('Interior');
    this.scene.wake('City');
    view.selection = view.lot !== null ? { type: 'lot', id: view.lot } : null;
    view.scene = 'city';
    view.lot = null;
    bus.emit('scene');
    bus.emit('select');
  }
  update(_t: number, deltaMs: number) {
    if (!view.started || view.speed === 0) return;
    const dt = Math.min(0.25, deltaMs / 1000);
    update(dt * GAME_MIN_PER_SEC * view.speed);
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      checkObjectives();
    }
  }
}

const fontsReady = Promise.race([
  Promise.all(['8px "Press Start 2P"', '20px VT323', '60px "Mr Dafoe"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => undefined);

fontsReady.then(() => {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0b0614',
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    pipeline: { CrtPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
    scene: [BootScene, SimScene, CityScene, InteriorScene],
  });
  initUI();
});

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nk = { get state() { return state; }, view, bus, map };
