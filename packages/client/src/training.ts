import {
  Bot,
  DT,
  RODS,
  createSimState,
  rodsOfTeam,
  serveBall,
  step,
  type RodCommand,
  type RodRole,
  type SimState,
} from '@babyfoot/shared';
import type { Sfx } from './audio.ts';
import type { Keyboard } from './input.ts';
import type { Pointer } from './pointer.ts';
import type { Renderer, View } from './render/renderer.ts';

const ROLE_LABEL: Record<RodRole, string> = { goal: 'GARDIEN', def: 'DÉFENSE', mid: 'MILIEU', att: 'ATTAQUE' };
const HYSTERESIS = 25;
/** Trackpad : unités monde par pixel (vertical) et rotation par pixel (horizontal). */
const PAD_SENS_Y = 0.8;
const PAD_SENS_ROT = 1 / 60;
/** Retour des pieds au neutre quand le doigt s'arrête (1/s). */
const PAD_ROT_RETURN = 8;

/** Mode entraînement solo : simulation locale à pas fixe, rendu interpolé. */
export class Training {
  private sim: SimState = createSimState(Date.now() & 0xffff);
  private acc = 0;
  private time = 0;
  private prevBall = { x: 0, y: 0 };
  private prevRodY: number[] = [];
  private prevRodA: number[] = [];
  private readonly mine = rodsOfTeam(0);
  private bot: Bot | null = new Bot(1, rodsOfTeam(1), 0.55);
  private active = this.mine[0];
  private padRod = -1;
  private padY = 0;
  private padRot = 0;
  private manual = false;
  private autoPick = this.mine[0];
  private cmds: (RodCommand | undefined)[] = [];
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;

  private el = {
    score: [document.getElementById('score0')!, document.getElementById('score1')!],
    rods: document.getElementById('rods')!,
    gauge: document.getElementById('gauge')!,
    gaugeFill: document.getElementById('gauge-fill')!,
    info: document.getElementById('info')!,
    help: document.getElementById('help')!,
    banner: document.getElementById('goal-banner')!,
  };
  private rodEls: HTMLElement[] = [];

  constructor(
    private kb: Keyboard,
    private pointer: Pointer,
    private renderer: Renderer,
    private sfx: Sfx,
  ) {
    for (const i of this.mine) {
      const d = document.createElement('div');
      d.className = 'rod';
      d.textContent = ROLE_LABEL[RODS[i].role];
      this.el.rods.appendChild(d);
      this.rodEls.push(d);
    }
    this.snapshot();
  }

  private snapshot() {
    this.prevBall = { x: this.sim.ball.x, y: this.sim.ball.y };
    this.prevRodY = this.sim.rods.map((r) => r.y);
    this.prevRodA = this.sim.rods.map((r) => r.angle);
  }

  /** Barre du joueur la plus proche de la balle (en x), avec hystérésis. */
  private pickRod(): number {
    const bx = this.sim.ball.x;
    const cur = Math.abs(RODS[this.autoPick].x - bx);
    let best = this.autoPick;
    let bestD = cur - HYSTERESIS;
    for (const i of this.mine) {
      const d = Math.abs(RODS[i].x - bx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private selectRod() {
    const idx = this.mine.indexOf(this.active);
    const cycle = (d: number) => {
      this.active = this.mine[(idx + d + this.mine.length) % this.mine.length];
      this.manual = true;
    };
    if (this.kb.consume('next')) cycle(1);
    if (this.kb.consume('prev')) cycle(-1);

    const auto = this.pickRod();
    if (auto !== this.autoPick) {
      this.autoPick = auto;
      this.manual = false; // la balle a changé de zone : retour en auto
    }
    // Ne jamais changer de barre pendant une frappe ou une balle collée.
    const r = this.sim.rods[this.active];
    const busy = r.phase !== 'idle' || this.sim.ball.stuckRod === this.active;
    if (!this.manual && !busy) this.active = this.autoPick;
  }

  /** Trackpad : la position visée suit le doigt, les pieds reviennent seuls au neutre. */
  private updatePad(dt: number) {
    const [dx, dy] = this.pointer.consume();
    const def = RODS[this.active];
    if (this.padRod !== this.active) {
      this.padRod = this.active;
      this.padY = this.sim.rods[this.active].y;
      this.padRot = 0;
    }
    this.padY = Math.min(def.maxY, Math.max(def.minY, this.padY + dy * PAD_SENS_Y));
    this.padRot *= Math.exp(-dt * PAD_ROT_RETURN);
    this.padRot = Math.min(1, Math.max(-1, this.padRot + dx * PAD_SENS_ROT));
  }

  frame(dtReal: number) {
    const dt = Math.min(dtReal, 0.25);
    this.time += dt;

    if (this.kb.consume('reset')) serveBall(this.sim);
    if (this.kb.consume('bot')) this.bot = this.bot ? null : new Bot(1, rodsOfTeam(1), 0.55);
    if (this.kb.consume('help')) this.el.help.classList.toggle('hidden');
    this.selectRod();
    this.updatePad(dt);

    this.acc += dt;
    while (this.acc >= DT) {
      this.snapshot();
      this.cmds.length = 0;
      const cmd = this.kb.command();
      if (this.pointer.locked) {
        if (cmd.move === 0) cmd.targetY = this.padY;
        if (cmd.rot === 0) cmd.rot = this.padRot;
      }
      this.cmds[this.active] = cmd;
      this.bot?.commands(this.sim, this.cmds);
      step(this.sim, this.cmds);
      // Au clavier, la cible trackpad suit la barre pour éviter un saut au retour du doigt.
      if (cmd.move !== 0) this.padY = this.sim.rods[this.active].y;
      for (const e of this.sim.events) this.onEvent(e);
      this.acc -= DT;
    }

    const alpha = this.acc / DT;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const s = this.sim;
    const teleport = Math.hypot(s.ball.x - this.prevBall.x, s.ball.y - this.prevBall.y) > 150;
    const view: View = {
      state: s,
      ballX: teleport ? s.ball.x : lerp(this.prevBall.x, s.ball.x),
      ballY: teleport ? s.ball.y : lerp(this.prevBall.y, s.ball.y),
      ballVisible: s.phase === 'play',
      rodY: s.rods.map((r, i) => lerp(this.prevRodY[i], r.y)),
      rodA: s.rods.map((r, i) => lerp(this.prevRodA[i], r.angle)),
      active: this.active,
      controlled: this.mine,
      time: this.time,
    };
    this.renderer.render(view, dt);
    this.updateHud(dt);
  }

  private onEvent(e: SimState['events'][number]) {
    this.renderer.onEvent(e, this.sim);
    switch (e.type) {
      case 'hit':
        this.sfx.hit(e.strength);
        break;
      case 'wall':
        this.sfx.wall(e.strength);
        break;
      case 'post':
        this.sfx.post(e.strength);
        break;
      case 'stick':
        this.sfx.stick();
        break;
      case 'goal': {
        this.sfx.goal();
        const el = this.el.score[e.team];
        el.textContent = String(this.sim.score[e.team]);
        el.classList.add('bump');
        setTimeout(() => el.classList.remove('bump'), 250);
        const b = this.el.banner;
        b.textContent = 'BUT !';
        b.className = `show t${e.team}`;
        setTimeout(() => (b.className = ''), 1000);
        break;
      }
    }
  }

  private updateHud(dt: number) {
    const r = this.sim.rods[this.active];
    this.mine.forEach((i, k) => this.rodEls[k].classList.toggle('active', i === this.active));
    const charging = r.phase === 'charging';
    this.el.gauge.classList.toggle('on', charging);
    this.el.gaugeFill.style.width = `${(charging ? r.charge : 0) * 100}%`;

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      const b = this.sim.ball;
      this.el.info.innerHTML =
        `${this.fps} FPS · sim 120 Hz<br>` +
        `balle ${Math.round(Math.hypot(b.vx, b.vy))} mm/s<br>` +
        `bot ${this.bot ? 'ON' : 'OFF'} (B) · mode ${this.manual ? 'manuel' : 'auto'}<br>` +
        (this.pointer.locked ? 'trackpad actif · Échap pour quitter' : 'clic sur le jeu = trackpad');
    }
  }
}
