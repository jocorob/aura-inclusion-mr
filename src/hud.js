import * as THREE from 'three';

export const SPECS = {
  harness: {
    eyebrow: 'COMPONENTE 01 · ESTRUCTURA',
    title: 'Arnés de pecho',
    body: 'Sistema de sujeción de cuatro puntos con correas de nailon de alta densidad, ajustadores metálicos y placa dorsal de reparto de carga. Mantiene el conjunto estable sobre el esternón para que el escaneo sea consistente al caminar.',
    rows: [
      ['Peso', '212 g'],
      ['Ajuste', '4 puntos'],
      ['Material', 'Nailon 1680D'],
      ['Tallas', 'S – XL'],
    ],
  },
  box: {
    eyebrow: 'COMPONENTE 02 · CÓMPUTO',
    title: 'Unidad AURA',
    body: 'Núcleo de cómputo local. Ejecuta la fusión sensorial, el SLAM, la detección de obstáculos y la síntesis de voz sin enviar un solo byte a la nube. La carcasa de policarbonato disipa el calor y protege los puertos.',
    rows: [
      ['SoC', 'BCM2712 · 4×A76'],
      ['Memoria', '8 GB LPDDR4X'],
      ['Batería', '2S · 5 000 mAh'],
      ['Autonomía', '≈ 18 h'],
    ],
  },
  camera: {
    eyebrow: 'COMPONENTE 03 · VISIÓN',
    title: 'Cámara frontal',
    body: 'Módulo en carcasa acrílica transparente con sensor de 12 MP y lente gran angular. Aporta profundidad estéreo, lectura de texto y detección de obstáculos bajos que el plano del LiDAR no cubre.',
    rows: [
      ['Sensor', 'IMX708 · 12 MP'],
      ['Campo', '120° · HDR'],
      ['Video', '1080p30'],
      ['Montaje', 'Acrílico · USB-C'],
    ],
  },
  lidar: {
    eyebrow: 'COMPONENTE 04 · PERCEPCIÓN',
    title: 'LiDAR ToF RPLIDAR C1',
    body: 'Escáner láser rotacional de tiempo de vuelo montado sobre la unidad. Barre 360° diez veces por segundo y entrega la nube de puntos que alimenta el mapa espacial y las alertas de proximidad.',
    rows: [
      ['Alcance', '0.05 – 12 m'],
      ['Frecuencia', '10 Hz'],
      ['Muestreo', '5 000 pts/s'],
      ['Interfaz', 'UART 460 800'],
    ],
  },
};

const DETECTION_TYPES = ['obstáculo', 'estructura', 'mobiliario'];

export class HUD {
  constructor() {
    this.radarCanvas = document.getElementById('radar');
    this.radarCtx = this.radarCanvas?.getContext('2d');
    this.waveCanvas = document.getElementById('waveform');
    this.waveCtx = this.waveCanvas?.getContext('2d');
    this.utteranceEl = document.getElementById('utterance');
    this.logEl = document.getElementById('voice-log');
    this.zoneEl = document.getElementById('zone-label')?.querySelector('b');
    this.zoneWrap = document.getElementById('zone-label');
    this.radarMinEl = document.getElementById('radar-min');
    this.toastEl = document.getElementById('toast');
    this.voiceToggle = document.getElementById('voice-toggle');
    this.visionLayer = document.getElementById('vision-layer');
    this.specCard = document.getElementById('spec-card');
    this.pipelineTag = document.getElementById('pipeline-tag');
    this.contextCard = document.getElementById('context-card');
    this.contextEyebrow = document.getElementById('context-eyebrow');
    this.contextTitle = document.getElementById('context-title');
    this.contextText = document.getElementById('context-text');
    this.contextItems = document.getElementById('context-items');
    this.contextActions = document.getElementById('context-actions');
    this.contextKey = null;
    this.onContextClose = null;

    this.hotspots = [...document.querySelectorAll('.hotspot')];
    this.time = 0;
    this.radarAcc = 0;
    this.waveAcc = 0;
    this.detAcc = 0;
    this.toastTimer = null;
    this.zoneName = '';
    this.detPool = [];
    this.speaking = false;
    this.annotations = true;
    this.elapsed = 0;

    this.buildDetPool();
    this.bindSpec();
    document.getElementById('context-close')?.addEventListener('click', () => this.onContextClose?.());
  }

  buildDetPool() {
    if (!this.visionLayer) return;
    for (let i = 0; i < 6; i++) {
      const div = document.createElement('div');
      div.className = 'det';
      div.style.opacity = '0';
      div.style.display = 'none';
      const label = document.createElement('span');
      label.className = 'det-label';
      div.appendChild(label);
      this.visionLayer.appendChild(div);
      this.detPool.push({ div, label });
    }
  }

  bindSpec() {
    for (const btn of this.hotspots) {
      btn.addEventListener('click', () => this.showSpec(btn.dataset.part));
    }
    this.specCard?.querySelector('.spec-close')?.addEventListener('click', () => this.hideSpec());
  }

  setMode(mode) {
    document.body.classList.toggle('mode-model', mode === 'model');
    document.body.classList.toggle('mode-sim', mode === 'sim');
    for (const btn of this.hotspots) btn.hidden = mode !== 'model';
    if (mode !== 'model') this.hideSpec();
  }

  setCameraMode(cam) {
    document.body.classList.toggle('cam-pov', cam === 'pov');
    document.querySelectorAll('#camera-seg button').forEach((b) => {
      b.classList.toggle('active', b.dataset.cam === cam);
    });
  }

  setEnv(kind) {
    document.querySelectorAll('#env-seg button').forEach((b) => {
      b.classList.toggle('active', b.dataset.env === kind);
    });
  }

  setVoiceEnabled(enabled) {
    if (!this.voiceToggle) return;
    this.voiceToggle.classList.toggle('on', enabled);
    this.voiceToggle.textContent = enabled ? 'Voz activa' : 'Voz apagada';
    this.voiceToggle.setAttribute('aria-pressed', String(enabled));
  }

  setLidarEnabled(enabled) {
    document.getElementById('lidar-toggle')?.classList.toggle('active', enabled);
    const state = document.getElementById('lidar-state');
    if (state) {
      state.textContent = enabled ? 'activo' : 'en pausa';
      state.classList.toggle('off', !enabled);
    }
    const badge = document.getElementById('lidar-hz-badge');
    if (badge) badge.textContent = enabled ? '10 Hz' : '0 Hz';
    const radarMode = document.getElementById('radar-mode');
    if (radarMode) radarMode.textContent = enabled ? '360°' : '—';
  }

  setUtterance(text, speaking = false) {
    if (!this.utteranceEl) return;
    this.utteranceEl.textContent = `«${text}»`;
    this.utteranceEl.classList.toggle('speaking', speaking);
    this.speaking = speaking;
    document.querySelector('.pipeline li[data-node="tts"]')?.classList.toggle('active', speaking);
  }

  log(message, level = 'info') {
    if (!this.logEl) return;
    this.logEl.querySelector('.empty')?.remove();
    const li = document.createElement('li');
    li.className = level;
    const t = document.createElement('time');
    const total = Math.floor(this.elapsed);
    t.textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    const span = document.createElement('span');
    span.textContent = message;
    li.append(t, span);
    this.logEl.prepend(li);
    while (this.logEl.children.length > 7) this.logEl.lastElementChild.remove();
  }

  toast(message, duration = 2600) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), duration);
  }

  setZone(name) {
    if (!name || name === this.zoneName) return;
    this.zoneName = name;
    if (this.zoneEl) this.zoneEl.textContent = name;
    if (this.zoneWrap) {
      this.zoneWrap.animate(
        [
          { transform: 'translateX(-50%) translateY(-4px)', opacity: 0.2 },
          { transform: 'translateX(-50%) translateY(0)', opacity: 1 },
        ],
        { duration: 420, easing: 'ease-out' }
      );
    }
  }

  showSpec(part) {
    const data = SPECS[part];
    if (!data || !this.specCard) return;
    document.getElementById('spec-eyebrow').textContent = data.eyebrow;
    document.getElementById('spec-title').textContent = data.title;
    document.getElementById('spec-body').textContent = data.body;
    const dl = document.getElementById('spec-list');
    dl.innerHTML = '';
    for (const [k, v] of data.rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    this.specCard.hidden = false;
  }

  hideSpec() {
    if (this.specCard) this.specCard.hidden = true;
  }

  showContext(key, { eyebrow = 'CERCA DE TI', title = '', text = '', items = [], actions = [] } = {}) {
    if (!this.contextCard) return;
    if (this.contextKey === key && !this.contextCard.hidden) return;
    this.contextKey = key;
    this.contextEyebrow.textContent = eyebrow;
    this.contextTitle.textContent = title;
    this.contextText.textContent = text;

    this.contextItems.innerHTML = '';
    for (const item of items) {
      const chip = document.createElement('span');
      chip.className = 'ctx-chip';
      const b = document.createElement('b');
      b.textContent = item.label;
      chip.appendChild(b);
      if (item.meta) {
        const em = document.createElement('em');
        em.textContent = item.meta;
        chip.appendChild(em);
      }
      this.contextItems.appendChild(chip);
    }
    this.contextItems.hidden = items.length === 0;

    this.contextActions.innerHTML = '';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-action';
      if (action.primary) btn.classList.add('primary');
      if (action.active) btn.classList.add('active');
      if (action.hint) {
        const kbd = document.createElement('kbd');
        kbd.textContent = action.hint;
        btn.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.textContent = action.label;
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        this.contextKey = null;
        action.onClick?.();
      });
      this.contextActions.appendChild(btn);
    }
    this.contextActions.hidden = actions.length === 0;

    this.contextCard.hidden = false;
    document.body.classList.add('context-open');
  }

  hideContext() {
    if (!this.contextCard || this.contextCard.hidden) {
      this.contextKey = null;
      return;
    }
    this.contextCard.hidden = true;
    this.contextKey = null;
    this.contextItems.innerHTML = '';
    this.contextActions.innerHTML = '';
    document.body.classList.remove('context-open');
  }

  updateHotspots(rig, camera, mode, activePart) {
    for (const btn of this.hotspots) {
      if (mode !== 'model' || !this.annotations) {
        btn.style.display = 'none';
        continue;
      }
      const local = rig.hotspotLocals[btn.dataset.part];
      if (!local) continue;
      const pos = rig.root.localToWorld(local.clone());
      const projected = pos.project(camera);
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15;
      btn.style.display = onScreen ? 'flex' : 'none';
      if (onScreen) {
        const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
        btn.style.left = `${x}px`;
        btn.style.top = `${y}px`;
        btn.style.opacity = projected.z > 0.999 ? '0.35' : '1';
        const isActive = activePart === btn.dataset.part;
        btn.style.zIndex = isActive ? 26 : 24;
      }
    }
  }

  updateRadar(lidar, dt) {
    this.radarAcc += dt;
    if (this.radarAcc < 0.055 || !this.radarCtx) return;
    this.radarAcc = 0;

    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxRange = 3.6;
    const radius = w * 0.43;

    ctx.clearRect(0, 0, w, h);

    // Retícula
    ctx.strokeStyle = 'rgba(62, 224, 208, 0.1)';
    ctx.lineWidth = 1.5;
    for (const r of [1, 2, 3]) {
      ctx.beginPath();
      ctx.arc(cx, cy, (r / maxRange) * radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    ctx.fillStyle = 'rgba(132, 148, 170, 0.4)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    for (const r of [1, 2, 3]) {
      ctx.fillText(`${r} m`, cx + 4, cy - (r / maxRange) * radius - 6);
    }

    const scan = lidar.scan;
    if (lidar.enabled && scan?.contour?.length) {
      const yaw = lidar.forwardYaw;
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);

      // Barrido
      const sweepA = lidar.scanAngle;
      const start = sweepA - 0.95 - Math.PI / 2;
      const end = sweepA - Math.PI / 2;
      const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
      grad.addColorStop(0, 'rgba(62, 224, 208, 0.22)');
      grad.addColorStop(1, 'rgba(62, 224, 208, 0)');
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(sweepA) * radius, cy - Math.cos(sweepA) * radius);
      ctx.strokeStyle = 'rgba(160, 255, 245, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Puntos
      for (const p of scan.contour) {
        const lateral = p.x * cosY - p.z * sinY;
        const forward = p.x * sinY + p.z * cosY;
        if (forward < -0.2) continue;
        const sx = cx + (lateral / maxRange) * radius;
        const sy = cy - (forward / maxRange) * radius;
        if (Math.hypot(sx - cx, sy - cy) > radius * 1.02) continue;
        if (p.d < 1.0) ctx.fillStyle = 'rgba(255, 77, 94, 0.95)';
        else if (p.d < 2.2) ctx.fillStyle = 'rgba(247, 185, 85, 0.85)';
        else ctx.fillStyle = 'rgba(62, 224, 208, 0.55)';
        ctx.beginPath();
        ctx.arc(sx, sy, p.d < 2.2 ? 3 : 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sector frontal
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius * 0.94, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(232, 65, 79, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Jugador
    ctx.beginPath();
    ctx.moveTo(cx, cy - 13);
    ctx.lineTo(cx + 9, cy + 9);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx - 9, cy + 9);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240, 247, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(62, 224, 208, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (this.radarMinEl) {
      this.radarMinEl.textContent = isFinite(scan?.min) ? scan.min.toFixed(2) : '—';
    }
  }

  updateWaveform(dt) {
    this.waveAcc += dt;
    if (this.waveAcc < 0.032 || !this.waveCtx) return;
    const step = this.waveAcc;
    this.waveAcc = 0;
    this.time += step;

    const ctx = this.waveCtx;
    const w = this.waveCanvas.width;
    const h = this.waveCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = 54;
    const gap = 3;
    const barW = (w - gap * (bars - 1)) / bars;
    const t = this.time;

    for (let i = 0; i < bars; i++) {
      const x = i * (barW + gap);
      const center = (i - bars / 2) / (bars / 2);
      const envelope = Math.cos(center * Math.PI * 0.5) ** 1.4;
      let amp;
      if (this.speaking) {
        amp = (0.32 + Math.abs(Math.sin(t * 5.2 + i * 0.55)) * 0.5 + Math.random() * 0.18) * envelope;
      } else {
        amp = (0.1 + Math.abs(Math.sin(t * 1.4 + i * 0.32)) * 0.1) * envelope;
      }
      const bh = Math.max(2, amp * h * 0.9);
      const y = h / 2 - bh / 2;
      const grad = ctx.createLinearGradient(0, y, 0, y + bh);
      if (this.speaking) {
        grad.addColorStop(0, 'rgba(190, 255, 248, 0.9)');
        grad.addColorStop(0.5, 'rgba(62, 224, 208, 0.95)');
        grad.addColorStop(1, 'rgba(190, 255, 248, 0.9)');
      } else {
        grad.addColorStop(0, 'rgba(62, 224, 208, 0.35)');
        grad.addColorStop(0.5, 'rgba(62, 224, 208, 0.2)');
        grad.addColorStop(1, 'rgba(62, 224, 208, 0.35)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      const r = barW / 2;
      ctx.roundRect(x, y, barW, bh, Math.min(r, 2));
      ctx.fill();
    }
  }

  updateDetections(camera, obstacles, sensorPos, active) {
    if (!this.visionLayer) return;
    if (!active) {
      for (const item of this.detPool) {
        item.div.style.display = 'none';
        item.div.style.opacity = '0';
      }
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const items = [];
    const v = new THREE.Vector3();
    const box = new THREE.Box3();

    for (const obs of obstacles) {
      if (!obs.mesh) continue;
      box.setFromObject(obs.mesh);
      const center = box.getCenter(new THREE.Vector3());
      const distance = center.distanceTo(sensorPos);
      if (distance > 9.5 || distance < 0.35) continue;
      const to = center.clone().sub(camera.position);
      if (to.dot(forward) <= 0.1) continue;
      const angle = to.clone().normalize().angleTo(forward);
      if (angle > 1.1) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let visible = true;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        v.applyMatrix4(camera.matrixWorldInverse);
        if (v.z > -0.1) {
          visible = false;
          break;
        }
        v.applyMatrix4(camera.projectionMatrix);
        const sx = (v.x * 0.5 + 0.5) * width;
        const sy = (-v.y * 0.5 + 0.5) * height;
        minX = Math.min(minX, sx);
        minY = Math.min(minY, sy);
        maxX = Math.max(maxX, sx);
        maxY = Math.max(maxY, sy);
      }
      if (!visible) continue;

      minX = Math.max(4, minX);
      minY = Math.max(24, minY);
      maxX = Math.min(width - 4, maxX);
      maxY = Math.min(height - 4, maxY);
      const bw = maxX - minX;
      const bh = maxY - minY;
      if (bw < 26 || bh < 26 || bw > width * 1.2) continue;
      if (maxX < 0 || minX > width) continue;

      const seed = (obs.label || '').length + Math.floor(center.x * 7 + center.z * 3);
      const confidence = 0.74 + ((Math.sin(seed) + 1) / 2) * 0.24;
      items.push({ x: minX, y: minY, w: bw, h: bh, distance, label: obs.label || 'obstáculo', confidence, low: obs.low });
    }

    items.sort((a, b) => a.distance - b.distance);
    const limit = Math.min(this.detPool.length, 5);
    for (let i = 0; i < this.detPool.length; i++) {
      const item = this.detPool[i];
      const data = items[i];
      if (!data || i >= limit) {
        if (item.div.style.display !== 'none') {
          item.div.style.display = 'none';
          item.div.style.opacity = '0';
        }
        continue;
      }
      item.div.style.display = 'block';
      item.div.style.opacity = '1';
      item.div.style.left = `${data.x}px`;
      item.div.style.top = `${data.y}px`;
      item.div.style.width = `${data.w}px`;
      item.div.style.height = `${data.h}px`;
      item.div.className = `det${data.distance < 1.25 ? ' danger' : ''}`;
      item.label.innerHTML = `${data.label}${data.low ? ' · bajo' : ''} <em>${data.distance.toFixed(1)} m</em>`;
    }
  }

  tick(dt) {
    this.elapsed += dt;
  }

  setFps(fps) {
    // El valor fino se gestiona en Telemetry
  }
}
