import Phaser from 'phaser';

/** Hotline Miami style post: pulsing RGB split, cycling colour wash, punchy saturation, scanlines. */
const FRAG = `
#define SHADER_NAME HM_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
varying vec2 outTexCoord;

vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
  vec2 uv = outTexCoord;
  vec2 c = uv - 0.5;
  float d = dot(c, c);
  float beat = pow(0.5 + 0.5 * sin(uTime * 2.2), 4.0);
  vec2 off = (vec2(0.0007 + 0.0016 * beat, 0.0) + c * d * 0.008) * uStrength;
  float r = texture2D(uMainSampler, uv + off).r;
  float g = texture2D(uMainSampler, uv).g;
  float b = texture2D(uMainSampler, uv - off).b;
  vec3 col = vec3(r, g, b);

  // slow diagonal colour wash (screen blend), the signature HM tint
  vec3 wash = hue(fract(uTime * 0.025 + uv.y * 0.18 + uv.x * 0.08));
  vec3 screen = 1.0 - (1.0 - col) * (1.0 - wash * 0.45);
  col = mix(col, screen, 0.3 * uStrength);

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.0 + 0.3 * uStrength);
  col = (col - 0.5) * (1.0 + 0.12 * uStrength) + 0.5;

  float scan = 0.92 + 0.08 * sin(uv.y * uResolution.y * 3.14159);
  col *= mix(1.0, scan, uStrength);
  col *= 1.0 - d * 1.2 * uStrength;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export class CrtPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  strength = 1;
  constructor(game: Phaser.Game) {
    super({ game, name: 'CrtPipeline', fragShader: FRAG });
  }
  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set1f('uStrength', this.strength);
  }
}
