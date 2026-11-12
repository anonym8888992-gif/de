/**
 * Procedural darksynth soundtrack + SFX via WebAudio. No audio files.
 * Starts on the first user gesture (browsers block autoplay).
 */

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;
let timer = 0;
let step = 0;
let nextTime = 0;

export const audio = { music: true, sfx: true };

const BPM = 104;
const STEP = 60 / BPM / 4; // 16th notes
// Am - F - C - G, two bars each
const ROOTS = [45, 45, 41, 41, 48, 48, 43, 43];
const CHORDS: number[][] = [[0, 3, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = audio.music ? 0.5 : 0;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = audio.sfx ? 0.8 : 0;
  sfxBus.connect(master);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  nextTime = ctx.currentTime + 0.1;
  timer = window.setInterval(schedule, 25);
}

export function setMusic(on: boolean) {
  audio.music = on;
  if (ctx) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.1);
}

export function setSfx(on: boolean) {
  audio.sfx = on;
  if (ctx) sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}

export function stopAudio() {
  window.clearInterval(timer);
}

// ---------------------------------------------------------------------------
// music

function schedule() {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.12) {
    playStep(step, nextTime);
    nextTime += STEP;
    step = (step + 1) % (16 * ROOTS.length);
  }
}

function playStep(s: number, t: number) {
  const bar = Math.floor(s / 16);
  const i = s % 16;
  const root = ROOTS[bar];
  const chord = CHORDS[bar];
  // four on the floor + offbeat hats + snare on 2 & 4
  if (i % 4 === 0) kick(t);
  if (i === 4 || i === 12) snare(t);
  if (i % 2 === 1) hat(t, i % 4 === 3 ? 0.07 : 0.035);
  // driving 8th-note bass with octave jumps
  if (i % 2 === 0) bass(hz(root - 12 + (i % 4 === 2 ? 12 : 0)), t);
  // arpeggio 16ths, two octaves up
  const n = chord[i % 3] + (Math.floor(i / 3) % 2 ? 12 : 0);
  arp(hz(root + 12 + n), t, i % 4 === 0 ? 0.06 : 0.04);
  // pad on bar start
  if (i === 0 && bar % 2 === 0) for (const c of chord) pad(hz(root + 12 + c), t, STEP * 32);
}

function env(g: GainNode, t: number, peak: number, a: number, dcy: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}

function kick(t: number) {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, 0.9, 0.002, 0.28);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.32);
}

function noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, len: number, out: AudioNode) {
  const src = ctx!.createBufferSource();
  src.buffer = noise;
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx!.createGain();
  env(g, t, peak, 0.002, len);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.05);
}

function snare(t: number) {
  noiseHit(t, 'bandpass', 1800, 0.45, 0.18, musicBus);
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.frequency.setValueAtTime(220, t);
  env(g, t, 0.25, 0.002, 0.08);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.12);
}

function hat(t: number, v: number) {
  noiseHit(t, 'highpass', 8000, v, 0.04, musicBus);
}

function bass(f: number, t: number) {
  const o = ctx!.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(160, t + STEP * 1.6);
  const g = ctx!.createGain();
  env(g, t, 0.32, 0.004, STEP * 1.8);
  o.connect(lp).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + STEP * 2);
}

function arp(f: number, t: number, v: number) {
  const o = ctx!.createOscillator();
  o.type = 'square';
  o.frequency.value = f;
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  const g = ctx!.createGain();
  env(g, t, v, 0.003, STEP * 0.9);
  o.connect(lp).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + STEP);
}

function pad(f: number, t: number, len: number) {
  for (const det of [-7, 7]) {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(lp).connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

// ---------------------------------------------------------------------------
// sfx

const last: Record<string, number> = {};
function throttle(k: string, ms: number) {
  const now = performance.now();
  if (now - (last[k] ?? 0) < ms) return false;
  last[k] = now;
  return true;
}

function tone(type: OscillatorType, f0: number, f1: number, t: number, len: number, v: number) {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = ctx!.createGain();
  env(g, t, v, 0.003, len);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + len + 0.05);
}

export type Sfx = 'sale' | 'shot' | 'siren' | 'ring' | 'win' | 'lose' | 'click' | 'cash' | 'alarm';

export function sfx(kind: Sfx) {
  if (!ctx || !audio.sfx) return;
  const t = ctx.currentTime + 0.01;
  switch (kind) {
    case 'sale':
      if (!throttle('sale', 120)) return;
      tone('square', 1320, 1320, t, 0.05, 0.08);
      tone('square', 1760, 1760, t + 0.05, 0.08, 0.08);
      break;
    case 'cash':
      tone('square', 988, 988, t, 0.06, 0.1);
      tone('square', 1318, 1318, t + 0.07, 0.06, 0.1);
      tone('square', 1976, 1976, t + 0.14, 0.18, 0.1);
      break;
    case 'shot':
      if (!throttle('shot', 70)) return;
      noiseHit(t, 'lowpass', 2400, 0.7, 0.14, sfxBus);
      tone('triangle', 160, 50, t, 0.12, 0.5);
      break;
    case 'siren':
      if (!throttle('siren', 1500)) return;
      for (let k = 0; k < 4; k++) tone('sawtooth', k % 2 ? 640 : 860, k % 2 ? 640 : 860, t + k * 0.22, 0.2, 0.05);
      break;
    case 'alarm':
      if (!throttle('alarm', 3000)) return;
      for (let k = 0; k < 6; k++) tone('square', 440, 440, t + k * 0.16, 0.08, 0.08);
      break;
    case 'ring':
      if (!throttle('ring', 2500)) return;
      for (let k = 0; k < 8; k++) { tone('sine', 440, 440, t + k * 0.05, 0.045, 0.12); tone('sine', 480, 480, t + k * 0.05, 0.045, 0.12); }
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, k) => tone('square', f, f, t + k * 0.09, 0.14, 0.09));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, k) => tone('sawtooth', f, f * 0.97, t + k * 0.13, 0.2, 0.08));
      break;
    case 'click':
      if (!throttle('click', 40)) return;
      tone('square', 2000, 1200, t, 0.025, 0.05);
      break;
  }
}
