import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  canvasTexture,
  makeGrilleTexture,
  makeLogoTexture,
  makePcbTexture,
  makeRplidarTexture,
  makeWeaveTexture,
  makeGlowTexture,
  ribbonGeometry,
} from './utils.js';

/**
 * Construye el conjunto digital: maniquí + arnés de pecho + caja AURA +
 * cámara frontal + LiDAR ToF RPLIDAR C1.
 * Sistema local: origen en los pies, +Z al frente, +Y arriba.
 */
export function createAuraRig() {
  const root = new THREE.Group();
  root.name = 'AURA_RIG';

  const glowTex = makeGlowTexture();
  const weaveTex = makeWeaveTexture();
  const logoText = makeLogoTexture();
  const rplidarTex = makeRplidarTexture();
  const grilleTex = makeGrilleTexture();
  const pcbTex = makePcbTexture();

  /* ---------------- Materiales ---------------- */
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xcdc4b4,
    roughness: 0.58,
    metalness: 0.02,
    clearcoat: 0.18,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.55,
  });

  const shirt = new THREE.MeshPhysicalMaterial({
    color: 0x4a4f57,
    roughness: 0.92,
    metalness: 0.02,
    sheen: 0.5,
    sheenRoughness: 0.85,
    sheenColor: 0x8e949e,
    clearcoat: 0.03,
    envMapIntensity: 0.4,
  });

  const trouser = new THREE.MeshStandardMaterial({
    color: 0x282b33,
    roughness: 0.94,
    metalness: 0.02,
  });

  const hairMat = new THREE.MeshStandardMaterial({ color: 0x231a15, roughness: 0.72, metalness: 0.05 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.55, metalness: 0.1 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x9c5d55, roughness: 0.5 });
  const eyeLine = new THREE.MeshStandardMaterial({ color: 0x38281f, roughness: 0.65 });
  const caneWhite = new THREE.MeshStandardMaterial({ color: 0xe9ebf0, roughness: 0.42, metalness: 0.18 });
  const caneRed = new THREE.MeshStandardMaterial({ color: 0xc4212f, roughness: 0.5 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.48, metalness: 0.15 });
  const skinTone = new THREE.MeshPhysicalMaterial({
    color: 0xb98a6d,
    roughness: 0.64,
    metalness: 0.01,
    clearcoat: 0.06,
    clearcoatRoughness: 0.8,
    envMapIntensity: 0.3,
  });

  const navy = new THREE.MeshPhysicalMaterial({
    color: 0x1b2a4b,
    roughness: 0.3,
    metalness: 0.55,
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.25,
  });

  const blackPlastic = new THREE.MeshPhysicalMaterial({
    color: 0x101216,
    roughness: 0.42,
    metalness: 0.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.9,
  });

  const softBlack = new THREE.MeshStandardMaterial({
    color: 0x0a0b0e,
    roughness: 0.75,
    metalness: 0.15,
  });

  const webbing = new THREE.MeshStandardMaterial({
    color: 0x1a1c21,
    map: weaveTex,
    roughness: 0.94,
    metalness: 0.02,
  });

  const metal = new THREE.MeshStandardMaterial({
    color: 0x2a2d33,
    roughness: 0.36,
    metalness: 0.85,
  });

  const acrylic = new THREE.MeshPhysicalMaterial({
    color: 0xdfeeff,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.8,
    depthWrite: false,
  });

  const redTrim = new THREE.MeshStandardMaterial({
    color: 0x8e1f2a,
    emissive: 0x7a101c,
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.4,
  });

  const greenLED = new THREE.MeshBasicMaterial({ color: 0x74ffb4, toneMapped: false });
  const cyanEmissive = new THREE.MeshBasicMaterial({ color: 0x3ee0d0, toneMapped: false });

  /* ---------------- Maniquí ---------------- */
  const body = new THREE.Group();
  body.name = 'Mannequin';
  root.add(body);

  // Torso
  const profile = [
    [0.0, 0.0],
    [0.15, 0.0],
    [0.162, 0.05],
    [0.17, 0.14],
    [0.184, 0.26],
    [0.19, 0.36],
    [0.178, 0.45],
    [0.15, 0.5],
    [0.105, 0.55],
    [0.055, 0.575],
    [0.0, 0.585],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torsoGeo = new THREE.LatheGeometry(profile, 44);
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.scale.set(1.02, 1, 0.76);
  torso.position.y = 0.94;
  torso.castShadow = true;
  torso.receiveShadow = true;
  body.add(torso);

  // Pelvis
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.155, 28, 20), trouser);
  pelvis.scale.set(1.05, 0.75, 0.85);
  pelvis.position.y = 0.94;
  pelvis.castShadow = true;
  body.add(pelvis);

  // Hombros
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.078, 22, 16), shirt);
    shoulder.scale.set(1, 0.92, 0.9);
    shoulder.position.set(0.177 * s, 1.435, 0);
    shoulder.castShadow = true;
    body.add(shoulder);
  }

  // Cuello y cabeza
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.1, 20), skinTone);
  neck.position.y = 1.525;
  body.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.6;
  body.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.104, 32, 24), skinTone);
  head.scale.set(0.92, 1.12, 0.98);
  head.position.y = 0.075;
  head.castShadow = true;
  headGroup.add(head);

  // Orejas
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), skinTone);
    ear.scale.set(0.5, 0.95, 0.62);
    ear.position.set(0.091 * s, 0.074, 0.004);
    headGroup.add(ear);
  }

  // Cabello
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.111, 28, 18, 0, Math.PI * 2, 0, 1.18),
    hairMat
  );
  hairCap.scale.set(0.98, 1.05, 1.02);
  hairCap.position.set(0, 0.076, 0.0);
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.086, 20, 14), hairMat);
  hairBack.scale.set(0.96, 0.98, 0.7);
  hairBack.position.set(0, 0.05, -0.062);
  headGroup.add(hairBack);

  const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), hairMat);
  quiff.scale.set(1.35, 0.42, 0.62);
  quiff.position.set(0, 0.163, 0.055);
  quiff.rotation.x = 0.25;
  headGroup.add(quiff);

  for (const s of [-1, 1]) {
    const sideburn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.036, 0.03), hairMat);
    sideburn.position.set(0.092 * s, 0.065, 0.005);
    headGroup.add(sideburn);
  }

  // Cejas
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.0045, 0.008), hairMat);
    brow.position.set(0.034 * s, 0.113, 0.098);
    brow.rotation.z = -0.08 * s;
    brow.rotation.x = 0.12;
    headGroup.add(brow);
  }

  // Ojos cerrados: línea de párpado fina
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.002, 0.021, 3, 8), eyeLine);
    eye.rotation.z = Math.PI / 2;
    eye.rotation.y = -0.12 * s;
    eye.position.set(0.034 * s, 0.096, 0.1015);
    headGroup.add(eye);

    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8), skinTone);
    lid.scale.set(1.02, 0.16, 0.26);
    lid.position.set(0.034 * s, 0.106, 0.099);
    headGroup.add(lid);

    const lash = new THREE.Mesh(new THREE.CapsuleGeometry(0.0012, 0.019, 3, 6), hairMat);
    lash.rotation.z = Math.PI / 2;
    lash.position.set(0.034 * s, 0.0995, 0.1005);
    headGroup.add(lash);
  }

  // Gafas oscuras de usuario invidente (referencia fotográfica)
  const glassesFrame = new THREE.MeshStandardMaterial({ color: 0x191c21, metalness: 0.35, roughness: 0.55 });
  const glassesMat = new THREE.MeshPhysicalMaterial({
    color: 0x141821,
    roughness: 0.12,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.2,
  });
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.0228, 20, 14), glassesMat);
    lens.scale.set(1.0, 0.82, 0.2);
    lens.position.set(0.0345 * s, 0.0975, 0.0935);
    lens.rotation.y = -0.12 * s;
    headGroup.add(lens);

    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.068), glassesMat);
    temple.position.set(0.086 * s, 0.0985, 0.062);
    temple.rotation.y = 0.06 * s;
    headGroup.add(temple);

    const templeFront = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.003, 0.003), glassesFrame);
    templeFront.position.set(0.070 * s, 0.0975, 0.0925);
    templeFront.rotation.y = -0.45 * s;
    headGroup.add(templeFront);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0232, 0.0017, 8, 28), glassesFrame);
    rim.position.set(0.0345 * s, 0.0975, 0.0975);
    rim.rotation.y = -0.12 * s;
    rim.scale.set(1.0, 0.82, 1.0);
    headGroup.add(rim);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0024, 0.0028), glassesFrame);
  bridge.position.set(0, 0.1005, 0.0995);
  headGroup.add(bridge);

  // Nariz
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.034, 12), skinTone);
  nose.rotation.x = Math.PI / 2.05;
  nose.position.set(0, 0.064, 0.104);
  nose.castShadow = true;
  headGroup.add(nose);

  // Labios
  const lips = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 10), lipMat);
  lips.scale.set(1, 0.18, 0.22);
  lips.position.set(0, 0.03, 0.101);
  headGroup.add(lips);

  // Mandíbula sutil
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), skinTone);
  jaw.scale.set(0.92, 0.62, 0.86);
  jaw.position.set(0, 0.018, 0.014);
  headGroup.add(jaw);

  // Cuello de la camiseta
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.013, 8, 24), shirt);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.527;
  body.add(collar);

  // Brazos con pivotes para animación
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.196 * side, 1.42, 0);
    pivot.rotation.z = 0.14 * side;
    pivot.rotation.x = -0.05;

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.049, 0.19, 6, 14), skinTone);
    upper.position.y = -0.145;
    upper.castShadow = true;
    pivot.add(upper);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 12), shirt);
    shoulderCap.scale.set(1, 0.95, 0.95);
    pivot.add(shoulderCap);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.058, 0.16, 16), shirt);
    sleeve.position.y = -0.08;
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const sleeveHem = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.006, 6, 20), shirt);
    sleeveHem.rotation.x = Math.PI / 2;
    sleeveHem.position.y = -0.161;
    pivot.add(sleeveHem);

    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    elbow.rotation.x = -0.18;
    pivot.add(elbow);

    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.17, 6, 14), skinTone);
    fore.position.y = -0.13;
    fore.castShadow = true;
    elbow.add(fore);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), skinTone);
    hand.scale.set(0.72, 1.25, 0.55);
    hand.position.y = -0.255;
    hand.castShadow = true;
    elbow.add(hand);

    if (side === 1) {
      // Bastón blanco plegable: seña de identidad de la persona usuaria
      const cane = new THREE.Group();
      cane.position.set(0.018, -0.268, 0.035);
      cane.rotation.x = -0.34;
      cane.rotation.z = -0.18;

      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.13, 12), gripMat);
      grip.position.y = -0.045;
      cane.add(grip);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.72, 10), caneWhite);
      shaft.position.y = -0.47;
      shaft.castShadow = true;
      cane.add(shaft);

      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.085, 10), caneRed);
      band.position.y = -0.78;
      cane.add(band);

      const caneTip = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.055, 10), gripMat);
      caneTip.position.y = -0.85;
      cane.add(caneTip);

      // Anilla de muñeca
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16), gripMat);
      strap.rotation.x = Math.PI / 2.4;
      cane.add(strap);

      elbow.add(cane);
    }

    return pivot;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  body.add(leftArm, rightArm);

  // Piernas
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.083 * side, 0.93, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.25, 6, 16), trouser);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    pivot.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.42;
    pivot.add(knee);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.26, 6, 16), trouser);
    shin.position.y = -0.19;
    shin.castShadow = true;
    knee.add(shin);

    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.065, 0.22, 3, 0.025), shoeMat);
    foot.position.set(0, -0.365, 0.045);
    foot.castShadow = true;
    knee.add(foot);

    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.104, 0.018, 0.225, 2, 0.008), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.85 }));
    sole.position.set(0, -0.398, 0.045);
    knee.add(sole);

    return { pivot, knee };
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  body.add(leftLeg.pivot, rightLeg.pivot);

  // Cinturón y dobladillo de la camiseta
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.012, 8, 40), gripMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.8, 1);
  belt.position.y = 1.005;
  body.add(belt);

  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.009, 8, 40), shirt);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1.01, 0.78, 1);
  hem.position.y = 1.025;
  body.add(hem);

  /* ---------------- Arnés ---------------- */
  const harness = new THREE.Group();
  harness.name = 'Harness';
  root.add(harness);

  const strap = (pts, width = 0.038, thickness = 0.006, hint = new THREE.Vector3(1, 0, 0), closed = false) => {
    const geo = ribbonGeometry(pts.map((p) => new THREE.Vector3(...p)), width, thickness, hint, 80, closed);
    const mesh = new THREE.Mesh(geo, webbing);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    harness.add(mesh);
    return mesh;
  };

  // Correas de hombro
  for (const s of [-1, 1]) {
    strap(
      [
        [0.062 * s, 1.383, 0.2],
        [0.102 * s, 1.432, 0.152],
        [0.138 * s, 1.477, 0.078],
        [0.156 * s, 1.5, 0.004],
        [0.152 * s, 1.487, -0.072],
        [0.125 * s, 1.423, -0.134],
        [0.086 * s, 1.335, -0.162],
        [0.055 * s, 1.262, -0.158],
      ],
      0.04
    );

    // Correa de ajuste frontal
    strap(
      [
        [0.075 * s, 1.375, 0.2],
        [0.098 * s, 1.32, 0.196],
        [0.108 * s, 1.24, 0.176],
      ],
      0.032
    );
  }

  // Correa de pecho (cerrada) y cintura
  const loopPoints = (y, rx, rz, n = 14) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.sin(a) * rx, y + Math.sin(a * 2) * 0.004, Math.cos(a) * rz]);
    }
    return pts;
  };
  const chestStrap = strap(loopPoints(1.243, 0.203, 0.158), 0.036, 0.006, new THREE.Vector3(0, 1, 0), true);
  const waistStrap = strap(loopPoints(1.075, 0.19, 0.148), 0.032, 0.006, new THREE.Vector3(0, 1, 0), true);

  // Correa vertical frontal de unión
  strap(
    [
      [0, 1.198, 0.203],
      [0, 1.16, 0.192],
      [0, 1.09, 0.166],
    ],
    0.03
  );

  // Correa de la espalda en X
  for (const s of [-1, 1]) {
    strap(
      [
        [0.14 * s, 1.468, -0.128],
        [0.09 * s, 1.35, -0.15],
        [-0.02 * s, 1.21, -0.152],
        [-0.09 * s, 1.12, -0.14],
      ],
      0.034
    );
  }

  // Placa posterior
  const backPlate = new THREE.Mesh(new RoundedBoxGeometry(0.185, 0.15, 0.024, 4, 0.011), blackPlastic);
  backPlate.position.set(0, 1.31, -0.183);
  backPlate.castShadow = true;
  harness.add(backPlate);

  const backRail = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.17, 0.03, 3, 0.008), metal);
  backRail.position.set(0, 1.31, -0.2);
  harness.add(backRail);

  // Almohadilla tras la caja
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.16, 0.016, 4, 0.006), softBlack);
  pad.position.set(0, 1.29, 0.125);
  harness.add(pad);

  // Hebillas
  function makeBuckle(w = 0.046, h = 0.034, d = 0.014) {
    const g = new THREE.Group();
    const bar = (bw, bh, bd, x, y) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 2, 0.0035), blackPlastic);
      m.position.set(x, y, 0);
      m.castShadow = true;
      g.add(m);
    };
    bar(w, 0.006, d, 0, h / 2);
    bar(w, 0.006, d, 0, -h / 2);
    bar(0.006, h, d, w / 2, 0);
    bar(0.006, h, d, -w / 2, 0);
    bar(w * 0.84, 0.0045, d * 0.9, 0, 0);
    return g;
  }

  const buckleDefs = [
    { p: [-0.107, 1.425, 0.15], n: [-0.55, 0.25, 1] },
    { p: [0.107, 1.425, 0.15], n: [0.55, 0.25, 1] },
    { p: [-0.09, 1.352, -0.166], n: [-0.3, 0.1, -1] },
    { p: [0.09, 1.352, -0.166], n: [0.3, 0.1, -1] },
    { p: [0.183, 1.075, 0.052], n: [1, 0.1, 0.45] },
  ];
  for (const def of buckleDefs) {
    const b = makeBuckle();
    b.position.set(...def.p);
    b.lookAt(new THREE.Vector3(def.p[0] + def.n[0], def.p[1] + def.n[1], def.p[2] + def.n[2]));
    harness.add(b);
  }

  // Pequeña etiqueta tejida
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  const lctx = labelCanvas.getContext('2d');
  lctx.fillStyle = '#141519';
  lctx.fillRect(0, 0, 256, 96);
  lctx.strokeStyle = 'rgba(232, 65, 79, 0.7)';
  lctx.lineWidth = 2;
  lctx.strokeRect(6, 6, 244, 84);
  lctx.fillStyle = '#e8414f';
  lctx.font = '600 36px Inter, Arial, sans-serif';
  lctx.textAlign = 'center';
  lctx.fillText('AURA', 128, 48);
  lctx.fillStyle = 'rgba(255,255,255,0.45)';
  lctx.font = '400 15px monospace';
  lctx.fillText('ASSISTIVE UNIT', 128, 72);
  const labelTex = canvasTexture(labelCanvas);
  const wovenLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 0.019),
    new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.9 })
  );
  wovenLabel.position.set(0.145, 1.487, -0.05);
  wovenLabel.rotation.set(0, -Math.PI / 2.4, 0.3);
  harness.add(wovenLabel);

  /* ---------------- Dispositivo AURA ---------------- */
  const device = new THREE.Group();
  device.name = 'AURA_Device';
  device.position.set(0, 1.29, 0.175);
  root.add(device);

  const boxGeo = new RoundedBoxGeometry(0.155, 0.185, 0.082, 6, 0.014);
  const mainBox = new THREE.Mesh(boxGeo, navy);
  mainBox.castShadow = true;
  mainBox.receiveShadow = true;
  device.add(mainBox);

  // Rebordes y hendiduras
  const panelLineMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.6, metalness: 0.3 });
  for (const y of [-0.072, 0.072]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.0022, 0.003), panelLineMat);
    line.position.set(0, y, 0.0405);
    device.add(line);
  }

  // Perímetro rojo del frontal
  const trimRadius = 0.0085;
  const trimPts = [];
  const tw = 0.0705;
  const th = 0.0855;
  const seg = 10;
  const corner = (cx, cy, a0, a1) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      trimPts.push(new THREE.Vector3(cx + Math.cos(a) * trimRadius, cy + Math.sin(a) * trimRadius, 0.0415));
    }
  };
  corner(tw - trimRadius, th - trimRadius, 0, Math.PI / 2);
  corner(-tw + trimRadius, th - trimRadius, Math.PI / 2, Math.PI);
  corner(-tw + trimRadius, -th + trimRadius, Math.PI, Math.PI * 1.5);
  corner(tw - trimRadius, -th + trimRadius, Math.PI * 1.5, Math.PI * 2);
  const trimCurve = new THREE.CatmullRomCurve3(trimPts, true);
  const trim = new THREE.Mesh(new THREE.TubeGeometry(trimCurve, 120, 0.0012, 5, true), redTrim);
  device.add(trim);

  // Costuras laterales rojas
  for (const s of [-1, 1]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.16, 0.0016), redTrim);
    seam.position.set(0.0772 * s, 0, 0.004);
    device.add(seam);
  }

  // Logo AURA
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.083, 0.0243),
    new THREE.MeshStandardMaterial({
      map: logoText,
      transparent: true,
      roughness: 0.4,
      metalness: 0.15,
      emissive: 0xffffff,
      emissiveMap: logoText,
      emissiveIntensity: 0.22,
      depthWrite: false,
    })
  );
  logo.position.set(0, 0.019, 0.0417);
  device.add(logo);

  // LED de estado
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), greenLED);
  led.position.set(0.0505, 0.0615, 0.0416);
  device.add(led);
  const ledGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: 0x5cffa8, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ledGlow.scale.setScalar(0.022);
  ledGlow.position.copy(led.position);
  device.add(ledGlow);

  // Rejilla del altavoz (lateral derecho)
  const grille = new THREE.Mesh(
    new THREE.PlaneGeometry(0.038, 0.047),
    new THREE.MeshStandardMaterial({ map: grilleTex, roughness: 0.75, metalness: 0.2 })
  );
  grille.position.set(0.0779, 0.028, 0.006);
  grille.rotation.y = Math.PI / 2;
  device.add(grille);

  // Rejillas de ventilación
  for (let i = 0; i < 4; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.02, 0.0012), panelLineMat);
    vent.position.set(-0.0778, -0.028, -0.024 + i * 0.011);
    vent.rotation.y = Math.PI / 2;
    device.add(vent);
  }

  // Puerto USB-C inferior
  const port = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.003, 0.0075, 2, 0.0015), softBlack);
  port.position.set(0.028, -0.0925, 0.006);
  device.add(port);

  // Tornillos
  for (const s of [-1, 1]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0015, 8), metal);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(0.062 * s, -0.072, 0.0417);
    device.add(screw);
  }

  /* ----- Cámara frontal ----- */
  const cameraGroup = new THREE.Group();
  cameraGroup.position.set(0, -0.051, 0.057);
  device.add(cameraGroup);

  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.052, 0.004), new THREE.MeshStandardMaterial({ color: 0x0d2b21, roughness: 0.7, metalness: 0.2 }));
  pcb.position.z = -0.012;
  cameraGroup.add(pcb);

  const pcbFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.062, 0.05),
    new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.55, metalness: 0.25 })
  );
  pcbFace.position.z = -0.0099;
  cameraGroup.add(pcbFace);

  // Lente
  const lensBody = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.016, 24), blackPlastic);
  lensBody.rotation.x = Math.PI / 2;
  lensBody.position.z = 0.006;
  cameraGroup.add(lensBody);

  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0016, 8, 28), metal);
  lensRing.position.z = 0.0142;
  cameraGroup.add(lensRing);

  const lensGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0098, 0.0098, 0.002, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x0a1830, roughness: 0.04, metalness: 0.95, clearcoat: 1, emissive: 0x06101f, emissiveIntensity: 0.8 })
  );
  lensGlass.rotation.x = Math.PI / 2;
  lensGlass.position.z = 0.0148;
  cameraGroup.add(lensGlass);

  // Tornillos de la PCB
  for (const [x, y] of [[-0.028, -0.022], [0.028, -0.022], [-0.028, 0.022], [0.028, 0.022]]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 8), metal);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, y, -0.008);
    cameraGroup.add(screw);
  }

  // Carcasa acrílica transparente
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.064, 0.038, 4, 0.005), acrylic);
  housing.position.z = 0.001;
  housing.renderOrder = 3;
  cameraGroup.add(housing);

  // Marco superior de la cámara
  const camMount = new THREE.Mesh(new RoundedBoxGeometry(0.088, 0.008, 0.03, 3, 0.003), blackPlastic);
  camMount.position.set(0, 0.035, -0.018);
  cameraGroup.add(camMount);

  /* ----- LiDAR RPLIDAR C1 ----- */
  const lidarGroup = new THREE.Group();
  lidarGroup.position.set(0, 0.0925, -0.002);
  device.add(lidarGroup);

  const lidarBase = new THREE.Mesh(new RoundedBoxGeometry(0.086, 0.024, 0.066, 4, 0.005), blackPlastic);
  lidarBase.position.y = 0.012;
  lidarBase.castShadow = true;
  lidarGroup.add(lidarBase);

  const lidarLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.062, 0.0116),
    new THREE.MeshStandardMaterial({ map: rplidarTex, transparent: true, roughness: 0.5, metalness: 0.2, depthWrite: false })
  );
  lidarLabel.position.set(0, 0.012, 0.0335);
  lidarGroup.add(lidarLabel);

  const lidarLed = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 8), greenLED);
  lidarLed.position.set(0.033, 0.012, 0.0338);
  lidarGroup.add(lidarLed);

  const lidarNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.04, 0.012, 28), blackPlastic);
  lidarNeck.position.y = 0.03;
  lidarNeck.castShadow = true;
  lidarGroup.add(lidarNeck);

  const drum = new THREE.Group();
  drum.position.y = 0.058;
  lidarGroup.add(drum);

  const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0325, 0.046, 36), new THREE.MeshPhysicalMaterial({
    color: 0x0b0d12,
    roughness: 0.22,
    metalness: 0.75,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.3,
  }));
  drumBody.castShadow = true;
  drum.add(drumBody);

  const windowMat = new THREE.MeshPhysicalMaterial({
    color: 0x08131a,
    roughness: 0.06,
    metalness: 0.9,
    transparent: true,
    opacity: 0.92,
    clearcoat: 1,
    emissive: 0x0a3b3b,
    emissiveIntensity: 0.5,
  });
  const lidarWindow = new THREE.Mesh(new THREE.CylinderGeometry(0.0318, 0.0318, 0.014, 36, 1, true), windowMat);
  lidarWindow.position.y = 0.011;
  drum.add(lidarWindow);

  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(0.0316, 0.0009, 6, 40), cyanEmissive);
  scanRing.rotation.x = Math.PI / 2;
  scanRing.position.y = 0.004;
  drum.add(scanRing);

  const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.002, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4d5e, toneMapped: false }));
  laserDot.position.set(0, 0.012, 0.0318);
  drum.add(laserDot);
  const laserGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff5566, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  laserGlow.scale.setScalar(0.014);
  laserGlow.position.copy(laserDot.position);
  drum.add(laserGlow);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0318, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({
    color: 0x0a0c10,
    roughness: 0.12,
    metalness: 0.85,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.5,
  }));
  cap.scale.y = 0.55;
  cap.position.y = 0.023;
  drum.add(cap);

  const drumScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 12), metal);
  drumScrew.position.y = 0.0405;
  drum.add(drumScrew);

  /* ----- Anclas ----- */
  const lidarAnchor = new THREE.Object3D();
  lidarAnchor.position.set(0, 0.156, 0.002);
  device.add(lidarAnchor);

  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.position.set(0, -0.051, 0.085);
  device.add(cameraAnchor);

  /* ----- Resaltado de componentes (marco tipo escáner) ----- */
  const highlightGroup = new THREE.Group();
  highlightGroup.visible = false;
  device.add(highlightGroup);

  const partBoxes = {
    box: new THREE.Box3(new THREE.Vector3(-0.085, -0.1, -0.05), new THREE.Vector3(0.085, 0.1, 0.055)),
    camera: new THREE.Box3(new THREE.Vector3(-0.045, -0.086, 0.03), new THREE.Vector3(0.045, -0.014, 0.082)),
    lidar: new THREE.Box3(new THREE.Vector3(-0.045, 0.088, -0.04), new THREE.Vector3(0.045, 0.155, 0.04)),
  };
  const highlightMat = new THREE.LineBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.9, toneMapped: false });
  const highlightMeshes = {};
  for (const [key, box] of Object.entries(partBoxes)) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.014, size.y + 0.014, size.z + 0.014));
    const line = new THREE.LineSegments(geo, highlightMat);
    line.position.copy(center);
    line.visible = false;
    highlightGroup.add(line);
    highlightMeshes[key] = line;
  }

  const harnessBox = new THREE.Box3(new THREE.Vector3(-0.23, 1.03, -0.21), new THREE.Vector3(0.23, 1.55, 0.12));
  const harnessSize = harnessBox.getSize(new THREE.Vector3());
  const harnessCenter = harnessBox.getCenter(new THREE.Vector3());
  const harnessHighlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(harnessSize.x, harnessSize.y + 0.01, harnessSize.z)),
    highlightMat
  );
  harnessHighlight.position.copy(harnessCenter);
  harnessHighlight.visible = false;
  root.add(harnessHighlight);
  highlightMeshes.harness = harnessHighlight;

  /* ----- API del rig ----- */
  let selected = null;
  let time = 0;
  let scanSpin = 0;

  function setHighlight(part) {
    selected = part;
    for (const [key, mesh] of Object.entries(highlightMeshes)) {
      mesh.visible = Boolean(part) && key === part;
    }
    highlightGroup.visible = Boolean(part) && part !== 'harness';
  }

  const bodyParts = {
    torso,
    head: headGroup,
    leftArm,
    rightArm,
    leftLeg: leftLeg.pivot,
    rightLeg: rightLeg.pivot,
    leftKnee: leftLeg.knee,
    rightKnee: rightLeg.knee,
  };

  let walkPhase = 0;

  function update(dt, { speed = 0, moving = false, scanning = true, pov = false } = {}) {
    time += dt;
    if (scanning) scanSpin += dt * 9.5;
    drum.rotation.y = scanSpin;

    const t = time;
    // Respiración
    const breath = Math.sin(t * 1.6) * 0.006;
    torso.scale.y = 1 + breath;
    headGroup.position.y = 1.6 - breath * 0.35;
    headGroup.rotation.y = Math.sin(t * 0.42) * 0.1;
    headGroup.rotation.x = Math.sin(t * 0.55) * 0.02 - 0.02;

    // Caminata procedural
    const targetAmp = moving ? Math.min(0.75, 0.24 + speed * 0.22) : 0;
    walkPhase += dt * (moving ? 5.2 + speed * 1.5 : 0);
    const swing = Math.sin(walkPhase) * targetAmp;
    leftLeg.pivot.rotation.x = swing;
    rightLeg.pivot.rotation.x = -swing;
    leftLeg.knee.rotation.x = Math.max(0, -Math.sin(walkPhase) * 0.55 * targetAmp * 2);
    rightLeg.knee.rotation.x = Math.max(0, Math.sin(walkPhase) * 0.55 * targetAmp * 2);
    leftArm.rotation.x = -swing * 0.65 - 0.05;
    rightArm.rotation.x = swing * 0.22 - 0.05;

    // Bob del cuerpo
    body.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.014 : 0;
    body.rotation.z = moving ? Math.sin(walkPhase) * 0.008 : 0;

    // LED parpadeante
    const blink = 0.6 + Math.sin(t * 2.4) * 0.25;
    greenLED.color.setRGB(0.3 * blink + 0.2, 0.9, 0.55);
    ledGlow.material.opacity = 0.45 + Math.sin(t * 2.4) * 0.2;
    laserGlow.material.opacity = 0.5 + Math.sin(t * 6) * 0.2;

    if (selected) {
      const pulse = 0.55 + Math.sin(t * 4.5) * 0.35;
      highlightMat.opacity = pulse;
    }
    highlightGroup.rotation.y = 0;
    scanRing.material.color.setRGB(0.1, 0.9, 0.8);
  }

  // anclas de hotspot en coordenadas locales del mundo del rig
  const hotspotLocals = {
    harness: new THREE.Vector3(0.205, 1.27, 0.03),
    box: new THREE.Vector3(0.055, 1.35, 0.215),
    camera: new THREE.Vector3(0.0, 1.222, 0.29),
    lidar: new THREE.Vector3(0.0, 1.46, 0.02),
  };

  return {
    root,
    body,
    bodyParts,
    device,
    harness,
    drum,
    lidarAnchor,
    cameraAnchor,
    hotspotLocals,
    setHighlight,
    update,
    materials: { navy, webbing, blackPlastic, acrylic, skin },
  };
}
