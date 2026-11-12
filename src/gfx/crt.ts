import Phaser from 'phaser';

const FRAG = `
#define SHADER_NAME CRT_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 c = uv - 0.5;
  float d = dot(c, c);
  // chromatic aberration, stronger toward the edges
  vec2 off = c * (0.004 + d * 0.012) * uStrength;
  float r = texture2D(uMainSampler, uv + off).r;
  float g = texture2D(uMainSampler, uv).g;
  float b = texture2D(uMainSampler, uv - off).b;
  vec3 col = vec3(r, g, b);
  // scanlines
  float scan = 0.9 + 0.1 * sin(uv.y * uResolution.y * 3.14159);
  col *= mix(1.0, scan, uStrength);
  // slow rolling band
  float band = smoothstep(0.0, 0.08, abs(fract(uv.y - uTime * 0.05) - 0.5));
  col *= mix(1.0, 0.97 + 0.03 * band, uStrength);
  // 80s grade: lift shadows to purple, push highlights warm
  col = mix(col, col * vec3(1.06, 0.96, 1.08) + vec3(0.025, 0.0, 0.04), 0.6 * uStrength);
  // vignette
  col *= 1.0 - d * 0.9 * uStrength;
  gl_FragColor = vec4(col, 1.0);
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
