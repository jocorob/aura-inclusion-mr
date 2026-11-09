import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createAuraRig } from './device.js';
import { createEnvironment, zoneAt } from './environment.js';
import { LidarSystem } from './lidar.js';
import { createStudio } from './studio.js';
import { HUD } from './hud.js';
import { Telemetry } from './telemetry.js';
import { VoiceSystem, Sonar } from './voice.js';
import { clamp, damp, lerp, resolveCircleAABB, wrapAngle, disposeObject } from './utils.js';

const DEMO_PATHS = {
  corridor: [
    { x: 0, z: 0.8 },
    { x: -0.5, z: -0.7 },
    { x: -0.85, z: -2.4 },
    { x: -0.72, z: -4.6 },
    { x: 0.15, z: -6.1 },
    { x: -0.2, z: -8.3 },
    { x: 0.0, z: -10.4 },
    { x: 0.0, z: -13.1 },
    { x: 1.45, z: -14.4 },
    { x: 0.1, z: -15.5 },
  ],
  // Paseo guiado por la casa: sala -> cocina -> pasillo -> baño
  home: [
    { x: -3.3, z: 2.2 },
    { x: -4.5, z: 2.2 },
    { x: -3.8, z: 0.9 },
    { x: -2.2, z: 0.9 },
    { x: -1.2, z: 0.2 },
    { x: 0.4, z: 0.5 },
    { x: 1.9, z: 0.2 },
    { x: 2.2, z: -1.9 },
    { x: 2.3, z: -3.1 },
    { x: 3.9, z: -3.15 },
    { x: 4.5, z: -2.85 },
  ],
};

const fmtDist = (d) => {
  if (!isFinite(d)) return 'más de 12 metros';
  if (d < 1) return `${Math.round(d * 100)} centímetros`;
  return `${d.toFixed(1).replace('.', ',')} metros`;
};

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

class App {
  constructor() {
    this.canvas = document.getElementById('scene-canvas');
    this.mode = 'sim';
    this.camMode = 'third';
    this.lidarEnabled = true;
    this.voiceEnabled = true;
    this.audioEnabled = true;
    this.sonarEnabled = true;
    this.demo = false;
    this.demoIndex = 0;
    this.orbitAuto = true;
    this.annotations = true;
    this.activePart = null;
    this.time = 0;
    this.speed = 0;
    this.loaded = false;
    this.greeted = false;
    this.zone = '';
    this.lastAlertAt = 0;
    this.lastZoneAt = 0;
    this.lastSideAlert = 0;
    this.lastBatteryAlert = 0;
    this.risk = 'clear';
    this.riskTimer = 0;
    this.sonarTimer = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.fps = 60;
    this.dragging = false;
    this.pointer = { x: 0, y: 0 };
    this.demoStuck = 0;
    this.lastUtterance = 'Sistema AURA en línea. Escaneando el entorno.';
    this.xrMode = null;
    this.xrSaved = null;
    this.hasFirstInput = false;
    this.intro = { active: false, t: 0, duration: 7.2 };
    this.riskArmAt = performance.now() + 2200;

    this.seated = false;
    this.seat = null;
    this.preSitCamera = 'third';
    this.fridgeOpen = false;
    this.fridgeSelected = null;
    this.contextMuted = null;
    this.contextCurrentId = null;
    this.contextTimer = 0;
    this.shelfSpoken = new Set();
    this.lastShelfAt = 0;

    this.player = { x: -3.3, z: 2.2, yaw: 2.0 };
    this.input = { x: 0, z: 0, run: false };
    this.virtual = { forward: false, back: false, left: false, right: false, run: false };
    this.viewYaw = 2.0;
    this.viewPitch = 0;
    this.thirdPitch = 0.16;
    this.thirdDist = 2.4;

    this.tmpVec = new THREE.Vector3();
    this.tmpVec2 = new THREE.Vector3();
    this.camRay = new THREE.Raycaster();

    this.initRenderer();
    this.initScene();
    this.initRigAndWorld();
    this.initCamera();
    this.initPost();
    this.initUI();
    this.initXR();

    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(() => this.animate());

    setTimeout(() => {
      document.body.classList.remove('is-loading');
      this.hud.setMode('sim');
      this.hud.setUtterance(this.lastUtterance, false);
      this.hud.log('Sistema iniciado · pipeline local en línea', 'info');
      this.hud.toast('Casa AURA · WASD para caminar · E interactuar · S sentarse', 5600);
    }, 700);
  }

  /* ================= Render ================= */
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x060910, 1);
    this.renderer.xr.enabled = true;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b12);
    this.scene.fog = new THREE.Fog(0x070b12, 12, 40);
    this.scene.environmentIntensity = 0.45;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(0xb4cdf5, 0x121419, 0.42);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xffedd6, 1.15);
    this.keyLight.position.set(6.5, 9, 6.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -11;
    this.keyLight.shadow.camera.right = 11;
    this.keyLight.shadow.camera.top = 13;
    this.keyLight.shadow.camera.bottom = -10;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 34;
    this.keyLight.shadow.bias = -0.0006;
    this.keyLight.shadow.normalBias = 0.022;
    this.keyLight.target.position.set(0, 0, -4);
    this.scene.add(this.keyLight, this.keyLight.target);

    this.studio = createStudio();
    this.scene.add(this.studio.group);
  }

  initRigAndWorld() {
    this.rig = createAuraRig();
    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
    this.rig.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(this.rig.root);

    this.env = createEnvironment('home');
    this.scene.add(this.env.group);

    this.lidar = new LidarSystem(this.scene);
    this.lidar.setTargets(this.env.targets);
    this.lidar.group.visible = true;

    this.hud = new HUD();
    this.telemetry = new Telemetry();
    this.voice = new VoiceSystem({
      onStart: (text) => {
        this.lastUtterance = text;
        this.hud.setUtterance(text, true);
      },
      onEnd: () => {
        this.hud.setUtterance(this.lastUtterance, false);
      },
    });
    this.sonar = new Sonar();

    this.hud.setVoiceEnabled(true);
    this.hud.setLidarEnabled(true);
    this.hud.setCameraMode('third');
    this.hud.setEnv(this.env.kind);
    this.hud.onContextClose = () => {
      this.contextMuted = this.contextCurrentId;
      this.hud.hideContext();
    };
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(window.innerWidth < 640 ? 66 : 58, window.innerWidth / window.innerHeight, 0.05, 160);
    this.camera.position.set(1.35, 1.49, 1.78);
    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1.33, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 0.95;
    this.controls.maxDistance = 5.2;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.56;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.enabled = false;
  }

  initPost() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(size, 0.36, 0.55, 0.9);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.outputPass);
  }

  /* ================= UI ================= */
  initUI() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });

    document.querySelectorAll('#camera-seg button').forEach((btn) => {
      btn.addEventListener('click', () => this.setCameraMode(btn.dataset.cam));
    });

    document.querySelectorAll('#env-seg button').forEach((btn) => {
      btn.addEventListener('click', () => this.setEnvironment(btn.dataset.env));
    });

    document.getElementById('demo-btn')?.addEventListener('click', () => this.toggleDemo());
    document.getElementById('reset-btn')?.addEventListener('click', () => this.resetPosition());
    document.getElementById('orbit-btn')?.addEventListener('click', (e) => {
      this.orbitAuto = !this.orbitAuto;
      e.currentTarget.classList.toggle('active', this.orbitAuto);
      this.controls.autoRotate = this.orbitAuto;
    });
    document.getElementById('annot-btn')?.addEventListener('click', (e) => {
      this.annotations = !this.annotations;
      e.currentTarget.classList.toggle('active', this.annotations);
    });

    document.getElementById('lidar-toggle')?.addEventListener('click', () => this.toggleLidar());
    document.getElementById('sonar-toggle')?.addEventListener('click', (e) => {
      this.sonarEnabled = !this.sonarEnabled;
      e.currentTarget.classList.toggle('active', this.sonarEnabled);
      this.sonar.setEnabled(this.audioEnabled && this.sonarEnabled);
      this.hud.toast(this.sonarEnabled ? 'Pulsos de proximidad activados' : 'Pulsos de proximidad silenciados');
    });
    document.getElementById('sound-toggle')?.addEventListener('click', (e) => {
      this.audioEnabled = !this.audioEnabled;
      e.currentTarget.classList.toggle('active', this.audioEnabled);
      this.sonar.setEnabled(this.audioEnabled && this.sonarEnabled);
      this.hud.toast(this.audioEnabled ? 'Audio del simulador activado' : 'Audio del simulador silenciado');
    });

    document.getElementById('voice-toggle')?.addEventListener('click', () => this.toggleVoice());
    document.querySelectorAll('.quick-asks button').forEach((btn) => {
      btn.addEventListener('click', () => this.ask(btn.dataset.ask));
    });

    document.getElementById('toggle-panels')?.addEventListener('click', () => this.togglePanels());
    document.getElementById('mobile-data')?.addEventListener('click', () => this.toggleMobilePanel('data'));
    document.getElementById('mobile-voice')?.addEventListener('click', () => this.toggleMobilePanel('voice'));

    const dpad = document.querySelectorAll('.dpad button');
    dpad.forEach((btn) => {
      const key = btn.dataset.key;
      const press = (on) => {
        this.virtual[key] = on;
        btn.classList.toggle('pressed', on);
        if (on) this.cancelDemo();
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        press(true);
        btn.setPointerCapture?.(e.pointerId);
      });
      btn.addEventListener('pointerup', () => press(false));
      btn.addEventListener('pointercancel', () => press(false));
      btn.addEventListener('pointerleave', () => press(false));
    });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'sim') return;
      this.dragging = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.cancelDemo();
      this.stopIntro();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.mode !== 'sim') return;
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.viewYaw -= dx * 0.0034;
      if (this.camMode === 'pov') {
        this.viewPitch = clamp(this.viewPitch - dy * 0.0028, -0.75, 0.75);
      } else {
        this.thirdPitch = clamp(this.thirdPitch - dy * 0.003, -0.18, 0.92);
      }
    });
    const endDrag = () => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('wheel', (e) => {
      if (this.mode !== 'sim' || this.camMode !== 'third') return;
      e.preventDefault();
      this.thirdDist = clamp(this.thirdDist + Math.sign(e.deltaY) * 0.28, 1.7, 5.4);
    }, { passive: false });

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('pointerdown', () => this.onFirstInput(), { once: true });
    window.addEventListener('keydown', () => this.onFirstInput(), { once: true });

    document.querySelectorAll('.hotspot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const part = btn.dataset.part;
        this.activePart = this.activePart === part ? null : part;
        this.rig.setHighlight(this.activePart);
        if (this.activePart) this.hud.showSpec(part);
        else this.hud.hideSpec();
      });
    });

    this.setMode('sim');
    this.hud.setCameraMode('third');
  }

  onFirstInput() {
    this.sonar.ensure();
    this.hasFirstInput = true;
    if (!this.greeted) {
      this.greeted = true;
      setTimeout(() => {
        this.speak('Sistema AURA en línea. Arnés ajustado y mapa espacial listo. Puedes comenzar a caminar.', { priority: 2, log: false });
      }, 420);
    }
  }

  onKeyDown(e) {
    if (e.repeat) return;
    const k = e.code;

    // Sentarse / levantarse es contextual: solo junto al sofá.
    const nearSofa = this.getNearestInteractable('sofa');
    if (k === 'KeyS' && !this.seated && nearSofa && this.speed < 0.55) {
      e.preventDefault();
      this.sitOnSofa(nearSofa);
      return;
    }
    if (this.seated) {
      if (k === 'KeyS' || k === 'KeyE' || k === 'Escape') {
        e.preventDefault();
        this.standUp();
        return;
      }
    }

    if (k === 'KeyE') {
      e.preventDefault();
      this.interact();
      return;
    }
    if (this.fridgeOpen && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(k)) {
      const fridge = this.getNearestInteractable('fridge');
      const idx = Number(k.slice(-1)) - 1;
      if (fridge?.products?.[idx]) {
        e.preventDefault();
        this.selectFridgeProduct(fridge.products[idx].id);
        return;
      }
    }

    if (!this.seated) {
      if (['ArrowUp', 'KeyW'].includes(k)) this.input.z = 1;
      if (['ArrowDown', 'KeyS'].includes(k)) this.input.z = -1;
      if (['ArrowLeft', 'KeyA'].includes(k)) this.input.x = -1;
      if (['ArrowRight', 'KeyD'].includes(k)) this.input.x = 1;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        this.cancelDemo();
      }
      if (k === 'ShiftLeft' || k === 'ShiftRight') this.input.run = true;
    }
    if (k === 'Space') {
      e.preventDefault();
      this.setCameraMode(this.camMode === 'third' ? 'pov' : 'third');
    }
    if (k === 'KeyL') this.toggleLidar();
    if (k === 'KeyV') this.toggleVoice();
    if (k === 'KeyR') this.resetPosition();
    if (k === 'KeyM') this.togglePanels();
    if (k === 'Escape') {
      this.hud.hideSpec();
      if (!this.fridgeOpen) this.hud.hideContext();
      document.body.classList.remove('panels-hidden', 'show-data', 'show-voice');
    }
  }

  onKeyUp(e) {
    const k = e.code;
    if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(k)) this.input.z = 0;
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(k)) this.input.x = 0;
    if (k === 'ShiftLeft' || k === 'ShiftRight') this.input.run = false;
  }

  togglePanels() {
    if (window.innerWidth <= 1080) {
      document.body.classList.toggle('show-data');
      document.body.classList.remove('show-voice');
    } else {
      document.body.classList.toggle('panels-hidden');
    }
  }

  toggleMobilePanel(which) {
    if (which === 'data') {
      document.body.classList.toggle('show-data');
      document.body.classList.remove('show-voice');
    } else {
      document.body.classList.toggle('show-voice');
      document.body.classList.remove('show-data');
    }
  }

  toggleVoice() {
    this.voiceEnabled = !this.voiceEnabled;
    this.voice.setEnabled(this.voiceEnabled);
    this.hud.setVoiceEnabled(this.voiceEnabled);
    this.hud.toast(this.voiceEnabled ? 'Voz Piper activada · procesamiento local' : 'Voz silenciada');
    if (this.voiceEnabled) {
      this.sonar.chime();
      this.speak('Voz local activada.', { priority: 2, log: false });
    }
  }

  toggleLidar() {
    this.lidarEnabled = !this.lidarEnabled;
    this.lidar.setEnabled(this.lidarEnabled && this.mode !== 'model');
    this.hud.setLidarEnabled(this.lidarEnabled);
    this.hud.toast(this.lidarEnabled ? 'LiDAR ToF activo · 10 Hz' : 'LiDAR en pausa');
    if (this.lidarEnabled) this.lidar.reset();
  }

  setCameraMode(cam) {
    const wasIntro = this.intro.active;
    this.stopIntro();
    this.camMode = cam;
    this.hud.setCameraMode(cam);
    if (cam === 'pov') {
      if (wasIntro) {
        this.viewYaw = this.player.yaw;
        this.viewPitch = 0;
      }
      this.player.yaw = this.viewYaw;
      this.hud.toast('POV del módulo de cámara AURA');
    } else {
      this.thirdPitch = 0.16;
      this.hud.toast('Cámara en tercera persona');
    }
    this.updateCamera(1 / 60, true);
  }

  /* ================= Modo ================= */
  setMode(mode) {
    if (mode === this.mode && this.loaded) return;
    if (mode === 'model' && this.seated) this.standUp();
    this.mode = mode;
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    this.hud.setMode(mode);
    this.hud.hideContext();
    if (this.loaded) this.stopIntro();
    this.rig.setHighlight(null);
    this.activePart = null;
    this.hud.hideSpec();
    this.cancelDemo();

    if (mode === 'model') {
      this.studio.group.visible = true;
      this.env.group.visible = false;
      this.lidar.setEnabled(false);
      this.controls.enabled = true;
      this.controls.autoRotate = this.orbitAuto;
      this.controls.target.set(0, 1.27, 0);
      this.camera.position.set(1.35, 1.49, 1.78);
      this.controls.update();
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0x05070c);
      this.rig.root.position.set(0, 0.125, 0);
      this.rig.root.rotation.y = 0;
      this.hud.setZone('Inspección del dispositivo');
      this.hud.updateDetections(this.camera, [], new THREE.Vector3(), false);
      this.hud.toast('Arrastra para orbitar · pulsa los puntos para ver cada componente', 3400);
    } else {
      this.studio.group.visible = false;
      this.env.group.visible = true;
      this.controls.enabled = false;
      this.lidar.setEnabled(this.lidarEnabled);
      this.scene.fog = new THREE.Fog(0x070b12, 12, 40);
      this.scene.background = new THREE.Color(0x070b12);
      this.rig.root.position.set(this.player.x, 0, this.player.z);
      this.rig.root.rotation.y = this.player.yaw;
      this.lidar.reset();
      this.hud.setZone(zoneAt(this.env, this.player.x, this.player.z));
      this.updateCamera(1 / 60, true);
    }
  }

  setEnvironment(kind) {
    if (this.env.kind === kind) return;
    this.env.setFridgeOpen?.(false);
    this.hud.hideContext();
    this.scene.remove(this.env.group);
    disposeObject(this.env.group);
    this.env = createEnvironment(kind);
    this.env.group.visible = this.mode !== 'model';
    this.scene.add(this.env.group);
    this.lidar.setTargets(this.env.targets);
    this.lidar.reset();
    this.hud.setEnv(kind);
    this.stopIntro();
    this.intro.active = kind !== 'home';
    this.intro.t = 0;
    this.seated = false;
    this.seat = null;
    this.preSitCamera = 'third';
    this.fridgeOpen = false;
    this.fridgeSelected = null;
    this.rig.root.visible = true;
    this.contextMuted = null;
    this.contextCurrentId = null;
    this.shelfSpoken.clear();
    this.camMode = 'third';
    this.hud.setCameraMode('third');
    const spawn = this.env.spawn;
    this.player.x = spawn.x;
    this.player.z = spawn.z;
    this.player.yaw = spawn.yaw;
    this.viewYaw = spawn.yaw;
    this.viewPitch = 0;
    this.thirdPitch = 0.16;
    this.thirdDist = kind === 'home' ? 2.4 : 3.1;
    this.speed = 0;
    this.zone = '';
    this.cancelDemo();
    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
    this.hud.setZone(zoneAt(this.env, this.player.x, this.player.z));
    this.updateCamera(1 / 60, true);
    const toast = kind === 'home'
      ? 'Casa adaptada cargada · sala, cocina y baño'
      : kind === 'labyrinth'
        ? 'Laberinto procedural generado · sigue la voz de AURA'
        : 'Corredor institucional restaurado';
    this.hud.toast(toast, 3200);
    if (this.voiceEnabled) {
      const line = kind === 'home'
        ? 'Casa domótica cargada. Estás en la sala, con el sofá y las estanterías cerca. La cocina queda al este y el baño al fondo del pasillo.'
        : kind === 'labyrinth'
          ? 'Nuevo entorno cargado: laberinto de cinco por cinco. Escaneando salidas.'
          : 'Entorno de corredor cargado. Ruta despejada al frente.';
      this.speak(line, { priority: 1, log: false });
    }
  }

  resetPosition() {
    const spawn = this.env.spawn;
    const wasSeated = this.seated;
    this.seated = false;
    this.seat = null;
    this.fridgeOpen = false;
    this.fridgeSelected = null;
    this.env.setFridgeOpen?.(false);
    this.contextMuted = null;
    this.shelfSpoken.clear();
    this.hud.hideContext();
    if (wasSeated && this.preSitCamera === 'third') {
      this.camMode = 'third';
      this.hud.setCameraMode('third');
    }
    this.player.x = spawn.x;
    this.player.z = spawn.z;
    this.player.yaw = spawn.yaw;
    this.viewYaw = spawn.yaw;
    this.viewPitch = 0;
    this.speed = 0;
    this.cancelDemo();
    this.lidar.reset();
    this.riskArmAt = performance.now() + 1200;
    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
    this.hud.setZone(zoneAt(this.env, this.player.x, this.player.z));
    this.updateCamera(1 / 60, true);
    this.hud.toast('Posición reiniciada');
    this.speak('Posición reiniciada. Escaneando el entorno.', { priority: 2, log: false });
  }

  toggleDemo() {
    if (this.env.kind === 'labyrinth') {
      this.hud.toast('El recorrido automático está disponible en la casa y el corredor');
      return;
    }
    if (this.seated) this.standUp();
    this.demo = !this.demo;
    document.getElementById('demo-btn')?.classList.toggle('active', this.demo);
    if (this.demo) {
      this.demoPath = DEMO_PATHS[this.env.kind] || DEMO_PATHS.corridor;
      this.demoIndex = 0;
      this.demoStuck = 0;
      this.camMode = 'third';
      this.hud.setCameraMode('third');
      this.hud.toast(this.env.kind === 'home' ? 'Recorrido guiado por la casa · AURA narra el entorno' : 'Recorrido automático · AURA narra cada obstáculo', 3400);
      this.speak(this.env.kind === 'home'
        ? 'Iniciando recorrido guiado por la casa. Pasaremos por la sala, la cocina y el baño.'
        : 'Iniciando recorrido guiado. Avanzaré despacio y te describiré el entorno.', { priority: 2 });
    } else {
      this.speed = 0;
      this.hud.toast('Recorrido automático detenido');
    }
  }

  cancelDemo() {
    if (!this.demo) return;
    this.demo = false;
    document.getElementById('demo-btn')?.classList.remove('active');
  }

  /* ================= Interacciones de la casa ================= */
  distanceTo(point) {
    return Math.hypot(point.x - this.player.x, point.z - this.player.z);
  }

  getNearestInteractable(type = null) {
    const list = this.env.interactables || [];
    let best = null;
    let bestDist = Infinity;
    for (const item of list) {
      if (type && item.type !== type) continue;
      const d = this.distanceTo(item.point);
      if (d <= item.radius && d < bestDist) {
        best = item;
        bestDist = d;
      }
    }
    return best;
  }

  joinEs(items) {
    const clean = items.filter(Boolean);
    if (!clean.length) return '';
    if (clean.length === 1) return clean[0];
    return `${clean.slice(0, -1).join(', ')} y ${clean[clean.length - 1]}`;
  }

  shelfLevelName(level) {
    return ['Estante inferior', 'Segundo estante', 'Tercer estante', 'Estante superior'][level] || 'Estante';
  }

  describeShelfText(shelf, distance) {
    const levelIntro = ['abajo', 'en el segundo estante', 'en el tercer estante', 'arriba'];
    const parts = [];
    for (const level of [3, 2, 1, 0]) {
      const voices = shelf.items.filter((i) => i.level === level).map((i) => i.voice);
      if (voices.length) parts.push(`${levelIntro[level]} hay ${this.joinEs(voices)}`);
    }
    const body = parts.join('; ');
    return `${shelf.label}, a ${fmtDist(distance)}. ${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
  }

  speakShelf(shelf, force = false) {
    const d = this.distanceTo(shelf.point);
    this.speak(this.describeShelfText(shelf, d), {
      priority: force ? 3 : 1,
      log: true,
    });
    this.contextTimer = 1;
  }

  renderContext(key, payload, id) {
    this.contextCurrentId = id;
    if (this.contextMuted === id) {
      this.hud.hideContext();
      return;
    }
    this.hud.showContext(key, payload);
  }

  sitOnSofa(sofa) {
    if (!sofa?.seats?.length) return;
    this.stopIntro();
    let seat = sofa.seats[0];
    let best = Infinity;
    for (const candidate of sofa.seats) {
      const d = Math.hypot(candidate.x - this.player.x, candidate.z - this.player.z);
      if (d < best) {
        best = d;
        seat = candidate;
      }
    }
    this.preSitCamera = this.camMode;
    this.seated = true;
    this.seat = seat;
    this.cancelDemo();
    this.input.x = 0;
    this.input.z = 0;
    this.speed = 0;
    this.player.x = seat.x;
    this.player.z = seat.z;
    this.player.yaw = seat.yaw;
    this.viewYaw = seat.yaw;
    this.viewPitch = 0;
    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
    this.lidar.reset();
    this.riskArmAt = performance.now() + 900;
    this.camMode = 'pov';
    this.hud.setCameraMode('pov');
    this.contextMuted = null;
    this.contextTimer = 1;
    this.updateCamera(1 / 60, true);
    this.hud.toast('Sentado en el sofá · vista a la altura de los ojos', 3200);
    this.speak('Te has sentado en el sofá. La vista se ajusta a la altura de los ojos y el LiDAR sigue escaneando la sala. Pulsa S para levantarte.', { priority: 2, log: true });
  }

  standUp() {
    if (!this.seated) return;
    this.stopIntro();
    const seat = this.seat;
    const yaw = seat?.yaw ?? this.player.yaw;
    this.seated = false;
    this.seat = null;
    this.player.x += Math.sin(yaw) * 0.92;
    this.player.z += Math.cos(yaw) * 0.92;
    resolveCircleAABB(this.player, 0.32, this.env.colliders);
    this.player.x = clamp(this.player.x, this.env.bounds.minX + 0.4, this.env.bounds.maxX - 0.4);
    this.player.z = clamp(this.player.z, this.env.bounds.minZ + 0.4, this.env.bounds.maxZ - 0.4);
    this.player.yaw = yaw;
    this.viewYaw = yaw;
    this.viewPitch = 0;
    this.speed = 0;
    this.input.x = 0;
    this.input.z = 0;
    const restore = this.preSitCamera || 'third';
    this.camMode = restore;
    this.hud.setCameraMode(restore);
    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
    this.lidar.reset();
    this.riskArmAt = performance.now() + 900;
    this.contextMuted = null;
    this.contextCurrentId = null;
    this.hud.hideContext();
    this.contextTimer = 1;
    this.updateCamera(1 / 60, true);
    this.hud.toast('De pie · LiDAR reactivado', 2400);
    this.speak('De pie. Continuamos explorando la casa.', { priority: 2, log: true });
  }

  toggleFridge(force) {
    this.stopIntro();
    const fridge = this.getNearestInteractable('fridge') || this.env.interactables?.find((i) => i.type === 'fridge');
    if (!fridge) return;
    const open = typeof force === 'boolean' ? force : !this.fridgeOpen;
    if (open && !this.fridgeOpen) {
      const anchor = this.env.fridge?.group?.position || fridge.point;
      const fx = anchor.x - this.player.x;
      const fz = anchor.z - this.player.z;
      if (Math.hypot(fx, fz) > 0.05) {
        this.player.yaw = Math.atan2(fx, fz);
        this.viewYaw = this.player.yaw;
        this.viewPitch = 0;
      }
    }
    this.fridgeOpen = open;
    this.fridgeSelected = null;
    this.env.setFridgeOpen?.(open);
    this.contextMuted = null;
    this.contextTimer = 1;
    if (open) {
      this.hud.toast('Nevera abierta · elige un producto', 3000);
      this.speak('Nevera abierta. En el estante superior hay yogur y queso; en el estante medio, leche y agua; abajo, manzanas y verduras. ¿Qué andas buscando?', { priority: 3, log: true });
    } else {
      this.hud.toast('Nevera cerrada');
      this.speak('Nevera cerrada.', { priority: 2, log: false });
    }
  }

  selectFridgeProduct(id) {
    this.stopIntro();
    const fridge = this.env.interactables?.find((i) => i.type === 'fridge');
    const product = fridge?.products?.find((p) => p.id === id);
    if (!product) return;
    this.fridgeSelected = id;
    this.contextMuted = null;
    this.contextTimer = 1;
    this.hud.toast(`${product.name} · ${product.level}`, 3000);
    this.speak(product.voice, { priority: 3, log: true });
  }

  interact() {
    this.stopIntro();
    if (this.seated) {
      this.standUp();
      return;
    }
    const near = this.getNearestInteractable();
    if (!near) {
      this.hud.toast('No hay nada interactivo al alcance');
      this.speak('No detecto ningún objeto interactivo a tu alcance.', { priority: 1, log: false });
      return;
    }
    if (near.type === 'fridge') this.toggleFridge();
    else if (near.type === 'sofa') this.sitOnSofa(near);
    else if (near.type === 'shelf') this.speakShelf(near, true);
  }

  updateInteractions(dt) {
    this.contextTimer += dt;
    if (this.contextTimer < 0.18) return;
    this.contextTimer = 0;
    const now = performance.now();
    const list = this.env.interactables || [];
    const fridge = list.find((i) => i.type === 'fridge');

    // Cerrar la nevera al alejarse
    if (this.fridgeOpen && fridge && this.distanceTo(fridge.point) > 2.55) {
      this.fridgeOpen = false;
      this.fridgeSelected = null;
      this.env.setFridgeOpen?.(false);
      this.contextMuted = null;
      this.hud.hideContext();
    }

    // Narración automática de estanterías al acercarse
    for (const item of list) {
      if (item.type !== 'shelf') continue;
      const d = this.distanceTo(item.point);
      if (d > item.radius + 0.9) this.shelfSpoken.delete(item.id);
      if (!this.seated && !this.fridgeOpen && d <= item.radius && !this.shelfSpoken.has(item.id) && now - this.lastShelfAt > 2200) {
        this.shelfSpoken.add(item.id);
        this.lastShelfAt = now;
        this.speak(this.describeShelfText(item, d), { priority: 1, log: true });
      }
    }

    if (this.seated) {
      this.renderContext('seated', {
        eyebrow: `SENTADO · ${(this.zone || 'SALA').toUpperCase()}`,
        title: 'Sentado en el sofá',
        text: 'El arnés sigue escaneando la sala y el LiDAR permanece activo. La vista está ajustada a la altura de los ojos sentado.',
        items: [],
        actions: [{ label: 'Levantarse del sofá', hint: 'S', primary: true, onClick: () => this.standUp() }],
      }, 'sofa-sala');
      return;
    }

    const near = this.getNearestInteractable();
    if (!near) {
      this.hud.hideContext();
      this.contextCurrentId = null;
      this.contextMuted = null;
      return;
    }
    if (this.contextMuted && this.contextMuted !== near.id) this.contextMuted = null;
    const d = this.distanceTo(near.point);
    const distLabel = d < 1 ? `${Math.round(d * 100)} cm` : `${d.toFixed(1).replace('.', ',')} m`;
    const zone = (this.zone || '').toUpperCase();

    if (near.type === 'fridge') {
      if (this.fridgeOpen) {
        const selected = near.products?.find((p) => p.id === this.fridgeSelected);
        this.renderContext(`fridge:open:${this.fridgeSelected || 'none'}:${d.toFixed(1)}`, {
          eyebrow: `NEVERA ABIERTA · A ${distLabel} · ${zone}`,
          title: selected ? `${selected.name}, localizado` : '¿Qué andas buscando?',
          text: selected
            ? `${selected.voice} Puedes elegir otro producto o cerrar la nevera.`
            : 'AURA ha abierto la nevera y ha etiquetado el interior. Elige un producto o pulsa E para cerrar.',
          items: (near.products || []).map((p) => ({ label: p.name, meta: p.level })),
          actions: [
            ...(near.products || []).map((p, i) => ({
              label: p.name,
              hint: String(i + 1),
              active: this.fridgeSelected === p.id,
              onClick: () => this.selectFridgeProduct(p.id),
            })),
            { label: 'Cerrar nevera', hint: 'E', onClick: () => this.toggleFridge(false) },
          ],
        }, near.id);
      } else {
        this.renderContext(`fridge:closed:${d.toFixed(1)}`, {
          eyebrow: `NEVERA · A ${distLabel} · ${zone}`,
          title: 'Nevera',
          text: 'Puerta cerrada. AURA puede abrirla, describir el interior y ayudarte a encontrar un producto.',
          items: [],
          actions: [{ label: 'Abrir nevera', hint: 'E', primary: true, onClick: () => this.toggleFridge(true) }],
        }, near.id);
      }
      return;
    }

    if (near.type === 'sofa') {
      this.renderContext(`sofa:${d.toFixed(1)}`, {
        eyebrow: `SOFÁ · A ${distLabel} · ${zone}`,
        title: 'Sofá de la sala',
        text: 'Siéntate para descansar. La cámara bajará a la altura de los ojos y el LiDAR seguirá activo. Pulsa S junto al sofá.',
        items: [],
        actions: [{ label: 'Sentarse en el sofá', hint: 'S', primary: true, onClick: () => this.sitOnSofa(near) }],
      }, near.id);
      return;
    }

    if (near.type === 'shelf') {
      const items = near.items.map((i) => ({ label: i.name, meta: this.shelfLevelName(i.level) }));
      this.renderContext(`shelf:${near.id}:${d.toFixed(1)}`, {
        eyebrow: `OBJETOS A ${distLabel} · ${zone}`,
        title: near.label,
        text: `${this.describeShelfText(near, d)} Pulsa «Describir» para volver a escucharla.`,
        items,
        actions: [{ label: 'Describir estantería', hint: 'E', primary: true, onClick: () => this.speakShelf(near, true) }],
      }, near.id);
    }
  }

  /* ================= Bucle ================= */
  animate() {
    const nowMs = performance.now();
    const dt = Math.min((nowMs - this.lastFrame) / 1000, 0.05);
    this.lastFrame = nowMs;
    this.time += dt;
    this.fpsFrames += 1;
    this.fpsTime += dt;
    if (this.fpsTime > 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    if (this.renderer.xr.isPresenting) {
      this.updateXR(dt);
    } else if (this.mode === 'model') {
      this.updateModel(dt);
    } else {
      this.updateSimulation(dt);
    }

    if (!this.renderer.xr.isPresenting) {
      this.hud.updateWaveform(dt);
      this.hud.tick(dt);
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (!this.loaded) {
      this.loaded = true;
      document.body.classList.remove('is-loading');
    }
  }

  updateModel(dt) {
    this.controls.autoRotate = this.orbitAuto;
    this.controls.update();
    this.studio.update(dt);
    this.rig.update(dt, { speed: 0, moving: false, scanning: true });
    this.rig.root.updateMatrixWorld(true);
    this.hud.updateHotspots(this.rig, this.camera, 'model', this.activePart);
    this.telemetry.update(dt, { fps: this.fps, scan: null, speaking: this.voice.speaking, moving: false, lidarOn: false });
  }

  updateSimulation(dt) {
    this.env.update?.(dt);
    if (this.demo) this.updateDemo(dt);
    this.updateIntro(dt);
    this.updatePlayer(dt);

    this.rig.update(dt, {
      speed: this.speed,
      moving: this.speed > 0.12,
      scanning: this.lidarEnabled,
      pov: this.camMode === 'pov',
      seated: this.seated,
    });
    this.rig.root.updateMatrixWorld(true);

    this.updateCamera(dt);

    const sensor = this.rig.lidarAnchor.getWorldPosition(this.tmpVec);
    this.lidar.update(dt, sensor, this.player.yaw, this.speed);
    this.hud.updateRadar(this.lidar, dt);
    this.hud.updateHotspots(this.rig, this.camera, 'sim', null);
    this.hud.updateDetections(this.camera, this.env.obstacles, sensor, this.camMode === 'pov');

    this.updateZone(dt);
    this.updateInteractions(dt);
    this.updateRisk(dt, sensor);
    this.updateBatteryAlerts();
    this.telemetry.update(dt, {
      fps: this.fps,
      scan: this.lidar.scan,
      speaking: this.voice.speaking,
      moving: this.speed > 0.12,
      lidarOn: this.lidarEnabled,
    });
  }

  updateIntro(dt) {
    if (!this.intro.active) return;
    this.intro.t += dt;
    const k = clamp(this.intro.t / this.intro.duration, 0, 1);
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const home = this.env.kind === 'home';
    const startYaw = this.player.yaw + (home ? -0.85 : 2.0);
    this.viewYaw = startYaw + wrapAngle(this.player.yaw - startYaw) * ease;
    this.thirdPitch = lerp(0.03, 0.16, ease);
    this.thirdDist = lerp(home ? 2.1 : 1.85, home ? 2.4 : 3.1, ease);
    if (k >= 1) this.intro.active = false;
  }

  stopIntro() {
    this.intro.active = false;
  }

  getMoveInput() {
    let x = this.input.x + (this.virtual.right ? 1 : 0) - (this.virtual.left ? 1 : 0);
    let z = this.input.z + (this.virtual.forward ? 1 : 0) - (this.virtual.back ? 1 : 0);
    x = clamp(x, -1, 1);
    z = clamp(z, -1, 1);
    const run = this.input.run || this.virtual.run;
    return { x, z, run };
  }

  updatePlayer(dt) {
    if (this.seated) {
      this.speed = damp(this.speed, 0, 8, dt);
      this.rig.root.position.set(this.player.x, 0, this.player.z);
      this.rig.root.rotation.y = this.player.yaw;
      return;
    }
    const input = this.getMoveInput();
    const yaw = this.viewYaw;
    const moving = Math.hypot(input.x, input.z) > 0.01;
    if (moving) this.stopIntro();

    if (moving) {
      const len = Math.hypot(input.x, input.z);
      const nx = input.x / len;
      const nz = input.z / len;
      const dirX = Math.sin(yaw) * nz - Math.cos(yaw) * nx;
      const dirZ = Math.cos(yaw) * nz + Math.sin(yaw) * nx;
      const targetSpeed = input.run ? 2.45 : 1.32;
      this.speed = damp(this.speed, targetSpeed, 5, dt);
      this.player.x += dirX * this.speed * dt;
      this.player.z += dirZ * this.speed * dt;
      if (!this.demo || this.camMode === 'pov') {
        this.player.yaw = dampAngle(this.player.yaw, Math.atan2(dirX, dirZ), 9, dt);
      }
    } else {
      this.speed = damp(this.speed, 0, 7, dt);
    }

    if (this.camMode === 'pov') {
      this.player.yaw = dampAngle(this.player.yaw, this.viewYaw, 18, dt);
    }

    resolveCircleAABB(this.player, 0.32, this.env.colliders);
    this.player.x = clamp(this.player.x, this.env.bounds.minX + 0.4, this.env.bounds.maxX - 0.4);
    this.player.z = clamp(this.player.z, this.env.bounds.minZ + 0.4, this.env.bounds.maxZ - 0.4);

    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
  }

  updateDemo(dt) {
    const path = this.demoPath || DEMO_PATHS.corridor;
    if (this.demoIndex >= path.length) {
      this.demo = false;
      this.input.x = 0;
      this.input.z = 0;
      document.getElementById('demo-btn')?.classList.remove('active');
      this.speak(this.env.kind === 'home'
        ? 'Recorrido completado. Estás en el baño de la casa. Fin de la demostración.'
        : 'Recorrido completado. Has llegado al vestíbulo. Fin de la demostración.', { priority: 2 });
      this.hud.toast('Recorrido completado');
      return;
    }
    const target = path[this.demoIndex];
    const dx = target.x - this.player.x;
    const dz = target.z - this.player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.55) {
      this.demoIndex++;
      this.demoStuck = 0;
      return;
    }

    const before = { x: this.player.x, z: this.player.z };
    if (this.demoLast) {
      const moved = Math.hypot(this.player.x - this.demoLast.x, this.player.z - this.demoLast.z);
      if (moved < 0.02) this.demoStuck += dt;
      else this.demoStuck = 0;
    }
    this.demoLast = before;
    if (this.demoStuck > 3.5) {
      this.demoIndex++;
      this.demoStuck = 0;
    }

    const yaw = this.viewYaw;
    const nx = dx / dist;
    const nz = dz / dist;
    this.input.x = -nx * Math.cos(yaw) + nz * Math.sin(yaw);
    this.input.z = nx * Math.sin(yaw) + nz * Math.cos(yaw);
    this.viewYaw = dampAngle(this.viewYaw, Math.atan2(dx, dz), 1.4, dt);
    this.player.yaw = dampAngle(this.player.yaw, Math.atan2(dx, dz), 4, dt);
  }

  updateCamera(dt, snap = false) {
    this.rig.root.updateMatrixWorld(true);
    if (this.camMode === 'pov') {
      const anchor = this.seated ? this.rig.headAnchor : this.rig.cameraAnchor;
      const p = anchor.getWorldPosition(this.tmpVec2);
      const fx = Math.sin(this.viewYaw);
      const fz = Math.cos(this.viewYaw);
      this.camera.position.set(p.x + fx * 0.03, p.y, p.z + fz * 0.03);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.viewPitch, this.viewYaw + Math.PI, 0);
    } else {
      const target = new THREE.Vector3(this.player.x, this.seated ? 0.92 : 1.24, this.player.z);
      if (this.env.kind === 'home') {
        // Plano sobre el hombro: deja ver la nevera y las estanterías sin que el avatar las tape.
        const rx = Math.cos(this.viewYaw);
        const rz = -Math.sin(this.viewYaw);
        target.x += rx * 0.32;
        target.z += rz * 0.32;
      }
      const dist = this.thirdDist;
      const fx = Math.sin(this.viewYaw);
      const fz = Math.cos(this.viewYaw);
      const cosP = Math.cos(this.thirdPitch);
      const desired = new THREE.Vector3(
        target.x - fx * dist * cosP,
        target.y + Math.sin(this.thirdPitch) * dist,
        target.z - fz * dist * cosP
      );

      const dir = desired.clone().sub(target);
      const length = dir.length();
      dir.normalize();
      this.camRay.set(target, dir);
      this.camRay.far = length;
      const hits = this.env.targets.length ? this.camRay.intersectObjects(this.env.targets, true) : [];
      if (hits.length) {
        const d = Math.max(0.85, hits[0].distance - 0.24);
        desired.copy(target).addScaledVector(dir, d);
      }
      desired.y = Math.max(0.5, desired.y);
      if (snap) this.camera.position.copy(desired);
      else this.camera.position.lerp(desired, 1 - Math.exp(-12 * dt));
      this.camera.lookAt(target);
    }
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
  }

  updateZone(dt) {
    const name = zoneAt(this.env, this.player.x, this.player.z);
    if (name === this.zone) return;
    const hadZone = Boolean(this.zone);
    this.zone = name;
    this.hud.setZone(name);
    if (hadZone && this.hasFirstInput && performance.now() - this.lastZoneAt > 2500) {
      this.lastZoneAt = performance.now();
      this.speak(`Entrando en ${name}.`, { priority: 0, log: true });
    }
  }

  /* ================= Riesgo y voz ================= */
  updateRisk(dt, sensor) {
    this.riskTimer += dt;
    if (this.riskTimer < 0.18) return;
    this.riskTimer = 0;
    if (!this.lidarEnabled) return;
    if (this.intro.active) return;
    if (performance.now() < this.riskArmAt) return;
    if (this.lidar.cycles < 1) return;

    const scan = this.lidar.scan;
    const now = performance.now();

    // Obstáculos bajos (detectados por la cámara de profundidad)
    let lowDist = Infinity;
    let lowAngle = 0;
    let lowLabel = '';
    const fwdX = Math.sin(this.player.yaw);
    const fwdZ = Math.cos(this.player.yaw);
    const origin = new THREE.Vector3(this.player.x, 0.55, this.player.z);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const obs of this.env.obstacles) {
      if (!obs.low) continue;
      box.setFromObject(obs.mesh);
      box.getCenter(center);
      const dx = center.x - this.player.x;
      const dz = center.z - this.player.z;
      const len = Math.hypot(dx, dz) || 1;
      const dot = (dx * fwdX + dz * fwdZ) / len;
      const d = Math.max(0, box.distanceToPoint(origin));
      if (dot < 0.55 || d > 2.4) continue;
      if (d < lowDist) {
        lowDist = d;
        lowAngle = Math.atan2(dx, dz) - this.player.yaw;
        lowLabel = obs.label;
      }
    }

    let front = scan.front;
    let label = scan.frontHit?.label || 'Obstáculo';
    let angle = 0;
    if (scan.frontHit) {
      angle = wrapAngle(Math.atan2(scan.frontHit.x - sensor.x, scan.frontHit.z - sensor.z) - this.player.yaw);
    }
    if (lowDist < front) {
      front = lowDist;
      label = lowLabel || 'Obstáculo bajo';
      angle = wrapAngle(lowAngle);
    }
    if (!isFinite(front)) front = 99;

    let level = 'clear';
    if (front < 0.8) level = 'critical';
    else if (front < 1.45) level = 'danger';
    else if (front < 2.7) level = 'warn';

    const prevRisk = this.risk;
    const changed = level !== prevRisk;
    this.risk = level;

    const isMoving = this.speed > 0.15;
    const repeatAfter = level === 'critical' ? 2200 : level === 'danger' ? 3400 : level === 'warn' ? 7000 : 0;
    const due = level !== 'clear' && now - this.lastAlertAt > repeatAfter && (isMoving || level === 'critical');

    if (changed || due) {
      const sideWord = angle > 0.16 ? ' a tu derecha' : angle < -0.16 ? ' a tu izquierda' : ' al frente';
      const clearSide = scan.frontRight > scan.frontLeft + 0.45 ? 'Paso libre a la derecha.' : scan.frontLeft > scan.frontRight + 0.45 ? 'Paso libre a la izquierda.' : 'Detente y retrocede.';
      let text = '';
      if (level === 'critical') text = `¡Alto! ${label}${sideWord} a ${fmtDist(front)}.`;
      else if (level === 'danger') text = `${label}${sideWord} a ${fmtDist(front)}. ${clearSide}`;
      else if (level === 'warn') text = `Atención: ${label}${sideWord} a ${fmtDist(front)}.`;
      else if (prevRisk !== 'clear') text = 'Camino despejado. Puedes continuar.';

      if (text) {
        this.lastAlertAt = now;
        const logLevel = level === 'critical' ? 'danger' : level === 'danger' ? 'warn' : 'info';
        this.speak(text, { priority: level === 'critical' ? 3 : level === 'danger' ? 2 : 1, log: true, level: logLevel });
        if (level !== 'clear') {
          this.sonar.ping(front, Math.sin(angle));
          if (this.sonarEnabled && this.audioEnabled && level === 'critical' && navigator.vibrate) navigator.vibrate([30, 50, 30]);
        }
      }
    }

    // Aviso lateral
    const sideMin = Math.min(scan.left, scan.right);
    if (front > 1.7 && sideMin < 1.0 && now - this.lastSideAlert > 4500 && isMoving) {
      this.lastSideAlert = now;
      const side = scan.left < scan.right ? 'izquierda' : 'derecha';
      this.speak(`Obstáculo a tu ${side} a ${fmtDist(sideMin)}.`, { priority: 1, log: true });
      this.hud.log(`Obstáculo a la ${side} · ${fmtDist(sideMin)}`, 'warn');
    }

    // Pulsos sonoros continuos
    this.sonarTimer += dt;
    if (this.audioEnabled && this.sonarEnabled && isMoving && level !== 'clear' && this.sonarTimer > 0.75) {
      this.sonarTimer = 0;
      this.sonar.ping(front, Math.sin(angle));
    }
  }

  updateBatteryAlerts() {
    const pct = this.telemetry.battery;
    if (pct < 20 && !this._b20) {
      this._b20 = true;
      this.speak('Batería al veinte por ciento. Conecta el cargador cuando puedas.', { priority: 2, log: true });
    }
    if (pct < 10 && !this._b10) {
      this._b10 = true;
      this.speak('Batería crítica. El sistema se apagará pronto.', { priority: 3, log: true });
    }
  }

  speak(text, { priority = 1, log = true, level = 'info' } = {}) {
    if (!text) return;
    this.lastUtterance = text;
    this.hud.setUtterance(text, this.voiceEnabled && this.voice.speaking);
    if (log) this.hud.log(text, level);
    this.telemetry.pulse('tts', 1200);
    if (!this.voiceEnabled) return;
    this.voice.speak(text, { priority, force: priority >= 2 });
  }

  ask(kind) {
    this.telemetry.pulse('mic', 1400);
    this.sonar.chime();
    const scan = this.lidar.scan;
    let answer = '';
    if (kind === 'front') {
      if (!isFinite(scan.front) || scan.front > 4.5) {
        answer = 'Tienes el camino despejado al frente por más de cuatro metros.';
      } else {
        const side = scan.frontRight > scan.frontLeft + 0.4 ? ' Hay paso a la derecha.' : scan.frontLeft > scan.frontRight + 0.4 ? ' Hay paso a la izquierda.' : ' Conviene detenerse.';
        answer = `${scan.frontHit?.label || 'Obstáculo'} al frente a ${fmtDist(scan.front)}.${side}`;
      }
    } else if (kind === 'exit') {
      if (this.env.kind === 'home') {
        const dx = -4.95 - this.player.x;
        const dz = 4.38 - this.player.z;
        const d = Math.hypot(dx, dz);
        const rel = wrapAngle(Math.atan2(dx, dz) - this.player.yaw);
        const side = Math.abs(rel) < 0.65 ? 'justo detrás de ti' : rel > 0 ? 'a tu derecha' : 'a tu izquierda';
        answer = `La puerta de entrada está a ${fmtDist(Math.max(0.4, d))}, ${side}, en la pared sur de la sala.`;
      } else {
        const gate = this.env.kind === 'labyrinth' ? { x: 0, z: 0 } : { x: 0, z: 4 };
        const d = Math.hypot(gate.x - this.player.x, gate.z - this.player.z);
        if (this.env.kind === 'labyrinth') {
          answer = `Estás en ${this.zone}. La salida del laberinto queda hacia el norte; te guiaré bordeando la pared de tu derecha.`;
        } else {
          answer = `La salida está a ${fmtDist(Math.max(0.3, d))} detrás de ti, por el pasillo principal. También hay un vestíbulo al frente.`;
        }
      }
    } else {
      if (this.env.kind === 'home') {
        const near = this.getNearestInteractable();
        const nearText = near ? ` Tienes ${near.label.toLowerCase()} a ${fmtDist(this.distanceTo(near.point))}.` : '';
        const roomText = this.zone === 'Cocina'
          ? 'La isla, la encimera, la nevera y la mesa de desayuno están distribuidas a tu alrededor.'
          : this.zone === 'Baño'
            ? 'La puerta queda al oeste; el lavabo, el inodoro y la ducha están al este y al fondo.'
            : this.zone === 'Pasillo'
              ? 'El pasillo conecta la cocina con el baño. La puerta del baño está al este.'
              : 'La sala tiene sofá, mesa de centro, televisión y dos estanterías. La cocina queda al este y el baño al fondo del pasillo.';
        answer = `Estás en ${this.zone}.${nearText} ${roomText}`;
      } else {
        const count = scan.contour.filter((p) => p.d < 4.5).length;
        const nearest = scan.min;
        answer = `Estás en ${this.zone}. Detecto ${count} puntos de contacto en menos de cuatro metros y medio. El obstáculo más próximo está a ${fmtDist(nearest)}.`;
      }
    }
    this.hud.log(answer, 'info');
    this.speak(answer, { priority: 3 });
  }

  /* ================= XR ================= */
  initXR() {
    const nav = navigator.xr;
    if (!nav) return;
    const vrBtn = document.getElementById('xr-vr');
    const arBtn = document.getElementById('xr-ar');
    nav.isSessionSupported('immersive-vr').then((ok) => {
      if (ok && vrBtn) {
        vrBtn.hidden = false;
        vrBtn.addEventListener('click', () => this.enterXR('vr'));
      }
    }).catch(() => {});
    nav.isSessionSupported('immersive-ar').then((ok) => {
      if (ok && arBtn) {
        arBtn.hidden = false;
        arBtn.addEventListener('click', () => this.enterXR('ar'));
      }
    }).catch(() => {});
  }

  async enterXR(mode) {
    if (!navigator.xr) return;
    if (this.mode === 'model') this.setMode('sim');
    try {
      const sessionInit = mode === 'vr'
        ? { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }
        : { requiredFeatures: ['dom-overlay'], optionalFeatures: ['local-floor', 'hit-test'], domOverlay: { root: document.body } };
      const session = await navigator.xr.requestSession(`immersive-${mode}`, sessionInit);
      this.renderer.xr.setReferenceSpaceType('local-floor');
      await this.renderer.xr.setSession(session);

      this.xrMode = mode;
      this.xrSaved = {
        pos: this.camera.position.clone(),
        quat: this.camera.quaternion.clone(),
        background: this.scene.background,
        fog: this.scene.fog,
      };

      this.xrRig = new THREE.Group();
      this.xrRig.position.set(this.player.x, 0, this.player.z);
      this.xrRig.rotation.y = this.player.yaw;
      this.scene.add(this.xrRig);
      this.xrRig.add(this.camera);
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);

      const mat = new THREE.MeshBasicMaterial({ color: 0x3ee0d0, toneMapped: false });
      for (let i = 0; i < 2; i++) {
        const controller = this.renderer.xr.getController(i);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), mat);
        controller.add(dot);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.6)]);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.6 }));
        controller.add(line);
        this.xrRig.add(controller);
      }

      document.body.classList.add('xr-active');
      const note = document.getElementById('xr-note');
      if (note) {
        note.hidden = false;
        note.textContent = mode === 'vr'
          ? 'WebXR · joystick izquierdo para caminar, derecho para girar'
          : 'Realidad aumentada · AURA proyectado en tu espacio';
      }

      if (mode === 'vr') {
        this.studio.group.visible = false;
        this.env.group.visible = true;
        this.rig.root.visible = false;
        this.lidar.setEnabled(this.lidarEnabled);
        this.scene.fog = new THREE.Fog(0x070b12, 12, 40);
        this.scene.background = new THREE.Color(0x070b12);
        this.renderer.setClearAlpha(1);
        this.camera.clearViewOffset?.();
      } else {
        this.studio.group.visible = false;
        this.env.group.visible = false;
        this.rig.root.visible = true;
        this.rig.body.visible = false;
        this.lidar.setEnabled(false);
        this.scene.fog = null;
        this.scene.background = null;
        this.renderer.setClearAlpha(0);
      }

      session.addEventListener('end', () => this.exitXR());
      this.hud.toast(mode === 'vr' ? 'Sesión VR iniciada' : 'Sesión AR iniciada');
    } catch (err) {
      console.warn('WebXR:', err);
      this.hud.toast('No se pudo iniciar la sesión WebXR en este dispositivo', 3200);
    }
  }

  exitXR() {
    const mode = this.xrMode;
    if (!mode) return;
    this.xrMode = null;
    document.body.classList.remove('xr-active');
    const note = document.getElementById('xr-note');
    if (note) note.hidden = true;

    if (this.xrRig) {
      this.player.x = this.xrRig.position.x;
      this.player.z = this.xrRig.position.z;
      this.viewYaw = this.xrRig.rotation.y;
      this.xrRig.remove(this.camera);
      this.scene.remove(this.xrRig);
      disposeObject(this.xrRig);
      this.xrRig = null;
    }

    this.rig.root.visible = true;
    this.rig.body.visible = true;
    this.scene.background = new THREE.Color(0x070b12);
    this.scene.fog = new THREE.Fog(0x070b12, 12, 40);
    this.renderer.setClearAlpha(1);
    this.scene.add(this.camera);
    if (this.xrSaved) this.camera.position.copy(this.xrSaved.pos);
    this.lidar.setEnabled(this.lidarEnabled && this.mode === 'sim');
    this.lidar.reset();
    this.studio.group.visible = this.mode === 'model';
    this.env.group.visible = this.mode !== 'model';
    this.rig.root.position.set(this.player.x, 0, this.player.z);
    this.rig.root.rotation.y = this.player.yaw;
    this.speed = 0;
    this.xrSaved = null;
    this.updateCamera(1 / 60, true);
  }

  updateXR(dt) {
    const session = this.renderer.xr.getSession();
    if (!session || !this.xrRig) return;

    if (this.xrMode === 'vr') {
      let mx = 0;
      let mz = 0;
      let turn = 0;
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp || !gp.axes) continue;
        const ax = Math.abs(gp.axes[0] || 0) > 0.2 ? gp.axes[0] : 0;
        const ay = Math.abs(gp.axes[1] || 0) > 0.2 ? gp.axes[1] : 0;
        if (src.handedness === 'right') turn += ax;
        else {
          mx += ax;
          mz += -ay;
        }
      }
      if (turn) this.xrRig.rotation.y -= turn * dt * 1.9;

      if (mx || mz) {
        const yaw = this.xrRig.rotation.y;
        const len = Math.hypot(mx, mz);
        const nx = mx / len;
        const nz = mz / len;
        const dirX = Math.sin(yaw) * nz - Math.cos(yaw) * nx;
        const dirZ = Math.cos(yaw) * nz + Math.sin(yaw) * nx;
        this.player.x += dirX * 1.15 * dt;
        this.player.z += dirZ * 1.15 * dt;
        resolveCircleAABB(this.player, 0.32, this.env.colliders);
        this.xrRig.position.x = this.player.x;
        this.xrRig.position.z = this.player.z;
      }

      const yaw = this.xrRig.rotation.y;
      const origin = this.tmpVec.set(
        this.xrRig.position.x + Math.sin(yaw) * 0.18,
        1.42,
        this.xrRig.position.z + Math.cos(yaw) * 0.18
      );
      this.lidar.update(dt, origin, yaw, 1);
      this.player.yaw = yaw;
      this.rig.root.position.set(this.player.x, 0, this.player.z);
      this.rig.root.rotation.y = yaw;
      this.updateZone(dt);
      this.updateRisk(dt, origin);
      this.telemetry.update(dt, { fps: this.fps, scan: this.lidar.scan, speaking: this.voice.speaking, moving: true, lidarOn: this.lidarEnabled });
    } else {
      const camPos = this.camera.getWorldPosition(this.tmpVec);
      const camQuat = this.camera.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
      forward.y = 0;
      if (forward.lengthSq() < 1e-5) forward.set(0, 0, -1);
      forward.normalize();
      const target = camPos.clone().addScaledVector(forward, 1.15);
      target.y = Math.max(0.6, camPos.y - 0.28);
      this.rig.root.position.lerp(target, 1 - Math.exp(-8 * dt));
      this.rig.root.rotation.y = Math.atan2(-forward.x, -forward.z);
      this.rig.update(dt, { speed: 0, moving: false, scanning: true });
      this.rig.root.updateMatrixWorld(true);
      this.lidar.setEnabled(false);
      this.telemetry.update(dt, { fps: this.fps, scan: null, speaking: this.voice.speaking, moving: false, lidarOn: false });
    }
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < 640 ? 66 : 58;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.composer.setSize(w, h);
    }
  }
}

function dampAngle(current, target, lambda, dt) {
  const delta = wrapAngle(target - current);
  return current + delta * (1 - Math.exp(-lambda * dt));
}

const app = new App();
window.__AURA__ = app;
