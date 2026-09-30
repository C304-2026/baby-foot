/**
 * Contrôle au trackpad / à la souris, sans clic : on glisse le doigt.
 * Un clic sur le jeu verrouille le curseur (Pointer Lock), Échap le libère.
 * Glisser haut/bas déplace la barre, gauche/droite fait pivoter les joueurs.
 */
export class Pointer {
  dx = 0;
  dy = 0;
  locked = false;

  constructor(target: HTMLElement) {
    target.addEventListener('click', () => {
      if (!this.locked) target.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      this.dx = 0;
      this.dy = 0;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  /** Déplacement cumulé depuis le dernier appel (pixels). */
  consume(): [number, number] {
    const d: [number, number] = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return d;
  }
}
