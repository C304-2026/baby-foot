import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL,
  CONTROL,
  DT,
  ROD,
  RODS,
  createSimState,
  step,
  type RodCommand,
  type SimState,
} from '../src/index.ts';

const GOALIE = 0; // barre du gardien de l'équipe 0 (x = 75)

function freshBall(s: SimState, x: number, y: number, vx: number, vy: number) {
  Object.assign(s.ball, { x, y, vx, vy, stuckRod: -1 });
  s.phase = 'play';
}

function run(s: SimState, ticks: number, cmds: (RodCommand | undefined)[] = []) {
  for (let t = 0; t < ticks; t++) step(s, cmds);
}

describe('physique', () => {
  it('ne laisse pas traverser un joueur à vitesse max', () => {
    const s = createSimState();
    const y = s.rods[GOALIE].y;
    freshBall(s, 400, y, -BALL.maxSpeed, 0);
    run(s, 30);
    assert.ok(s.ball.x > RODS[GOALIE].x);
    assert.ok(s.ball.vx > 0);
    assert.equal(s.score[1], 0);
  });

  it('transfère la vitesse de la barre à la balle', () => {
    const s = createSimState();
    const r = s.rods[GOALIE];
    r.y = RODS[GOALIE].minY;
    freshBall(s, RODS[GOALIE].x, r.y + 160, 0, 0);
    let maxVy = 0;
    for (let t = 0; t < 20; t++) {
      step(s, [{ move: 1, rot: 0, shoot: false, control: false, lift: false }]);
      maxVy = Math.max(maxVy, s.ball.vy);
    }
    assert.ok(maxVy > ROD.maxSpeed);
  });

  it('frappe chargée plus puissante que frappe rapide', () => {
    const shot = (holdTicks: number) => {
      const s = createSimState();
      const r = s.rods[GOALIE];
      freshBall(s, RODS[GOALIE].x + BALL.radius + ROD.manRadius + 4, r.y, 0, 0);
      let maxV = 0;
      for (let t = 0; t < 200; t++) {
        step(s, [{ move: 0, rot: 0, shoot: t < holdTicks, control: false, lift: false }]);
        maxV = Math.max(maxV, s.ball.vx);
      }
      return maxV;
    };
    const quick = shot(3);
    const charged = shot(Math.round(ROD.chargeTime / DT));
    assert.ok(quick > 800);
    assert.ok(charged > quick * 1.5);
  });

  it('colle la balle au pied au plus 1,5 s puis la relâche', () => {
    const s = createSimState();
    const r = s.rods[GOALIE];
    freshBall(s, RODS[GOALIE].x + 60, r.y, -600, 0);
    const hold = { move: 0, rot: 0, shoot: false, control: true, lift: false };
    run(s, 20, [hold]);
    assert.equal(s.ball.stuckRod, GOALIE);
    run(s, Math.round(CONTROL.maxStickTime / DT) + 2, [hold]);
    assert.equal(s.ball.stuckRod, -1);
    run(s, 10, [hold]);
    assert.equal(s.ball.stuckRod, -1); // pas de recapture sans relâcher la touche
  });

  it('pied levé : la balle passe dessous', () => {
    const s = createSimState();
    const r = s.rods[GOALIE];
    r.angle = ROD.liftAngle + 0.2;
    freshBall(s, 150, r.y, -2000, 0);
    const lift = { move: 0, rot: 1, shoot: false, control: false, lift: false };
    // Le pied reste levé via un angle maintenu manuellement.
    for (let t = 0; t < 30; t++) {
      step(s, [lift]);
      s.rods[GOALIE].angle = ROD.liftAngle + 0.2;
    }
    assert.equal(s.score[1], 1);
  });
});
