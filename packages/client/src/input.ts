import type { RodCommand } from '@babyfoot/shared';

/** Touches physiques (event.code) : indépendant de la disposition AZERTY/QWERTY. */
const KEYS = {
  up: ['KeyW'],
  down: ['KeyS'],
  rotBack: ['ArrowLeft'],
  rotFwd: ['ArrowRight'],
  lift: ['ArrowDown'],
  shoot: ['Space', 'ArrowUp'],
  control: ['ShiftLeft', 'ShiftRight'],
  next: ['Tab', 'KeyE'],
  prev: ['KeyQ'],
  reset: ['KeyR'],
  bot: ['KeyB'],
  help: ['KeyH'],
} as const;

type Action = keyof typeof KEYS;
const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Keyboard {
  private down = new Set<string>();
  private pressed = new Set<Action>();

  constructor(private onFirstInput?: () => void) {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      this.onFirstInput?.();
      if (e.repeat) return;
      this.down.add(e.code);
      for (const a of Object.keys(KEYS) as Action[]) {
        if ((KEYS[a] as readonly string[]).includes(e.code)) this.pressed.add(a);
      }
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  held(a: Action) {
    return KEYS[a].some((c) => this.down.has(c));
  }

  /** Front montant depuis le dernier appel. */
  consume(a: Action) {
    const p = this.pressed.has(a);
    this.pressed.delete(a);
    return p;
  }

  command(): RodCommand {
    return {
      move: (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0),
      rot: (this.held('rotFwd') ? 1 : 0) - (this.held('rotBack') ? 1 : 0),
      shoot: this.held('shoot'),
      control: this.held('control'),
      lift: this.held('lift'),
    };
  }
}
