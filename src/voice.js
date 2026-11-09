/**
 * Capa de voz local simulada.
 * Usa la síntesis de voz del navegador como aproximación al motor Piper TTS
 * que correría dentro del Raspberry Pi 5. No interviene ningún servicio remoto.
 */
export class VoiceSystem {
  constructor({ onStart, onEnd, onError } = {}) {
    this.enabled = true;
    this.speaking = false;
    this.currentPriority = 0;
    this.voice = null;
    this.onStart = onStart || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onError = onError || (() => {});
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.synth = this.supported ? window.speechSynthesis : null;
    this.lastSpoken = '';
    this.lastSpokenAt = 0;
    this.fallbackTimer = null;

    if (this.supported) {
      this.loadVoices();
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices.length) return;
    const spanish = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
    const preferred = [
      /google español/i,
      /m[oó]nica/i,
      /paulina/i,
      /helena/i,
      /laura/i,
      /sabina/i,
      /elvira/i,
      /jorge/i,
      /diego/i,
      /spanish/i,
    ];
    let chosen = null;
    for (const re of preferred) {
      chosen = spanish.find((v) => re.test(v.name));
      if (chosen) break;
    }
    this.voice = chosen || spanish[0] || voices.find((v) => v.default) || voices[0];
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  cancel() {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
    }
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.speaking = false;
    this.onEnd();
  }

  /**
   * @param {string} text
   * @param {{priority?: number, force?: boolean, onDone?: Function}} options
   */
  speak(text, { priority = 1, force = false } = {}) {
    if (!text || !this.enabled) return false;
    if (!force && this.speaking && priority < this.currentPriority) return false;
    if (!force && this.speaking && priority === this.currentPriority) return false;

    this.currentPriority = priority;
    this.lastSpoken = text;
    this.lastSpokenAt = performance.now();
    this.speaking = true;
    this.onStart(text);

    if (!this.synth) {
      this.fallbackTimer = setTimeout(() => {
        this.speaking = false;
        this.onEnd();
      }, Math.max(1400, text.length * 62));
      return true;
    }

    try {
      this.synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      if (this.voice) utter.voice = this.voice;
      utter.lang = this.voice?.lang || 'es-ES';
      utter.rate = 1.04;
      utter.pitch = 1;
      utter.volume = 1;
      utter.onstart = () => {
        this.speaking = true;
        this.onStart(text);
      };
      utter.onend = () => {
        this.speaking = false;
        this.onEnd();
      };
      utter.onerror = (event) => {
        this.speaking = false;
        this.onError(event);
        this.onEnd();
      };
      this.synth.speak(utter);
      // Respaldo por si el navegador no dispara onend
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = setTimeout(() => {
        if (this.speaking) {
          this.speaking = false;
          this.onEnd();
        }
      }, Math.max(2600, text.length * 75));
      return true;
    } catch {
      this.speaking = false;
      this.onEnd();
      return false;
    }
  }
}

/** Pulsos sonoros de proximidad (sonar), generados con WebAudio. */
export class Sonar {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastPing = 0;
  }

  ensure() {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setEnabled(v) {
    this.enabled = v;
  }

  ping(distance = 2, pan = 0) {
    if (!this.enabled) return;
    if (!this.ensure()) return;
    const now = performance.now();
    if (now - this.lastPing < 340) return;
    this.lastPing = now;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    const freq = 520 + Math.min(1, Math.max(0, (distance - 0.4) / 4)) * 380;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.14);

    const near = Math.max(0.04, 1 - Math.min(1, distance / 4.5));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16 * near + 0.02, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(gain);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }

    osc.start(t);
    osc.stop(t + 0.24);
  }

  chime() {
    if (!this.enabled) return;
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.05, t + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.4);
    });
  }

  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend();
  }
}
