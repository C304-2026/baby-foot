/** Sons synthétisés WebAudio (sans fichier). Version jalon 1 : frappes, murs, buts. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;

  /** Doit être appelé depuis un geste utilisateur. */
  unlock() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private burst(freq: number, q: number, gain: number, dur: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(freq: number, gain: number, dur: number, type: OscillatorType = 'sine', slide = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hit(strength: number) {
    const k = Math.min(1, strength / 4000);
    this.burst(1800 + 2200 * k, 1.2, 0.25 + 0.6 * k, 0.05 + 0.05 * k);
    this.tone(220 + 200 * k, 0.15 + 0.3 * k, 0.06, 'triangle', 0.5);
  }

  wall(strength: number) {
    const k = Math.min(1, strength / 4000);
    this.burst(500, 2, 0.15 + 0.4 * k, 0.08);
    this.tone(110, 0.1 + 0.2 * k, 0.08, 'sine', 0.6);
  }

  post(strength: number) {
    const k = Math.min(1, strength / 4000);
    this.tone(1400, 0.15 + 0.3 * k, 0.35, 'triangle', 0.98);
    this.tone(2100, 0.08 + 0.15 * k, 0.25, 'sine', 0.98);
  }

  stick() {
    this.burst(900, 3, 0.25, 0.05, 'lowpass');
  }

  goal() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.25, 0.5, 'sawtooth', 1.01), i * 70),
    );
    this.burst(1200, 0.4, 0.5, 1.6); // foule
  }
}
