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
    // Cola de frases: una sola locución activa y el resto espera turno.
    this.queue = [];
    this.current = null;
    this.token = 0;
    this.queueOrder = 0;

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
    this.token += 1;
    this._clearFallback();
    this.queue.length = 0;
    this.current = null;
    this.currentPriority = 0;
    this.speaking = false;
    this.onEnd();
  }

  _clearFallback() {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  _enqueue(item) {
    if (this.current && item.text === this.current.text) return true;
    if (this.queue.some((queued) => queued.text === item.text)) return true;
    item.order = ++this.queueOrder;
    this.queue.push(item);
    // La cola nunca crece sin límite: primero se descarta lo prescindible,
    // sin eliminar una descripción protegida mientras haya otra opción.
    if (this.queue.length > 8) {
      let drop = this.queue.findIndex((queued) => queued.interruptible && queued.priority < 3);
      if (drop < 0) drop = this.queue.findIndex((queued) => queued.interruptible);
      if (drop < 0) drop = this.queue.findIndex((queued) => queued.priority < 3);
      if (drop < 0) drop = 0;
      this.queue.splice(drop, 1);
    }
    return true;
  }

  _start(item) {
    this._clearFallback();
    const token = ++this.token;
    this.current = item;
    this.currentPriority = item.priority;
    this.lastSpoken = item.text;
    this.lastSpokenAt = performance.now();
    this.speaking = true;
    this.onStart(item.text);

    if (!this.synth) {
      this.fallbackTimer = setTimeout(() => this._finish(token), Math.max(1400, item.text.length * 62));
      return true;
    }

    try {
      // El navegador solo reproduce una locución: se cancela la anterior para
      // que la nueva empiece limpia y sin solaparse.
      this.synth.cancel();
      const utter = new SpeechSynthesisUtterance(item.text);
      if (this.voice) utter.voice = this.voice;
      utter.lang = this.voice?.lang || 'es-ES';
      utter.rate = 1.04;
      utter.pitch = 1;
      utter.volume = 1;
      utter.onstart = () => {
        if (token === this.token) this.speaking = true;
      };
      utter.onend = () => this._finish(token);
      utter.onerror = (event) => {
        if (token !== this.token) return;
        this.onError(event);
        this._finish(token);
      };
      this.synth.speak(utter);
      // Respaldo por si el navegador no dispara onend.
      this.fallbackTimer = setTimeout(
        () => this._finish(token),
        Math.max(2600, item.text.length * 75),
      );
      return true;
    } catch {
      if (token === this.token) this._finish(token);
      return false;
    }
  }

  _finish(token) {
    if (token !== this.token || !this.current) return;
    const item = this.current;
    this._clearFallback();
    this.current = null;
    this.currentPriority = 0;
    this.speaking = false;
    this.onEnd();
    try {
      item.onDone?.();
    } catch {
      /* ignore */
    }
    this._drain();
  }

  _drain() {
    if (this.speaking || this.current || !this.queue.length) return;
    this.queue.sort((a, b) => b.priority - a.priority || a.order - b.order);
    this._start(this.queue.shift());
  }

  /**
   * @param {string} text
   * @param {{priority?: number, onDone?: Function, interruptible?: boolean}} options
   */
  speak(text, { priority = 1, onDone, interruptible = true } = {}) {
    if (!text || !this.enabled) return false;
    const item = { text, priority, onDone, interruptible, order: 0 };

    if (this.speaking) {
      // Una descripción marcada como protegida termina sin cortes. En los
      // demás casos, lo crítico manda; prioridad 2 puede cortar información.
      const canInterrupt = this.current?.interruptible !== false
        && (priority >= 3
          || (priority > this.currentPriority && this.currentPriority < 2));
      if (!canInterrupt) return this._enqueue(item);

      this.token += 1;
      this._clearFallback();
      try {
        this.synth?.cancel();
      } catch {
        /* ignore */
      }
      this.current = null;
      this.currentPriority = 0;
      this.speaking = false;
      this.onEnd();
      return this._start(item);
    }

    return this._start(item);
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
