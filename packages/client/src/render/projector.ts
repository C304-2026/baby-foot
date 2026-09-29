import { FIELD } from '@babyfoot/shared';

/** Compression verticale (caméra inclinée) et poids de la hauteur. */
const TILT = 0.78;
const Z_K = 0.62;
/** Perspective légère : le côté haut (loin) est un peu plus étroit. */
const PERSP = 0.08;

const VIEW_W = 1480;
const VIEW_H = 1000;

/** Projection monde (x, y, z) → écran, look 2.5D. */
export class Projector {
  scale = 1;
  cx = 0;
  cy = 0;

  resize(w: number, h: number) {
    this.scale = Math.min(w / VIEW_W, h / (VIEW_H * TILT));
    this.cx = w / 2;
    this.cy = h / 2 + 10 * this.scale;
  }

  /** Facteur de profondeur : > 1 près de la caméra (bas de l'écran). */
  depth(y: number) {
    return 1 + (PERSP * (y - FIELD.width / 2)) / FIELD.width;
  }

  x(x: number, y: number) {
    return this.cx + (x - FIELD.length / 2) * this.scale * this.depth(y);
  }

  y(y: number, z = 0) {
    return this.cy + (y - FIELD.width / 2) * this.scale * TILT - z * this.scale * Z_K * this.depth(y);
  }

  /** Taille écran d'une longueur monde à la profondeur y. */
  len(v: number, y: number) {
    return v * this.scale * this.depth(y);
  }
}
