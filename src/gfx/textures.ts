import Phaser from 'phaser';
import { ROLES, type Role } from '../config';

type Ctx = CanvasRenderingContext2D;

/** Pixel density for textures shown zoomed-in (interior art); sprites using them are scaled by 1/HI. */
export const HI = 2;
let RES = 1;

export function makeTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void, res = RES) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w * res, h * res)!;
  const ctx = tex.getContext();
  ctx.scale(res, res);
  draw(ctx);
  tex.refresh();
  return tex;
}

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function hex(n: number) {
  return '#' + n.toString(16).padStart(6, '0');
}

export function shade(col: string, amt: number): string {
  const n = parseInt(col.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * (amt > 0 ? 255 - c : c))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

export const CAR_COLORS = ['#d64545', '#3f7dd6', '#f2c14e', '#e8e8e8', '#2d2d2d', '#5fb36b', '#9b59b6', '#ef8a3c', '#7f8c8d', '#1abc9c'];

/** Car facing +x, origin top-left, 30x16. */
export function drawCar(ctx: Ctx, color: string, cop = false, flash = 0) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, 3, 3, 28, 14, 5);
  ctx.fill();
  const body = cop ? '#f4f4f4' : color;
  const g = ctx.createLinearGradient(0, 1, 0, 15);
  g.addColorStop(0, shade(body, 0.25));
  g.addColorStop(0.5, body);
  g.addColorStop(1, shade(body, -0.3));
  ctx.fillStyle = g;
  rr(ctx, 1, 1, 28, 14, 5);
  ctx.fill();
  if (cop) {
    ctx.fillStyle = '#1b1f2a';
    rr(ctx, 1, 1, 7, 14, 4);
    ctx.fill();
    rr(ctx, 23, 1, 6, 14, 4);
    ctx.fill();
  }
  // glass
  ctx.fillStyle = '#1c2633';
  rr(ctx, 18, 3, 5, 10, 2);
  ctx.fill();
  rr(ctx, 6, 3.5, 3, 9, 1.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(19, 4, 1.5, 8);
  // roof
  ctx.fillStyle = cop ? '#ffffff' : shade(body, 0.12);
  rr(ctx, 9.5, 3, 8, 10, 2);
  ctx.fill();
  // lights
  ctx.fillStyle = '#fff6c2';
  ctx.fillRect(28, 2.5, 1.5, 3);
  ctx.fillRect(28, 10.5, 1.5, 3);
  ctx.fillStyle = '#ff4040';
  ctx.fillRect(0.5, 2.5, 1.5, 3);
  ctx.fillRect(0.5, 10.5, 1.5, 3);
  if (cop) {
    ctx.fillStyle = flash ? '#ff2a2a' : '#5a1010';
    ctx.fillRect(12, 2.5, 3, 5.5);
    ctx.fillStyle = flash ? '#11204a' : '#2f7bff';
    ctx.fillRect(12, 8, 3, 5.5);
  }
  ctx.restore();
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a26a3c'];

/** Top-down person facing +x on a 28x28 canvas. */
export function drawPerson(ctx: Ctx, shirt: string, skin: string, hat: 'none' | 'straw' | 'chef' | 'cap' | 'hood' | 'vest', ox = 0, oy = 0) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(15, 16, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // hands
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(19, 5.5, 2.6, 0, Math.PI * 2);
  ctx.arc(19, 22.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // shoulders
  const g = ctx.createLinearGradient(6, 0, 20, 0);
  g.addColorStop(0, shade(shirt, -0.35));
  g.addColorStop(1, shade(shirt, 0.15));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(13, 14, 6.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(shirt, -0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (hat === 'vest') {
    ctx.fillStyle = '#d7ff3a';
    ctx.fillRect(9, 6, 2, 16);
    ctx.fillRect(15, 6, 2, 16);
  }
  if (hat === 'hood') {
    ctx.fillStyle = shade(shirt, -0.2);
    ctx.beginPath();
    ctx.ellipse(10.5, 14, 4.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(14.5, 14, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1d14';
  ctx.beginPath();
  ctx.arc(13.5, 14, 4.8, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  if (hat === 'straw') {
    ctx.fillStyle = '#e8c872';
    ctx.beginPath();
    ctx.arc(14, 14, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a24c';
    ctx.beginPath();
    ctx.arc(14, 14, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8b5e2b';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (hat === 'chef') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(13.5, 14, 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cfd8dc';
    ctx.stroke();
    ctx.fillStyle = '#66d9ff';
    ctx.fillRect(17.5, 11, 2, 6); // goggles
  } else if (hat === 'cap') {
    ctx.fillStyle = '#1d1f24';
    ctx.beginPath();
    ctx.arc(14, 14, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(17, 10.5, 4, 7);
  }
  ctx.restore();
}

const ROLE_LOOK: Record<Role, { hat: Parameters<typeof drawPerson>[3]; skin: number }> = {
  grower: { hat: 'straw', skin: 1 },
  packer: { hat: 'vest', skin: 0 },
  dealer: { hat: 'hood', skin: 2 },
  cook: { hat: 'chef', skin: 4 },
  guard: { hat: 'cap', skin: 3 },
};

function drawGlow(ctx: Ctx, size: number, color: string) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

export function generateTextures(scene: Phaser.Scene) {
  CAR_COLORS.forEach((c, i) => makeTex(scene, `car${i}`, 32, 18, (ctx) => drawCar(ctx, c)));
  makeTex(scene, 'cop0', 32, 18, (ctx) => drawCar(ctx, '#fff', true, 0));
  makeTex(scene, 'cop1', 32, 18, (ctx) => drawCar(ctx, '#fff', true, 1));

  const shirts = ['#3b82f6', '#ef4444', '#a3a3a3', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f5f5f4'];
  shirts.forEach((s, i) => makeTex(scene, `ped${i}`, 28, 28, (ctx) => drawPerson(ctx, s, SKIN[i % SKIN.length], 'none')));
  RES = HI;
  (Object.keys(ROLES) as Role[]).forEach((r) => {
    const look = ROLE_LOOK[r];
    makeTex(scene, `worker_${r}`, 28, 28, (ctx) => drawPerson(ctx, hex(ROLES[r].color), SKIN[look.skin], look.hat));
  });
  RES = 1;
  makeTex(scene, 'cop_ped', 28, 28, (ctx) => drawPerson(ctx, '#1e3a8a', SKIN[0], 'cap'));

  makeTex(scene, 'glow', 128, 128, (ctx) => drawGlow(ctx, 128, 'rgba(255,214,140,1)'));
  makeTex(scene, 'glow_blue', 128, 128, (ctx) => drawGlow(ctx, 128, 'rgba(90,200,255,1)'));
  makeTex(scene, 'glow_red', 128, 128, (ctx) => drawGlow(ctx, 128, 'rgba(255,60,60,1)'));
  makeTex(scene, 'glow_green', 128, 128, (ctx) => drawGlow(ctx, 128, 'rgba(120,255,140,1)'));
  makeTex(scene, 'dot', 8, 8, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(4, 4, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  makeTex(scene, 'ring', 40, 40, (ctx) => {
    ctx.strokeStyle = 'rgba(120,255,140,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(20, 20, 16, 0, Math.PI * 2);
    ctx.stroke();
  });

  makeTex(scene, 'pin', 36, 44, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(18, 41, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, 36);
    g.addColorStop(0, '#7dffa0');
    g.addColorStop(1, '#16a34a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(18, 15, 13, Math.PI, 0);
    ctx.lineTo(18, 38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b3d1e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#0b3d1e';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 18, 15);
  });

  makeTex(scene, 'pin_front', 36, 44, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(18, 41, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, 36);
    g.addColorStop(0, '#9be7ff');
    g.addColorStop(1, '#0284c7');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(18, 15, 13, Math.PI, 0);
    ctx.lineTo(18, 38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#063a52';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧺', 18, 15);
  });

  makeTex(scene, 'sale_sign', 44, 22, (ctx) => {
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(20, 12, 3, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rr(ctx, 3, 3, 40, 14, 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    rr(ctx, 1, 1, 40, 14, 2);
    ctx.fill();
    ctx.fillStyle = '#d32f2f';
    rr(ctx, 2.5, 2.5, 37, 11, 1.5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOR SALE', 21, 8.5, 35);
  });

  // ---- interior stations ----
  RES = HI;
  makeTex(scene, 'st_tent', 64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 4, 5, 60, 59, 6);
    ctx.fill();
    ctx.fillStyle = '#23262b';
    rr(ctx, 1, 1, 60, 60, 6);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, '#e9eef2');
    g.addColorStop(0.5, '#9aa4ad');
    g.addColorStop(1, '#dfe5ea');
    ctx.fillStyle = g;
    rr(ctx, 5, 5, 52, 52, 3);
    ctx.fill();
    ctx.fillStyle = '#3e2a1d';
    rr(ctx, 9, 9, 44, 44, 3);
    ctx.fill();
    for (const [x, y] of [[20, 20], [42, 20], [20, 42], [42, 42]]) {
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.arc(x, y, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3d29';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(31, 1);
    ctx.lineTo(31, 6);
    ctx.stroke();
  });
  makeTex(scene, 'plants', 64, 64, (ctx) => {
    for (const [x, y] of [[20, 20], [42, 20], [20, 42], [42, 42]]) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, 11, 0);
        g.addColorStop(0, '#2f7d32');
        g.addColorStop(1, '#8bd96a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(6, 0, 6, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  makeTex(scene, 'st_lab', 96, 64, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 4, 6, 92, 58, 5);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#e3e8ec');
    g.addColorStop(1, '#a7b0b8');
    ctx.fillStyle = g;
    rr(ctx, 1, 1, 92, 58, 5);
    ctx.fill();
    ctx.strokeStyle = '#6b7780';
    ctx.lineWidth = 2;
    ctx.stroke();
    // burner
    ctx.fillStyle = '#2a2f35';
    ctx.beginPath();
    ctx.arc(26, 30, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    for (const r of [7, 12]) {
      ctx.beginPath();
      ctx.arc(26, 30, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // big flask
    ctx.fillStyle = 'rgba(200,240,255,0.55)';
    ctx.beginPath();
    ctx.arc(26, 30, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0f7ff';
    ctx.stroke();
    // beakers
    const beaker = (x: number, y: number, r: number, c: string) => {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      ctx.fill();
    };
    beaker(58, 16, 6, '#47b8ff');
    beaker(74, 18, 5, '#ffd84a');
    beaker(64, 42, 7, '#4be3c1');
    beaker(82, 44, 5, '#ff6fb1');
    ctx.strokeStyle = '#8fa1ad';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(37, 28);
    ctx.bezierCurveTo(46, 10, 50, 40, 58, 22);
    ctx.stroke();
  });
  makeTex(scene, 'st_table', 64, 32, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 3, 4, 61, 28, 4);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, '#b07a46');
    g.addColorStop(1, '#7a4f2a');
    ctx.fillStyle = g;
    rr(ctx, 1, 1, 60, 28, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let x = 12; x < 60; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x, 28);
      ctx.stroke();
    }
    // scale
    ctx.fillStyle = '#d6d9dc';
    rr(ctx, 6, 7, 16, 14, 2);
    ctx.fill();
    ctx.fillStyle = '#17324a';
    ctx.fillRect(9, 16, 10, 3);
    ctx.fillStyle = '#4ef08a';
    ctx.fillRect(10, 16.5, 6, 2);
    // baggies
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y] of [[34, 8], [40, 14], [46, 8], [52, 15]]) {
      rr(ctx, x, y, 7, 8, 1.5);
      ctx.fill();
    }
  });
  makeTex(scene, 'st_stash', 32, 32, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    rr(ctx, 4, 5, 28, 27, 3);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 32, 32);
    g.addColorStop(0, '#5d6670');
    g.addColorStop(1, '#2c3238');
    ctx.fillStyle = g;
    rr(ctx, 2, 2, 27, 27, 3);
    ctx.fill();
    ctx.strokeStyle = '#1a1e22';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#c9cfd4';
    ctx.beginPath();
    ctx.arc(15.5, 15.5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a4148';
    ctx.beginPath();
    ctx.arc(15.5, 15.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e1b12c';
    ctx.fillRect(24, 10, 2, 11);
  });
  makeTex(scene, 'bag_herb', 12, 12, (ctx) => bag(ctx, '#6fcf57'));
  makeTex(scene, 'bag_crystal', 12, 12, (ctx) => bag(ctx, '#5cc8ff'));
  makeTex(scene, 'crate', 14, 14, (ctx) => {
    ctx.fillStyle = '#a0703d';
    ctx.fillRect(1, 1, 12, 12);
    ctx.strokeStyle = '#5c3d1d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, 12, 12);
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.lineTo(13, 13);
    ctx.stroke();
  });
  makeTex(scene, 'leafpile', 14, 14, (ctx) => {
    ctx.fillStyle = '#3f8f3a';
    ctx.beginPath();
    ctx.arc(7, 7, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7ccf5a';
    ctx.beginPath();
    ctx.arc(5, 6, 3, 0, Math.PI * 2);
    ctx.arc(9, 8, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  makeTex(scene, 'rocks', 14, 14, (ctx) => {
    ctx.fillStyle = '#9fe6ff';
    for (const [x, y, r] of [[5, 6, 3.5], [9, 8, 3], [7, 4, 2.5]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
  });
  RES = 1;
}

function bag(ctx: Ctx, c: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  rr(ctx, 1, 1, 10, 10, 2);
  ctx.fill();
  ctx.fillStyle = c;
  rr(ctx, 2.5, 4, 7, 6, 1.5);
  ctx.fill();
  ctx.fillStyle = '#e53935';
  ctx.fillRect(1, 1.5, 10, 1.5);
}
