import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/* ---------- Lienzo y texturas procedurales ---------- */

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas, { repeat = null, srgb = true, anisotropy = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

export function drawTracked(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx - x;
}

export function makeLogoTexture() {
  const { canvas, ctx } = makeCanvas(1024, 300);
  ctx.clearRect(0, 0, 1024, 300);
  ctx.font = '300 190px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#e8414f';
  ctx.textBaseline = 'middle';
  const text = 'AURA';
  const tracking = 34;
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + tracking;
  width -= tracking;
  ctx.shadowColor = 'rgba(232, 65, 79, 0.45)';
  ctx.shadowBlur = 16;
  drawTracked(ctx, text, (1024 - width) / 2, 152, tracking);
  return canvasTexture(canvas, { anisotropy: 8 });
}

export function makeRplidarTexture() {
  const { canvas, ctx } = makeCanvas(640, 120);
  ctx.clearRect(0, 0, 640, 120);
  ctx.font = '400 60px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(226, 234, 244, 0.92)';
  ctx.textBaseline = 'middle';
  const width = drawTracked(ctx, 'RPLIDAR', 0, 60, 9);
  drawTracked(ctx, 'RPLIDAR', (640 - width) / 2, 62, 9);
  return canvasTexture(canvas, { anisotropy: 8 });
}

export function makeGrilleTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#0a0c11';
  ctx.fillRect(0, 0, 256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 14; y < 250; y += 15) {
    for (let x = 14; x < 250; x += 15) {
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 162, 178, 0.32)';
      ctx.fill();
    }
  }
  return canvasTexture(canvas);
}

export function makePcbTexture() {
  const { canvas, ctx } = makeCanvas(512, 420);
  const g = ctx.createLinearGradient(0, 0, 512, 420);
  g.addColorStop(0, '#154a38');
  g.addColorStop(0.5, '#0f3d2e');
  g.addColorStop(1, '#0b2f24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 420);

  // Pistas de cobre
  const rng = mulberry32(1337);
  ctx.strokeStyle = 'rgba(198, 158, 76, 0.75)';
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = rng() > 0.75 ? 3 : 1.4;
    ctx.beginPath();
    let x = rng() * 512;
    let y = rng() * 420;
    ctx.moveTo(x, y);
    for (let s = 0; s < 3 + Math.floor(rng() * 4); s++) {
      if (rng() > 0.5) x += (rng() - 0.5) * 180;
      else y += (rng() - 0.5) * 150;
      x = clamp(x, 8, 504);
      y = clamp(y, 8, 412);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Pads dorados
  for (let i = 0; i < 34; i++) {
    const x = 18 + rng() * 476;
    const y = 18 + rng() * 384;
    ctx.beginPath();
    ctx.arc(x, y, 3 + rng() * 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226, 191, 96, 0.9)';
    ctx.fill();
  }
  // Componentes
  const chip = (x, y, w, h) => {
    ctx.fillStyle = '#121418';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(200, 210, 220, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  chip(60, 64, 130, 90);
  chip(340, 240, 96, 78);
  chip(210, 130, 52, 52);
  // Serigrafía
  ctx.fillStyle = 'rgba(232, 240, 245, 0.5)';
  ctx.font = '500 15px monospace';
  ctx.fillText('AURA · CAM-I  rev.C', 52, 40);
  ctx.fillText('IMX708', 68, 178);
  ctx.font = '400 11px monospace';
  ctx.fillText('U7   EN  5V', 344, 336);
  ctx.fillText('MIPI-CSI', 344, 352);
  return canvasTexture(canvas, { anisotropy: 8 });
}

export function makeWeaveTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#191b20';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 6) {
      const shade = 20 + ((x + y) % 3) * 6;
      ctx.fillStyle = `rgb(${shade + 4}, ${shade + 6}, ${shade + 10})`;
      ctx.fillRect(x + ((y / 4) % 2) * 3, y, 5, 3);
    }
  }
  ctx.strokeStyle = 'rgba(110, 118, 130, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  return canvasTexture(canvas, { repeat: [2, 10] });
}

export function makeFloorTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#2a2e36';
  ctx.fillRect(0, 0, 512, 512);
  const rng = mulberry32(42);
  for (let i = 0; i < 9000; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const c = 32 + rng() * 26;
    ctx.fillStyle = `rgba(${c}, ${c + 2}, ${c + 7}, ${0.25 + rng() * 0.4})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  // Losas
  ctx.strokeStyle = 'rgba(12, 14, 18, 0.65)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 256) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 256) {
    ctx.beginPath(); ctx.moveTo(i + 2, 0); ctx.lineTo(i + 2, 512); ctx.stroke();
  }
  return canvasTexture(canvas, { repeat: [4, 6], anisotropy: 8 });
}

export function makeWallTexture() {
  const { canvas, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = '#3d434c';
  ctx.fillRect(0, 0, 256, 512);
  const rng = mulberry32(7);
  for (let i = 0; i < 5000; i++) {
    const c = 55 + rng() * 22;
    ctx.fillStyle = `rgba(${c}, ${c + 3}, ${c + 8}, ${0.12 + rng() * 0.25})`;
    ctx.fillRect(rng() * 256, rng() * 512, 1 + rng() * 2, 1 + rng() * 2);
  }
  // Junta horizontal sutil
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.fillRect(0, 250, 256, 1);
  return canvasTexture(canvas, { repeat: [1, 1] });
}

export function makeGlowTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(150,255,250,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas, { srgb: false });
}

export function makeStudioFloorTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  g.addColorStop(0, '#111823');
  g.addColorStop(0.55, '#0a0f18');
  g.addColorStop(1, '#05080d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const rng = mulberry32(11);
  ctx.fillStyle = 'rgba(120, 180, 220, 0.05)';
  for (let i = 0; i < 260; i++) ctx.fillRect(rng() * 512, rng() * 512, 1, 1);
  return canvasTexture(canvas);
}

export function makeLabelTexture(text, { color = '#bfeee9', size = 64, bg = 'rgba(5, 14, 22, 0.62)', border = 'rgba(62,224,208,0.4)' } = {}) {
  const { canvas, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = bg;
  roundRect(ctx, 6, 6, 500, 116, 18);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  roundRect(ctx, 6, 6, 500, 116, 18);
  ctx.stroke();
  ctx.font = `500 ${size}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  return canvasTexture(canvas);
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* PRNG determinista */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Cinta / correa extrudada a lo largo de una curva ---------- */
/**
 * Genera una geometría de cinta plana (tipo correa de arnés) a lo largo de
 * una curva, controlando la dirección del ancho con un vector de referencia.
 */
export function ribbonGeometry(points, width, thickness, widthAxisHint, segments = 90, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.4);
  const count = segments + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfW = width / 2;
  const halfT = thickness / 2;
  let length = 0;
  let prev = null;

  for (let i = 0; i < count; i++) {
    const t = closed ? i / segments : i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    if (prev) length += p.distanceTo(prev);
    prev = p.clone();

    let w = widthAxisHint.clone().sub(tangent.clone().multiplyScalar(widthAxisHint.dot(tangent)));
    if (w.lengthSq() < 1e-6) w.set(0, 1, 0).sub(tangent.clone().multiplyScalar(tangent.y));
    w.normalize();
    const n = new THREE.Vector3().crossVectors(tangent, w).normalize();

    const corners = [
      [-halfW, -halfT],
      [halfW, -halfT],
      [halfW, halfT],
      [-halfW, halfT],
    ];
    for (const [cw, ct] of corners) {
      positions.push(
        p.x + w.x * cw + n.x * ct,
        p.y + w.y * cw + n.y * ct,
        p.z + w.z * cw + n.z * ct
      );
      uvs.push(cw > 0 ? 1 : 0, length * 3);
    }
  }

  const ringCount = count;
  for (let i = 0; i < ringCount - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      indices.push(a + k, b + k, b + k2);
      indices.push(a + k, b + k2, a + k2);
    }
  }
  // Tapas
  if (!closed) {
    const last = (ringCount - 1) * 4;
    indices.push(0, 2, 1, 0, 3, 2);
    indices.push(last, last + 1, last + 2, last, last + 2, last + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- AABB ---------- */
export function boxCollider(mesh, pad = 0) {
  const box = new THREE.Box3().setFromObject(mesh);
  return {
    minX: box.min.x - pad,
    maxX: box.max.x + pad,
    minZ: box.min.z - pad,
    maxZ: box.max.z + pad,
  };
}

export function resolveCircleAABB(pos, radius, colliders) {
  for (const c of colliders) {
    const closestX = clamp(pos.x, c.minX, c.maxX);
    const closestZ = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 1e-4;
      const push = radius - d;
      if (d2 > 1e-8) {
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        // Centro dentro del AABB: expulsar por el eje más cercano
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const back = pos.z - c.minZ;
        const front = c.maxZ - pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === back) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

export function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
