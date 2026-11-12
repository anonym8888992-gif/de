import Phaser from 'phaser';
import './style.css';
import { bus } from './bus';
import { GAME_MIN_PER_SEC } from './config';
import { generateCityTexture } from './gfx/cityArt';
import { generateTextures } from './gfx/textures';
import { CityScene } from './scenes/CityScene';
import { InteriorScene } from './scenes/InteriorScene';
import { checkObjectives, update } from './sim/sim';
import { isFront, map, view } from './state';
import { initUI } from './ui/ui';

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create() {
    generateTextures(this);
    generateCityTexture(this, map);
    this.scene.start('Sim');
    this.scene.launch('City');
  }
}

/** Runs the simulation independently of whichever view is on screen. */
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
      bus.emit('changed');
    });
  }
  private enter(lotId: number) {
    if (isFront(lotId)) return;
    view.placing = null;
    if (this.scene.isActive('Interior') || this.scene.isPaused('Interior')) this.scene.stop('Interior');
    if (this.scene.isActive('City')) this.scene.sleep('City');
    view.scene = 'interior';
    view.propertyId = lotId;
    view.selection = null;
    this.scene.launch('Interior', { lotId });
    bus.emit('scene');
  }
  private exit() {
    if (view.scene !== 'interior') return;
    view.placing = null;
    this.scene.stop('Interior');
    this.scene.wake('City');
    view.selection = view.propertyId !== null ? { type: 'lot', id: view.propertyId } : null;
    view.scene = 'city';
    view.propertyId = null;
    bus.emit('scene');
    bus.emit('select');
  }
  update(_t: number, deltaMs: number) {
    if (!view.started || view.speed === 0) return;
    const dt = Math.min(0.1, deltaMs / 1000);
    update(dt * GAME_MIN_PER_SEC * view.speed);
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      checkObjectives();
    }
  }
}

// Canvas-drawn textures bake in fonts, so wait for the webfonts (but never hang on them).
const fontsReady = Promise.race([
  Promise.all(['16px Bungee', '800 16px Inter', '700 16px Inter', '400 16px Inter'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => undefined);

fontsReady.then(() => new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d1117',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, SimScene, CityScene, InteriorScene],
}));

initUI();
