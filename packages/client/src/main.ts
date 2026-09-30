import { Application } from 'pixi.js';
import { Sfx } from './audio.ts';
import { Keyboard } from './input.ts';
import { Pointer } from './pointer.ts';
import { Renderer } from './render/renderer.ts';
import { Training } from './training.ts';
import './style.css';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#05060f',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    powerPreference: 'high-performance',
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const sfx = new Sfx();
  const kb = new Keyboard(() => sfx.unlock());
  const renderer = new Renderer(app);
  app.renderer.on('resize', () => renderer.resize());

  const pointer = new Pointer(app.canvas);
  app.canvas.addEventListener('pointerdown', () => sfx.unlock());
  const game = new Training(kb, pointer, renderer, sfx);
  app.ticker.maxFPS = 0;
  app.ticker.add((t) => game.frame(t.deltaMS / 1000));

  // Accès debug depuis la console.
  (window as unknown as { game: Training }).game = game;
}

main();
