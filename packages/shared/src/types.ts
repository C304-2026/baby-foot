import type { TeamId } from './constants.ts';

/** Commande appliquée à une barre pendant un tick. */
export interface RodCommand {
  /** -1 (haut) … 1 (bas), analogique possible (manette). */
  move: number;
  /** -1 … 1 : rotation des joueurs, positif = pied vers +x (écran : droite). */
  rot: number;
  shoot: boolean;
  control: boolean;
  /** Lever les joueurs (pieds à l'horizontale) pour laisser passer la balle. */
  lift: boolean;
}

export const NEUTRAL_COMMAND: Readonly<RodCommand> = { move: 0, rot: 0, shoot: false, control: false, lift: false };

export type ShotPhase = 'idle' | 'charging' | 'strike';

export interface RodState {
  y: number;
  vy: number;
  angle: number;
  omega: number;
  phase: ShotPhase;
  shootHeld: boolean;
  holdTime: number;
  /** 0 … 1 : jauge de tir. */
  charge: number;
  strikeOmega: number;
  /** Contrôle déjà consommé : il faut relâcher la touche pour recoller. */
  controlSpent: boolean;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Barre qui tient la balle collée, -1 sinon. */
  stuckRod: number;
  stuckMan: number;
  stickTime: number;
  stickOffX: number;
  stickOffY: number;
}

export interface TouchInfo {
  rod: number;
  man: number;
  tick: number;
  /** Nombre de ticks consécutifs en contact avec cette barre. */
  contactTicks: number;
}

export type MatchPhase = 'play' | 'goal';

export type SimEvent =
  | { type: 'hit'; rod: number; man: number; x: number; y: number; strength: number }
  | { type: 'wall'; x: number; y: number; strength: number }
  | { type: 'post'; x: number; y: number; strength: number }
  | { type: 'strike'; rod: number; power: number }
  | { type: 'stick'; rod: number; man: number }
  | { type: 'release'; rod: number }
  | { type: 'goal'; team: TeamId; x: number; y: number }
  | { type: 'serve' };

export interface SimState {
  tick: number;
  phase: MatchPhase;
  phaseTimer: number;
  rods: RodState[];
  ball: BallState;
  score: [number, number];
  touch: TouchInfo | null;
  deadTime: number;
  serveSide: number;
  rng: number;
  events: SimEvent[];
}
