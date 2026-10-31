const STORE_MUTE = "pacstrike.muted";

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.ambience = null;
    this._lastChomp = 0;
    this._chompFlip = 0;
    try {
      this.muted = localStorage.getItem(STORE_MUTE) === "1";
    } catch {
      this.muted = false;
    }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.7);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  _ok() {
    return this.ctx && this.ctx.state === "running" && !this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(STORE_MUTE, muted ? "1" : "0");
    } catch {}
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, t, 0.02);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  tone({
    freq = 440,
    end = freq,
    dur = 0.14,
    type = "sine",
    vol = 0.2,
    attack = 0.004,
    delay = 0,
    pan = 0,
  } = {}) {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (end !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    let node = gain;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      p.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(node);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({
    dur = 0.12,
    vol = 0.16,
    type = "highpass",
    freq = 900,
    end = null,
    delay = 0,
    pan = 0,
  } = {}) {
    if (!this._ok() || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (end) filter.frequency.exponentialRampToValueAtTime(Math.max(30, end), t0 + dur);
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      p.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  chomp() {
    if (!this._ok()) return;
    const now = this.ctx.currentTime;
    if (now - this._lastChomp < 0.055) return;
    this._lastChomp = now;
    this._chompFlip = (this._chompFlip + 1) % 2;
    const base = this._chompFlip ? 620 : 470;
    this.tone({ freq: base, end: base * 1.7, dur: 0.06, type: "triangle", vol: 0.12 });
    this.tone({ freq: base * 0.5, end: base * 0.7, dur: 0.05, type: "sine", vol: 0.06 });
  }

  shoot(frenzy = false) {
    if (!this._ok()) return;
    const p = (Math.random() - 0.5) * 0.3;
    this.tone({
      freq: frenzy ? 1100 : 880,
      end: frenzy ? 260 : 190,
      dur: frenzy ? 0.075 : 0.09,
      type: "square",
      vol: 0.075,
      pan: p,
    });
    this.noise({ dur: 0.05, vol: 0.05, type: "highpass", freq: 2400, pan: p });
  }

  hit() {
    if (!this._ok()) return;
    this.noise({ dur: 0.06, vol: 0.12, type: "bandpass", freq: 1200, end: 300 });
    this.tone({ freq: 300, end: 160, dur: 0.07, type: "square", vol: 0.06 });
  }

  ghostDie() {
    if (!this._ok()) return;
    this.tone({ freq: 660, end: 70, dur: 0.32, type: "sawtooth", vol: 0.11 });
    this.tone({ freq: 990, end: 120, dur: 0.24, type: "triangle", vol: 0.07, delay: 0.02 });
    this.noise({ dur: 0.3, vol: 0.13, type: "lowpass", freq: 2600, end: 200 });
  }

  eatGhost(chain = 1) {
    if (!this._ok()) return;
    const base = 420 + Math.min(5, chain) * 110;
    for (let i = 0; i < 3; i++) {
      this.tone({
        freq: base * (1 + i * 0.32),
        end: base * (1.25 + i * 0.32),
        dur: 0.09,
        type: "triangle",
        vol: 0.1,
        delay: i * 0.055,
      });
    }
    this.noise({ dur: 0.16, vol: 0.08, type: "highpass", freq: 1800, end: 4000 });
  }

  power() {
    if (!this._ok()) return;
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((f, i) =>
      this.tone({
        freq: f,
        end: f * 1.02,
        dur: 0.18,
        type: "sawtooth",
        vol: 0.075,
        delay: i * 0.055,
      })
    );
    this.noise({ dur: 0.5, vol: 0.07, type: "highpass", freq: 400, end: 6000 });
  }

  powerEnd() {
    if (!this._ok()) return;
    this.tone({ freq: 520, end: 140, dur: 0.4, type: "triangle", vol: 0.09 });
  }

  hurt() {
    if (!this._ok()) return;
    this.tone({ freq: 180, end: 55, dur: 0.34, type: "sawtooth", vol: 0.2 });
    this.noise({ dur: 0.32, vol: 0.2, type: "lowpass", freq: 1600, end: 180 });
    this.tone({ freq: 90, end: 45, dur: 0.45, type: "sine", vol: 0.2, delay: 0.03 });
  }

  orbFire() {
    if (!this._ok()) return;
    this.tone({ freq: 260, end: 95, dur: 0.28, type: "sawtooth", vol: 0.055 });
    this.tone({ freq: 130, end: 60, dur: 0.32, type: "sine", vol: 0.08, delay: 0.02 });
  }

  orbPop() {
    if (!this._ok()) return;
    this.noise({ dur: 0.12, vol: 0.1, type: "bandpass", freq: 700, end: 2000 });
  }

  levelClear(level = 1) {
    if (!this._ok()) return;
    const scale = [523, 659, 784, 1046, 1318];
    scale.forEach((f, i) => {
      this.tone({
        freq: f,
        dur: 0.22,
        type: "triangle",
        vol: 0.1,
        delay: i * 0.1,
      });
      this.tone({
        freq: f / 2,
        dur: 0.24,
        type: "sine",
        vol: 0.07,
        delay: i * 0.1,
      });
    });
    this.noise({ dur: 0.7, vol: 0.05, type: "highpass", freq: 1200, end: 7000, delay: 0.1 });
  }

  gameOver() {
    if (!this._ok()) return;
    const notes = [392, 330, 262, 196, 131];
    notes.forEach((f, i) =>
      this.tone({
        freq: f,
        end: f * 0.86,
        dur: 0.34,
        type: "sawtooth",
        vol: 0.1,
        delay: i * 0.16,
      })
    );
    this.noise({ dur: 1.1, vol: 0.12, type: "lowpass", freq: 1200, end: 90 });
  }

  click() {
    if (!this._ok()) return;
    this.tone({ freq: 880, end: 1320, dur: 0.05, type: "square", vol: 0.05 });
  }

  startGame() {
    if (!this._ok()) return;
    this.tone({ freq: 196, end: 392, dur: 0.16, type: "sawtooth", vol: 0.08 });
    this.tone({ freq: 523, dur: 0.28, type: "triangle", vol: 0.08, delay: 0.1 });
  }

  heartbeat() {
    if (!this._ok()) return;
    this.tone({ freq: 70, end: 40, dur: 0.18, type: "sine", vol: 0.16 });
    this.tone({ freq: 62, end: 36, dur: 0.16, type: "sine", vol: 0.11, delay: 0.14 });
  }

  startAmbience() {
    if (!this._ok() || this.ambience) return;
    const ctx = this.ctx;
    const group = ctx.createGain();
    group.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 160;
    filter.Q.value = 3;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 27.5;
    const g1 = ctx.createGain();
    g1.gain.value = 0.05;
    const g2 = ctx.createGain();
    g2.gain.value = 0.09;
    osc1.connect(g1);
    g1.connect(filter);
    osc2.connect(g2);
    g2.connect(filter);
    filter.connect(group);
    group.connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    osc1.start();
    osc2.start();
    lfo.start();
    group.gain.setTargetAtTime(0.4, ctx.currentTime, 1.2);
    this.ambience = { group, filter, osc1, osc2, lfo, g1, g2 };
    this.setFrenzy(false);
  }

  stopAmbience() {
    if (!this.ambience || !this.ctx) return;
    const a = this.ambience;
    this.ambience = null;
    const t = this.ctx.currentTime;
    a.group.gain.cancelScheduledValues(t);
    a.group.gain.setTargetAtTime(0, t, 0.25);
    setTimeout(() => {
      try {
        a.osc1.stop();
        a.osc2.stop();
        a.lfo.stop();
      } catch {}
    }, 700);
  }

  setFrenzy(on) {
    if (!this.ambience || !this.ctx) return;
    const t = this.ctx.currentTime;
    const a = this.ambience;
    a.filter.frequency.setTargetAtTime(on ? 520 : 160, t, 0.25);
    a.osc1.detune.setTargetAtTime(on ? 40 : 0, t, 0.3);
    a.osc2.detune.setTargetAtTime(on ? -30 : 0, t, 0.3);
    a.g1.gain.setTargetAtTime(on ? 0.075 : 0.05, t, 0.3);
  }
}
