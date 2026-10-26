/**
 * All the sound in one place: a soft, endless piece of ambient music, and little sound effects
 * (kisses, holding hands, petting, the camera shutter...). Everything is synthesized
 * in the browser, so there are no audio files to load. One mute switch covers all of it.
 */

const AC = window.AudioContext || window.webkitAudioContext;
const store = {
  get(k, d) { try { const v = localStorage.getItem('og-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('og-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const midi = n => 440 * 2 ** ((n - 69) / 12);

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = store.get('muted', false);
    this.listener = { x: 0, z: 0 };
    this.duck = 1;                     // 1 = full ambient music; lowered while "our song" plays
    this.duck2 = 1;                    // lowered while a film plays
    this._music = false;
  }

  /** create the audio graph (must follow a click or key press) */
  unlock() {
    if (!AC) return;
    if (!this.ctx) {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
      // a shared, roomy reverb
      const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
      this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
      this.wet = ctx.createGain(); this.wet.gain.value = 0.5; this.reverb.connect(this.wet); this.wet.connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(v) {
    this.muted = !!v; store.set('muted', this.muted);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.08);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  /* ── helpers ── */
  _vol(pos) {                          // quieter the further away a sound is
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
    return Math.max(0, 1 - d / 16) ** 1.5;
  }
  _tone(freq, t, dur, { type = 'sine', gain = 0.2, glide = 0, attack = 0.005, verb = 0, dest = this.sfx, vol = 1 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    if (verb) { const s = ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.reverb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, { freq = 1500, q = 1, type = 'bandpass', gain = 0.2, sweep = 0, vol = 1 } = {}) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noiseBuf; n.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.sfx);
    n.start(t); n.stop(t + dur + 0.05);
  }
  _bell(note, t, { gain = 0.14, dur = 1.6, vol = 1, verb = 0.9 } = {}) {
    const f = midi(note);
    this._tone(f, t, dur, { gain, vol, verb });
    this._tone(f * 2.01, t, dur * 0.4, { gain: gain * 0.35, vol, verb });
    this._tone(f * 3.97, t, dur * 0.15, { gain: gain * 0.12, vol });
  }
  _ok() { return this.ctx && !this.muted && this.ctx.state !== 'closed'; }

  /* ── sound effects ── */
  kiss() {      // a soft smack, then a little shimmer of bells
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.02;
    this._tone(620, t, 0.1, { gain: 0.22, glide: 0.45 });
    this._noise(t, 0.07, { freq: 2600, q: 0.8, gain: 0.12 });
    [76, 79, 83, 88].forEach((n, i) => this._bell(n, t + 0.18 + i * 0.11, { gain: 0.09, dur: 1.8 }));
    [52, 59, 64].forEach(n => this._tone(midi(n), t + 0.1, 2.6, { type: 'triangle', gain: 0.05, attack: 0.5, verb: 0.6 }));
  }
  hold() {      // two warm notes
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.02;
    this._bell(67, t, { gain: 0.12, dur: 1.4 }); this._bell(74, t + 0.16, { gain: 0.12, dur: 1.8 });
  }
  release() {
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.02;
    this._bell(74, t, { gain: 0.08, dur: 1 }); this._bell(67, t + 0.14, { gain: 0.08, dur: 1.2 });
  }
  pet(pos) {    // happy little sparkle with soft pats
    if (!this._ok()) return; const v = this._vol(pos); if (v < 0.03) return; const t = this.ctx.currentTime + 0.02;
    [0, 0.14].forEach(d => { this._tone(110, t + d, 0.09, { gain: 0.22, glide: 0.6, vol: v }); this._noise(t + d, 0.05, { freq: 500, q: 0.7, gain: 0.1, vol: v }); });
    [84, 88, 91].forEach((n, i) => this._bell(n, t + 0.3 + i * 0.09, { gain: 0.07, dur: 1.1, vol: v }));
  }
  purr(pos, secs = 1.6) {
    if (!this._ok()) return; const v = this._vol(pos); if (v < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02, o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 52; f.type = 'lowpass'; f.frequency.value = 260;
    lfo.frequency.value = 24; lg.gain.value = 0.5; g.gain.value = 0;
    lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + secs);
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + secs + 0.1); lfo.stop(t + secs + 0.1);
  }
  shutter() {
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    this._noise(t, 0.04, { freq: 3500, q: 0.6, gain: 0.35 }); this._noise(t + 0.07, 0.05, { freq: 2200, q: 0.6, gain: 0.3 });
    this._tone(180, t, 0.08, { gain: 0.25, glide: 0.5 });
  }
  tick(high = false) {
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    this._tone(high ? 1320 : 880, t, 0.18, { gain: 0.16, verb: 0.3 });
  }
  pop() {       // a request bubble appears
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    this._tone(420, t, 0.09, { gain: 0.18, glide: 2.2 }); this._tone(990, t + 0.07, 0.12, { gain: 0.08, verb: 0.5 });
  }
  whoosh() {
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    this._noise(t, 0.5, { freq: 500, q: 0.9, gain: 0.16, sweep: 5 });
  }
  blow(pos) {   // an airy kiss that sets hearts off
    if (!this._ok()) return; const v = this._vol(pos); if (v < 0.03) return; const t = this.ctx.currentTime + 0.01;
    this._tone(700, t, 0.08, { gain: 0.15, glide: 0.5, vol: v });
    this._noise(t + 0.02, 0.5, { freq: 1800, q: 0.7, gain: 0.07, sweep: 3, vol: v });
    [86, 91, 95].forEach((n, i) => this._bell(n, t + 0.25 + i * 0.12, { gain: 0.06, dur: 1.3, vol: v }));
  }
  sit() {
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    this._tone(95, t, 0.18, { gain: 0.25, glide: 0.55 }); this._noise(t, 0.12, { freq: 400, q: 0.5, gain: 0.1 });
  }
  thunk() {     // a can dropping out of the vending machine, a little clink on the tray
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    this._noise(t, 0.35, { freq: 900, q: 0.8, gain: 0.05, sweep: 0.3 });                         // the mechanism
    this._tone(110, t + 0.38, 0.16, { gain: 0.3, glide: 0.5 });                                    // the thud
    this._tone(2400, t + 0.42, 0.18, { gain: 0.05, glide: 0.8, verb: 0.3 });                       // the clink
  }
  popcorn() {   // a burst of quick pops
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    for (let i = 0; i < 14; i++) this._noise(t + i * 0.055 + Math.random() * 0.04, 0.03, { freq: 1500 + Math.random() * 2500, q: 1.5, gain: 0.07 + Math.random() * 0.05 });
  }
  sparkle() {
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.01;
    [79, 84, 88, 91, 96].forEach((n, i) => this._bell(n, t + i * 0.07, { gain: 0.07, dur: 1.2 }));
  }
  fanfare() {   // for the big yes
    if (!this._ok()) return; const t = this.ctx.currentTime + 0.05;
    [[60, 64, 67, 72], [62, 65, 69, 74], [64, 67, 71, 76], [67, 72, 76, 79]].forEach((ch, i) => ch.forEach((n, j) => this._bell(n, t + i * 0.32 + j * 0.03, { gain: 0.08, dur: 2.2 })));
  }
  /* ── the ambient music ── */
  startMusic() {
    this.unlock(); if (!this.ctx || this._music) return;
    this._music = true;
    this.musicBus.gain.setTargetAtTime(0.5, this.ctx.currentTime, 4);        // fades in slowly
    const CH = [[48, 55, 59, 64, 62], [45, 52, 55, 60, 64], [41, 48, 55, 60, 64], [43, 50, 55, 57, 62]];   // Cmaj9, Am9, Fmaj9, G6/9
    const PENT = [72, 74, 76, 79, 81, 84, 88];
    const BAR = 9;                                                            // seconds per chord
    let nextBar = this.ctx.currentTime + 0.3, bar = 0, nextNote = nextBar + 2, last = 3;
    const pad = (notes, t) => notes.forEach((n, i) => {
      for (const det of [-7, 6]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = midi(n); o.detune.value = det + i;
        f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.045, t + 3.2); g.gain.setValueAtTime(0.045, t + BAR - 1); g.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 3.5);
        o.connect(f); f.connect(g); g.connect(this.musicBus);
        const s = this.ctx.createGain(); s.gain.value = 0.7; g.connect(s); s.connect(this.reverb);
        o.start(t); o.stop(t + BAR + 3.6);
      }
    });
    const pluck = (n, t, v) => {
      const f = midi(n);
      this._tone(f, t, 2.4, { gain: 0.07 * v, verb: 1, dest: this.musicBus });
      this._tone(f * 2.01, t, 0.5, { gain: 0.02 * v, verb: 0.8, dest: this.musicBus });
    };
    this._musicTimer = setInterval(() => {
      if (!this.ctx) return;
      this.musicBus.gain.setTargetAtTime(0.5 * this.duck * this.duck2, this.ctx.currentTime, 0.6);
      const now = this.ctx.currentTime;
      while (nextBar < now + 1) { pad(CH[bar % 4], nextBar); nextBar += BAR; bar++; }
      while (nextNote < now + 1) {
        // a gentle wandering tune; every so often a short phrase, and often a long rest
        const phrase = Math.random() < 0.35 ? 3 : 1;
        for (let i = 0; i < phrase; i++) {
          last = Math.max(0, Math.min(PENT.length - 1, last + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
          pluck(PENT[last], nextNote + i * 0.55, 0.8 + Math.random() * 0.4);
        }
        nextNote += 1.8 + Math.random() * 3.6 + phrase * 0.5;
      }
    }, 400);
  }
}

export const sound = new SoundEngine();

// browsers only allow audio after a click or key press: wake up on the first one
const wake = () => { sound.unlock(); };
window.addEventListener('pointerdown', wake, { passive: true });
window.addEventListener('keydown', wake);
