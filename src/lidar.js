import * as THREE from 'three';
import { makeCanvas, makeGlowTexture, wrapAngle } from './utils.js';

const RAY_COUNT = 480;
const MAX_RANGE = 12;
const VISUAL_HZ = 4.2;
const EVAL_HZ = 10;

function sectorGeometry(inner, outer, sweep, segments = 30) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const a = -sweep + f * sweep;
    const s = Math.sin(a);
    const c = Math.cos(a);
    pos.push(s * inner, 0, c * inner);
    pos.push(s * outer, 0, c * outer);
    uv.push(f, 0, f, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function sweepTexture() {
  const { canvas, ctx } = makeCanvas(256, 16);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(62, 224, 208, 0)');
  g.addColorStop(0.55, 'rgba(62, 224, 208, 0.08)');
  g.addColorStop(0.88, 'rgba(120, 255, 240, 0.35)');
  g.addColorStop(1, 'rgba(200, 255, 250, 0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * LiDAR ToF simulado: lanza rayos sobre el plano del sensor y construye una
 * nube de puntos, sectores de riesgo y balizas de alerta en tiempo real.
 */
export class LidarSystem {
  constructor(scene) {
    this.scene = scene;
    this.targets = [];
    this.enabled = true;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = MAX_RANGE;
    this.raycaster.near = 0.04;

    this.origin = new THREE.Vector3(0, 1.42, 0);
    this.forwardYaw = 0;
    this.stepAngle = (Math.PI * 2) / RAY_COUNT;
    this.cursor = 0;
    this.angleCarry = 0;
    this.scanAngle = 0;
    this.lastCastEnd = new THREE.Vector3(0, 0, 4);
    this.evalTimer = 0;
    this.elapsed = 0;
    this.cycles = 0;

    this.hits = new Array(RAY_COUNT);
    for (let i = 0; i < RAY_COUNT; i++) {
      this.hits[i] = { active: false, x: 0, y: 0, z: 0, dist: Infinity };
    }

    this.scan = {
      min: Infinity,
      front: Infinity,
      left: Infinity,
      right: Infinity,
      frontLeft: Infinity,
      frontRight: Infinity,
      rear: Infinity,
      frontHit: null,
      nearestHit: null,
      contour: [],
      raysCast: 0,
    };

    this.group = new THREE.Group();
    this.group.name = 'LiDAR';
    scene.add(this.group);

    const glow = makeGlowTexture();

    /* ----- Nube de puntos ----- */
    const positions = new Float32Array(RAY_COUNT * 3).fill(-500);
    const colors = new Float32Array(RAY_COUNT * 3);
    this.pointsGeo = new THREE.BufferGeometry();
    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.pointsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.pointsMat = new THREE.PointsMaterial({
      size: 0.07,
      map: glow,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.pointsGeo, this.pointsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.group.add(this.points);

    /* ----- Abanico de barrido ----- */
    this.sweep = new THREE.Mesh(
      sectorGeometry(0.1, 3.8, 0.95, 36),
      new THREE.MeshBasicMaterial({
        map: sweepTexture(),
        color: 0x9ffff5,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    this.sweep.renderOrder = 3;
    this.sweep.frustumCulled = false;
    this.group.add(this.sweep);

    /* ----- Rayo de barrido ----- */
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    this.beam = new THREE.Line(
      beamGeo,
      new THREE.LineBasicMaterial({ color: 0xcffffa, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 4;
    this.group.add(this.beam);

    /* ----- Anillos métricos en el suelo ----- */
    this.groundGroup = new THREE.Group();
    this.groundGroup.position.y = 0.018;
    this.group.add(this.groundGroup);
    for (const [r, op] of [[1, 0.16], [2.2, 0.1], [3.6, 0.06]]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.008, r, 72),
        new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
      );
      ring.rotation.x = -Math.PI / 2;
      this.groundGroup.add(ring);
    }

    /* ----- Vectores de proximidad por sector ----- */
    const vecGeo = new THREE.BufferGeometry();
    vecGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    vecGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.vectorLines = new THREE.LineSegments(
      vecGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    this.vectorLines.frustumCulled = false;
    this.group.add(this.vectorLines);

    /* ----- Marcadores de impacto ----- */
    this.markers = [];
    for (let i = 0; i < 3; i++) {
      const marker = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color: 0x3ee0d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      marker.scale.setScalar(0.18);
      this.group.add(marker);
      this.markers.push(marker);
    }

    /* ----- Baliza del obstáculo más cercano ----- */
    this.beacon = new THREE.Group();
    this.beacon.visible = false;
    const beaconLineGeo = new THREE.BufferGeometry();
    beaconLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    this.beaconLine = new THREE.Line(
      beaconLineGeo,
      new THREE.LineBasicMaterial({ color: 0xffb14d, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    this.beacon.add(this.beaconLine);
    this.beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.255, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb14d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beacon.add(this.beaconRing);
    this.group.add(this.beacon);

    /* ----- Ondas de pulso ----- */
    this.pulses = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.group.add(ring);
      this.pulses.push({ mesh: ring, life: 1, active: false });
    }

    this.tmpDir = new THREE.Vector3();
    this.tmpOrigin = new THREE.Vector3();
  }

  setTargets(targets) {
    this.targets = targets;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.group.visible = enabled;
    if (!enabled) {
      this.scan.min = Infinity;
      this.scan.front = Infinity;
      this.scan.left = Infinity;
      this.scan.right = Infinity;
      this.scan.frontHit = null;
    }
  }

  reset() {
    const pos = this.pointsGeo.attributes.position;
    const col = this.pointsGeo.attributes.color;
    for (let i = 0; i < RAY_COUNT; i++) {
      pos.setXYZ(i, 0, -500, 0);
      col.setXYZ(i, 0, 0, 0);
      this.hits[i].active = false;
      this.hits[i].dist = Infinity;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.cursor = 0;
    this.scanAngle = 0;
    this.cycles = 0;
  }

  update(dt, origin, yaw, speed = 0) {
    this.elapsed += dt;
    this.origin.copy(origin);
    this.forwardYaw = yaw;

    if (!this.enabled) return;

    // Barrido progresivo (visual) — 360° completos
    this.angleCarry += dt * VISUAL_HZ * RAY_COUNT;
    let casts = Math.floor(this.angleCarry);
    this.angleCarry -= casts;
    casts = Math.min(casts, 40);

    const posAttr = this.pointsGeo.attributes.position;
    const colAttr = this.pointsGeo.attributes.color;
    const ray = this.raycaster;

    for (let k = 0; k < casts; k++) {
      const idx = this.cursor;
      const localAngle = idx * this.stepAngle;
      const worldAngle = yaw + localAngle;
      this.tmpDir.set(Math.sin(worldAngle), 0, Math.cos(worldAngle));
      ray.set(origin, this.tmpDir);

      let hit = null;
      if (this.targets.length) {
        const intersections = ray.intersectObjects(this.targets, true);
        if (intersections.length) hit = intersections[0];
      }

      const h = this.hits[idx];
      if (hit) {
        const d = hit.distance;
        h.active = true;
        h.x = hit.point.x;
        h.y = hit.point.y;
        h.z = hit.point.z;
        h.dist = d;
        let labelObj = hit.object;
        while (labelObj && !labelObj.userData.obstacleLabel) labelObj = labelObj.parent;
        h.label = labelObj?.userData.obstacleLabel || 'Pared';
        posAttr.setXYZ(idx, hit.point.x, hit.point.y, hit.point.z);

        let r, g, b;
        if (d < 1.0) {
          r = 1; g = 0.22; b = 0.3;
        } else if (d < 2.2) {
          r = 1; g = 0.7; b = 0.26;
        } else {
          const fade = 1 - Math.min(1, (d - 2.2) / MAX_RANGE) * 0.65;
          r = 0.2 * fade; g = 0.86 * fade; b = 0.84 * fade;
        }
        colAttr.setXYZ(idx, r, g, b);

        this.lastCastEnd.copy(hit.point);
      } else {
        h.active = false;
        h.dist = Infinity;
        posAttr.setXYZ(idx, origin.x + this.tmpDir.x * 40, -500, origin.z + this.tmpDir.z * 40);
        colAttr.setXYZ(idx, 0, 0, 0);
        this.lastCastEnd.set(origin.x + this.tmpDir.x * 3.8, origin.y, origin.z + this.tmpDir.z * 3.8);
      }

      this.cursor += 1;
      if (this.cursor >= RAY_COUNT) {
        this.cursor = 0;
        this.cycles += 1;
      }
    }

    if (casts > 0) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    // Geometría de visualización
    this.scanAngle = this.cursor * this.stepAngle;
    this.sweep.position.set(origin.x, origin.y - 0.02, origin.z);
    this.sweep.rotation.y = yaw + this.scanAngle;
    this.groundGroup.position.set(origin.x, 0.018, origin.z);

    const beamPos = this.beam.geometry.attributes.position;
    beamPos.setXYZ(0, origin.x, origin.y, origin.z);
    beamPos.setXYZ(1, this.lastCastEnd.x, this.lastCastEnd.y, this.lastCastEnd.z);
    beamPos.needsUpdate = true;

    // Evaluación de sectores
    this.evalTimer += dt;
    if (this.evalTimer >= 1 / EVAL_HZ) {
      this.evalTimer = 0;
      this.evaluate();
    }

    // Baliza y pulsos
    this.updateBeacon(dt);
  }

  evaluate() {
    const origin = this.origin;
    const fYaw = this.forwardYaw;
    let min = Infinity;
    let front = Infinity;
    let left = Infinity;
    let right = Infinity;
    let frontLeft = Infinity;
    let frontRight = Infinity;
    let rear = Infinity;
    let frontHit = null;
    let nearestHit = null;
    let leftHit = null;
    let rightHit = null;
    let frontLeftHit = null;
    let frontRightHit = null;
    const contour = [];

    for (let i = 0; i < RAY_COUNT; i++) {
      const h = this.hits[i];
      if (!h.active) continue;
      const dx = h.x - origin.x;
      const dz = h.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > MAX_RANGE) continue;
      const a = wrapAngle(Math.atan2(dx, dz) - fYaw);
      contour.push({ x: dx, z: dz, a, d: dist });

      if (dist < min) {
        min = dist;
        nearestHit = h;
      }

      const absA = Math.abs(a);
      if (absA <= 0.5) {
        if (dist < front) {
          front = dist;
          frontHit = h;
        }
      } else if (a > 0.5 && a <= 1.4) {
        if (dist < frontRight) {
          frontRight = dist;
          frontRightHit = h;
        }
      } else if (a < -0.5 && a >= -1.4) {
        if (dist < frontLeft) {
          frontLeft = dist;
          frontLeftHit = h;
        }
      }
      if (a <= -1.15 && a >= -2.0 && dist < left) {
        left = dist;
        leftHit = h;
      }
      if (a >= 1.15 && a <= 2.0 && dist < right) {
        right = dist;
        rightHit = h;
      }
      if (absA > 2.4) rear = Math.min(rear, dist);
    }

    this.scan = {
      min,
      front,
      left,
      right,
      frontLeft,
      frontRight,
      rear,
      frontHit,
      nearestHit,
      leftHit,
      rightHit,
      frontLeftHit,
      frontRightHit,
      contour,
      raysCast: RAY_COUNT,
      points: contour.length,
      timestamp: this.elapsed,
    };
  }

  updateBeacon(dt) {
    const scan = this.scan;
    const hit = scan.frontHit || scan.nearestHit;
    if (!this.enabled || !hit || !isFinite(scan.min)) {
      this.beacon.visible = false;
      return;
    }

    const dist = Math.hypot(hit.x - this.origin.x, hit.z - this.origin.z);
    let color = 0x3ee0d0;
    if (dist < 1.0) color = 0xff4d5e;
    else if (dist < 2.2) color = 0xffb14d;

    this.beacon.visible = true;
    this.beacon.position.set(hit.x, 0, hit.z);
    const pulse = 1 + Math.sin(this.elapsed * 5) * 0.12;
    this.beaconRing.scale.setScalar(pulse);
    this.beaconRing.material.color.setHex(color);
    this.beaconRing.material.opacity = 0.5 + Math.sin(this.elapsed * 5) * 0.25;

    const bp = this.beaconLine.geometry.attributes.position;
    bp.setXYZ(0, 0, 0.03, 0);
    bp.setXYZ(1, 0, Math.max(0.25, hit.y - 0.04), 0);
    bp.needsUpdate = true;
    this.beaconLine.material.color.setHex(color);

    // Vectores por sector
    const vec = this.vectorLines.geometry.attributes.position;
    const vcol = this.vectorLines.geometry.attributes.color;
    for (const m of this.markers) m.visible = false;
    const sectors = [
      { d: scan.front, hit: scan.frontHit, color: new THREE.Color(distColor(scan.front)) },
      { d: scan.frontLeft, hit: pickSector(scan.contour, -0.95, -0.45, this.origin), color: new THREE.Color(distColor(scan.frontLeft)) },
      { d: scan.frontRight, hit: pickSector(scan.contour, 0.45, 0.95, this.origin), color: new THREE.Color(distColor(scan.frontRight)) },
    ];

    sectors.forEach((s, i) => {
      const o = i * 6;
      if (!s.hit || !isFinite(s.d)) {
        vec.setXYZ(o / 3, this.origin.x, this.origin.y, this.origin.z);
        vec.setXYZ(o / 3 + 1, this.origin.x, this.origin.y, this.origin.z);
        vcol.setXYZ(o / 3, 0, 0, 0);
        vcol.setXYZ(o / 3 + 1, 0, 0, 0);
        return;
      }
      vec.setXYZ(o / 3, this.origin.x, this.origin.y - 0.06, this.origin.z);
      vec.setXYZ(o / 3 + 1, s.hit.x, s.hit.y, s.hit.z);
      vcol.setXYZ(o / 3, s.color.r, s.color.g, s.color.b);
      vcol.setXYZ(o / 3 + 1, s.color.r * 0.4, s.color.g * 0.4, s.color.b * 0.4);

      const marker = this.markers[i];
      marker.position.set(s.hit.x, s.hit.y, s.hit.z);
      marker.material.color.copy(s.color);
      marker.material.opacity = 0.9;
      marker.visible = true;
    });
    vec.needsUpdate = true;
    vcol.needsUpdate = true;

    // Pulsos
    for (const p of this.pulses) {
      if (!p.active) continue;
      p.life += dt / 1.4;
      const t = Math.min(1, p.life);
      const s = 0.35 + t * 3.2;
      p.mesh.scale.setScalar(s);
      p.mesh.material.opacity = (1 - t) * 0.5;
      if (t >= 1) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  ping(x, z, color = 0x3ee0d0) {
    const p = this.pulses.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.life = 0;
    p.mesh.visible = true;
    p.mesh.position.set(x, 0.025, z);
    p.mesh.material.color.setHex(color);
    p.mesh.scale.setScalar(0.4);
    p.mesh.material.opacity = 0.6;
  }
}

function distColor(d) {
  if (!isFinite(d)) return 0x3ee0d0;
  if (d < 1.0) return 0xff4d5e;
  if (d < 2.2) return 0xffb14d;
  return 0x3ee0d0;
}

function pickSector(contour, minA, maxA, origin) {
  let best = null;
  let bestD = Infinity;
  for (const c of contour) {
    if (c.a >= minA && c.a <= maxA && c.d < bestD) {
      bestD = c.d;
      best = c;
    }
  }
  if (!best) return null;
  return { x: origin.x + best.x, y: origin.y - 0.04, z: origin.z + best.z };
}
