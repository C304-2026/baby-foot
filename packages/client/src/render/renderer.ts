import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import {
  BALL,
  FIELD,
  GOAL_Y0,
  GOAL_Y1,
  ROD,
  RODS,
  manOffset,
  type SimEvent,
  type SimState,
} from '@babyfoot/shared';
import { Projector } from './projector.ts';
import { Particles } from './particles.ts';

export const TEAM_COLORS = [0x22e5ff, 0xff2bd6] as const;
const TEAM_DARK = [0x0a6a8a, 0x8a1570] as const;
const BALL_COLOR = 0xfff6c8;
const LINE_COLOR = 0x7ff3ff;

/** État interpolé transmis au rendu. */
export interface View {
  state: SimState;
  ballX: number;
  ballY: number;
  ballVisible: boolean;
  rodY: number[];
  rodA: number[];
  /** Barre active du joueur local (-1 si aucune). */
  active: number;
  controlled: readonly number[];
  time: number;
}

export class Renderer {
  readonly p = new Projector();
  private world = new Container();
  private tableLayer = new Container();
  private table = new Graphics();
  private tableGlow = new Graphics();
  private shadows = new Graphics();
  private trailG = new Graphics();
  private ballG = new Graphics();
  private rodsG = new Graphics();
  private glow = new Graphics();
  private fx = new Particles();
  private trail: { x: number; y: number }[] = [];
  private lastBall = { x: 0, y: 0 };
  private shake = 0;
  private ballSquash = 0;
  private strikePulse = new Array(RODS.length).fill(0);
  private flash = new Graphics();
  private flashAlpha = 0;

  constructor(private app: Application) {
    const glowLayer = (g: Graphics, strength: number) => {
      const c = new Container();
      c.addChild(g);
      c.filters = [new BlurFilter({ strength, quality: 3 })];
      c.blendMode = 'add';
      return c;
    };
    // Table statique (et son halo flouté) mise en cache dans une texture.
    this.tableLayer.addChild(this.table, glowLayer(this.tableGlow, 10));
    this.world.addChild(
      this.tableLayer,
      this.shadows,
      glowLayer(this.trailG, 4),
      this.ballG,
      this.rodsG,
      glowLayer(this.glow, 14),
      this.fx.g,
    );
    this.fx.g.blendMode = 'add';
    app.stage.addChild(this.world, this.flash);
    this.resize();
  }

  resize() {
    const { width, height } = this.app.renderer.screen;
    this.p.resize(width, height);
    this.tableLayer.cacheAsTexture(false);
    this.drawTable();
    this.tableLayer.cacheAsTexture(true);
  }

  // ---------------------------------------------------------------- table

  private quad(g: Graphics, x0: number, y0: number, x1: number, y1: number, z = 0) {
    const p = this.p;
    return g.poly([p.x(x0, y0), p.y(y0, z), p.x(x1, y0), p.y(y0, z), p.x(x1, y1), p.y(y1, z), p.x(x0, y1), p.y(y1, z)]);
  }

  private line(g: Graphics, x0: number, y0: number, x1: number, y1: number, z = 0) {
    const p = this.p;
    g.moveTo(p.x(x0, y0), p.y(y0, z)).lineTo(p.x(x1, y1), p.y(y1, z));
  }

  private ellipseWorld(g: Graphics, cx: number, cy: number, rx: number, ry: number, seg = 48) {
    const p = this.p;
    const pts: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      pts.push(p.x(x, y), p.y(y));
    }
    g.poly(pts, false);
  }

  private drawTable() {
    const g = this.table;
    const gl = this.tableGlow;
    g.clear();
    gl.clear();
    const L = FIELD.length;
    const W = FIELD.width;
    const WALL = 46;
    const s = this.p.scale;

    // Cadre extérieur (dessus des bandes).
    this.quad(g, -110, -70, L + 110, W + 70, WALL).fill(0x14082e);
    // Face avant de la table (épaisseur visible).
    const p = this.p;
    g.poly([
      p.x(-110, W + 70), p.y(W + 70, WALL),
      p.x(L + 110, W + 70), p.y(W + 70, WALL),
      p.x(L + 110, W + 70), p.y(W + 70, -60),
      p.x(-110, W + 70), p.y(W + 70, -60),
    ]).fill(0x0b0420);
    // Face intérieure de la bande du fond (visible grâce à l'inclinaison).
    g.poly([p.x(0, 0), p.y(0, 0), p.x(L, 0), p.y(0, 0), p.x(L, 0), p.y(0, WALL), p.x(0, 0), p.y(0, WALL)]).fill(0x221048);

    // Terrain : bandes alternées entre les barres.
    this.quad(g, 0, 0, L, W).fill(0x06243a);
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) this.quad(g, i * 150, 0, (i + 1) * 150, W).fill({ color: 0x0a3050, alpha: 0.7 });
    }
    // Vignettage doux vers les bords.
    for (let k = 0; k < 6; k++) {
      const m = k * 10;
      this.quad(g, m, m, L - m, W - m).stroke({ width: 10 * s, color: 0x000000, alpha: 0.08 });
    }

    // Cages.
    for (const [x0, x1, team] of [[-FIELD.goalDepth, 0, 0], [L, L + FIELD.goalDepth, 1]] as const) {
      this.quad(g, x0, GOAL_Y0, x1, GOAL_Y1).fill(0x02030a);
      this.quad(gl, x0, GOAL_Y0, x1, GOAL_Y1).stroke({ width: 5 * s, color: TEAM_COLORS[team] });
      this.quad(g, x0, GOAL_Y0, x1, GOAL_Y1).stroke({ width: 2 * s, color: TEAM_COLORS[team] });
    }

    // Lignes.
    const lines = (gg: Graphics, width: number, alpha: number) => {
      const st = { width: width * s, color: LINE_COLOR, alpha };
      this.quad(gg, 0, 0, L, W).stroke(st);
      this.line(gg, L / 2, 0, L / 2, W);
      gg.stroke(st);
      this.ellipseWorld(gg, L / 2, W / 2, 90, 90);
      gg.stroke(st);
      this.quad(gg, 0, GOAL_Y0 - 70, 110, GOAL_Y1 + 70).stroke(st);
      this.quad(gg, L - 110, GOAL_Y0 - 70, L, GOAL_Y1 + 70).stroke(st);
      this.ellipseWorld(gg, L / 2, W / 2, 6, 6, 16);
      gg.fill({ color: LINE_COLOR, alpha });
    };
    lines(gl, 7, 0.55);
    lines(g, 2.2, 0.9);

    // Liseré néon du cadre.
    this.quad(gl, -110, -70, L + 110, W + 70, WALL).stroke({ width: 8 * s, color: 0x8a3cff, alpha: 0.9 });
    this.quad(g, -110, -70, L + 110, W + 70, WALL).stroke({ width: 2 * s, color: 0xb47cff });
  }

  // ---------------------------------------------------------------- events

  onEvent(e: SimEvent, state: SimState) {
    const p = this.p;
    switch (e.type) {
      case 'hit': {
        const k = Math.min(1, e.strength / 2500);
        this.fx.burst(p.x(e.x, e.y), p.y(e.y, BALL.radius), TEAM_COLORS[RODS[e.rod].team], 4 + k * 20, 60 + k * 420, this.p.scale);
        this.ballSquash = Math.max(this.ballSquash, 0.3 + k * 0.5);
        if (k > 0.55) this.shake = Math.max(this.shake, 4 + k * 10);
        break;
      }
      case 'wall':
      case 'post': {
        const k = Math.min(1, e.strength / 2500);
        this.fx.burst(p.x(e.x, e.y), p.y(e.y, BALL.radius), e.type === 'post' ? 0xffe14d : 0xffffff, 2 + k * 8, 40 + k * 240, this.p.scale);
        this.ballSquash = Math.max(this.ballSquash, 0.2 + k * 0.4);
        break;
      }
      case 'strike':
        this.strikePulse[e.rod] = 1;
        break;
      case 'stick':
        this.fx.burst(p.x(state.ball.x, state.ball.y), p.y(state.ball.y, BALL.radius), 0xffffff, 6, 80, this.p.scale);
        break;
      case 'goal':
        this.fx.burst(p.x(e.x, e.y), p.y(e.y, BALL.radius), TEAM_COLORS[e.team], 90, 900, this.p.scale);
        this.shake = 22;
        this.flashAlpha = 0.45;
        this.flashColor = TEAM_COLORS[e.team];
        break;
      case 'serve':
        this.trail.length = 0;
        break;
    }
  }
  private flashColor = 0xffffff;

  // ---------------------------------------------------------------- frame

  render(v: View, dt: number) {
    const p = this.p;
    const s = p.scale;
    this.shadows.clear();
    this.trailG.clear();
    this.ballG.clear();
    this.rodsG.clear();
    this.glow.clear();

    // Secousse d'écran.
    this.shake *= Math.exp(-dt * 9);
    this.world.position.set((Math.random() - 0.5) * this.shake * s, (Math.random() - 0.5) * this.shake * s);
    this.ballSquash *= Math.exp(-dt * 14);
    for (let i = 0; i < this.strikePulse.length; i++) this.strikePulse[i] *= Math.exp(-dt * 10);

    this.drawBall(v, dt);
    this.drawRods(v);
    this.fx.update(dt);

    this.flashAlpha *= Math.exp(-dt * 5);
    const { width, height } = this.app.renderer.screen;
    this.flash.clear().rect(0, 0, width, height).fill({ color: this.flashColor, alpha: this.flashAlpha });
  }

  private drawBall(v: View, dt: number) {
    const p = this.p;
    const R = BALL.radius;
    if (!v.ballVisible) {
      this.trail.length = 0;
      return;
    }
    const bx = v.ballX;
    const by = v.ballY;
    const jump = Math.hypot(bx - this.lastBall.x, by - this.lastBall.y);
    if (jump > 200) this.trail.length = 0;
    const vx = dt > 0 ? (bx - this.lastBall.x) / dt : 0;
    const vy = dt > 0 ? (by - this.lastBall.y) / dt : 0;
    this.lastBall = { x: bx, y: by };

    // Traînée.
    this.trail.push({ x: bx, y: by });
    if (this.trail.length > 16) this.trail.shift();
    const trailColor = v.state.touch ? TEAM_COLORS[RODS[v.state.touch.rod].team] : 0xffe14d;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const k = i / this.trail.length;
      this.trailG
        .moveTo(p.x(a.x, a.y), p.y(a.y, R))
        .lineTo(p.x(b.x, b.y), p.y(b.y, R))
        .stroke({ width: p.len(R * 1.6 * k, b.y), color: trailColor, alpha: 0.55 * k, cap: 'round' });
    }

    // Ombre.
    this.shadows.ellipse(p.x(bx + 10, by + 8), p.y(by + 8), p.len(R * 1.05, by), p.len(R * 0.7, by)).fill({ color: 0x000000, alpha: 0.45 });

    // Balle étirée dans le sens du mouvement (squash & stretch).
    const speed = Math.hypot(vx, vy);
    const stretch = 1 + Math.min(speed / BALL.maxSpeed, 1) * 0.35 + this.ballSquash * 0.2;
    const squash = 1 / Math.sqrt(stretch) - this.ballSquash * 0.1;
    const ang = Math.atan2(vy * 0.78, vx);
    const cx = p.x(bx, by);
    const cy = p.y(by, R);
    const r = p.len(R, by);
    const pts: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const ex = Math.cos(a) * r * stretch;
      const ey = Math.sin(a) * r * squash;
      pts.push(cx + ex * Math.cos(ang) - ey * Math.sin(ang), cy + ex * Math.sin(ang) + ey * Math.cos(ang));
    }
    this.ballG.poly(pts).fill(BALL_COLOR);
    this.ballG.circle(cx - r * 0.3, cy - r * 0.35, r * 0.35).fill({ color: 0xffffff, alpha: 0.9 });
    this.glow.circle(cx, cy, r * 1.4).fill({ color: 0xffe14d, alpha: 0.55 });
    if (v.state.ball.stuckRod >= 0) this.glow.circle(cx, cy, r * 2).fill({ color: 0xffffff, alpha: 0.35 });
  }

  private drawRods(v: View) {
    const p = this.p;
    const s = p.scale;
    const H = ROD.height;
    const W = FIELD.width;

    for (let i = 0; i < RODS.length; i++) {
      const def = RODS[i];
      const team = def.team;
      const rs = v.state.rods[i];
      const ry = v.rodY[i];
      const a = v.rodA[i];
      const isActive = i === v.active;
      const isMine = v.controlled.includes(i);
      const x = def.x;

      // Tige : dépasse du terrain, poignée côté de l'équipe.
      const top = -70 - 40;
      const bot = W + 70 + 40;
      const shift = ry - (def.minY + def.maxY) / 2;
      this.rodRod(x, top + shift, bot + shift, isActive ? 0xffffff : 0x8d93b8, isActive);
      const hy0 = team === 0 ? bot + shift : top + shift - 90;
      const hy1 = team === 0 ? bot + shift + 90 : top + shift;
      this.rodsG
        .moveTo(p.x(x, hy0), p.y(hy0, H))
        .lineTo(p.x(x, hy1), p.y(hy1, H))
        .stroke({ width: p.len(18, hy0), color: isActive ? TEAM_COLORS[team] : TEAM_DARK[team], cap: 'round' });
      if (isActive) {
        this.glow
          .moveTo(p.x(x, hy0), p.y(hy0, H))
          .lineTo(p.x(x, hy1), p.y(hy1, H))
          .stroke({ width: p.len(30, hy0), color: TEAM_COLORS[team], alpha: 0.9, cap: 'round' });
        this.glow
          .moveTo(p.x(x, 0), p.y(0, H))
          .lineTo(p.x(x, W), p.y(W, H))
          .stroke({ width: 10 * s, color: TEAM_COLORS[team], alpha: 0.35 + 0.15 * Math.sin(v.time * 8) });
      }

      // Joueurs.
      const pulse = this.strikePulse[i];
      const charging = rs.phase === 'charging' ? rs.charge : 0;
      for (let m = 0; m < def.men; m++) {
        const my = ry + manOffset(def, m);
        this.drawMan(x, my, a, team, isActive, isMine, pulse, charging);
      }
    }
  }

  private rodRod(x: number, y0: number, y1: number, color: number, active: boolean) {
    const p = this.p;
    const H = ROD.height;
    this.rodsG.moveTo(p.x(x, y0), p.y(y0, H)).lineTo(p.x(x, y1), p.y(y1, H)).stroke({ width: p.len(active ? 8 : 6, y1), color });
    this.rodsG
      .moveTo(p.x(x, y0) - 1, p.y(y0, H) - 1)
      .lineTo(p.x(x, y1) - 1, p.y(y1, H) - 1)
      .stroke({ width: p.len(1.5, y1), color: 0xffffff, alpha: 0.6 });
  }

  /** Joueur stylisé qui pivote autour de la barre (tête au-dessus, pied au sol à angle 0). */
  private drawMan(x: number, y: number, a: number, team: 0 | 1, active: boolean, mine: boolean, pulse: number, charge: number) {
    const p = this.p;
    const H = ROD.height;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const at = (d: number) => {
      const wx = x + sin * d;
      const z = H - cos * d;
      return [p.x(wx, y), p.y(y, z)] as const;
    };
    const color = TEAM_COLORS[team];
    const dark = TEAM_DARK[team];
    // Squash & stretch : étirement pendant la frappe, écrasement pendant l'armement.
    const widen = 1 + pulse * 0.35 - charge * 0.12;
    const len = 1 - pulse * 0.08 + charge * 0.06;

    // Ombre du joueur sur le sol.
    const footX = x + sin * ROD.footReach;
    this.shadows
      .ellipse(p.x((x + footX) / 2 + 12, y + 10), p.y(y + 10), p.len(Math.abs(footX - x) / 2 + 16, y), p.len(12, y))
      .fill({ color: 0x000000, alpha: 0.35 });

    const [lx0, ly0] = at(6 * len);
    const [lx1, ly1] = at(56 * len);
    const [tx0, ty0] = at(-28 * len);
    const [tx1, ty1] = at(6);
    const [hx, hy] = at(-42 * len);
    const [fx, fy] = at(ROD.footReach);
    const w = (v: number) => p.len(v, y);

    const g = this.rodsG;
    g.moveTo(lx0, ly0).lineTo(lx1, ly1).stroke({ width: w(13 * widen), color: dark, cap: 'round' });
    g.ellipse(fx, fy, w(12 * widen), w(9)).fill(dark);
    g.moveTo(tx0, ty0).lineTo(tx1, ty1).stroke({ width: w(26 * widen), color, cap: 'round' });
    g.moveTo(tx0 - w(4), ty0).lineTo(tx1 - w(4), ty1).stroke({ width: w(6), color: 0xffffff, alpha: 0.35, cap: 'round' });
    g.circle(hx, hy, w(11)).fill(color);
    g.circle(hx - w(3), hy - w(3), w(4)).fill({ color: 0xffffff, alpha: 0.5 });
    if (active) {
      g.circle(hx, hy, w(11)).stroke({ width: w(2.5), color: 0xffffff });
      this.glow.circle(hx, hy, w(16)).fill({ color, alpha: 0.6 });
    } else if (mine) {
      g.circle(hx, hy, w(11)).stroke({ width: w(1.5), color: 0xffffff, alpha: 0.35 });
    }
    if (charge > 0 && active) {
      this.glow.circle(fx, fy, w(10 + charge * 18)).fill({ color: 0xffe14d, alpha: 0.4 + charge * 0.5 });
    }
  }
}
