import Phaser from 'phaser';
import { INK } from '../config';

/** Hard offset drop shadows that follow sprites (position, rotation, texture). */
export class Shadows {
  private m = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.Image>();
  constructor(private scene: Phaser.Scene, private depth = 4) {}

  add<T extends Phaser.GameObjects.Image>(img: T, off = 3): T {
    const s = this.scene.add.image(img.x + off, img.y + off, img.texture.key).setDepth(this.depth).setTintFill(INK).setAlpha(0.5);
    s.setData('off', off);
    this.m.set(img, s);
    return img;
  }

  update() {
    for (const [img, s] of this.m) {
      if (!img.active) {
        s.destroy();
        this.m.delete(img);
        continue;
      }
      const o = s.getData('off') as number;
      if (s.texture.key !== img.texture.key) s.setTexture(img.texture.key);
      s.setPosition(img.x + o, img.y + o).setRotation(img.rotation).setScale(img.scaleX, img.scaleY)
        .setOrigin(img.originX, img.originY).setVisible(img.visible).setAlpha(0.5 * img.alpha);
    }
  }
}
