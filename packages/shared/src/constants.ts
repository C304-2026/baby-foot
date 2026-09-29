// Unités monde : 1 unité ≈ 1 mm. Axe x = longueur (buts à gauche/droite), axe y = largeur.

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;

const deg = (d: number) => (d * Math.PI) / 180;

export const FIELD = {
  length: 1200,
  width: 680,
  goalWidth: 200,
  goalDepth: 60,
  postRadius: 4,
} as const;

export const GOAL_Y0 = (FIELD.width - FIELD.goalWidth) / 2;
export const GOAL_Y1 = GOAL_Y0 + FIELD.goalWidth;

export const BALL = {
  radius: 17,
  maxSpeed: 3200,
  /** Amortissement proportionnel (1/s). */
  linearDamping: 0.35,
  /** Décélération constante de roulement (u/s²). */
  rollingFriction: 45,
  wallRestitution: 0.72,
  manRestitution: 0.35,
  manFriction: 0.15,
} as const;

export const ROD = {
  /** Hauteur de l'axe au-dessus du sol = longueur de jambe : le pied touche le sol à angle 0. */
  height: 64,
  footReach: 64,
  manRadius: 11,
  /** Vitesse max de translation (u/s) et accélération très forte : inertie quasi nulle. */
  maxSpeed: 1300,
  accel: 32000,
  /** Au-delà de cet angle, le pied est levé : la balle passe dessous. */
  liftAngle: deg(62),
  /** Rotation pilotée par les flèches. */
  arrowAngle: deg(50),
  rotSpeed: 12,
  /** Pieds levés (touche dédiée). */
  liftedAngle: deg(85),
  liftSpeed: 22,
  /** Frappe. */
  windBackMin: deg(10),
  windBackMax: deg(80),
  windBackSpeed: 22,
  followThrough: deg(88),
  chargeTime: 0.7,
  strikeOmegaMin: 18,
  strikeOmegaMax: 44,
} as const;

export const CONTROL = {
  /** Durée max de balle « collée » au pied (s). */
  maxStickTime: 1.5,
  /** Marge de capture autour du joueur. */
  captureMargin: 6,
  /** Au-delà de cette vitesse relative, la balle est seulement amortie, pas collée. */
  maxCaptureSpeed: 2400,
  /** Restitution quand on amortit une balle trop rapide pour être collée. */
  dampRestitution: 0.05,
  /** Durée du glissement de la balle vers sa position sous le pied (s). */
  catchTime: 0.06,
  /** Angle du pied posé sur la balle. */
  pinAngle: deg(8),
} as const;

export const MATCH = {
  goalPause: 1.2,
  /** Balle immobile hors de portée : réengagement après ce délai (s). */
  deadBallTime: 2.5,
  /** Balle immobile même atteignable : réengagement après ce délai (s). */
  stallTime: 6,
  deadBallSpeed: 15,
  serveSpeed: 450,
  /** Pentes des coins (hors de portée du gardien) qui ramènent la balle en jeu. */
  cornerSize: 150,
  cornerDepthY: 185,
  cornerAccel: 260,
} as const;

export type TeamId = 0 | 1;
export type RodRole = 'goal' | 'def' | 'mid' | 'att';

export interface RodDef {
  team: TeamId;
  role: RodRole;
  x: number;
  men: number;
  spacing: number;
  minY: number;
  maxY: number;
}

const WALL_MARGIN = 20;

function rodDef(i: number, team: TeamId, role: RodRole, men: number, spacing: number): RodDef {
  const half = ((men - 1) / 2) * spacing;
  let minY = WALL_MARGIN + half;
  let maxY = FIELD.width - WALL_MARGIN - half;
  if (role === 'goal') {
    minY = GOAL_Y0 - 30;
    maxY = GOAL_Y1 + 30;
  }
  return { team, role, x: 75 + i * 150, men, spacing, minY, maxY };
}

/** 8 barres standard, de gauche à droite. L'équipe 0 défend le but gauche et attaque vers +x. */
export const RODS: readonly RodDef[] = [
  rodDef(0, 0, 'goal', 1, 0),
  rodDef(1, 0, 'def', 2, 250),
  rodDef(2, 1, 'att', 3, 210),
  rodDef(3, 0, 'mid', 5, 125),
  rodDef(4, 1, 'mid', 5, 125),
  rodDef(5, 0, 'att', 3, 210),
  rodDef(6, 1, 'def', 2, 250),
  rodDef(7, 1, 'goal', 1, 0),
];

/** Sens d'attaque : +1 vers la droite (équipe 0), -1 vers la gauche (équipe 1). */
export const teamDir = (team: TeamId): 1 | -1 => (team === 0 ? 1 : -1);

export const manOffset = (def: RodDef, k: number) => (k - (def.men - 1) / 2) * def.spacing;

export const rodsOfTeam = (team: TeamId) =>
  RODS.map((_, i) => i).filter((i) => RODS[i].team === team);
