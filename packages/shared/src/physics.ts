import {
  BALL,
  CONTROL,
  DT,
  FIELD,
  GOAL_Y0,
  GOAL_Y1,
  MATCH,
  ROD,
  RODS,
  manOffset,
  teamDir,
  type TeamId,
} from './constants.ts';
import { clamp, lerp, nextRandom } from './math.ts';
import { NEUTRAL_COMMAND, type RodCommand, type RodState, type SimState } from './types.ts';

export function createRodState(i: number): RodState {
  const def = RODS[i];
  return {
    y: (def.minY + def.maxY) / 2,
    vy: 0,
    angle: 0,
    omega: 0,
    phase: 'idle',
    shootHeld: false,
    holdTime: 0,
    charge: 0,
    strikeOmega: 0,
    controlSpent: false,
  };
}

export function createSimState(seed = 1): SimState {
  const s: SimState = {
    tick: 0,
    phase: 'play',
    phaseTimer: 0,
    rods: RODS.map((_, i) => createRodState(i)),
    ball: { x: 0, y: 0, vx: 0, vy: 0, stuckRod: -1, stuckMan: 0, stickTime: 0, stickOffX: 0, stickOffY: 0 },
    score: [0, 0],
    touch: null,
    deadTime: 0,
    serveSide: 0,
    rng: seed >>> 0 || 1,
    events: [],
  };
  serveBall(s);
  return s;
}

/** Engagement : la balle entre par le côté, au milieu du terrain. */
export function serveBall(s: SimState) {
  const b = s.ball;
  const fromTop = s.serveSide % 2 === 0;
  s.serveSide++;
  const [r, rng] = nextRandom(s.rng);
  s.rng = rng;
  b.x = FIELD.length / 2 + (r - 0.5) * 40;
  b.y = fromTop ? BALL.radius + 4 : FIELD.width - BALL.radius - 4;
  b.vx = (r - 0.5) * 160;
  b.vy = fromTop ? MATCH.serveSpeed : -MATCH.serveSpeed;
  b.stuckRod = -1;
  b.stickTime = 0;
  s.touch = null;
  s.deadTime = 0;
  s.phase = 'play';
  s.events.push({ type: 'serve' });
}

/** Avance la simulation d'un pas fixe. `cmds[i]` pilote la barre i. */
export function step(s: SimState, cmds: readonly (RodCommand | undefined)[]) {
  s.events.length = 0;
  s.tick++;

  const prevY = s.rods.map((r) => r.y);
  const prevA = s.rods.map((r) => r.angle);
  for (let i = 0; i < s.rods.length; i++) updateRod(s, i, cmds[i] ?? NEUTRAL_COMMAND);

  if (s.phase === 'goal') {
    s.phaseTimer -= DT;
    if (s.phaseTimer <= 0) serveBall(s);
    return;
  }
  updateBall(s, cmds, prevY, prevA);
}

function updateRod(s: SimState, i: number, cmd: RodCommand) {
  const def = RODS[i];
  const r = s.rods[i];
  const dir = teamDir(def.team);

  // Translation : cinématique, accélération très forte, butées sèches.
  const targetV = clamp(cmd.move, -1, 1) * ROD.maxSpeed;
  const maxDv = ROD.accel * DT;
  r.vy += clamp(targetV - r.vy, -maxDv, maxDv);
  let y = r.y + r.vy * DT;
  if (y < def.minY) {
    y = def.minY;
    r.vy = 0;
  } else if (y > def.maxY) {
    y = def.maxY;
    r.vy = 0;
  }
  r.y = y;

  if (!cmd.control) r.controlSpent = false;

  // Frappe : appui = armement (jauge), relâchement = frappe.
  if (cmd.shoot && !r.shootHeld && r.phase === 'idle') {
    r.phase = 'charging';
    r.holdTime = 0;
    r.charge = 0;
  }
  r.shootHeld = cmd.shoot;

  const prevAngle = r.angle;
  if (r.phase === 'strike') {
    r.angle += dir * r.strikeOmega * DT;
    if (dir * r.angle >= ROD.followThrough) {
      r.angle = dir * ROD.followThrough;
      r.phase = 'idle';
      r.charge = 0;
    }
  } else {
    let target: number;
    let speed: number = ROD.rotSpeed;
    if (r.phase === 'charging') {
      r.holdTime += DT;
      r.charge = Math.min(1, r.holdTime / ROD.chargeTime);
      target = -dir * lerp(ROD.windBackMin, ROD.windBackMax, r.charge);
      speed = ROD.windBackSpeed;
      if (!cmd.shoot) {
        r.phase = 'strike';
        r.strikeOmega = lerp(ROD.strikeOmegaMin, ROD.strikeOmegaMax, Math.pow(r.charge, 1.2));
        s.events.push({ type: 'strike', rod: i, power: r.charge });
      }
    } else if (s.ball.stuckRod === i) {
      target = -dir * CONTROL.pinAngle;
    } else if (cmd.lift) {
      target = dir * ROD.liftedAngle;
      speed = ROD.liftSpeed;
    } else {
      target = clamp(cmd.rot, -1, 1) * ROD.arrowAngle;
    }
    if (r.phase !== 'strike') r.angle += clamp(target - r.angle, -speed * DT, speed * DT);
  }
  r.omega = (r.angle - prevAngle) / DT;
}

function updateBall(
  s: SimState,
  cmds: readonly (RodCommand | undefined)[],
  prevY: number[],
  prevA: number[],
) {
  const b = s.ball;

  if (b.stuckRod >= 0) {
    const i = b.stuckRod;
    const r = s.rods[i];
    const cmd = cmds[i] ?? NEUTRAL_COMMAND;
    b.stickTime += DT;
    const timeout = b.stickTime >= CONTROL.maxStickTime;
    if (!cmd.control || timeout || r.phase === 'strike') {
      if (timeout) r.controlSpent = true;
      b.stuckRod = -1;
      b.vx = 0;
      b.vy = r.vy;
      s.events.push({ type: 'release', rod: i });
    } else {
      followStick(s);
      markTouch(s, i, b.stuckMan);
      return;
    }
  }

  // Sous-pas adaptatifs : le déplacement relatif balle/joueur par sous-pas reste
  // inférieur à ~1/3 de rayon, ce qui interdit toute traversée même à pleine vitesse.
  const R = BALL.radius;
  const reachX = ROD.footReach + ROD.manRadius + R;
  const speed = Math.hypot(b.vx, b.vy);
  const near: number[] = [];
  let maxRodDisp = 0;
  for (let i = 0; i < RODS.length; i++) {
    if (Math.abs(b.x - RODS[i].x) > reachX + speed * DT + 8) continue;
    near.push(i);
    const r = s.rods[i];
    maxRodDisp = Math.max(maxRodDisp, Math.abs(r.y - prevY[i]) + ROD.footReach * Math.abs(r.angle - prevA[i]));
  }
  const disp = speed * DT + maxRodDisp;
  const n = clamp(Math.ceil(disp / (R * 0.33)), 1, 48);
  const h = DT / n;

  for (let k = 1; k <= n; k++) {
    b.x += b.vx * h;
    b.y += b.vy * h;
    const t = k / n;
    for (const i of near) {
      if (collideRod(s, i, cmds[i] ?? NEUTRAL_COMMAND, lerp(prevY[i], s.rods[i].y, t), lerp(prevA[i], s.rods[i].angle, t), prevY[i], prevA[i])) {
        followStick(s);
        return;
      }
    }
    collideWalls(s);
    if (checkGoal(s)) return;
  }

  // Pentes des coins : la balle ne meurt pas hors de portée.
  const inCornerX = b.x < MATCH.cornerSize || b.x > FIELD.length - MATCH.cornerSize;
  if (inCornerX) {
    if (b.y < MATCH.cornerDepthY) b.vy += MATCH.cornerAccel * DT;
    else if (b.y > FIELD.width - MATCH.cornerDepthY) b.vy -= MATCH.cornerAccel * DT;
  }

  // Frottements.
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0) {
    let ns = sp * Math.exp(-BALL.linearDamping * DT) - BALL.rollingFriction * DT;
    ns = clamp(ns, 0, BALL.maxSpeed);
    b.vx *= ns / sp;
    b.vy *= ns / sp;
  }

  // Balle morte : réengagement (vite si hors de portée, plus tard sinon).
  if (Math.hypot(b.vx, b.vy) < MATCH.deadBallSpeed) {
    s.deadTime += DT;
    const limit = ballReachable(s) ? MATCH.stallTime : MATCH.deadBallTime;
    if (s.deadTime >= limit) serveBall(s);
  } else {
    s.deadTime = 0;
  }
}

/**
 * Collision balle / joueurs d'une barre à la position interpolée (y, a).
 * Retourne true si la balle vient d'être collée au pied.
 */
function collideRod(
  s: SimState,
  i: number,
  cmd: RodCommand,
  y: number,
  a: number,
  y0: number,
  a0: number,
): boolean {
  if (Math.abs(a) > ROD.liftAngle) return false;
  const def = RODS[i];
  const r = s.rods[i];
  const b = s.ball;
  const R = BALL.radius;
  const rad = R + ROD.manRadius;
  const rodVy = (r.y - y0) / DT;
  const omega = (r.angle - a0) / DT;
  const tipX = ROD.footReach * Math.sin(a);
  const canCapture = cmd.control && !r.controlSpent && r.phase !== 'strike';

  for (let m = 0; m < def.men; m++) {
    const my = y + manOffset(def, m);
    // Segment horizontal du pied : (def.x, my) → (def.x + tipX, my).
    const u = tipX === 0 ? 0 : clamp((b.x - def.x) / tipX, 0, 1);
    const cx = def.x + u * tipX;
    const dx = b.x - cx;
    const dy = b.y - my;
    const d2 = dx * dx + dy * dy;
    const limit = canCapture ? rad + CONTROL.captureMargin : rad;
    if (d2 >= limit * limit) continue;

    const d = Math.sqrt(d2);
    let nx: number;
    let ny: number;
    if (d > 1e-6) {
      nx = dx / d;
      ny = dy / d;
    } else {
      nx = Math.sign(b.x - def.x) || teamDir(def.team);
      ny = 0;
    }
    // Vitesse du point de contact (translation de la barre + rotation du pied).
    const cvx = u * ROD.footReach * Math.cos(a) * omega;
    const cvy = rodVy;
    const rvx = b.vx - cvx;
    const rvy = b.vy - cvy;
    const vn = rvx * nx + rvy * ny;

    if (canCapture && Math.hypot(rvx, rvy) <= CONTROL.maxCaptureSpeed) {
      const dir = teamDir(def.team);
      b.stuckRod = i;
      b.stuckMan = m;
      b.stickTime = 0;
      b.stickOffX = dir * (rad - 2);
      b.stickOffY = clamp(b.y - my, -10, 10);
      b.vx = 0;
      b.vy = rodVy;
      markTouch(s, i, m);
      s.events.push({ type: 'stick', rod: i, man: m });
      return true;
    }
    if (d >= rad) continue;

    b.x = cx + nx * rad;
    b.y = my + ny * rad;
    if (vn < 0) {
      const e = cmd.control ? CONTROL.dampRestitution : BALL.manRestitution;
      const jn = -(1 + e) * vn;
      const tvx = rvx - vn * nx;
      const tvy = rvy - vn * ny;
      b.vx += jn * nx - tvx * BALL.manFriction;
      b.vy += jn * ny - tvy * BALL.manFriction;
      clampBallSpeed(s);
      if (-vn > 60) s.events.push({ type: 'hit', rod: i, man: m, x: b.x, y: b.y, strength: -vn });
    }
    markTouch(s, i, m);
  }
  return false;
}

function followStick(s: SimState) {
  const b = s.ball;
  const i = b.stuckRod;
  if (i < 0) return;
  const def = RODS[i];
  const r = s.rods[i];
  const tx = def.x + b.stickOffX;
  const ty = clamp(r.y + manOffset(def, b.stuckMan) + b.stickOffY, BALL.radius, FIELD.width - BALL.radius);
  // Glissement linéaire vers la position sous le pied, terminé à CONTROL.catchTime.
  const remaining = CONTROL.catchTime - b.stickTime;
  const k = remaining > DT ? DT / remaining : 1;
  b.x += (tx - b.x) * k;
  b.y += (ty - b.y) * k;
  b.vx = 0;
  b.vy = r.vy;
}

function markTouch(s: SimState, rod: number, man: number) {
  const t = s.touch;
  if (t && t.rod === rod) {
    if (t.tick !== s.tick) t.contactTicks = t.tick === s.tick - 1 ? t.contactTicks + 1 : 1;
    t.tick = s.tick;
    t.man = man;
  } else {
    s.touch = { rod, man, tick: s.tick, contactTicks: 1 };
  }
}

function clampBallSpeed(s: SimState) {
  const b = s.ball;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > BALL.maxSpeed) {
    b.vx *= BALL.maxSpeed / sp;
    b.vy *= BALL.maxSpeed / sp;
  }
}

const POSTS = [
  [0, GOAL_Y0],
  [0, GOAL_Y1],
  [FIELD.length, GOAL_Y0],
  [FIELD.length, GOAL_Y1],
] as const;

function collideWalls(s: SimState) {
  const b = s.ball;
  const R = BALL.radius;
  const L = FIELD.length;
  const W = FIELD.width;
  const e = BALL.wallRestitution;
  const inMouth = b.y > GOAL_Y0 && b.y < GOAL_Y1;

  const wall = (strength: number) => {
    if (strength > 80) s.events.push({ type: 'wall', x: b.x, y: b.y, strength });
  };

  if (b.x >= 0 && b.x <= L) {
    if (b.y < R) {
      b.y = R;
      if (b.vy < 0) (wall(-b.vy), (b.vy = -b.vy * e));
    } else if (b.y > W - R) {
      b.y = W - R;
      if (b.vy > 0) (wall(b.vy), (b.vy = -b.vy * e));
    }
  } else {
    // Dans la cage.
    if (b.y < GOAL_Y0 + R) {
      b.y = GOAL_Y0 + R;
      if (b.vy < 0) b.vy = -b.vy * e;
    } else if (b.y > GOAL_Y1 - R) {
      b.y = GOAL_Y1 - R;
      if (b.vy > 0) b.vy = -b.vy * e;
    }
  }

  if (!inMouth) {
    if (b.x < R) {
      b.x = R;
      if (b.vx < 0) (wall(-b.vx), (b.vx = -b.vx * e));
    } else if (b.x > L - R) {
      b.x = L - R;
      if (b.vx > 0) (wall(b.vx), (b.vx = -b.vx * e));
    }
  }

  const pr = R + FIELD.postRadius;
  for (const [px, py] of POSTS) {
    const dx = b.x - px;
    const dy = b.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 >= pr * pr || d2 < 1e-9) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    b.x = px + nx * pr;
    b.y = py + ny * pr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      if (-vn > 80) s.events.push({ type: 'post', x: b.x, y: b.y, strength: -vn });
    }
  }
}

function checkGoal(s: SimState): boolean {
  const b = s.ball;
  let team: TeamId | -1 = -1;
  if (b.x < -BALL.radius) team = 1;
  else if (b.x > FIELD.length + BALL.radius) team = 0;
  if (team === -1) return false;
  s.score[team]++;
  s.events.push({ type: 'goal', team, x: b.x, y: b.y });
  s.phase = 'goal';
  s.phaseTimer = MATCH.goalPause;
  b.vx = 0;
  b.vy = 0;
  return true;
}

/** Vrai si au moins un joueur peut atteindre la balle. */
export function ballReachable(s: SimState): boolean {
  const b = s.ball;
  const reachX = ROD.footReach * Math.sin(ROD.liftAngle) + ROD.manRadius + BALL.radius;
  const reachY = ROD.manRadius + BALL.radius;
  for (const def of RODS) {
    if (Math.abs(b.x - def.x) > reachX) continue;
    for (let m = 0; m < def.men; m++) {
      const off = manOffset(def, m);
      if (b.y >= def.minY + off - reachY && b.y <= def.maxY + off + reachY) return true;
    }
  }
  return false;
}
