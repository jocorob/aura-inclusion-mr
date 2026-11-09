import * as THREE from 'three';
import { makeStudioFloorTexture, mulberry32, makeGlowTexture } from './utils.js';

/**
 * Set de exhibición tipo estudio fotográfico para el modo "Modelo 3D".
 */
export function createStudio() {
  const group = new THREE.Group();
  group.name = 'Studio';
  group.visible = false;

  const floorTex = makeStudioFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 80),
    new THREE.MeshPhysicalMaterial({
      map: floorTex,
      color: 0x76899a,
      roughness: 0.36,
      metalness: 0.55,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.7,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  group.add(floor);

  // Peana
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.06, 1.14, 0.12, 80),
    new THREE.MeshPhysicalMaterial({
      color: 0x12161d,
      roughness: 0.24,
      metalness: 0.85,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.1,
    })
  );
  pedestal.position.y = 0.06;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  group.add(pedestal);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.006, 80),
    new THREE.MeshStandardMaterial({ color: 0x080b10, roughness: 0.35, metalness: 0.6 })
  );
  top.position.y = 0.123;
  group.add(top);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8414f, transparent: true, opacity: 0.24, toneMapped: false });
  const pedestalRing = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.0045, 8, 120), ringMat);
  pedestalRing.rotation.x = Math.PI / 2;
  pedestalRing.position.y = 0.128;
  group.add(pedestalRing);

  const cyanLine = new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const orbitRings = [];
  for (const [r, op] of [[1.55, 0.2], [2.3, 0.11], [3.2, 0.06]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r, 128), cyanLine.clone());
    ring.material.opacity = op;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    group.add(ring);
    orbitRings.push(ring);
  }

  // Luz principal
  const key = new THREE.SpotLight(0xfff6ec, 95, 14, 0.55, 0.82, 2);
  key.position.set(2.3, 4.4, 2.7);
  key.target.position.set(0, 1.15, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  group.add(key, key.target);

  const rimRed = new THREE.SpotLight(0xff4a5c, 9, 12, 0.62, 0.9, 2);
  rimRed.position.set(-2.8, 2.6, -2.2);
  rimRed.target.position.set(0, 1.2, 0);
  group.add(rimRed, rimRed.target);

  const rimCyan = new THREE.SpotLight(0x3ee0d0, 9, 12, 0.7, 0.9, 2);
  rimCyan.position.set(2.7, 2.0, -2.6);
  rimCyan.target.position.set(0, 1.35, 0);
  group.add(rimCyan, rimCyan.target);

  const fill = new THREE.PointLight(0x99b8ff, 9, 10, 2);
  fill.position.set(0, 2.6, 3.4);
  group.add(fill);

  // Partículas flotantes
  const rng = mulberry32(9182);
  const count = 90;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = 1.4 + rng() * 3.2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.2 + rng() * 3.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const particles = new THREE.Points(
    pgeo,
    new THREE.PointsMaterial({
      size: 0.03,
      map: makeGlowTexture(),
      color: 0x9ff6ee,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  group.add(particles);

  // Halo vertical tenue
  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.9, 2.8, 40, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x3ee0d0,
      transparent: true,
      opacity: 0.004,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.position.y = 1.5;
  group.add(halo);

  let t = 0;
  function update(dt) {
    t += dt;
    particles.rotation.y += dt * 0.03;
    particles.position.y = Math.sin(t * 0.4) * 0.05;
    pedestalRing.material.opacity = 0.65 + Math.sin(t * 0.9) * 0.2;
    orbitRings.forEach((ring, i) => {
      ring.rotation.z += dt * (0.02 + i * 0.008) * (i % 2 ? -1 : 1);
    });
    key.intensity = 33 + Math.sin(t * 1.2) * 1.5;
    halo.rotation.y += dt * 0.05;
  }

  return { group, update };
}
