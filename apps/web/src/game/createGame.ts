import Phaser from 'phaser';
import { OfficeScene, type SceneCallbacks } from './OfficeScene';

export function createOfficeGame(
  parent: HTMLElement,
  callbacks: SceneCallbacks,
): {
  game: Phaser.Game;
  scene: OfficeScene;
} {
  const scene = new OfficeScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 900,
    height: parent.clientHeight || 640,
    backgroundColor: '#111827',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scene: [scene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  return { game, scene };
}
