const CIRC = 2 * Math.PI * 42;

export class Telemetry {
  constructor() {
    this.battery = 87.4;
    this.latency = 44;
    this.cpu = 36;
    this.temp = 51;
    this.fps = 60;
    this.fpsSmooth = 60;
    this.session = 0;
    this.history = new Array(42).fill(48);
    this.uiTimer = 0;
    this.sparkTimer = 0;
    this.lowWarned = false;

    this.el = {
      batteryPct: document.getElementById('battery-pct'),
      batteryRing: document.getElementById('battery-ring'),
      batteryDial: document.querySelector('.battery-dial'),
      batteryEta: document.getElementById('battery-eta'),
      batteryPack: document.getElementById('battery-pack'),
      batteryDraw: document.getElementById('battery-draw'),
      batteryStatus: document.getElementById('battery-status'),
      latency: document.getElementById('latency'),
      cpu: document.getElementById('cpu'),
      temp: document.getElementById('temp'),
      tempBar: document.getElementById('temp-bar'),
      fps: document.getElementById('fps'),
      fpsBar: document.getElementById('fps-bar'),
      session: document.getElementById('session-time'),
      cores: [...document.querySelectorAll('#cores i')],
      spark: document.getElementById('latency-spark'),
      pipelineTag: document.getElementById('pipeline-tag'),
    };
    this.cores = [30, 42, 25, 38];
    this.sparkCtx = this.el.spark ? this.el.spark.getContext('2d') : null;
    this.pipelineTimers = new Map();
  }

  pulse(node, duration = 900) {
    const el = document.querySelector(`.pipeline li[data-node="${node}"]`);
    if (!el) return;
    el.classList.add('active');
    clearTimeout(this.pipelineTimers.get(node));
    const timer = setTimeout(() => {
      el.classList.remove('active');
    }, duration);
    this.pipelineTimers.set(node, timer);
  }

  update(dt, { fps = 60, scan = null, speaking = false, moving = false, lidarOn = true } = {}) {
    this.session += dt;

    // Batería
    const drain = 0.0016 + (moving ? 0.0005 : 0) + (speaking ? 0.0004 : 0);
    this.battery = Math.max(3, this.battery - drain * dt);

    // Latencia local
    const target = 32 + Math.random() * 9 + (speaking ? 9 : 0) + (scan?.points > 300 ? 5 : 0) + (fps < 45 ? 8 : 0);
    this.latency += (target - this.latency) * Math.min(1, dt * 3.2);
    this.history.push(this.latency);
    if (this.history.length > 42) this.history.shift();

    // CPU
    const cpuTarget = 24 + Math.random() * 9 + (lidarOn ? 13 : 0) + (moving ? 8 : 0) + (speaking ? 7 : 0);
    this.cpu += (cpuTarget - this.cpu) * Math.min(1, dt * 1.6);
    this.cpu = Math.min(96, Math.max(12, this.cpu));

    // Temperatura
    const tempTarget = 42 + this.cpu * 0.19;
    this.temp += (tempTarget - this.temp) * Math.min(1, dt * 0.25);

    // FPS
    this.fpsSmooth += (fps - this.fpsSmooth) * Math.min(1, dt * 4);

    for (let i = 0; i < this.cores.length; i++) {
      const base = this.cpu * (0.7 + i * 0.08);
      const jitter = (Math.random() - 0.5) * 18;
      this.cores[i] += (base + jitter - this.cores[i]) * Math.min(1, dt * 2.4);
    }

    this.uiTimer += dt;
    if (this.uiTimer > 0.16) {
      this.uiTimer = 0;
      this.render(scan, speaking);
    }

    this.sparkTimer += dt;
    if (this.sparkTimer > 0.1) {
      this.sparkTimer = 0;
      this.drawSpark();
    }
  }

  render(scan, speaking) {
    const el = this.el;
    const pct = this.battery;
    if (el.batteryPct) el.batteryPct.textContent = String(Math.round(pct));
    if (el.batteryRing) {
      const offset = CIRC * (1 - pct / 100);
      el.batteryRing.style.strokeDashoffset = String(offset);
    }
    if (el.batteryDial) {
      el.batteryDial.classList.toggle('warn', pct < 25 && pct >= 12);
      el.batteryDial.classList.toggle('danger', pct < 12);
    }
    if (el.batteryEta) {
      const hours = pct / (0.0016 * 3600);
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      el.batteryEta.textContent = `${h} h ${String(m).padStart(2, '0')} min`;
    }
    if (el.batteryPack) el.batteryPack.textContent = `2S · ${(7.9 - (100 - pct) * 0.0032).toFixed(1)} V`;
    if (el.batteryDraw) el.batteryDraw.textContent = `${(1.18 + this.cpu * 0.006 + (this.battery > 80 ? 0.08 : 0)).toFixed(2)} A`;
    if (el.batteryStatus) {
      const status = pct < 12 ? 'Crítica' : pct < 25 ? 'Baja' : 'Nominal';
      el.batteryStatus.textContent = status;
      el.batteryStatus.className = pct < 25 ? '' : 'ok';
    }

    if (el.latency) el.latency.textContent = String(Math.round(this.latency));
    if (el.cpu) el.cpu.textContent = String(Math.round(this.cpu));
    if (el.temp) el.temp.textContent = String(Math.round(this.temp));
    if (el.tempBar) el.tempBar.style.width = `${Math.min(100, (this.temp / 85) * 100)}%`;
    if (el.fps) el.fps.textContent = String(Math.round(this.fpsSmooth));
    if (el.fpsBar) el.fpsBar.style.width = `${Math.min(100, (this.fpsSmooth / 60) * 100)}%`;
    if (el.cores) {
      el.cores.forEach((bar, i) => {
        bar.style.setProperty('--lvl', `${Math.min(100, Math.max(5, this.cores[i]))}%`);
      });
    }
    if (el.session) {
      const total = Math.floor(this.session);
      const mm = String(Math.floor(total / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      el.session.textContent = `${mm}:${ss}`;
    }
    if (el.pipelineTag) {
      el.pipelineTag.textContent = `${Math.max(2, Math.round(this.latency * 0.22))} ms`;
    }

    // Actividad del pipeline
    const slam = document.querySelector('.pipeline li[data-node="slam"]');
    if (slam) slam.classList.toggle('active', Boolean(scan && scan.points > 60));
    const fusion = document.querySelector('.pipeline li[data-node="fusion"]');
    if (fusion) fusion.classList.toggle('active', true);
    const tts = document.querySelector('.pipeline li[data-node="tts"]');
    if (tts) tts.classList.toggle('active', speaking);
  }

  drawSpark() {
    const ctx = this.sparkCtx;
    if (!ctx) return;
    const w = 120;
    const h = 26;
    ctx.clearRect(0, 0, w, h);
    const values = this.history;
    const min = 20;
    const max = 90;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (h - 3) - 1.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(62, 224, 208, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Relleno
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(62, 224, 208, 0.18)');
    grad.addColorStop(1, 'rgba(62, 224, 208, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    const last = values[values.length - 1];
    const y = h - ((Math.min(max, Math.max(min, last)) - min) / (max - min)) * (h - 3) - 1.5;
    ctx.beginPath();
    ctx.arc(w - 1.5, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#3ee0d0';
    ctx.fill();
  }
}
