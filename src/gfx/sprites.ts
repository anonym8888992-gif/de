import Phaser from 'phaser';
import { INK, NEON } from '../config';
import { Pix, shade, toTexture } from './pix';

function mk(scene: Phaser.Scene, key: string, w: number, h: number, draw: (p: Pix) => void, outline = true) {
  const p = new Pix(w, h);
  draw(p);
  if (outline) p.outline(INK);
  toTexture(scene, key, p);
}

// ---------------------------------------------------------------------------
// people (12x12, facing +x)

export interface Look {
  shirt: number;
  skin: number;
  hair: number;
  extra?: 'shades' | 'cap' | 'mask' | 'stripe' | 'bald';
  accent?: number;
}

const SKINS = [0xf2c29b, 0xd9a07a, 0xb27650, 0x8a5636, 0x6b3f26, 0xf7d6bd];
const HAIRS = [0x2a1a10, 0x5a3418, 0xe8c46a, 0x1a1a1a, 0x8a2a1a, 0xbfbfbf];

function person(p: Pix, l: Look) {
  // arms reaching forward
  p.rect(7, 1, 3, 2, shade(l.shirt, -0.15));
  p.rect(7, 9, 3, 2, shade(l.shirt, -0.15));
  p.rect(10, 1, 1, 2, l.skin);
  p.rect(10, 9, 1, 2, l.skin);
  // shoulders
  p.ellipse(5.5, 6, 3.2, 5.2, l.shirt);
  p.rect(2, 2, 2, 8, shade(l.shirt, -0.3));
  if (l.extra === 'stripe') p.rect(4, 1, 1, 10, l.accent ?? NEON.white);
  if (l.accent && l.extra !== 'stripe') p.rect(6, 3, 1, 6, l.accent);
  // head
  p.disc(6, 6, 2.6, l.skin);
  if (l.extra !== 'bald') {
    p.rect(3, 4, 3, 4, l.hair);
    p.rect(4, 3, 3, 1, l.hair);
    p.rect(4, 8, 3, 1, l.hair);
  }
  if (l.extra === 'cap') {
    p.disc(5.5, 6, 2.8, l.accent ?? 0x1b2a6b);
    p.rect(8, 4, 2, 4, l.accent ?? 0x1b2a6b);
  }
  if (l.extra === 'mask') {
    p.disc(6, 6, 2.8, l.accent ?? NEON.pink);
    p.set(8, 5, INK);
    p.set(8, 7, INK);
  }
  if (l.extra === 'shades') p.rect(8, 4, 1, 4, INK);
}

export const CREW_LOOKS: Look[] = [
  { shirt: 0xffe14d, skin: SKINS[1], hair: HAIRS[0], extra: 'shades' },
  { shirt: 0xf4f4f4, skin: SKINS[2], hair: HAIRS[3], extra: 'shades', accent: 0xffe14d },
  { shirt: 0x2de2e6, skin: SKINS[0], hair: HAIRS[2], extra: 'stripe', accent: 0xffe14d },
  { shirt: 0xffe14d, skin: SKINS[3], hair: HAIRS[0], extra: 'stripe', accent: INK },
  { shirt: 0xff8fc8, skin: SKINS[5], hair: HAIRS[4], extra: 'shades', accent: 0xffe14d },
  { shirt: 0x3a3a46, skin: SKINS[4], hair: HAIRS[3], extra: 'bald', accent: 0xffe14d },
];

const GANG_SHIRT = [0xffe14d, 0xff2a8a, 0x2de2e6, 0xff8a1f];

export function generateSprites(scene: Phaser.Scene) {
  CREW_LOOKS.forEach((l, i) => mk(scene, `crew${i}`, 12, 12, (p) => person(p, l)));
  for (let g = 1; g <= 3; g++) {
    for (let v = 0; v < 2; v++) {
      mk(scene, `gang${g}_${v}`, 12, 12, (p) => person(p, {
        shirt: GANG_SHIRT[g], skin: SKINS[(g * 2 + v) % SKINS.length], hair: HAIRS[(g + v) % 4],
        extra: v ? 'shades' : 'stripe', accent: v ? undefined : INK,
      }));
    }
  }
  const civShirts = [0x3d7dd8, 0xd94848, 0x8f8f8f, 0xf2a03d, 0x3fb57a, 0x9a5fd1, 0xf7f0e0, 0x6fd1d8, 0xf27ab0, 0x48486a];
  civShirts.forEach((c, i) => mk(scene, `civ${i}`, 12, 12, (p) => person(p, { shirt: c, skin: SKINS[i % SKINS.length], hair: HAIRS[i % HAIRS.length] })));
  mk(scene, 'copman', 12, 12, (p) => person(p, { shirt: 0x24356e, skin: SKINS[0], hair: HAIRS[0], extra: 'cap', accent: 0x101a40 }));

  // ---- cars (24x12, facing +x) ----
  const civCars = [0xe8e0d0, 0xd94848, 0x3d7dd8, 0x2a2a34, 0xf2c14e, 0x6fd1d8, 0xf27ab0, 0x5aa65a, 0xbfbfc8, 0x8a4fd8];
  civCars.forEach((c, i) => mk(scene, `car${i}`, 24, 12, (p) => car(p, c)));
  mk(scene, 'car_crew', 24, 12, (p) => car(p, 0xffe14d, INK));
  for (let g = 1; g <= 3; g++) mk(scene, `car_gang${g}`, 24, 12, (p) => car(p, 0x24202e, GANG_SHIRT[g]));
  mk(scene, 'cop0', 24, 12, (p) => cop(p, 0));
  mk(scene, 'cop1', 24, 12, (p) => cop(p, 1));
  mk(scene, 'van', 26, 12, (p) => van(p));
  mk(scene, 'boat', 36, 14, (p) => boat(p, 0xf4f4f4, NEON.pink));
  mk(scene, 'boat2', 36, 14, (p) => boat(p, 0xf4f4f4, NEON.cyan));
  mk(scene, 'boat3', 30, 12, (p) => boat(p, 0xffe14d, INK));

  // ---- palm (28x28) ----
  for (let v = 0; v < 3; v++) mk(scene, `palm${v}`, 30, 30, (p) => palm(p, v));

  // ---- fx ----
  mk(scene, 'flash', 11, 11, (p) => {
    p.line(5, 0, 5, 10, NEON.yellow);
    p.line(0, 5, 10, 5, NEON.yellow);
    p.line(1, 1, 9, 9, 0xffa040);
    p.line(9, 1, 1, 9, 0xffa040);
    p.disc(5.5, 5.5, 2, NEON.white);
  }, false);
  mk(scene, 'blood', 10, 10, (p) => {
    p.disc(5, 5, 3, 0x9a0c1e);
    p.set(1, 2, 0x9a0c1e);
    p.set(8, 8, 0x9a0c1e);
    p.set(9, 3, 0x9a0c1e);
  }, false);
  mk(scene, 'px', 2, 2, (p) => p.rect(0, 0, 2, 2, 0xffffff), false);
  mk(scene, 'hq', 13, 15, (p) => {
    p.rect(1, 1, 11, 9, NEON.yellow);
    p.rect(5, 10, 3, 4, NEON.yellow);
    p.text('HQ', 3, 3, INK);
  });
  mk(scene, 'selring', 20, 20, (p) => {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      if (a % 8 < 5) p.set(10 + Math.cos(t) * 8.5, 10 + Math.sin(t) * 8.5, NEON.yellow);
    }
  }, false);

  // soft glows for night lights (these are allowed to be smooth: they're light, not art)
  glow(scene, 'glow', 'rgba(255,220,160,1)');
  glow(scene, 'glow_pink', 'rgba(255,42,138,1)');
  glow(scene, 'glow_cyan', 'rgba(45,226,230,1)');
  glow(scene, 'glow_yellow', 'rgba(255,225,77,1)');
  glow(scene, 'glow_orange', 'rgba(255,138,31,1)');
  glow(scene, 'glow_red', 'rgba(255,40,40,1)');
  glow(scene, 'glow_blue', 'rgba(60,110,255,1)');
  glow(scene, 'glow_white', 'rgba(255,250,240,1)');

  generateFurniture(scene);
}

function glow(scene: Phaser.Scene, key: string, color: string) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, 64, 64)!;
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(0.3, color.replace(/[\d.]+\)$/, '0.4)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  t.refresh();
}

function car(p: Pix, body: number, stripe?: number) {
  p.rect(1, 1, 22, 10, body);
  // cut corners
  for (const [x, y] of [[1, 1], [22, 1], [1, 10], [22, 10]]) p.data[y * p.w + x] = 0;
  p.rect(1, 8, 22, 2, shade(body, -0.25));
  p.rect(1, 2, 22, 1, shade(body, 0.25));
  // roof & glass
  p.rect(8, 2, 8, 8, shade(body, 0.12));
  p.rect(15, 2, 3, 8, 0x1b2440);
  p.rect(6, 3, 2, 6, 0x1b2440);
  p.set(16, 3, 0x6f8fd0);
  p.set(16, 4, 0x6f8fd0);
  if (stripe !== undefined) {
    p.rect(1, 5, 7, 2, stripe);
    p.rect(18, 5, 5, 2, stripe);
  }
  p.set(22, 2, 0xfff2a0);
  p.set(22, 9, 0xfff2a0);
  p.set(1, 2, 0xff3030);
  p.set(1, 9, 0xff3030);
}

function cop(p: Pix, f: number) {
  car(p, 0x1a1a24);
  p.rect(8, 1, 8, 10, 0xf4f4f4);
  p.rect(15, 2, 3, 8, 0x1b2440);
  p.rect(11, 2, 2, 4, f ? 0xff3030 : 0x601010);
  p.rect(11, 6, 2, 4, f ? 0x203070 : 0x3070ff);
}

function van(p: Pix) {
  p.rect(1, 1, 24, 10, 0xf4f0e8);
  for (const [x, y] of [[1, 1], [24, 1], [1, 10], [24, 10]]) p.data[y * p.w + x] = 0;
  p.rect(1, 8, 24, 2, 0xc9c0b0);
  p.rect(19, 2, 3, 8, 0x1b2440);
  p.rect(2, 4, 16, 1, NEON.pink);
  p.rect(2, 7, 16, 1, NEON.cyan);
  p.rect(5, 2, 6, 1, 0xd9d0c0);
  p.set(24, 2, 0xfff2a0);
  p.set(24, 9, 0xfff2a0);
}

function boat(p: Pix, hull: number, stripe: number) {
  const w = p.w;
  const h = p.h;
  const mid = h / 2;
  for (let x = 1; x < w - 1; x++) {
    const taper = x > w * 0.65 ? ((x - w * 0.65) / (w * 0.35)) * (mid - 1) : 0;
    p.rect(x, 1 + taper, 1, h - 2 - taper * 2, hull);
  }
  p.rect(1, mid - 1, w * 0.7, 2, stripe);
  p.rect(5, 3, w * 0.35, h - 6, 0xb07a48);
  p.rect(w * 0.5, 3, 3, h - 6, 0x1b2440);
}

function palm(p: Pix, v: number) {
  const c = 15;
  const greens = [0x1f7a3a, 0x37b04c, 0x7be06a];
  const n = 7 + v;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + v * 0.4;
    const len = 12 + ((k * 7 + v) % 3);
    for (let t = 2; t < len; t++) {
      const bend = Math.sin(t / len * Math.PI) * 1.5;
      const x = c + Math.cos(a) * t - Math.sin(a) * bend;
      const y = c + Math.sin(a) * t + Math.cos(a) * bend;
      const wdt = t < len - 3 ? 1.3 : 0.6;
      p.disc(x, y, wdt, t > len * 0.6 ? greens[1] : greens[0]);
      if (t % 2 === 0) p.set(x - Math.sin(a) * 2, y + Math.cos(a) * 2, greens[2]);
    }
  }
  p.disc(c, c, 2.2, 0x8a5a2a);
  p.set(c - 1, c - 1, 0xc08a4a);
}

// ---------------------------------------------------------------------------
// furniture for interiors (top-down)

function generateFurniture(scene: Phaser.Scene) {
  mk(scene, 'f_bed', 16, 26, (p) => {
    p.rect(0, 0, 16, 26, 0x7a4a2a);
    p.rect(1, 1, 14, 24, 0xf4f0f8);
    p.rect(1, 9, 14, 16, 0x7f5ad8);
    p.rect(1, 9, 14, 1, 0x5a3aa8);
    p.rect(3, 2, 10, 5, 0xffffff);
  });
  mk(scene, 'f_sofa', 34, 14, (p) => {
    p.rect(0, 0, 34, 14, 0xb03a6a);
    p.rect(3, 4, 28, 9, 0xd85a8a);
    p.rect(17, 4, 1, 9, 0xb03a6a);
  });
  mk(scene, 'f_table', 22, 22, (p) => {
    for (const [x, y] of [[8, 0], [8, 18], [0, 8], [18, 8]]) { const side = x === 0 || x === 18; p.rect(x, y, side ? 4 : 6, side ? 6 : 4, 0xd94848); }
    p.rect(4, 4, 14, 14, 0x6a3a1a);
    p.rect(5, 5, 12, 12, 0x9a6a3a);
    p.rect(7, 8, 3, 2, 0xffffff);
    p.rect(12, 11, 2, 2, NEON.green);
  });
  mk(scene, 'f_counter', 48, 10, (p) => {
    p.rect(0, 0, 48, 10, 0x8a8a9a);
    p.rect(1, 1, 46, 3, 0xc9c9d8);
    for (let x = 4; x < 44; x += 9) p.rect(x, 5, 6, 3, 0x6fd1d8);
  });
  mk(scene, 'f_shelves', 32, 10, (p) => {
    p.rect(0, 0, 32, 10, 0x5a3a24);
    for (let x = 1; x < 31; x += 3) p.rect(x, 1, 2, 8, [NEON.pink, NEON.cyan, NEON.yellow, 0xf4f4f4, NEON.green][x % 5]);
  });
  mk(scene, 'f_safe', 14, 14, (p) => {
    p.rect(0, 0, 14, 14, 0x3a3f48);
    p.rect(1, 1, 12, 12, 0x5a606a);
    p.disc(7, 7, 3, 0xc9c9d0);
    p.disc(7, 7, 1.2, 0x2a2a30);
    p.rect(11, 4, 1, 6, 0xd9b84a);
  });
  mk(scene, 'f_desk', 26, 14, (p) => {
    p.rect(0, 0, 26, 14, 0x6a4024);
    p.rect(1, 1, 24, 12, 0x8a5a34);
    p.rect(3, 3, 7, 5, 0x2a2a30);
    p.rect(4, 4, 5, 3, 0x2de2e6);
    p.rect(14, 4, 6, 7, 0xf4f0e8);
    p.rect(21, 3, 3, 3, 0xd94848);
  });
  mk(scene, 'f_door', 16, 6, (p) => {
    p.rect(0, 0, 16, 6, 0x4a4f58);
    p.rect(1, 1, 14, 4, 0x7a808a);
    p.rect(12, 2, 2, 2, 0xd9b84a);
  });
  mk(scene, 'f_radio', 12, 9, (p) => {
    p.rect(0, 0, 12, 9, 0x2a2a30);
    p.rect(1, 1, 5, 7, 0x4a4a52);
    p.rect(7, 2, 4, 2, NEON.green);
    p.rect(7, 5, 4, 2, NEON.red);
  });
  mk(scene, 'f_icebox', 16, 14, (p) => {
    p.rect(0, 0, 16, 14, 0xd8e8f4);
    p.rect(1, 1, 14, 12, 0xf4fbff);
    p.rect(2, 6, 12, 1, 0x9ab8d0);
    p.rect(12, 2, 2, 3, 0x6f8fd0);
  });
  mk(scene, 'f_djbooth', 40, 16, (p) => {
    p.rect(0, 0, 40, 16, 0x1a1424);
    p.rect(1, 1, 38, 14, 0x2a2238);
    p.disc(9, 8, 5, 0x0a0a0a);
    p.disc(9, 8, 1.5, NEON.pink);
    p.disc(31, 8, 5, 0x0a0a0a);
    p.disc(31, 8, 1.5, NEON.cyan);
    p.rect(17, 4, 6, 8, 0x4a4458);
    for (let i = 0; i < 4; i++) p.rect(18, 5 + i * 2, 4, 1, [NEON.green, NEON.yellow, NEON.orange, NEON.red][i]);
  });
  mk(scene, 'f_cabinet', 12, 14, (p) => {
    p.rect(0, 0, 12, 14, 0x2a1a4a);
    p.rect(1, 1, 10, 6, 0x101018);
    p.rect(2, 2, 8, 4, NEON.cyan);
    p.rect(3, 3, 2, 2, NEON.pink);
    p.rect(2, 9, 3, 3, 0x4a4458);
    p.set(3, 10, NEON.red);
    p.set(7, 10, NEON.yellow);
    p.set(9, 10, NEON.green);
  });
  mk(scene, 'f_atm', 12, 12, (p) => {
    p.rect(0, 0, 12, 12, 0x6a6a7a);
    p.rect(2, 2, 8, 4, 0x2a6a2a);
    p.rect(3, 3, 6, 2, NEON.green);
    p.rect(2, 8, 8, 2, 0x2a2a30);
  });
  mk(scene, 'f_washer', 14, 14, (p) => {
    p.rect(0, 0, 14, 14, 0xe8ecf4);
    p.disc(7, 8, 4.5, 0x8a96a8);
    p.disc(7, 8, 3.5, 0x6fd1f8);
    p.rect(2, 1, 10, 2, 0xb8c0d0);
    p.set(10, 1, NEON.red);
  });
  mk(scene, 'f_curtain', 32, 6, (p) => {
    for (let x = 0; x < 32; x++) p.rect(x, 0, 1, 6, x % 3 === 0 ? 0x6a0a2a : 0xb01a4a);
  });
  mk(scene, 'f_tv', 14, 10, (p) => {
    p.rect(0, 0, 14, 10, 0x2a2a30);
    p.rect(1, 1, 12, 8, 0x3a3a46);
    p.rect(2, 2, 10, 6, 0x4a8ad8);
    p.rect(3, 3, 3, 2, 0xf4f4f4);
  });
  mk(scene, 'f_lift', 30, 18, (p) => {
    p.rect(0, 0, 30, 18, 0xd9b84a);
    p.rect(2, 2, 26, 14, 0x3a3a46);
    p.rect(0, 0, 30, 2, 0x1a1a1a);
    p.checker(0, 0, 30, 2, NEON.yellow, 2);
    const c = new Pix(24, 12);
    car(c, 0xd94848);
    p.blit(c, 3, 3);
  });
  mk(scene, 'f_booth', 34, 30, (p) => {
    p.rect(0, 0, 34, 30, 0x8a96a8);
    p.rect(2, 2, 30, 26, 0xc0c8d8);
    const c = new Pix(24, 12);
    car(c, 0x3d7dd8);
    p.blit(c, 5, 9);
    p.dither(2, 2, 30, 26, NEON.pink, 0.06, Math.random);
  });
  mk(scene, 'f_forklift', 16, 24, (p) => {
    p.rect(2, 6, 12, 16, NEON.orange);
    p.rect(4, 10, 8, 6, 0x2a2a30);
    p.rect(3, 0, 2, 7, 0x6a6a7a);
    p.rect(11, 0, 2, 7, 0x6a6a7a);
    p.rect(0, 8, 2, 4, INK);
    p.rect(14, 8, 2, 4, INK);
    p.rect(0, 17, 2, 4, INK);
    p.rect(14, 17, 2, 4, INK);
  });
  mk(scene, 'f_boat', 36, 14, (p) => boat(p, 0xffffff, NEON.pink));
  mk(scene, 'f_jukebox', 14, 12, (p) => {
    p.rect(0, 0, 14, 12, 0x8a3a1a);
    p.rect(1, 1, 12, 10, NEON.orange);
    p.rect(2, 2, 10, 4, NEON.yellow);
    p.rect(3, 7, 8, 3, NEON.pink);
  });
  mk(scene, 'f_plant', 14, 14, (p) => {
    p.rect(3, 3, 8, 8, 0xb0603a);
    p.rect(4, 4, 6, 6, 0x5a3a1a);
    for (const [x, y, r] of [[5, 5, 3], [9, 5, 3], [7, 9, 3], [4, 9, 2], [10, 9, 2]]) p.disc(x, y, r, 0x2f9e44);
    for (const [x, y] of [[5, 4], [9, 5], [7, 9]]) p.set(x, y, 0x7be06a);
  });
  mk(scene, 'f_pool', 26, 42, (p) => {
    p.rect(0, 0, 26, 42, 0x5a2a12);
    p.rect(2, 2, 22, 38, 0x1f8a4a);
    p.disc(8, 12, 1.5, 0xffffff);
    p.disc(16, 20, 1.5, 0xd94848);
    p.disc(12, 28, 1.5, NEON.yellow);
  });
  mk(scene, 'f_bar', 60, 12, (p) => {
    p.rect(0, 0, 60, 12, 0x3a1a2a);
    p.rect(1, 1, 58, 4, 0x6a2a4a);
    for (let x = 4; x < 56; x += 6) p.rect(x, 7, 2, 4, [NEON.cyan, NEON.pink, NEON.yellow, 0xf4f4f4][x % 4]);
  });
  mk(scene, 'f_stool', 6, 6, (p) => p.disc(3, 3, 2.4, 0xd94848));
  mk(scene, 'f_crate', 14, 14, (p) => {
    p.rect(0, 0, 14, 14, 0x8a5a2a);
    p.rect(1, 1, 12, 12, 0xb07a48);
    p.line(1, 1, 12, 12, 0x6a4020);
    p.line(12, 1, 1, 12, 0x6a4020);
  });
  mk(scene, 'f_brick_green', 6, 4, (p) => { p.rect(0, 0, 6, 4, 0x3fa040); p.rect(1, 1, 4, 1, 0x7dff6a); });
  mk(scene, 'f_brick_candy', 6, 4, (p) => { p.rect(0, 0, 6, 4, 0xc03a9a); p.rect(1, 1, 4, 1, 0xff8fd8); });
  mk(scene, 'f_brick_snow', 6, 4, (p) => { p.rect(0, 0, 6, 4, 0xd8e0f0); p.rect(1, 1, 4, 1, 0xffffff); });
  mk(scene, 'f_car', 24, 12, (p) => car(p, 0xf27ab0));
  mk(scene, 'f_car2', 24, 12, (p) => car(p, 0x6fd1d8));
  mk(scene, 'f_car3', 24, 12, (p) => car(p, 0xf4f4f4, NEON.orange));
  mk(scene, 'f_slot', 16, 16, (p) => {
    for (let i = 0; i < 16; i++) {
      if (i % 4 < 2) {
        p.set(i, 0, NEON.yellow);
        p.set(i, 15, NEON.yellow);
        p.set(0, i, NEON.yellow);
        p.set(15, i, NEON.yellow);
      }
    }
    p.rect(7, 4, 2, 8, NEON.yellow);
    p.rect(4, 7, 8, 2, NEON.yellow);
  }, false);
}
export { car as drawCar, palm as drawPalm };
