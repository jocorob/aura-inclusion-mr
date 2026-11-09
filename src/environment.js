import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  makeCanvas,
  canvasTexture,
  makeFloorTexture,
  makeWallTexture,
  makeLabelTexture,
  mulberry32,
  roundRect,
} from './utils.js';

/**
 * Entornos simulados: corredor institucional con sala lateral y vestíbulo,
 * o laberinto generado proceduralmente.
 * Devuelve malla, colisionadores 2D, objetivos de raycast, zonas y punto de inicio.
 */
export function createEnvironment(kind = 'corridor') {
  const group = new THREE.Group();
  group.name = `Environment_${kind}`;
  const colliders = [];
  const targets = [];
  const obstacles = [];
  const zones = [];

  const H = kind === 'labyrinth' ? 2.6 : 2.92;

  /* ---------------- Materiales ---------------- */
  const floorTex = makeFloorTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0x9aa3b0,
    roughness: 0.4,
    metalness: 0.22,
    envMapIntensity: 0.5,
  });
  const wallTex = makeWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    color: 0x7b8593,
    roughness: 0.9,
    metalness: 0.04,
  });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.6, metalness: 0.25 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x141920, roughness: 0.95 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xdfefff, toneMapped: false });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x565d66, roughness: 0.4, metalness: 0.8 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.5, metalness: 0.65 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6d4e34, roughness: 0.72, metalness: 0.05 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x25402c, roughness: 0.85 });
  const greenMat2 = new THREE.MeshStandardMaterial({ color: 0x2f5136, roughness: 0.85 });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.35, toneMapped: false });

  const addBoxMesh = (geo, mat, x, y, z, { cast = true, receive = true, rotY = 0 } = {}) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };

  const addCollider = (cx, cz, w, d, pad = 0) => {
    colliders.push({
      minX: cx - w / 2 - pad,
      maxX: cx + w / 2 + pad,
      minZ: cz - d / 2 - pad,
      maxZ: cz + d / 2 + pad,
    });
  };

  const addWall = (cx, cz, w, d, { collider = true, base = true, height = H } = {}) => {
    const mesh = addBoxMesh(new THREE.BoxGeometry(w, height, d), wallMat, cx, height / 2, cz);
    targets.push(mesh);
    if (collider) addCollider(cx, cz, w, d);
    if (base) {
      const bb = new THREE.Mesh(new THREE.BoxGeometry(w + 0.014, 0.15, d + 0.014), baseMat);
      bb.position.set(cx, 0.075, cz);
      bb.receiveShadow = true;
      group.add(bb);
    }
    return mesh;
  };

  const addObstacle = (mesh, label, { low = false, pad = 0.02, labelOffset = 0.9 } = {}) => {
    mesh.userData.obstacleLabel = label;
    mesh.userData.isObstacle = true;
    targets.push(mesh);
    obstacles.push({ mesh, label, low, labelOffset });
    const box = new THREE.Box3().setFromObject(mesh);
    addCollider((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, box.max.x - box.min.x, box.max.z - box.min.z, pad);
  };

  const addLabel = (text, x, y, z, { scale = 1, color = '#bfeee9' } = {}) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeLabelTexture(text, { color }),
        transparent: true,
        depthWrite: false,
        opacity: 0.94,
      })
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(1.05 * scale, 0.265 * scale, 1);
    group.add(sprite);
    return sprite;
  };

  const addCeilingLight = (x, z, length = 1.9, intensity = 16, warm = false) => {
    const fixture = addBoxMesh(
      new THREE.BoxGeometry(0.18, 0.03, length),
      new THREE.MeshBasicMaterial({ color: warm ? 0xffe3c0 : 0xe6f2ff, toneMapped: false }),
      x,
      H - 0.05,
      z,
      { cast: false, receive: false }
    );
    fixture.material.opacity = 1;
    const light = new THREE.PointLight(warm ? 0xffd9b0 : 0xdcecff, intensity, Math.max(9, length * 4.2), 2);
    light.position.set(x, H - 0.25, z);
    group.add(light);
    // Difusor
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, length + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(x, H - 0.07, z);
    group.add(halo);
  };

  const addFloorGrid = (size, divisions) => {
    const grid = new THREE.GridHelper(size, divisions, 0x3ee0d0, 0x2b6d7a);
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.085;
    grid.material.depthWrite = false;
    group.add(grid);
    return grid;
  };

  const addTactilePath = (x, z, length) => {
    const { canvas, ctx } = makeCanvas(128, 128);
    ctx.fillStyle = '#8f866d';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(60, 55, 42, 0.55)';
    for (let dy = 10; dy < 128; dy += 22) {
      for (let dx = 10; dx < 128; dx += 22) {
        ctx.beginPath();
        ctx.arc(dx, dy, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = canvasTexture(canvas, { repeat: [1, Math.max(1, length / 0.4)] });
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, length),
      new THREE.MeshStandardMaterial({ map: tex, color: 0xbdb08e, roughness: 0.9 })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.014, z);
    strip.receiveShadow = true;
    group.add(strip);
  };

  const addPoster = (x, y, z, rotY) => {
    const { canvas, ctx } = makeCanvas(512, 720);
    const g = ctx.createLinearGradient(0, 0, 512, 720);
    g.addColorStop(0, '#0e1724');
    g.addColorStop(1, '#070d15');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = 'rgba(232, 65, 79, 0.8)';
    ctx.lineWidth = 3;
    roundRect(ctx, 30, 30, 452, 660, 18);
    ctx.stroke();
    // Anillos concéntricos
    ctx.strokeStyle = 'rgba(62, 224, 208, 0.5)';
    ctx.lineWidth = 2;
    for (let r = 40; r < 190; r += 26) {
      ctx.beginPath();
      ctx.arc(256, 270, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8414f';
    ctx.beginPath();
    ctx.arc(256, 270, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2f6fb';
    ctx.textAlign = 'center';
    ctx.font = '300 70px Inter, Arial, sans-serif';
    ctx.fillText('AURA', 256, 520);
    ctx.fillStyle = 'rgba(62, 224, 208, 0.9)';
    ctx.font = '400 20px monospace';
    ctx.fillText('TECNOLOGÍA PARA LA INCLUSIÓN', 256, 566);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '400 16px monospace';
    ctx.fillText('PERCEPCIÓN · VOZ · AUTONOMÍA', 256, 610);
    const tex = canvasTexture(canvas);
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.27),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.1, emissive: 0x0a1a20, emissiveMap: tex, emissiveIntensity: 0.25 })
    );
    poster.position.set(x, y, z);
    poster.rotation.y = rotY;
    group.add(poster);
    return poster;
  };

  const makeBench = (x, z, rotY = 0) => {
    const bench = new THREE.Group();
    bench.position.set(x, 0, z);
    bench.rotation.y = rotY;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.075, 0.42, 3, 0.02), woodMat);
    seat.position.y = 0.46;
    seat.castShadow = true;
    bench.add(seat);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.36), darkMetal);
      leg.position.set(s * 0.55, 0.22, 0);
      leg.castShadow = true;
      bench.add(leg);
    }
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.28, 0.05, 3, 0.02), woodMat);
    back.position.set(0, 0.78, -0.19);
    back.castShadow = true;
    bench.add(back);
    group.add(bench);
    addObstacle(bench, 'Banca', { low: true });
    return bench;
  };

  const makePlant = (x, z, height = 1.35) => {
    const plant = new THREE.Group();
    plant.position.set(x, 0, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x4b4f55, roughness: 0.75 }));
    pot.position.y = 0.25;
    pot.castShadow = true;
    plant.add(pot);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 }));
    soil.position.y = 0.5;
    plant.add(soil);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, height * 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x3a2c1f, roughness: 0.9 }));
    trunk.position.y = 0.5 + height * 0.25;
    plant.add(trunk);
    const rng = mulberry32(Math.floor(x * 100 + z * 13) + 99);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 + rng() * 0.1, 10, 8), i % 2 ? greenMat : greenMat2);
      leaf.scale.set(1, 0.62, 1);
      leaf.position.set((rng() - 0.5) * 0.42, 0.72 + rng() * height * 0.45, (rng() - 0.5) * 0.42);
      leaf.castShadow = true;
      plant.add(leaf);
    }
    group.add(plant);
    addObstacle(plant, 'Jardinera', { low: true, labelOffset: 1.2 });
    return plant;
  };

  const makeCabinet = (x, z, rotY = 0) => {
    const cab = new THREE.Group();
    cab.position.set(x, 0, z);
    cab.rotation.y = rotY;
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.52, 1.55, 0.44, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x3d4854, roughness: 0.55, metalness: 0.35 }));
    body.position.y = 0.775;
    body.castShadow = true;
    cab.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.03, 0.46), darkMetal);
    top.position.y = 1.565;
    cab.add(top);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.01), new THREE.MeshBasicMaterial({ color: 0x0b1118 }));
    slot.position.set(0, 1.32, 0.225);
    cab.add(slot);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0x1d6b56, roughness: 0.6, emissive: 0x0d3a2e, emissiveIntensity: 0.4 }));
    badge.position.set(0, 0.9, 0.226);
    cab.add(badge);
    group.add(cab);
    addObstacle(cab, 'Punto de reciclaje');
    return cab;
  };

  const makeShelf = (x, z, rotY = 0) => {
    const shelf = new THREE.Group();
    shelf.position.set(x, 0, z);
    shelf.rotation.y = rotY;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.92, 0.05), metalMat);
      post.position.set(s * 0.62, 0.96, 0.18);
      post.castShadow = true;
      shelf.add(post);
      const post2 = post.clone();
      post2.position.z = -0.18;
      shelf.add(post2);
    }
    for (let i = 0; i < 4; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.035, 0.44), darkMetal);
      board.position.y = 0.32 + i * 0.5;
      board.castShadow = true;
      board.receiveShadow = true;
      shelf.add(board);
      for (let b = 0; b < 3; b++) {
        if ((i + b) % 4 === 0) continue;
        const box = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.2 + (b % 2) * 0.08, 0.28, 2, 0.015), new THREE.MeshStandardMaterial({ color: b % 2 ? 0x6d6257 : 0x4d5a66, roughness: 0.85 }));
        box.position.set(-0.4 + b * 0.4, 0.44 + i * 0.5, 0);
        box.castShadow = true;
        shelf.add(box);
      }
    }
    group.add(shelf);
    addObstacle(shelf, 'Estantería', { labelOffset: 1.9 });
    return shelf;
  };

  const makeColumn = (x, z, radius = 0.32) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, H, 28), new THREE.MeshStandardMaterial({ color: 0x727a85, roughness: 0.78, metalness: 0.06 }));
    col.position.set(x, H / 2, z);
    col.castShadow = true;
    col.receiveShadow = true;
    group.add(col);
    targets.push(col);
    obstacles.push({ mesh: col, label: 'Columna', low: false, labelOffset: 1.2 });
    addCollider(x, z, radius * 2, radius * 2);
    // Zócalo metálico
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.035, radius + 0.05, 0.12, 28), darkMetal);
    ring.position.set(x, 0.06, z);
    group.add(ring);
    return col;
  };

  const addDoorFrame = (x, z, width = 1.5, h = 2.2) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.24), darkMetal);
    side.position.set(x - width / 2, h / 2, z);
    group.add(side);
    const side2 = side.clone();
    side2.position.x = x + width / 2;
    group.add(side2);
    const header = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.13, 0.24), darkMetal);
    header.position.set(x, h + 0.065, z);
    group.add(header);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.26), new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.35, toneMapped: false }));
    sill.position.set(x, 0.006, z);
    group.add(sill);
  };

  /* ================= CORREDOR ================= */
  if (kind === 'corridor') {
    // Suelo y techo
    const floor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 34), floorMat);
    floor.position.set(0, -0.1, -5);
    floor.receiveShadow = true;
    group.add(floor);
    floorTex.repeat.set(9, 12);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 34), ceilMat);
    ceiling.position.set(0, H + 0.1, -5);
    ceiling.receiveShadow = true;
    group.add(ceiling);

    // Muros del corredor
    addWall(-1.79, -4, 0.18, 16); // muro izquierdo z: -12..4
    addWall(1.79, 1.25, 0.18, 5.5); // derecho z: -1.5..4
    addWall(1.79, -9.25, 0.18, 5.5); // derecho z: -12..-6.5
    addWall(0, 4.09, 3.76, 0.18); // muro de fondo tras el spawn

    // Muro final con hueco hacia el vestíbulo
    addWall(-1.245, -12.09, 1.09, 0.18);
    addWall(1.245, -12.09, 1.09, 0.18);
    // Cierre del vestíbulo a los lados del vano
    addWall(-2.94, -12.09, 2.12, 0.18);
    addWall(2.94, -12.09, 2.12, 0.18);
    addDoorFrame(0, -12.02, 1.4, 2.42);

    // Sala lateral derecha
    addWall(6.69, -4, 0.18, 5.2); // fondo sala x=6.6
    addWall(4.2, -6.66, 5.2, 0.18); // muro norte sala
    addWall(4.2, -1.34, 5.2, 0.18); // muro sur sala

    // Vestíbulo
    addWall(-4.09, -14.5, 0.18, 5.0);
    addWall(4.09, -14.5, 0.18, 5.0);
    addWall(0, -17.09, 8.36, 0.18);
    // Pilastras del vestíbulo
    makeColumn(-2.35, -14.2, 0.34);
    makeColumn(2.35, -14.2, 0.34);

    // Iluminación
    addCeilingLight(0, 2.2, 2.0, 10);
    addCeilingLight(0, -1.6, 2.0, 10);
    addCeilingLight(0, -5.4, 2.0, 10);
    addCeilingLight(0, -9.2, 2.0, 10);
    addCeilingLight(-2.2, -14.0, 2.2, 14, true);
    addCeilingLight(2.2, -14.0, 2.2, 14, true);

    addFloorGrid(26, 26);
    addTactilePath(0, -2, 12);
    addTactilePath(0, -14.4, 4.6);

    // Señalética
    addLabel('PASILLO A', 1.5, 2.35, -5.5, { scale: 0.9 });
    addLabel('SALA LATERAL', 5.9, 2.2, -6.5, { scale: 0.8 });
    addLabel('SALIDA →', 1.6, 2.25, -1.2, { scale: 0.7 });
    addLabel('VESTÍBULO', 0, 2.5, -16.6, { scale: 1.15, color: '#f3d9a4' });
    addPoster(-1.68, 1.72, -6.4, Math.PI / 2);
    addPoster(1.68, 1.72, -2.9, -Math.PI / 2);

    // Obstáculos
    makeColumn(0.52, -3.55, 0.3);
    makeBench(-1.36, -1.5);
    makeCabinet(1.34, -0.35);
    makeShelf(-1.28, -7.0);
    makePlant(0.82, -8.15, 1.45);
    makeCabinet(5.9, -5.9);
    makePlant(3.0, -2.35, 1.2);
    makeBench(-2.75, -13.2);
    makePlant(3.2, -16.2, 1.3);

    // Decoración del vestíbulo
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x24302f, roughness: 0.95 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.008, -14.3);
    rug.receiveShadow = true;
    group.add(rug);

    // Punto de referencia holográfico del vestíbulo
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.6, 40),
      new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, -14.3);
    group.add(ring);

    zones.push(
      { name: 'Pasillo A', x0: -1.8, x1: 1.8, z0: -12, z1: 4 },
      { name: 'Sala lateral', x0: 1.8, x1: 6.6, z0: -6.6, z1: -1.4 },
      { name: 'Vestíbulo', x0: -4, x1: 4, z0: -17, z1: -12 }
    );

    return {
      kind,
      group,
      colliders,
      targets,
      obstacles,
      zones,
      spawn: { x: 0, z: 0.8, yaw: Math.PI },
      bounds: { minX: -8, maxX: 8, minZ: -18, maxZ: 5 },
      dispose: () => {},
    };
  }

  /* ================= LABERINTO ================= */
  const RNG = mulberry32(20260411);
  const cells = 5;
  const S = 2.65;
  const x0 = -((cells * S) / 2);
  const z0 = -((cells * S) / 2);
  const doorways = new Set();
  const visited = Array.from({ length: cells }, () => new Array(cells).fill(false));
  const key = (i, j, d) => `${i},${j},${d}`;

  const stack = [[2, 2]];
  visited[2][2] = true;
  while (stack.length) {
    const [ci, cj] = stack[stack.length - 1];
    const options = [];
    if (ci > 0 && !visited[ci - 1][cj]) options.push([-1, 0, 'W']);
    if (ci < cells - 1 && !visited[ci + 1][cj]) options.push([1, 0, 'E']);
    if (cj > 0 && !visited[ci][cj - 1]) options.push([0, -1, 'N']);
    if (cj < cells - 1 && !visited[ci][cj + 1]) options.push([0, 1, 'S']);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [di, dj, dir] = options[Math.floor(RNG() * options.length)];
    const ni = ci + di;
    const nj = cj + dj;
    visited[ni][nj] = true;
    const opp = { W: 'E', E: 'W', N: 'S', S: 'N' }[dir];
    doorways.add(key(ci, cj, dir));
    doorways.add(key(ni, nj, opp));
    stack.push([ni, nj]);
  }
  // Abrir pasajes adicionales para generar bucles
  for (let i = 0; i < cells - 1; i++) {
    if (RNG() > 0.55) {
      doorways.add(key(i, 1, 'E'));
      doorways.add(key(i + 1, 1, 'W'));
    }
    if (RNG() > 0.6) {
      doorways.add(key(1, i, 'S'));
      doorways.add(key(1, i + 1, 'N'));
    }
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(cells * S + 2, 0.2, cells * S + 2), floorMat);
  floor.position.set(0, -0.1, 0);
  floor.receiveShadow = true;
  group.add(floor);
  floorTex.repeat.set(4, 4);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(cells * S + 2, 0.2, cells * S + 2), ceilMat);
  ceiling.position.set(0, H + 0.1, 0);
  group.add(ceiling);

  const wallThick = 0.16;
  // Muros horizontales (a lo largo de X)
  for (let j = 0; j <= cells; j++) {
    for (let i = 0; i < cells; i++) {
      const openN = j > 0 && doorways.has(key(i, j - 1, 'S'));
      const openS = j < cells && doorways.has(key(i, j, 'N'));
      if (openN || openS) continue;
      const z = z0 + j * S;
      const x = x0 + i * S + S / 2;
      addWall(x, z, S, wallThick);
    }
  }
  // Muros verticales (a lo largo de Z)
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j < cells; j++) {
      const openW = i > 0 && doorways.has(key(i - 1, j, 'E'));
      const openE = i < cells && doorways.has(key(i, j, 'W'));
      if (openW || openE) continue;
      const x = x0 + i * S;
      const z = z0 + j * S + S / 2;
      addWall(x, z, wallThick, S);
    }
  }

  // Iluminación
  addCeilingLight(0, -2.5, 1.4, 14);
  addCeilingLight(0, 2.5, 1.4, 14);
  addCeilingLight(-4.8, 0, 1.4, 12, true);
  addCeilingLight(4.8, 0, 1.4, 12, true);

  addFloorGrid(cells * S + 2, 18);

  // Obstáculos dentro de celdas abiertas
  makeColumn(x0 + 0.5 * S, z0 + 0.5 * S, 0.26);
  makeCabinet(x0 + 3.6 * S, z0 + 0.8 * S);
  makePlant(x0 + 1.5 * S, z0 + 3.5 * S, 1.2);
  makeBench(x0 + 3.5 * S, z0 + 3.4 * S);
  makeShelf(x0 + 0.6 * S, z0 + 0.6 * S, Math.PI / 2);

  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      zones.push({
        name: `Laberinto · N${i + 1}${j + 1}`,
        x0: x0 + i * S,
        x1: x0 + i * S + S,
        z0: z0 + j * S,
        z1: z0 + j * S + S,
      });
    }
  }

  addLabel('ZONA DE PRUEBA', 0, 2.3, z0 + 0.2, { scale: 0.9 });

  return {
    kind,
    group,
    colliders,
    targets,
    obstacles,
    zones,
    spawn: { x: x0 + 2.5 * S, z: z0 + 2.5 * S, yaw: 0 },
    bounds: { minX: x0, maxX: x0 + cells * S, minZ: z0, maxZ: z0 + cells * S },
    dispose: () => {},
  };
}

export function zoneAt(env, x, z) {
  for (const zone of env.zones) {
    if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone.name;
  }
  return 'Área no mapeada';
}
