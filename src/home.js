import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  makeCanvas,
  canvasTexture,
  makeLabelTexture,
  mulberry32,
  roundRect,
} from './utils.js';

/**
 * Casa domótica adaptada para asistencia visual.
 * Tres zonas conectadas (Sala, Cocina y Baño) más un distribuidor.
 * Devuelve colisiones, objetivos de LiDAR y puntos de interacción.
 */

const H = 2.78;

function makePlasterTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#d8d1c3';
  ctx.fillRect(0, 0, 256, 256);
  const rng = mulberry32(31);
  for (let i = 0; i < 3600; i++) {
    const v = 200 + rng() * 28;
    ctx.fillStyle = `rgba(${v}, ${v - 5}, ${v - 14}, ${0.05 + rng() * 0.08})`;
    ctx.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
  }
  return canvasTexture(canvas, { repeat: [2, 2] });
}

function makeWoodTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  const rng = mulberry32(77);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (r * 512) / rows;
    const base = 82 + rng() * 22;
    ctx.fillStyle = `rgb(${base + 30}, ${base}, ${base - 22})`;
    ctx.fillRect(0, y, 512, 512 / rows - 2);
    ctx.fillStyle = 'rgba(45, 28, 16, 0.55)';
    ctx.fillRect(0, y + 512 / rows - 2, 512, 2);
    for (let g = 0; g < 34; g++) {
      ctx.strokeStyle = `rgba(${base + 10}, ${base - 18}, ${base - 34}, ${0.08 + rng() * 0.13})`;
      ctx.lineWidth = 0.7 + rng();
      ctx.beginPath();
      const gy = y + 3 + rng() * (512 / rows - 7);
      ctx.moveTo(0, gy);
      for (let x = 0; x <= 512; x += 32) {
        ctx.lineTo(x, gy + Math.sin(x * 0.02 + r) * 3 + (rng() - 0.5) * 2);
      }
      ctx.stroke();
    }
    // junta vertical desplazada
    ctx.fillStyle = 'rgba(45, 28, 16, 0.4)';
    const jx = ((r * 197) % 512);
    ctx.fillRect(jx, y, 2, 512 / rows);
  }
  return canvasTexture(canvas, { repeat: [2.2, 3.2] });
}

function makeTileTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#b9b6ad';
  ctx.fillRect(0, 0, 256, 256);
  const rng = mulberry32(12);
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const x = tx * 128;
      const y = ty * 128;
      const v = 218 + rng() * 26;
      ctx.fillStyle = `rgb(${v}, ${v - 7}, ${v - 20})`;
      ctx.fillRect(x + 3, y + 3, 122, 122);
      for (let i = 0; i < 180; i++) {
        const c = 190 + rng() * 40;
        ctx.fillStyle = `rgba(${c}, ${c - 8}, ${c - 18}, ${0.08 + rng() * 0.1})`;
        ctx.fillRect(x + 4 + rng() * 118, y + 4 + rng() * 118, 1 + rng() * 3, 1 + rng() * 3);
      }
    }
  }
  ctx.strokeStyle = 'rgba(108, 104, 96, 0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.strokeRect(128, 0, 128, 128);
  ctx.strokeRect(0, 128, 128, 128);
  ctx.strokeRect(128, 128, 128, 128);
  return canvasTexture(canvas, { repeat: [4, 7] });
}

function makeRugTexture() {
  const { canvas, ctx } = makeCanvas(512, 384);
  ctx.fillStyle = '#31434a';
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = '#233239';
  for (let i = 0; i < 14; i++) {
    if (i % 2) ctx.fillRect(i * 38, 0, 20, 384);
  }
  ctx.strokeStyle = 'rgba(226, 196, 154, 0.5)';
  ctx.lineWidth = 7;
  roundRect(ctx, 14, 14, 484, 356, 10);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120, 205, 197, 0.28)';
  ctx.lineWidth = 2;
  roundRect(ctx, 30, 30, 452, 324, 6);
  ctx.stroke();
  return canvasTexture(canvas);
}

function makeWindowTexture() {
  const { canvas, ctx } = makeCanvas(512, 384);
  const g = ctx.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, '#071120');
  g.addColorStop(0.55, '#0d2033');
  g.addColorStop(1, '#1c2d39');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 384);
  const rng = mulberry32(99);
  // luna
  ctx.fillStyle = 'rgba(225, 236, 245, 0.85)';
  ctx.beginPath();
  ctx.arc(408, 78, 20, 0, Math.PI * 2);
  ctx.fill();
  // edificios
  for (let i = 0; i < 22; i++) {
    const w = 18 + rng() * 38;
    const h = 50 + rng() * 160;
    const x = i * 24 - 10;
    const y = 384 - h;
    ctx.fillStyle = `rgba(${16 + rng() * 18}, ${27 + rng() * 20}, ${38 + rng() * 22}, 0.95)`;
    ctx.fillRect(x, y, w, h);
    for (let wy = y + 8; wy < 380; wy += 14) {
      for (let wx = x + 5; wx < x + w - 5; wx += 12) {
        if (rng() > 0.45) {
          ctx.fillStyle = rng() > 0.3 ? 'rgba(246, 201, 130, 0.75)' : 'rgba(150, 214, 224, 0.5)';
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
  }
  return canvasTexture(canvas);
}

function makeScreenTexture() {
  const { canvas, ctx } = makeCanvas(512, 288);
  const g = ctx.createLinearGradient(0, 0, 512, 288);
  g.addColorStop(0, '#081018');
  g.addColorStop(1, '#10202b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = 'rgba(62, 224, 208, 0.4)';
  ctx.lineWidth = 2;
  for (let r = 36; r < 160; r += 24) {
    ctx.beginPath();
    ctx.arc(256, 144, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8414f';
  ctx.beginPath();
  ctx.arc(256, 144, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef5fb';
  ctx.font = '300 42px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '10px';
  ctx.fillText('AURA', 256, 214);
  ctx.fillStyle = 'rgba(62, 224, 208, 0.85)';
  ctx.font = '400 14px monospace';
  ctx.fillText('CASA CONECTADA · MODO ASISTENCIA', 256, 244);
  return canvasTexture(canvas);
}

function makeTextTexture(text, { bg = '#f2f0e9', fg = '#1c2a33', w = 256, h = 128, size = 54 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(30, 50, 60, 0.35)';
  ctx.lineWidth = 4;
  roundRect(ctx, 5, 5, w - 10, h - 10, 10);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `600 ${size}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  return canvasTexture(canvas);
}

export function createHomeEnvironment() {
  const group = new THREE.Group();
  group.name = 'Environment_home';
  const colliders = [];
  const targets = [];
  const obstacles = [];
  const zones = [];
  const interactables = [];

  /* ---------------- Texturas y materiales ---------------- */
  const plasterTex = makePlasterTexture();
  const woodTex = makeWoodTexture();
  const tileTex = makeTileTexture();
  const rugTex = makeRugTexture();
  const windowTex = makeWindowTexture();
  const screenTex = makeScreenTexture();

  const wallMat = new THREE.MeshStandardMaterial({ map: plasterTex, color: 0xd8d0c2, roughness: 0.94, metalness: 0.02 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x556a66, roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xc2a27c, roughness: 0.62, metalness: 0.05 });
  const tileMat = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xd6d7d2, roughness: 0.5, metalness: 0.06 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x262a2c, roughness: 0.96 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xe8e3d7, roughness: 0.7 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6848, roughness: 0.55, metalness: 0.04 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4c3827, roughness: 0.6 });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x435d5b, roughness: 0.96 });
  const cushionMat = new THREE.MeshStandardMaterial({ color: 0x9a6247, roughness: 0.95 });
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0xc9b28d, roughness: 1 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeceae3, roughness: 0.42, metalness: 0.08 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x9da3a7, roughness: 0.3, metalness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.45, metalness: 0.5 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.35, metalness: 0.3 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe6e3, transparent: true, opacity: 0.22, roughness: 0.05,
    metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  });
  const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.22, metalness: 0.08 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x2f5b3c, roughness: 0.9 });
  const greenMat2 = new THREE.MeshStandardMaterial({ color: 0x3f744c, roughness: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, toneMapped: false });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xbff3ec, transparent: true, opacity: 0.7, toneMapped: false });

  const rng = mulberry32(20261109);

  const addMesh = (geo, mat, x, y, z, parent = group, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  };

  const addCollider = (cx, cz, w, d, pad = 0) => {
    colliders.push({
      minX: cx - w / 2 - pad,
      maxX: cx + w / 2 + pad,
      minZ: cz - d / 2 - pad,
      maxZ: cz + d / 2 + pad,
    });
  };

  const addWall = (cx, cz, w, d, { mat = wallMat, height = H, base = true } = {}) => {
    const mesh = addMesh(new THREE.BoxGeometry(w, height, d), mat, cx, height / 2, cz);
    mesh.userData.obstacleLabel = 'Pared';
    targets.push(mesh);
    obstacles.push({ mesh, label: 'Pared', low: false, labelOffset: 1 });
    addCollider(cx, cz, w, d);
    if (base) {
      addMesh(new THREE.BoxGeometry(w + 0.02, 0.1, d + 0.02), baseMat, cx, 0.05, cz);
    }
    return mesh;
  };

  const addFloor = (x0, x1, z0, z1, mat, y = 0.002) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const addRug = (x, z, w, d, rotY = 0, tex = rugTex) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98, metalness: 0 });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = rotY;
    rug.position.set(x, 0.009, z);
    rug.receiveShadow = true;
    group.add(rug);
    return rug;
  };

  const addLabel = (text, x, y, z, { scale = 0.9, color = '#dff7f2' } = {}) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeLabelTexture(text, { color }),
        transparent: true,
        depthWrite: false,
        opacity: 0.92,
      })
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(0.98 * scale, 0.245 * scale, 1);
    group.add(sprite);
    return sprite;
  };

  const addCeilingLight = (x, z, { intensity = 9, warm = true, length = 1.0 } = {}) => {
    const color = warm ? 0xffd6a6 : 0xdcefff;
    addMesh(
      new THREE.BoxGeometry(length, 0.035, 0.16),
      new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      x, H - 0.04, z,
      group, { cast: false }
    );
    const light = new THREE.PointLight(color, intensity, 7.5, 2);
    light.position.set(x, H - 0.22, z);
    group.add(light);
    return light;
  };

  const addWindow = (x, y, z, w, h, rotY = 0) => {
    const frame = new THREE.Group();
    frame.position.set(x, y, z);
    frame.rotation.y = rotY;
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: windowTex, toneMapped: false })
    );
    pane.position.z = 0.01;
    frame.add(pane);
    const border = new THREE.MeshStandardMaterial({ color: 0x3b3f42, roughness: 0.5, metalness: 0.3 });
    const t = 0.055;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, 0.06), border);
    top.position.set(0, h / 2 + t / 2, 0.03);
    frame.add(top);
    const bottom = top.clone();
    bottom.position.y = -h / 2 - t / 2;
    frame.add(bottom);
    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, 0.06), border);
    left.position.set(-w / 2 - t / 2, 0, 0.03);
    frame.add(left);
    const right = left.clone();
    right.position.x = w / 2 + t / 2;
    frame.add(right);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.025, h, 0.05), border);
    mullion.position.set(0, 0, 0.035);
    frame.add(mullion);
    group.add(frame);
    return frame;
  };

  const addDoorFrame = (x, z, width, rotY = 0, { h = 2.12 } = {}) => {
    const frame = new THREE.Group();
    frame.position.set(x, 0, z);
    frame.rotation.y = rotY;
    const trim = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.65 });
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.22), trim);
    side.position.set(-width / 2 - 0.045, h / 2, 0);
    frame.add(side);
    const side2 = side.clone();
    side2.position.x = width / 2 + 0.045;
    frame.add(side2);
    const header = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.1, 0.22), trim);
    header.position.set(0, h + 0.05, 0);
    frame.add(header);
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.012, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.3, toneMapped: false })
    );
    sill.position.set(0, 0.007, 0);
    frame.add(sill);
    group.add(frame);
    targets.push(frame);
    return frame;
  };

  const addObstacle = (obj, label, { low = false, w, d, cx, cz, pad = 0.02, labelOffset = 1.1 } = {}) => {
    obj.userData.obstacleLabel = label;
    obj.userData.isObstacle = true;
    group.add(obj);
    targets.push(obj);
    obstacles.push({ mesh: obj, label, low, labelOffset });
    addCollider(cx ?? obj.position.x, cz ?? obj.position.z, w, d, pad);
    return obj;
  };

  /* ================= ESTRUCTURA ================= */
  addFloor(-5.6, 1.0, -1.28, 4.48, floorMat);
  addFloor(1.0, 6.48, -4.58, 4.48, tileMat, 0.003);
  // Techo
  addMesh(new THREE.BoxGeometry(6.62, 0.12, 5.78), ceilingMat, -2.3, H + 0.06, 1.6, group, { cast: false });
  addMesh(new THREE.BoxGeometry(5.5, 0.12, 9.08), ceilingMat, 3.74, H + 0.06, -0.05, group, { cast: false });

  // Muros exteriores
  addWall(-5.6, 1.6, 0.18, 5.8);       // oeste sala
  addWall(0.4, 4.48, 12.2, 0.18);      // sur
  addWall(6.48, -0.05, 0.18, 9.1);     // este
  addWall(3.74, -4.58, 5.6, 0.18);     // fondo del ala posterior
  addWall(1.0, -2.9, 0.18, 3.4);       // oeste del distribuidor

  // Muro interior entre sala/cocina y el ala posterior (vano de 1,8 m al pasillo)
  addWall(-2.25, -1.28, 6.7, 0.16);   // de -5,6 a 1,1
  addWall(4.65, -1.28, 3.5, 0.16);    // de 2,9 a 6,4
  // Tabique distribuidor / baño con puerta amplia de 1,8 m
  addWall(3.4, -4.3, 0.16, 0.6);      // de -4,6 a -4,0
  addWall(3.4, -1.7, 0.16, 1.0);      // de -2,2 a -1,2

  // Puerta de entrada y vanos
  addDoorFrame(-4.95, 4.38, 1.8, 0);
  addMesh(new THREE.BoxGeometry(1.7, 2.06, 0.05), woodDark, -4.95, 1.03, 4.35);
  addMesh(new THREE.SphereGeometry(0.028, 12, 10), steelMat, -4.18, 1.03, 4.3);
  addDoorFrame(2.0, -1.28, 1.8, 0);
  addDoorFrame(3.4, -3.1, 1.8, Math.PI / 2);
  // Puerta abierta del baño
  const bathDoor = new THREE.Group();
  bathDoor.position.set(3.44, 0, -2.22);
  bathDoor.rotation.y = -1.32;
  const bathPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.05, 1.76), new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.6 }));
  bathPanel.position.set(0, 1.03, -0.88);
  bathPanel.castShadow = true;
  bathDoor.add(bathPanel);
  group.add(bathDoor);

  // Ventanas
  addWindow(-3.55, 1.62, 4.38, 1.5, 1.15, Math.PI);
  addWindow(4.15, 1.62, 4.38, 1.7, 1.15, Math.PI);
  addWindow(-5.5, 1.62, 3.55, 1.1, 1.1, Math.PI / 2);

  // Alfombras
  addRug(-2.35, 1.6, 3.4, 2.5);
  addRug(2.2, -2.95, 1.0, 2.7);
  addRug(4.85, -2.55, 0.9, 0.55, 0, null);

  // Etiquetas de zona
  addLabel('SALA', -2.4, 2.45, 2.1, { scale: 0.9 });
  addLabel('COCINA', 4.3, 2.45, 0.8, { scale: 0.9, color: '#f3e2c2' });
  addLabel('BAÑO', 4.85, 2.42, -3.15, { scale: 0.8, color: '#cfe9ff' });
  addLabel('PASILLO', 2.2, 2.35, -2.1, { scale: 0.7, color: '#d9e7ee' });

  // Luces
  addCeilingLight(-3.3, 1.3, { intensity: 10, warm: true });
  addCeilingLight(-1.1, 3.1, { intensity: 8, warm: true });
  addCeilingLight(3.2, 2.3, { intensity: 9, warm: true });
  addCeilingLight(5.2, 0.3, { intensity: 7, warm: false });
  addCeilingLight(2.1, -2.7, { intensity: 7, warm: true });
  addCeilingLight(4.8, -2.9, { intensity: 8, warm: false });

  /* ================= SALA ================= */
  // Sofá de tres plazas, orientado al televisor (oeste)
  const sofa = new THREE.Group();
  sofa.position.set(-0.4, 0, 1.6);
  sofa.rotation.y = -Math.PI / 2;
  const sofaBase = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.36, 0.98, 3, 0.04), fabricMat);
  sofaBase.position.y = 0.3;
  sofaBase.castShadow = true;
  sofaBase.receiveShadow = true;
  sofa.add(sofaBase);
  const sofaBack = new THREE.Mesh(new RoundedBoxGeometry(2.28, 0.62, 0.24, 3, 0.06), fabricMat);
  sofaBack.position.set(0, 0.67, -0.38);
  sofaBack.castShadow = true;
  sofa.add(sofaBack);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.52, 0.96, 3, 0.05), fabricMat);
    arm.position.set(s * 1.05, 0.46, 0);
    arm.castShadow = true;
    sofa.add(arm);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 10), darkMat);
    foot.position.set(s * 0.92, 0.06, 0.36);
    sofa.add(foot);
    const foot2 = foot.clone();
    foot2.position.z = -0.36;
    sofa.add(foot2);
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.16, 0.7, 3, 0.05), fabricMat);
    cushion.position.set(s * 0.52, 0.52, 0.06);
    cushion.castShadow = true;
    sofa.add(cushion);
    const backCushion = new THREE.Mesh(new RoundedBoxGeometry(0.94, 0.46, 0.16, 3, 0.05), fabricMat);
    backCushion.position.set(s * 0.52, 0.72, -0.25);
    backCushion.rotation.x = -0.12;
    sofa.add(backCushion);
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.34, 0.12, 3, 0.05), cushionMat);
    pillow.position.set(s * 0.78, 0.65, -0.17);
    pillow.rotation.z = s * 0.15;
    pillow.castShadow = true;
    sofa.add(pillow);
  }
  const throwBlanket = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.6, 3, 0.04), blanketMat);
  throwBlanket.position.set(-0.98, 0.58, 0.02);
  throwBlanket.rotation.z = -0.08;
  sofa.add(throwBlanket);
  addObstacle(sofa, 'Sofá', { low: true, w: 1.05, d: 2.4, labelOffset: 1.25 });

  // Mesa de centro
  const coffee = new THREE.Group();
  coffee.position.set(-2.35, 0, 1.6);
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.06, 1.35, 3, 0.02), woodMat);
  top.position.y = 0.4;
  top.castShadow = true;
  coffee.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.37, 8), darkMat);
      leg.position.set(sx * 0.23, 0.185, sz * 0.56);
      coffee.add(leg);
    }
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.07, 20), ceramicMat);
  bowl.position.set(0.05, 0.465, 0.12);
  coffee.add(bowl);
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.3), new THREE.MeshStandardMaterial({ color: 0x6a4a4a, roughness: 0.8 }));
  book.position.set(-0.12, 0.445, -0.3);
  book.rotation.y = 0.25;
  coffee.add(book);

  // Objetos cotidianos de la mesa de centro para el escaneo en POV.
  const coffeeItems = [];
  const addCoffeeItem = (meta, object, x, y, z, rot = 0) => {
    object.position.set(x, y, z);
    object.rotation.y = rot;
    object.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.userData.itemLabel = meta.name;
      }
    });
    coffee.add(object);
    coffeeItems.push({ ...meta, object });
  };
  const remote = makeShelfItem('remote');
  if (remote) addCoffeeItem({
    name: 'Mando a distancia', voice: 'un mando a distancia', category: 'electrónica', count: 1,
    summary: 'un mando a distancia', title: 'Mando de la televisión',
    detail: 'Un mando de televisión con los botones de volumen y encendido en relieve; está sobre la mesa de centro.',
  }, remote, 0.18, 0.44, 0.42, -0.35);
  const mugs = makeShelfItem('mugs');
  if (mugs) addCoffeeItem({
    name: 'Tazas', voice: 'dos tazas de café', category: 'menaje', count: 2,
    summary: 'dos tazas de café', title: 'Dos tazas de café',
    detail: 'Dos tazas de cerámica sobre la mesa de centro; una blanca y otra verde, con las asas hacia fuera.',
  }, mugs, -0.17, 0.43, 0.36, 0.2);
  const magazine = new THREE.Group();
  const magazineBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.012, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xd7c9ad, roughness: 0.82 })
  );
  magazineBody.position.y = 0.006;
  magazine.add(magazineBody);
  const magazineCover = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.275),
    new THREE.MeshStandardMaterial({ map: makeTextTexture('AURA', { bg: '#395a63', fg: '#f1e6ce', size: 44 }), roughness: 0.75 })
  );
  magazineCover.rotation.x = -Math.PI / 2;
  magazineCover.position.y = 0.013;
  magazine.add(magazineCover);
  const magazineEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.21, 0.006, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xb7a88e, roughness: 0.9 })
  );
  magazineEdge.position.y = 0.002;
  magazine.add(magazineEdge);
  addCoffeeItem({
    name: 'Revista', voice: 'una revista', category: 'libros', count: 1,
    summary: 'una revista', title: 'Revista de diseño',
    detail: 'Una revista de diseño abierta sobre la mesa de centro, con fotos de interiores y titulares en letra grande.',
  }, magazine, -0.02, 0.435, -0.56, 0.18);
  interactables.push({
    type: 'table', id: 'mesa-centro', label: 'Mesa de centro',
    point: new THREE.Vector3(-2.35, 0, 1.6), radius: 1.45,
    look: new THREE.Vector3(-2.35, 0.45, 1.6), items: coffeeItems,
    scanPitch: { from: 0.02, to: -0.95, duration: 1900 }, finalPitch: -0.55,
  });
  addObstacle(coffee, 'Mesa de centro', { low: true, w: 0.68, d: 1.42, labelOffset: 1.0 });

  // Mueble de TV y televisor
  const media = new THREE.Group();
  media.position.set(-5.33, 0, 1.55);
  const mediaBody = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.52, 1.8, 3, 0.03), woodMat);
  mediaBody.position.y = 0.29;
  mediaBody.castShadow = true;
  mediaBody.receiveShadow = true;
  media.add(mediaBody);
  const mediaTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 1.86), woodDark);
  mediaTop.position.y = 0.56;
  media.add(mediaTop);
  addObstacle(media, 'Mueble del televisor', { low: true, w: 0.52, d: 1.88, labelOffset: 0.9 });

  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.88, 1.56), blackMat);
  tvFrame.position.set(-5.47, 1.58, 1.55);
  tvFrame.castShadow = true;
  group.add(tvFrame);
  const tvScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.48, 0.8),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  tvScreen.position.set(-5.435, 1.58, 1.55);
  tvScreen.rotation.y = Math.PI / 2;
  group.add(tvScreen);
  const soundbar = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.08, 1.1, 3, 0.02), darkMat);
  soundbar.position.set(-5.32, 0.63, 1.55);
  group.add(soundbar);
  targets.push(tvFrame);

  // Lámpara de pie
  const lamp = new THREE.Group();
  lamp.position.set(-4.78, 0, 0.22);
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.5, 10), darkMat);
  lampPole.position.y = 0.75;
  lamp.add(lampPole);
  const lampFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.035, 20), darkMat);
  lampFoot.position.y = 0.02;
  lamp.add(lampFoot);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.28, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf3e6cd, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0.35 }));
  shade.position.y = 1.55;
  lamp.add(shade);
  const lampLight = new THREE.PointLight(0xffd3a0, 3.6, 4.5, 2);
  lampLight.position.set(0, 1.45, 0);
  lamp.add(lampLight);
  addObstacle(lamp, 'Lámpara de pie', { low: true, w: 0.35, d: 0.35, labelOffset: 1.7 });

  // Planta de la sala
  const plant = makePlant(-5.0, 3.6, 1.25, 0.26);
  addObstacle(plant, 'Planta', { low: true, w: 0.5, d: 0.5, labelOffset: 1.7 });

  // Estanterías con objetos etiquetados
  const shelfA = makeShelfUnit(-3.9, -0.83, 0, {
    id: 'shelf-sala-norte',
    label: 'Estantería de la sala',
    items: [
      { name: 'Novela histórica', voice: 'una novela histórica', level: 1, kind: 'books', category: 'libros', count: 4, title: 'Historia de una ciudad', detail: '«Historia de una ciudad», una novela histórica de tapa dura con 384 páginas.' },
      { name: 'Poesía', voice: 'un libro de poesía', level: 1, kind: 'book-thin', category: 'libros', count: 1, title: 'Poemas de Antonio Machado', detail: '«Poemas de Antonio Machado», una edición de bolsillo con 96 páginas y letra grande.' },
      { name: 'Guía de lectura', voice: 'una guía de lectura', level: 1, kind: 'book-blue', category: 'libros', count: 1, title: 'Guía de lectura AURA', detail: '«Guía de lectura AURA», un manual en letra grande con pictogramas y consejos de orientación.' },
      { name: 'Cesta de mimbre', voice: 'una cesta de mimbre', level: 0, kind: 'basket', category: 'hogar', count: 1, article: 'una', detail: 'Una cesta de mimbre tejida a mano; dentro hay una manta ligera doblada.' },
      { name: 'Jarrón de cerámica', voice: 'un jarrón de cerámica', level: 0, kind: 'vase', category: 'decoración', count: 1, article: 'un', detail: 'Un jarrón de cerámica esmaltada con flores secas; la base tiene una etiqueta en braille.' },
      { name: 'Radio portátil', voice: 'una radio portátil', level: 2, kind: 'radio', category: 'electrónica', count: 1, article: 'una', detail: 'Una radio portátil analógica con antena, dial grande y marca en relieve en el botón de encendido.' },
      { name: 'Reloj de mesa', voice: 'un reloj de mesa', level: 2, kind: 'clock', category: 'electrónica', count: 1, article: 'un', detail: 'Un reloj de mesa con números grandes y agujas de alto contraste.' },
      { name: 'Marco de fotos', voice: 'un marco de fotos familiar', level: 3, kind: 'photo', category: 'decoración', count: 1, article: 'un', detail: 'Un marco de fotos familiar de madera; la imagen es una reunión al aire libre.' },
      { name: 'Planta pequeña', voice: 'una planta pequeña', level: 3, kind: 'plant', category: 'decoración', count: 1, article: 'una', detail: 'Una planta pequeña de interior en una maceta de barro con etiqueta de cuidados.' },
    ],
  });
  shelfA.group.position.set(-3.9, 0, -0.83);
  group.add(shelfA.group);
  interactables.push({
    type: 'shelf', id: 'shelf-sala-norte', label: 'Estantería de la sala',
    point: new THREE.Vector3(-3.9, 0, 0.18), radius: 1.55, items: shelfA.items,
    look: new THREE.Vector3(-3.9, 1.1, -0.83),
  });
  addObstacle(shelfA.group, 'Estantería', { w: 1.45, d: 0.5, cx: -3.9, cz: -0.83, labelOffset: 1.95 });

  const shelfB = makeShelfUnit(-1.1, -0.83, 0, {
    id: 'shelf-sala-sur',
    label: 'Estantería junto al sofá',
    items: [
      { name: 'Juego de mesa', voice: 'un juego de mesa', level: 0, kind: 'game', category: 'hogar', count: 1, article: 'un', detail: 'Un juego de mesa familiar de cartón, con fichas de madera y reglas en braille.' },
      { name: 'Manta doblada', voice: 'una manta doblada', level: 0, kind: 'blanket', category: 'hogar', count: 1, article: 'una', detail: 'Una manta de algodón doblada, suave y de color mostaza.' },
      { name: 'Libro de cocina', voice: 'un libro de cocina', level: 1, kind: 'book-warm', category: 'libros', count: 1, title: 'Cocina para todos los días', detail: '«Cocina para todos los días», un recetario con 120 platos y pasos numerados.' },
      { name: 'Diccionario', voice: 'un diccionario', level: 1, kind: 'book-green', category: 'libros', count: 1, title: 'Diccionario de la lengua española', detail: '«Diccionario de la lengua española», edición actualizada con definiciones en letra grande.' },
      { name: 'Altavoz inteligente', voice: 'un altavoz inteligente', level: 2, kind: 'speaker', category: 'electrónica', count: 1, article: 'un', detail: 'Un altavoz inteligente cilíndrico; el anillo luminoso indica que está conectado.' },
      { name: 'Mando de televisión', voice: 'el mando de la televisión', level: 2, kind: 'remote', category: 'electrónica', count: 1, article: 'un', detail: 'Un mando de televisión con botones en relieve y una marca táctil en el botón de encendido.' },
      { name: 'Vela aromática', voice: 'una vela aromática', level: 3, kind: 'candle', category: 'decoración', count: 1, article: 'una', detail: 'Una vela aromática de lavanda en un vaso de cristal.' },
      { name: 'Tazas', voice: 'dos tazas de desayuno', level: 3, kind: 'mugs', category: 'menaje', count: 2, article: 'dos', detail: 'Dos tazas de desayuno de cerámica, una blanca y otra verde.' },
    ],
  });
  shelfB.group.position.set(-1.1, 0, -0.83);
  group.add(shelfB.group);
  interactables.push({
    type: 'shelf', id: 'shelf-sala-sur', label: 'Estantería junto al sofá',
    point: new THREE.Vector3(-1.1, 0, 0.12), radius: 1.5, items: shelfB.items,
    look: new THREE.Vector3(-1.1, 1.1, -0.83),
  });
  addObstacle(shelfB.group, 'Estantería', { w: 1.45, d: 0.5, cx: -1.1, cz: -0.83, labelOffset: 1.95 });

  // Cuadros y detalles
  const artTex = makeTextTexture('HOGAR', { bg: '#26363b', fg: '#e7d7b5', size: 44 });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.7 }));
  art.position.set(-2.5, 1.75, -1.18);
  group.add(art);
  const art2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x9b6f52, roughness: 0.8 }));
  art2.position.set(-5.49, 1.68, 0.15);
  art2.rotation.y = Math.PI / 2;
  group.add(art2);

  /* ================= COCINA ================= */
  const island = new THREE.Group();
  island.position.set(2.4, 0, 1.7);
  const islandBase = new THREE.Mesh(new RoundedBoxGeometry(1.55, 0.88, 0.86, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0x3f5a57, roughness: 0.65 }));
  islandBase.position.y = 0.44;
  islandBase.castShadow = true;
  islandBase.receiveShadow = true;
  island.add(islandBase);
  const islandTop = new THREE.Mesh(new RoundedBoxGeometry(1.68, 0.06, 0.98, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 0.52, metalness: 0.02 }));
  islandTop.position.y = 0.92;
  islandTop.castShadow = true;
  island.add(islandTop);
  // Objetos de la barra para el escaneo y la interacción en POV.
  const islandItems = [];
  const addIslandItem = (meta, object, x, y, z, rot = 0) => {
    object.position.set(x, y, z);
    object.rotation.y = rot;
    object.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.userData.itemLabel = meta.name;
      }
    });
    island.add(object);
    islandItems.push({ ...meta, object });
  };

  // Frutero
  const islandFruit = new THREE.Group();
  const fruitBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.09, 22), ceramicMat);
  fruitBowl.position.set(0, 0.045, 0);
  islandFruit.add(fruitBowl);
  for (let i = 0; i < 3; i++) {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: i === 1 ? 0x6e9a4a : 0xb64a3a, roughness: 0.6 }));
    apple.position.set((i - 1) * 0.06, 0.11 + (i === 1 ? 0.025 : 0), (i - 1) * 0.045);
    islandFruit.add(apple);
  }
  addIslandItem({
    name: 'Frutero', voice: 'un frutero con tres manzanas', category: 'fruta', count: 3,
    summary: 'tres manzanas', title: 'Frutero de la barra',
    detail: 'Un frutero de cerámica en el centro de la barra con tres manzanas, dos rojas y una verde.',
  }, islandFruit, -0.3, 0.95, -0.03, 0.12);

  // Platos apilados
  const plates = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.012, 22), ceramicMat);
    plate.position.y = 0.006 + i * 0.016;
    plates.add(plate);
  }
  addIslandItem({
    name: 'Platos', voice: 'tres platos', category: 'vajilla', count: 3,
    summary: 'tres platos', title: 'Tres platos llanos',
    detail: 'Tres platos llanos de cerámica apilados junto al borde de la barra, listos para poner la mesa.',
  }, plates, 0.48, 0.95, 0.22, 0);

  // Vasos
  const glasses = new THREE.Group();
  const glassMatLocal = new THREE.MeshPhysicalMaterial({ color: 0xdfeef0, transparent: true, opacity: 0.55, roughness: 0.06, metalness: 0, clearcoat: 1, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.12, 14), glassMatLocal);
    glass.position.set((i - 1) * 0.1, 0.06, (i % 2) * 0.03);
    glasses.add(glass);
  }
  addIslandItem({
    name: 'Vasos', voice: 'tres vasos', category: 'vasos', count: 3,
    summary: 'tres vasos', title: 'Tres vasos de agua',
    detail: 'Tres vasos de cristal transparente junto a la jarra, en la barra de la cocina.',
  }, glasses, 0.46, 0.95, -0.28, -0.18);

  // Tabla de picar
  const board = new THREE.Group();
  const boardTop = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.028, 0.24, 3, 0.012), woodMat);
  boardTop.position.y = 0.014;
  board.add(boardTop);
  const boardHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), woodMat);
  boardHandle.rotation.z = Math.PI / 2;
  boardHandle.position.set(0.23, 0.03, 0);
  board.add(boardHandle);
  addIslandItem({
    name: 'Tabla de picar', voice: 'una tabla de picar', category: 'menaje', count: 1,
    summary: 'una tabla de picar', title: 'Tabla de picar',
    detail: 'Una tabla de madera de olivo con asa, limpia y apoyada en la barra de la cocina.',
  }, board, -0.52, 0.95, 0.3, 0.08);

  interactables.push({
    type: 'table', id: 'barra-cocina', label: 'Barra de cocina',
    point: new THREE.Vector3(2.4, 0, 1.7), radius: 1.5,
    look: new THREE.Vector3(2.4, 0.98, 1.7), items: islandItems,
    scanPitch: { from: 0.04, to: -0.42, duration: 1600 }, finalPitch: -0.16,
  });
  addObstacle(island, 'Barra de cocina', { low: true, w: 1.72, d: 1.0, labelOffset: 1.25 });

  // Taburetes
  for (let i = 0; i < 3; i++) {
    const stool = new THREE.Group();
    const z = 1.1 + i * 0.6;
    stool.position.set(1.42, 0, z);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 20), cushionMat);
    seat.position.y = 0.64;
    seat.castShadow = true;
    stool.add(seat);
    for (let l = 0; l < 3; l++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6), darkMat);
      leg.position.set(Math.cos((l / 3) * Math.PI * 2) * 0.13, 0.31, Math.sin((l / 3) * Math.PI * 2) * 0.13);
      stool.add(leg);
    }
    addObstacle(stool, 'Taburete', { low: true, w: 0.38, d: 0.38, labelOffset: 0.8 });
  }

  // Encimera y armarios de la cocina (pared este)
  const counter = new THREE.Group();
  counter.position.set(6.08, 0, 2.45);
  const counterBase = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.88, 2.8, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x596b66, roughness: 0.6 }));
  counterBase.position.y = 0.44;
  counterBase.castShadow = true;
  counter.add(counterBase);
  const counterTop = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.06, 2.88, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0xe9e5d9, roughness: 0.22, metalness: 0.12 }));
  counterTop.position.y = 0.91;
  counterTop.castShadow = true;
  counter.add(counterTop);
  for (let i = 0; i < 4; i++) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), steelMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(-0.32, 0.64, -0.95 + i * 0.63);
    counter.add(handle);
  }
  // Fregadero
  const sink = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.5), steelMat);
  sink.position.set(0, 0.935, -0.9);
  counter.add(sink);
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.28, 10), steelMat);
  tap.position.set(-0.2, 1.1, -0.9);
  counter.add(tap);
  const tapArm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), steelMat);
  tapArm.rotation.z = Math.PI / 2;
  tapArm.position.set(-0.1, 1.23, -0.9);
  counter.add(tapArm);
  // Placa
  const hob = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.5), blackMat);
  hob.position.set(0, 0.94, 0.85);
  counter.add(hob);
  for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
    const burner = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 6, 20), steelMat);
    burner.rotation.x = Math.PI / 2;
    burner.position.set(dx, 0.95, 0.85 + dz);
    counter.add(burner);
  }
  // Armarios altos
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.72, 2.8), new THREE.MeshStandardMaterial({ color: 0xd9d5c8, roughness: 0.55 }));
  upper.position.set(6.26, 1.92, 2.45);
  upper.castShadow = true;
  counter.add(upper);
  const hood = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.22, 0.8, 3, 0.03), steelMat);
  hood.position.set(6.12, 1.75, 3.3);
  counter.add(hood);
  const backsplash = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshStandardMaterial({ map: tileTex, color: 0xcfd8d1, roughness: 0.4 }));
  backsplash.rotation.y = -Math.PI / 2;
  backsplash.position.set(6.34, 1.27, 2.45);
  counter.add(backsplash);
  group.add(counter);
  addObstacle(counter, 'Encimera de cocina', { w: 0.72, d: 2.9, cx: 6.08, cz: 2.45, labelOffset: 1.1 });

  // Nevera
  const fridgeRig = makeFridge(5.92, -0.45);
  group.add(fridgeRig.group);
  addObstacle(fridgeRig.group, 'Nevera', { w: 0.9, d: 0.86, cx: 5.92, cz: -0.45, labelOffset: 2.1 });
  interactables.push({
    type: 'fridge', id: 'nevera', label: 'Nevera',
    point: new THREE.Vector3(5.1, 0, -0.45), radius: 1.5,
    look: new THREE.Vector3(5.78, 1.1, -0.45),
    products: fridgeRig.products,
  });

  // Lámparas colgantes sobre la isla
  for (const z of [1.35, 2.05]) {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.18, 18), darkMat);
    shade.position.set(2.4, 2.22, z);
    group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glowMat);
    bulb.position.set(2.4, 2.12, z);
    group.add(bulb);
    const light = new THREE.PointLight(0xffd6a6, 4.2, 4.2, 2);
    light.position.set(2.4, 2.02, z);
    group.add(light);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.45, 6), darkMat);
    cord.position.set(2.4, 2.55, z);
    group.add(cord);
  }

  // Mesa de desayuno
  const table = new THREE.Group();
  table.position.set(4.2, 0, 3.35);
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 32), woodMat);
  tableTop.position.y = 0.74;
  tableTop.castShadow = true;
  table.add(tableTop);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.72, 12), darkMat);
  tableLeg.position.y = 0.36;
  table.add(tableLeg);
  // Objetos sobre la mesa para el escaneo activo en POV
  const tableItems = [];
  const addTableItem = (meta, kind, x, y, z, rot = 0) => {
    const object = makeShelfItem(kind);
    if (!object) return;
    object.position.set(x, y, z);
    object.rotation.y = rot;
    object.traverse((o) => {
      if (o.isMesh) o.userData.itemLabel = meta.name;
    });
    table.add(object);
    tableItems.push({ ...meta, object });
  };
  addTableItem({
    name: 'Libro de recetas', voice: 'un libro de recetas', category: 'libros', count: 1, summary: 'un libro de recetas',
    title: 'Cocina para todos los días', detail: '«Cocina para todos los días», un recetario con 120 platos y pasos numerados.',
  }, 'book-warm', -0.04, 0.77, 0.06, 0.35);
  addTableItem({
    name: 'Tazas de café', voice: 'dos tazas de café', category: 'menaje', count: 2, article: 'dos', summary: 'dos tazas de café',
    detail: 'Dos tazas de cerámica blanca, todavía tibias, con asas amplias.',
  }, 'mugs', 0.21, 0.77, -0.08, -0.15);
  const fruitGroup = new THREE.Group();
  fruitGroup.position.set(-0.2, 0.77, 0.14);
  const fruitBowl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.08, 22), ceramicMat);
  fruitBowl2.position.y = 0.04;
  fruitGroup.add(fruitBowl2);
  for (let i = 0; i < 3; i++) {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: i === 1 ? 0x6e9a4a : 0xb64a3a, roughness: 0.6 }));
    apple.position.set((i - 1) * 0.055, 0.1, (i % 2) * 0.02);
    fruitGroup.add(apple);
  }
  table.add(fruitGroup);
  tableItems.push({
    name: 'Frutero', voice: 'un frutero con tres manzanas', category: 'fruta', count: 3, article: 'un', summary: 'tres manzanas',
    detail: 'Un frutero de cerámica con tres manzanas, dos rojas y una verde.', object: fruitGroup,
  });
  interactables.push({
    type: 'table', id: 'mesa-cocina', label: 'Mesa de desayuno',
    point: new THREE.Vector3(4.2, 0, 3.35), radius: 1.35,
    look: new THREE.Vector3(4.2, 0.85, 3.35), items: tableItems,
  });
  addObstacle(table, 'Mesa de desayuno', { low: true, w: 1.05, d: 1.05, labelOffset: 0.9 });
  for (const s of [-1, 1]) {
    const chair = new THREE.Group();
    chair.position.set(4.2 + s * 0.82, 0, 3.35);
    chair.rotation.y = s * Math.PI / 2;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.06, 0.42, 3, 0.02), woodMat);
    seat.position.y = 0.46;
    chair.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.5, 0.05, 3, 0.02), woodMat);
    back.position.set(0, 0.72, -0.2);
    chair.add(back);
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6), darkMat);
      leg.position.set(lx, 0.23, lz);
      chair.add(leg);
    }
    addObstacle(chair, 'Silla', { low: true, w: 0.45, d: 0.45, labelOffset: 0.9 });
  }

  // Planta de la cocina y detalles
  const kitchenPlant = makePlant(1.55, 3.95, 1.05, 0.2);
  addObstacle(kitchenPlant, 'Planta', { low: true, w: 0.42, d: 0.42, labelOffset: 1.5 });
  const kitchenArt = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshStandardMaterial({ map: makeTextTexture('COCINA', { bg: '#33443f', fg: '#efe2c6', size: 36 }), roughness: 0.7 }));
  kitchenArt.position.set(2.9, 1.72, 4.38);
  kitchenArt.rotation.y = Math.PI;
  group.add(kitchenArt);

  /* ================= PASILLO ================= */
  const hallConsole = new THREE.Group();
  hallConsole.position.set(1.26, 0, -2.55);
  const consoleBody = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.72, 1.05, 3, 0.02), woodMat);
  consoleBody.position.y = 0.36;
  consoleBody.castShadow = true;
  hallConsole.add(consoleBody);
  const consoleTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 1.1), woodDark);
  consoleTop.position.y = 0.735;
  hallConsole.add(consoleTop);
  const keyBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.05, 18), ceramicMat);
  keyBowl.position.set(0, 0.775, 0.26);
  hallConsole.add(keyBowl);
  const hallLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), glowMat);
  hallLamp.position.set(0, 0.9, -0.22);
  hallConsole.add(hallLamp);
  addObstacle(hallConsole, 'Consola del pasillo', { low: true, w: 0.4, d: 1.12, labelOffset: 0.9 });

  const hallArt = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x6e7e83, roughness: 0.8 }));
  hallArt.position.set(1.12, 1.6, -2.55);
  hallArt.rotation.y = Math.PI / 2;
  group.add(hallArt);

  /* ================= BAÑO ================= */
  // Lavabo y espejo (pared este)
  const vanity = new THREE.Group();
  vanity.position.set(6.03, 0, -1.85);
  const vanityBody = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.8, 1.15, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x4d5d60, roughness: 0.6 }));
  vanityBody.position.y = 0.4;
  vanityBody.castShadow = true;
  vanity.add(vanityBody);
  const vanityTop = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.05, 1.22, 3, 0.02), ceramicMat);
  vanityTop.position.y = 0.82;
  vanity.add(vanityTop);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 24), whiteMat);
  basin.position.set(0, 0.85, 0);
  vanity.add(basin);
  const basinTap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.24, 8), steelMat);
  basinTap.position.set(0.16, 0.95, 0);
  vanity.add(basinTap);
  addObstacle(vanity, 'Lavabo', { low: true, w: 0.62, d: 1.2, labelOffset: 1.0 });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75), new THREE.MeshPhysicalMaterial({ color: 0xdfe9ea, roughness: 0.08, metalness: 0.6 }));
  mirror.rotation.y = -Math.PI / 2;
  mirror.position.set(6.38, 1.62, -1.85);
  group.add(mirror);
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.83, 1.03), darkMat);
  mirrorFrame.position.set(6.4, 1.62, -1.85);
  group.add(mirrorFrame);

  // Inodoro
  const toilet = new THREE.Group();
  toilet.position.set(4.35, 0, -4.08);
  const toiletBase = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.38, 22), ceramicMat);
  toiletBase.position.y = 0.19;
  toiletBase.scale.z = 1.15;
  toilet.add(toiletBase);
  const toiletBowl = new THREE.Mesh(new THREE.SphereGeometry(0.24, 22, 14), ceramicMat);
  toiletBowl.scale.set(1, 0.45, 1.2);
  toiletBowl.position.set(0, 0.42, 0.04);
  toilet.add(toiletBowl);
  const toiletSeat = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 24), whiteMat);
  toiletSeat.rotation.x = Math.PI / 2;
  toiletSeat.scale.z = 1.2;
  toiletSeat.position.set(0, 0.5, 0.04);
  toilet.add(toiletSeat);
  const tank = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.52, 0.2, 3, 0.03), ceramicMat);
  tank.position.set(0, 0.74, -0.23);
  toilet.add(tank);
  addObstacle(toilet, 'Inodoro', { low: true, w: 0.55, d: 0.78, labelOffset: 1.1 });

  // Ducha
  const shower = new THREE.Group();
  shower.position.set(5.7, 0, -3.95);
  const tray = new THREE.Mesh(new RoundedBoxGeometry(1.12, 0.09, 1.12, 3, 0.02), whiteMat);
  tray.position.y = 0.045;
  shower.add(tray);
  const showerBack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.02), new THREE.MeshStandardMaterial({ map: tileTex, color: 0xc4d2d3, roughness: 0.4 }));
  showerBack.position.set(0, 1.02, -0.55);
  shower.add(showerBack);
  const glass1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), glassMat);
  glass1.position.set(-0.55, 1.02, 0);
  glass1.rotation.y = Math.PI / 2;
  shower.add(glass1);
  const glass2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.9), glassMat);
  glass2.position.set(-0.3, 1.02, 0.55);
  shower.add(glass2);
  const showerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 18), steelMat);
  showerHead.position.set(0, 2.05, -0.45);
  shower.add(showerHead);
  const showerPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.5, 8), steelMat);
  showerPipe.position.set(0, 2.2, -0.52);
  shower.add(showerPipe);
  addObstacle(shower, 'Ducha', { w: 1.18, d: 1.2, labelOffset: 2.15, low: false });

  // Toallas y detalles del baño
  const towelRail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8), steelMat);
  towelRail.rotation.x = Math.PI / 2;
  towelRail.position.set(5.1, 1.35, -1.32);
  group.add(towelRail);
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.03), new THREE.MeshStandardMaterial({ color: 0xd9d0bc, roughness: 0.98 }));
  towel.position.set(5.1, 1.03, -1.31);
  group.add(towel);
  const bathMat = addRug(4.85, -2.55, 0.9, 0.55);
  if (bathMat) bathMat.material.color.set(0xaebfba);

  /* ================= ETIQUETAS E INTERACCIÓN ================= */
  interactables.push({
    type: 'sofa', id: 'sofa-sala', label: 'Sofá de la sala',
    point: new THREE.Vector3(-1.3, 0, 1.6), radius: 1.42,
    seats: [
      { x: -0.42, z: 1.05, yaw: -Math.PI / 2 },
      { x: -0.42, z: 2.15, yaw: -Math.PI / 2 },
    ],
  });

  zones.push(
    { name: 'Sala', x0: -5.6, x1: 1.0, z0: -1.28, z1: 4.48 },
    { name: 'Cocina', x0: 1.0, x1: 6.48, z0: -1.28, z1: 4.48 },
    { name: 'Pasillo', x0: 1.0, x1: 3.4, z0: -4.58, z1: -1.28 },
    { name: 'Baño', x0: 3.4, x1: 6.48, z0: -4.58, z1: -1.28 }
  );

  function update(dt) {
    const target = fridgeRig.open ? -1.55 : 0;
    fridgeRig.doorPivot.rotation.y += (target - fridgeRig.doorPivot.rotation.y) * (1 - Math.exp(-7 * dt));
    const lightTarget = fridgeRig.open ? 0.32 : 0;
    fridgeRig.light.intensity += (lightTarget - fridgeRig.light.intensity) * (1 - Math.exp(-5 * dt));
    fridgeRig.glow.material.opacity = 0.015 + fridgeRig.light.intensity * 0.01;
  }

  function setFridgeOpen(open) {
    fridgeRig.open = Boolean(open);
  }

  const dispose = () => {};

  return {
    kind: 'home',
    group,
    colliders,
    targets,
    obstacles,
    zones,
    interactables,
    spawn: { x: -3.3, z: 2.2, yaw: 2.0 },
    bounds: { minX: -5.5, maxX: 6.38, minZ: -4.48, maxZ: 4.38 },
    fridge: fridgeRig,
    setFridgeOpen,
    update,
    dispose,
  };

  /* ================= CONSTRUCTORES INTERNOS ================= */
  function makeShelfUnit(x, z, rotY, { id, label, items }) {
    const shelf = new THREE.Group();
    shelf.position.set(x, 0, z);
    shelf.rotation.y = rotY;
    shelf.userData.obstacleLabel = 'Estantería';
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3f3429, roughness: 0.55, metalness: 0.2 });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x6c5138, roughness: 0.62 });
    for (const s of [-1, 1]) {
      for (const zz of [-0.16, 0.16]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.95, 0.05), frameMat);
        post.position.set(s * 0.64, 0.975, zz);
        post.castShadow = true;
        shelf.add(post);
      }
    }
    const boardYs = [0.28, 0.76, 1.24, 1.72];
    for (const y of boardYs) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.035, 0.38), boardMat);
      board.position.set(0, y, 0);
      board.castShadow = true;
      board.receiveShadow = true;
      shelf.add(board);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.6, 0.02), new THREE.MeshStandardMaterial({ color: 0x4b3a2b, roughness: 0.8 }));
    back.position.set(0, 1.0, -0.185);
    shelf.add(back);

    const meta = [];
    for (const item of items) {
      const level = item.level;
      const boardY = boardYs[level] ?? 0.28;
      const object = makeShelfItem(item.kind);
      if (!object) continue;
      const slots = 2;
      const index = meta.filter((m) => m.level === level).length;
      const localX = -0.34 + index * 0.34 + (index >= 1 ? 0.02 : 0);
      object.position.set(localX, boardY + 0.02, 0.02);
      object.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.userData.itemLabel = item.name;
        }
      });
      shelf.add(object);
      meta.push({ ...item, level, object });
    }
    return { group: shelf, items: meta, id, label };
  }

  function makeShelfItem(kind) {
    const g = new THREE.Group();
    const bookColors = [0x7c4d4d, 0x4f6470, 0x6f6340, 0x3d5a50, 0x8a6b4e];
    const add = (geo, mat, x, y, z, rot = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = rot;
      g.add(m);
      return m;
    };
    switch (kind) {
      case 'books':
      case 'book-thin':
      case 'book-blue':
      case 'book-warm':
      case 'book-green': {
        const n = kind === 'books' ? 4 : 1;
        for (let i = 0; i < n; i++) {
          const h = kind === 'books' ? 0.22 + (i % 2) * 0.04 : 0.24;
          const col = kind === 'book-blue' ? 0x3b5266 : kind === 'book-warm' ? 0x8a5d3d : kind === 'book-green' ? 0x47654d : bookColors[(i + (kind === 'books' ? 0 : 2)) % bookColors.length];
          const b = add(new THREE.BoxGeometry(0.045, h, 0.22), new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }), i * 0.055 - 0.07, h / 2, 0, 0.02 - i * 0.01);
          b.castShadow = true;
        }
        break;
      }
      case 'vase': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.22, 18), new THREE.MeshStandardMaterial({ color: 0x8a9c96, roughness: 0.3 }));
        body.position.y = 0.11;
        g.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.09, 18), ceramicMat);
        neck.position.y = 0.265;
        g.add(neck);
        for (let i = 0; i < 3; i++) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 5), greenMat);
          stem.position.set((i - 1) * 0.02, 0.44, (i - 1) * 0.015);
          stem.rotation.z = (i - 1) * 0.15;
          g.add(stem);
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), greenMat2);
          leaf.scale.set(1, 0.5, 0.6);
          leaf.position.set((i - 1) * 0.05, 0.56, (i - 1) * 0.03);
          g.add(leaf);
        }
        break;
      }
      case 'basket': {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 18), new THREE.MeshStandardMaterial({ color: 0x9b7f54, roughness: 0.95 }));
        basket.position.y = 0.1;
        g.add(basket);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 20), new THREE.MeshStandardMaterial({ color: 0x7d6341, roughness: 0.95 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.2;
        g.add(rim);
        const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), blanketMat);
        cloth.scale.set(1, 0.5, 1);
        cloth.position.y = 0.19;
        g.add(cloth);
        break;
      }
      case 'radio': {
        const body = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.16, 0.1, 3, 0.015), new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.5, metalness: 0.2 }));
        body.position.y = 0.1;
        g.add(body);
        const speaker = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 18), new THREE.MeshStandardMaterial({ color: 0x5b6163, roughness: 1 }));
        speaker.rotation.x = Math.PI / 2;
        speaker.position.set(-0.06, 0.1, 0.055);
        g.add(speaker);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), steelMat);
        dial.rotation.x = Math.PI / 2;
        dial.position.set(0.07, 0.12, 0.056);
        g.add(dial);
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 5), steelMat);
        antenna.position.set(0.1, 0.25, 0);
        antenna.rotation.z = 0.25;
        g.add(antenna);
        break;
      }
      case 'clock': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.045, 24), new THREE.MeshStandardMaterial({ color: 0x8a6c4e, roughness: 0.5 }));
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.13, 0);
        g.add(body);
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 0.6 }));
        face.position.set(0, 0.13, 0.025);
        g.add(face);
        for (const [len, rot] of [[0.055, 0.4], [0.07, -1.1]]) {
          const hand = new THREE.Mesh(new THREE.BoxGeometry(0.004, len, 0.003), blackMat);
          hand.position.set(0, 0.13 + len / 2, 0.03);
          hand.rotation.z = rot;
          g.add(hand);
        }
        break;
      }
      case 'photo': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.025), new THREE.MeshStandardMaterial({ color: 0x6d5439, roughness: 0.6 }));
        frame.position.set(0, 0.16, 0);
        g.add(frame);
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.22), new THREE.MeshStandardMaterial({ color: 0x9bb0ad, roughness: 0.8 }));
        photo.position.set(0, 0.16, 0.014);
        g.add(photo);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.06), darkMat);
        stand.position.set(0, 0.04, -0.02);
        g.add(stand);
        break;
      }
      case 'plant': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0x7a5a45, roughness: 0.85 }));
        pot.position.y = 0.05;
        g.add(pot);
        for (let i = 0; i < 7; i++) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), i % 2 ? greenMat : greenMat2);
          leaf.scale.set(1, 0.4, 0.7);
          leaf.position.set((rng() - 0.5) * 0.16, 0.13 + rng() * 0.12, (rng() - 0.5) * 0.12);
          g.add(leaf);
        }
        break;
      }
      case 'game': {
        const box = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.07, 0.22, 3, 0.01), new THREE.MeshStandardMaterial({ color: 0x506d66, roughness: 0.7 }));
        box.position.y = 0.035;
        g.add(box);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.015, 0.18), new THREE.MeshStandardMaterial({ color: 0xc9b28d, roughness: 0.7 }));
        lid.position.y = 0.075;
        g.add(lid);
        for (let i = 0; i < 4; i++) {
          const token = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10), i % 2 ? cushionMat : steelMat);
          token.position.set(-0.07 + i * 0.045, 0.09, 0.02);
          g.add(token);
        }
        break;
      }
      case 'blanket': {
        const blanket = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.1, 0.22, 3, 0.02), blanketMat);
        blanket.position.y = 0.05;
        g.add(blanket);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: 0x8b6f4b, roughness: 1 }));
        line.position.set(0, 0.102, 0.05);
        g.add(line);
        break;
      }
      case 'speaker': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.17, 22), new THREE.MeshStandardMaterial({ color: 0x394345, roughness: 0.9 }));
        body.position.y = 0.085;
        g.add(body);
        const light = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.006, 6, 24), new THREE.MeshBasicMaterial({ color: 0x3ee0d0, toneMapped: false }));
        light.rotation.x = Math.PI / 2;
        light.position.y = 0.17;
        g.add(light);
        break;
      }
      case 'remote': {
        const body = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.02, 0.2, 2, 0.008), blackMat);
        body.position.y = 0.01;
        g.add(body);
        for (let i = 0; i < 5; i++) {
          const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 8), new THREE.MeshStandardMaterial({ color: 0x8a8f92, roughness: 0.5 }));
          btn.position.set(0, 0.022, -0.06 + i * 0.025);
          g.add(btn);
        }
        break;
      }
      case 'candle': {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 18), new THREE.MeshStandardMaterial({ color: 0xd8c9ae, roughness: 0.35 }));
        jar.position.y = 0.05;
        g.add(jar);
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0xf1e3c7, roughness: 0.7 }));
        wax.position.y = 0.095;
        g.add(wax);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), glowMat);
        flame.scale.set(0.7, 1.4, 0.7);
        flame.position.y = 0.13;
        g.add(flame);
        break;
      }
      case 'mugs': {
        for (let i = 0; i < 2; i++) {
          const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.09, 16), i ? ceramicMat : new THREE.MeshStandardMaterial({ color: 0x7d8f88, roughness: 0.35 }));
          mug.position.set(i * 0.11 - 0.055, 0.045, 0);
          g.add(mug);
          const handle = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.007, 6, 12, Math.PI), i ? ceramicMat : new THREE.MeshStandardMaterial({ color: 0x7d8f88, roughness: 0.35 }));
          handle.position.set(i * 0.11 - 0.055 + 0.045, 0.045, 0);
          handle.rotation.z = -Math.PI / 2;
          g.add(handle);
        }
        break;
      }
      default:
        return null;
    }
    return g;
  }

  function makeFridge(x, z) {
    const fridge = new THREE.Group();
    fridge.position.set(x, 0, z);
    fridge.rotation.y = -Math.PI / 2;
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xd7dad6, roughness: 0.28, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    // Carcasa abierta por delante para poder ver el interior
    const backPanel = new THREE.Mesh(new RoundedBoxGeometry(0.82, 1.96, 0.07, 3, 0.02), shellMat);
    backPanel.position.set(0, 0.98, -0.325);
    backPanel.castShadow = true;
    backPanel.receiveShadow = true;
    fridge.add(backPanel);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new RoundedBoxGeometry(0.07, 1.96, 0.7, 3, 0.02), shellMat);
      side.position.set(s * 0.375, 0.98, 0);
      side.castShadow = true;
      fridge.add(side);
    }
    const fridgeTop = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.07, 0.7, 3, 0.02), shellMat);
    fridgeTop.position.set(0, 1.925, 0);
    fridgeTop.castShadow = true;
    fridge.add(fridgeTop);
    const fridgeBottom = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.1, 0.7, 3, 0.02), shellMat);
    fridgeBottom.position.set(0, 0.06, 0);
    fridgeBottom.castShadow = true;
    fridge.add(fridgeBottom);
    // fondo interior (la cavidad queda abierta para ver los productos)
    const interiorBack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 1.66),
      new THREE.MeshStandardMaterial({ color: 0x3d565c, roughness: 0.75 })
    );
    interiorBack.position.set(0, 1.0, -0.27);
    fridge.add(interiorBack);
    // baldas interiores
    const shelfMat = new THREE.MeshPhysicalMaterial({ color: 0xd5e6e7, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.015, 0.5), shelfMat);
      shelf.position.set(0, 0.38 + i * 0.42, -0.03);
      fridge.add(shelf);
    }
    // productos
    const products = [
      { id: 'leche', name: 'Leche', voice: 'La leche está en el estante del medio, a la izquierda.', level: 'Estante medio', category: 'lácteos', count: 1, article: 'una', summary: 'una botella de leche', title: 'Botella de leche entera', detail: 'Una botella de leche entera de un litro, con tapón azul y etiqueta en relieve.' },
      { id: 'manzana', name: 'Manzanas', voice: 'Las manzanas están en el cajón de verduras, abajo.', level: 'Cajón inferior', category: 'fruta', count: 3, article: 'tres', summary: 'tres manzanas', title: 'Tres manzanas', detail: 'Tres manzanas frescas: dos rojas y una verde, en el cajón inferior.' },
      { id: 'agua', name: 'Agua', voice: 'El agua está en el estante del medio, a la derecha.', level: 'Estante medio', category: 'bebidas', count: 1, article: 'una', summary: 'una botella de agua', title: 'Botella de agua mineral', detail: 'Una botella de agua mineral de medio litro, transparente y con tapón azul.' },
      { id: 'queso', name: 'Queso', voice: 'El queso está en el estante superior, junto a los yogures.', level: 'Estante superior', category: 'lácteos', count: 1, article: 'un', summary: 'un trozo de queso', title: 'Queso curado', detail: 'Un trozo de queso curado de oveja, envuelto en papel encerado.' },
      { id: 'jugo', name: 'Jugo de naranja', voice: 'El jugo de naranja está en el estante superior, a la izquierda.', level: 'Estante superior', category: 'bebidas', count: 1, article: 'un', summary: 'un jugo de naranja', title: 'Jugo de naranja', detail: 'Un envase de jugo de naranja sin azúcar añadido, con tapón verde y etiqueta en letra grande.' },
      { id: 'mantequilla', name: 'Mantequilla', voice: 'La mantequilla está en el estante superior, delante.', level: 'Estante superior', category: 'lácteos', count: 1, article: 'una', summary: 'una mantequilla', title: 'Mantequilla', detail: 'Una barra de mantequilla envuelta en papel vegetal, con una marca táctil en la solapa.' },
    ];
    // leche
    const milk = new THREE.Group();
    milk.position.set(-0.18, 0.42, 0.03);
    const milkBody = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.3, 0.12, 2, 0.01), whiteMat);
    milkBody.position.y = 0.15;
    milk.add(milkBody);
    const milkCap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x3f6e9e, roughness: 0.5 }));
    milkCap.position.y = 0.31;
    milk.add(milkCap);
    const milkLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: makeTextTexture('LECHE', { fg: '#2c5c86', size: 38 }), toneMapped: false }));
    milkLabel.position.set(0, 0.17, 0.061);
    milk.add(milkLabel);
    fridge.add(milk);
    // agua
    const waterGroup = new THREE.Group();
    fridge.add(waterGroup);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 14), new THREE.MeshPhysicalMaterial({ color: 0xa9dce6, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0, clearcoat: 1 }));
    water.position.set(0.18, 0.59, 0.02);
    waterGroup.add(water);
    const waterCap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.035, 10), new THREE.MeshStandardMaterial({ color: 0x2d6b8e, roughness: 0.4 }));
    waterCap.position.set(0.18, 0.78, 0.02);
    waterGroup.add(waterCap);
    // manzanas (agrupadas para poder acercarlas a la cámara)
    const apples = new THREE.Group();
    fridge.add(apples);
    for (let i = 0; i < 3; i++) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), new THREE.MeshStandardMaterial({ color: i === 1 ? 0x7da34c : 0xa94034, roughness: 0.55 }));
      apple.position.set(-0.18 + i * 0.12, 0.11, 0.01);
      apples.add(apple);
    }
    // queso
    const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 3), new THREE.MeshStandardMaterial({ color: 0xe4c56e, roughness: 0.7 }));
    cheese.rotation.y = 0.3;
    cheese.position.set(0.16, 1.27, 0.01);
    fridge.add(cheese);
    // jugo de naranja (estante superior, izquierda)
    const juice = new THREE.Group();
    juice.position.set(-0.2, 0.81, 0.035);
    const juiceBody = new THREE.Mesh(
      new RoundedBoxGeometry(0.12, 0.26, 0.11, 2, 0.012),
      new THREE.MeshStandardMaterial({ color: 0xe08a32, roughness: 0.42 })
    );
    juiceBody.position.y = 0.13;
    juice.add(juiceBody);
    const juiceCap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.025, 10), new THREE.MeshStandardMaterial({ color: 0x4b7a3f, roughness: 0.5 }));
    juiceCap.position.y = 0.272;
    juice.add(juiceCap);
    const juiceLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 0.09),
      new THREE.MeshBasicMaterial({ map: makeTextTexture('JUGO', { bg: '#f0a13a', fg: '#4a2b0d', size: 36 }), toneMapped: false })
    );
    juiceLabel.position.set(0, 0.15, 0.057);
    juice.add(juiceLabel);
    fridge.add(juice);
    // mantequilla (estante superior, centro)
    const butter = new THREE.Group();
    butter.position.set(0.03, 0.81, 0.04);
    const butterBody = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.07, 0.1, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0xf0d58b, roughness: 0.65 }));
    butterBody.position.y = 0.035;
    butter.add(butterBody);
    const butterWrap = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.055), new THREE.MeshStandardMaterial({ color: 0xf6edcf, roughness: 0.8 }));
    butterWrap.position.set(0, 0.038, 0.051);
    butter.add(butterWrap);
    fridge.add(butter);
    // yogures
    for (let i = 0; i < 2; i++) {
      const yogurt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), whiteMat);
      yogurt.position.set(-0.06 + i * 0.1, 1.28, 0.0);
      fridge.add(yogurt);
    }
    // cajón de verduras
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.4), new THREE.MeshPhysicalMaterial({ color: 0xcfe0d6, transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false }));
    drawer.position.set(0, 0.2, 0.06);
    fridge.add(drawer);
    const lettuce = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), greenMat2);
    lettuce.scale.set(1, 0.65, 1);
    lettuce.position.set(0.16, 0.16, 0.02);
    fridge.add(lettuce);

    products[0].object = milk;
    products[1].object = apples;
    products[2].object = waterGroup;
    products[3].object = cheese;
    products[4].object = juice;
    products[5].object = butter;

    // Puerta con bisagra
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.4, 0.98, 0.36);
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.92, 0.06, 4, 0.02), shellMat);
    door.position.set(0.4, 0, 0.02);
    door.castShadow = true;
    doorPivot.add(door);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.5, 8), steelMat);
    handle.position.set(0.33, 0.15, 0.06);
    doorPivot.add(handle);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.012, 0.012), darkMat);
    seam.position.set(0.4, -0.25, 0.055);
    doorPivot.add(seam);
    // nota con imán
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshStandardMaterial({ map: makeTextTexture('LISTA', { bg: '#f4e9c8', fg: '#6b4d2a', size: 40 }), roughness: 0.9 }));
    note.position.set(-0.13, 0.25, 0.052);
    doorPivot.add(note);
    fridge.add(doorPivot);

    const light = new THREE.PointLight(0xdff2ff, 0, 2.2, 2);
    light.position.set(0, 1.3, 0.1);
    fridge.add(light);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xcbeef2, transparent: true, opacity: 0.05, toneMapped: false }));
    glow.position.set(0, 1.0, -0.26);
    fridge.add(glow);

    return {
      group: fridge,
      doorPivot,
      light,
      glow,
      products,
      open: false,
      setOpen(value) {
        this.open = Boolean(value);
      },
    };
  }
}

/** Planta reutilizable con maceta. */
function makePlant(x, z, height = 1.2, potRadius = 0.24) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  const potMat = new THREE.MeshStandardMaterial({ color: 0x7b6a5a, roughness: 0.8 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potRadius, potRadius * 0.78, potRadius * 1.8, 20), potMat);
  pot.position.y = potRadius * 0.9;
  pot.castShadow = true;
  plant.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potRadius * 0.92, potRadius * 0.92, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 }));
  soil.position.y = potRadius * 1.8;
  plant.add(soil);
  const green = new THREE.MeshStandardMaterial({ color: 0x2f5b3c, roughness: 0.9 });
  const green2 = new THREE.MeshStandardMaterial({ color: 0x3f744c, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, height * 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x463322, roughness: 0.9 }));
  trunk.position.y = potRadius * 1.8 + height * 0.25;
  plant.add(trunk);
  const rng = mulberry32(Math.round(x * 71 + z * 31) + 5);
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rng() * 0.08, 10, 8), i % 2 ? green : green2);
    leaf.scale.set(1, 0.55, 1);
    leaf.position.set((rng() - 0.5) * 0.4, potRadius * 1.8 + 0.25 + rng() * height * 0.5, (rng() - 0.5) * 0.4);
    leaf.castShadow = true;
    plant.add(leaf);
  }
  return plant;
}
