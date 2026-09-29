import { Graphics } from 'pixi.js';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
}

/** Étincelles d'impact (coordonnées écran). */
export class Particles {
  readonly g = new Graphics();
  private list: P[] = [];

  burst(x: number, y: number, color: number, count: number, speed: number, scale: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7) * scale;
      const max = 0.25 + Math.random() * 0.45;
      this.list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, life: max, max, size: (2 + Math.random() * 3) * scale, color });
    }
    if (this.list.length > 600) this.list.splice(0, this.list.length - 600);
  }

  update(dt: number) {
    this.g.clear();
    const drag = Math.exp(-dt * 5);
    let w = 0;
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      const k = p.life / p.max;
      this.g.circle(p.x, p.y, p.size * (0.4 + 0.6 * k)).fill({ color: p.color, alpha: k });
      this.list[w++] = p;
    }
    this.list.length = w;
  }
}
