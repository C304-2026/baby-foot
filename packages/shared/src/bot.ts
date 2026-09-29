import { BALL, FIELD, ROD, RODS, manOffset, teamDir, type TeamId } from './constants.ts';
import { clamp } from './math.ts';
import type { RodCommand, SimState } from './types.ts';

interface RodMemory {
  holdTicks: number;
  cooldown: number;
}

/** Bot simple : suit la trajectoire de la balle et frappe quand elle est devant un pied. */
export class Bot {
  private mem = new Map<number, RodMemory>();
  private seed = 7;

  constructor(
    readonly team: TeamId,
    readonly rods: number[],
    /** 0 = très lent, 1 = réflexes maximum. */
    public skill = 0.6,
  ) {}

  private rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  commands(s: SimState, out: (RodCommand | undefined)[]) {
    const b = s.ball;
    const dir = teamDir(this.team);
    const R = BALL.radius + ROD.manRadius;
    for (const i of this.rods) {
      const def = RODS[i];
      const r = s.rods[i];
      let m = this.mem.get(i);
      if (!m) this.mem.set(i, (m = { holdTicks: 0, cooldown: 0 }));

      // Position visée : balle prédite à l'abscisse de la barre (rebonds sur les bords inclus).
      let ty = b.y;
      const dx = def.x - b.x;
      if (Math.abs(b.vx) > 50 && Math.sign(dx) === Math.sign(b.vx)) {
        ty = foldY(b.y + (b.vy * dx) / b.vx);
      }
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < def.men; k++) {
        const target = clamp(ty - manOffset(def, k), def.minY, def.maxY);
        const d = Math.abs(target - r.y) + Math.abs(target + manOffset(def, k) - ty) * 4;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      const targetY = clamp(ty - manOffset(def, best), def.minY, def.maxY);
      const move = clamp((targetY - r.y) / 45, -1, 1) * (0.55 + 0.45 * this.skill);

      // Frappe si la balle est juste devant un pied.
      let shoot = false;
      if (m.cooldown > 0) m.cooldown--;
      if (m.holdTicks > 0) {
        m.holdTicks--;
        shoot = m.holdTicks > 0;
      } else if (m.cooldown === 0 && r.phase === 'idle') {
        const front = dir * (b.x - def.x);
        const my = r.y + manOffset(def, best);
        if (front > R - 6 && front < R + 26 && Math.abs(b.y - my) < 16 && Math.hypot(b.vx, b.vy) < 1300) {
          m.holdTicks = 2 + Math.floor(this.rand() * 50 * this.skill);
          m.cooldown = 60;
          shoot = true;
        }
      }
      // Balle qui arrive par l'arrière : lever les joueurs pour la laisser passer.
      const back = -dir * (b.x - def.x);
      const lift = !shoot && def.role !== 'goal' && back > 0 && back < 320 && dir * b.vx > 120;
      out[i] = { move, rot: 0, shoot, control: false, lift };
    }
  }
}

function foldY(y: number) {
  const lo = BALL.radius;
  const span = FIELD.width - 2 * BALL.radius;
  let t = (y - lo) % (2 * span);
  if (t < 0) t += 2 * span;
  return lo + (t > span ? 2 * span - t : t);
}
