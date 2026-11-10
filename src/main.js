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

const NUM_ES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];
const numEs = (n) => NUM_ES[n] ?? String(n);

const CATEGORY_WORDS = {
  libros: ['libro', 'libros'],
  'decoración': ['objeto decorativo', 'objetos decorativos'],
  'electrónica': ['aparato electrónico', 'aparatos electrónicos'],
  hogar: ['objeto de casa', 'objetos de casa'],
  menaje: ['pieza de menaje', 'piezas de menaje'],
  'lácteos': ['producto lácteo', 'productos lácteos'],
  fruta: ['pieza de fruta', 'piezas de fruta'],
  bebidas: ['bebida', 'bebidas'],
  alimentos: ['alimento', 'alimentos'],
};

const articleFor = (word) => (/a$/.test(word) ? 'una' : 'un');
const pluralFor = (count, word) => (count === 1 ? `${articleFor(word)} ${word}` : `${numEs(count)} ${word}`);

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
    this.lastZoneAt = 0;
    this.lastBatteryAlert = 0;
    this.risk = 'clear';
    this.riskTimer = 0;
    this.tutor = { lastAt: 0, lastSignature: '', lastLevel: 'clear', lastClearAt: 0, warned: false };
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
    this.scan = null;
    this.scanSeq = 0;
    this.held = null;
    this.intentGoal = null;
    this.intentPromptOpen = false;
    this.intentPrompted = false;
    this.intentLastPromptAt = 0;
    this.intentHudAt = 0;
    this.homeSince = performance.now();
    this.heldStage = null;
    this.scanRay = new THREE.Raycaster();
    this.scanRay.camera = this.camera;
    this.scanBox = new THREE.Box3();
    this.scanSphere = new THREE.Sphere();

    this.player = { x: -3.3, z: 2.2, yaw: 2.0 };
    this.input = { x: 0, z: 0, run: false };
    this.virtual = { forward: false, back: false, left: false, right: false, run: false };
    this.viewYaw = 2.0;
    this.viewPitch = 0;
    this.thirdPitch = 0.16;
    this.thirdDist = 2.4;
    // Estado suavizado de la cámara POV: evita giros rígidos y mantiene
    // el encuadre estable mientras el usuario arrastra o se desplaza.
    this.povCam = { x: 0, y: 1.58, z: 0, yaw: 2.0, pitch: 0, ready: false };

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

    document.getElementById('intent-open')?.addEventListener('click', () => this.openIntentPrompt(true, true));
    document.getElementById('intent-close')?.addEventListener('click', () => this.closeIntentPrompt());
    document.querySelectorAll('#intent-options [data-intent]').forEach((btn) => {
      btn.addEventListener('click', () => this.chooseIntent(btn.dataset.intent));
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
        if (this.held || this.scan) return;
        this.speak('Sistema AURA en línea. Arnés ajustado y mapa espacial listo. Puedes comenzar a caminar.', { priority: 2, log: false });
      }, 420);
    }
  }

  onKeyDown(e) {
    if (e.repeat) return;
    const k = e.code;

    if (k === 'KeyI') {
      e.preventDefault();
      if (this.intentPromptOpen) this.closeIntentPrompt();
      else this.openIntentPrompt(true, true);
      return;
    }
    if (k === 'Escape' && this.intentPromptOpen) {
      e.preventDefault();
      this.closeIntentPrompt();
      return;
    }

    // Sentarse / levantarse es contextual: solo junto al sofá.
    const nearSofa = this.getNearestInteractable('sofa');
    if (k === 'KeyS' && !this.seated && !this.held && nearSofa && this.speed < 0.55) {
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

    if (k === 'KeyF') {
      e.preventDefault();
      if (this.intentPromptOpen) this.closeIntentPrompt();
      if (this.held) {
        this.returnHeld();
        return;
      }
      const preferred = this.getPreferredScanItem();
      if (preferred) {
        this.takeHeldItem(preferred);
        return;
      }
      const target = (this.env.interactables || []).find((item) =>
        (item.type === 'shelf' || item.type === 'table' || item.type === 'fridge') &&
        this.distanceTo(item.point) <= item.radius
      );
      if (target) {
        this.hud.toast('Primero escanea con E y elige un objeto');
        this.speak('Primero pulsa E para escanear la superficie; después podrás acercar un objeto con F.', { priority: 1, log: false });
      }
      return;
    }
    if (k === 'KeyE') {
      e.preventDefault();
      if (this.intentPromptOpen) this.closeIntentPrompt();
      this.interact();
      return;
    }
    if (this.fridgeOpen && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(k)) {
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
      if (this.intentGoal) {
        this.clearIntent();
        this.hud.toast('Plan cancelado');
        this.speak('Plan cancelado. Puedes seguir explorando o pulsar I para elegir otro destino.', { priority: 1, log: false });
        return;
      }
      if (this.held) {
        this.returnHeld();
        return;
      }
      if (this.fridgeOpen) {
        this.toggleFridge(false);
        return;
      }
      if (this.scan) {
        this.scan = null;
        this.hud.hideScan();
      }
      this.hud.hideSpec();
      this.hud.hideContext();
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
    if (this.scan && cam !== 'pov') {
      this.scan = null;
      this.hud.hideScan();
    }
    if (this.held && cam !== 'pov') this.returnHeld({ silent: true });
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
    if (this.held || this.scan) this.clearScan();
    this.clearIntent();
    this.closeIntentPrompt();
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
    this.clearScan();
    this.clearIntent();
    this.closeIntentPrompt();
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
    this.tutor = { lastAt: 0, lastSignature: '', lastLevel: 'clear', lastClearAt: 0, warned: false };
    this.risk = 'clear';
    this.intentPrompted = false;
    this.homeSince = performance.now();
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
    this.clearScan();
    this.clearIntent();
    this.closeIntentPrompt();
    const spawn = this.env.spawn;
    const wasSeated = this.seated;
    this.seated = false;
    this.seat = null;
    this.fridgeOpen = false;
    this.fridgeSelected = null;
    this.env.setFridgeOpen?.(false);
    this.contextMuted = null;
    this.tutor = { lastAt: 0, lastSignature: '', lastLevel: 'clear', lastClearAt: 0, warned: false };
    this.risk = 'clear';
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
    if (this.held || this.scan) this.clearScan();
    if (this.env.kind === 'labyrinth') {
      this.hud.toast('El recorrido automático está disponible en la casa y el corredor');
      return;
    }
    if (this.seated) this.standUp();
    this.demo = !this.demo;
    document.getElementById('demo-btn')?.classList.toggle('active', this.demo);
    if (this.demo) {
      this.closeIntentPrompt();
      this.clearIntent();
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

  /* ================= Diálogo proactivo de intenciones ================= */
  openIntentPrompt(speak = true, force = false) {
    if (this.env.kind !== 'home' || this.mode !== 'sim' || this.scan || this.held || this.seated) return;
    if (this.intentPromptOpen) return;
    const now = performance.now();
    if (speak && !force && now - this.intentLastPromptAt < 6000) return;
    this.cancelDemo();
    this.intentPromptOpen = true;
    this.intentPrompted = true;
    this.intentLastPromptAt = now;
    this.contextTimer = 1;
    document.body.classList.remove('show-data', 'show-voice');
    this.hud.showIntentPrompt();
    if (speak) {
      this.speak('¿Qué te gustaría hacer? ¿Quieres ir al baño, a la cocina o tomar algo en la nevera?', { priority: 2, log: true });
    }
  }

  closeIntentPrompt() {
    if (!this.intentPromptOpen) return;
    this.intentPromptOpen = false;
    this.hud.hideIntentPrompt();
    this.contextTimer = 1;
  }

  chooseIntent(id) {
    this.closeIntentPrompt();
    if (id === 'explore') {
      this.clearIntent();
      this.speak('Perfecto. Sigue explorando. Cuando quieras retomar un destino, pulsa I.', { priority: 1, log: true });
      return;
    }
    const meta = {
      bath: { label: 'Baño', spoken: 'al baño' },
      kitchen: { label: 'Cocina', spoken: 'a la cocina' },
      fridge: { label: 'Nevera', spoken: 'a la nevera' },
    }[id];
    if (!meta) return;
    const route = this.buildIntentRoute(id);
    if (!route.length) return;
    this.clearIntent();
    this.intentGoal = {
      id,
      label: meta.label,
      spoken: meta.spoken,
      route,
      index: 0,
      arrived: false,
      arrivedAt: 0,
    };
    const finalPoint = route[route.length - 1];
    this.intentHudAt = 0;
    this.hud.setGoal(meta.label, fmtDist(this.distanceTo(finalPoint)));
    const first = route[0];
    const direction = this.intentDirection(first);
    let speech = `Vamos ${meta.spoken}. El primer tramo queda ${direction}, a ${fmtDist(this.distanceTo(first))}.`;
    if (id === 'fridge') speech += ' Al llegar, pulsa E para abrirla y escanear los productos.';
    else speech += ' Te aviso al llegar.';
    this.speak(speech, { priority: 2, log: true });
    this.hud.toast(`Objetivo: ${meta.label} · sigue las indicaciones de AURA`, 4200);
  }

  buildIntentRoute(id) {
    const route = [];
    const front = this.player.z > -1.05;
    const final = id === 'bath'
      ? { x: 4.15, z: -2.95, label: 'la puerta del baño' }
      : id === 'kitchen'
        ? { x: 2.2, z: 2.75, label: 'la cocina' }
        : { x: 4.45, z: -0.45, label: 'la nevera' };

    if (id === 'bath') {
      if (this.player.x > 3.35 && this.player.z < -1.2) return [final];
      if (front) {
        if (this.player.x > 3.3) {
          route.push({ x: 4.5, z: 0.8, label: 'el lado este de la barra' });
        } else {
          if (this.player.z > 1.2) {
            route.push({ x: 0.9, z: 3.0, label: 'el borde sur de la sala' });
          }
          if (this.distanceTo({ x: 0.9, z: -0.15 }) > 0.8) {
            route.push({ x: 0.9, z: -0.15, label: 'el pasillo de la sala' });
          }
        }
        route.push({ x: 2.0, z: -0.55, label: 'el paso al pasillo' });
      }
      if (!front || this.player.x < 2.0 || this.player.z > -2.35) {
        route.push({ x: 2.6, z: -2.95, label: 'el pasillo' });
      }
    } else if (id === 'kitchen') {
      if (!front) {
        route.push({ x: 2.0, z: -0.55, label: 'el paso a la cocina' });
        route.push({ x: 4.5, z: 0.8, label: 'el lado este de la barra' });
        route.push({ x: 4.5, z: 2.9, label: 'la zona de la mesa' });
      } else if (this.player.x > 3.35) {
        route.push({ x: 4.5, z: 2.9, label: 'la zona de la mesa' });
      }
    } else if (id === 'fridge') {
      if (!front) {
        route.push({ x: 2.0, z: -0.55, label: 'el paso a la cocina' });
        route.push({ x: 4.5, z: 0.8, label: 'el lado este de la barra' });
      } else if (this.player.z > 0.85 || this.player.x < 3.2) {
        route.push({ x: 4.5, z: 2.9, label: 'la zona de la mesa' });
        route.push({ x: 4.5, z: 0.8, label: 'el lado este de la barra' });
      }
    }

    route.push(final);
    while (route.length > 1 && this.distanceTo(route[0]) < 0.8) route.shift();
    return route;
  }

  intentDirection(point) {
    const delta = wrapAngle(Math.atan2(point.x - this.player.x, point.z - this.player.z) - this.viewYaw);
    if (Math.abs(delta) <= 0.5) return 'al frente';
    if (Math.abs(delta) >= 2.45) return 'detrás de ti';
    return delta > 0 ? 'a tu derecha' : 'a tu izquierda';
  }

  intentArrivalText(goal) {
    if (goal.id === 'bath') return 'Ya estás en el baño. El lavabo queda a un lado y la ducha al fondo.';
    if (goal.id === 'kitchen') return 'Ya estás en la cocina. La barra queda al frente y la nevera a la derecha.';
    return 'Ya estás frente a la nevera. Pulsa E para abrirla y escanear lo que hay dentro.';
  }

  clearIntent() {
    if (!this.intentGoal) return;
    this.intentGoal = null;
    this.hud.clearGoal();
  }

  updateIntent() {
    if (this.env.kind !== 'home' || this.mode !== 'sim') return;
    const now = performance.now();
    if (!this.intentPrompted && !this.intentPromptOpen && !this.intentGoal
      && this.hasFirstInput && !this.demo && !this.seated && !this.scan && !this.held
      && this.speed < 0.16 && now - this.homeSince > 8500
      && now - this.tutor.lastAt > 6000 && !this.voice.speaking) {
      this.openIntentPrompt(true);
      return;
    }
    const goal = this.intentGoal;
    if (!goal) return;
    if (goal.arrived) {
      if (now - goal.arrivedAt > 8000) this.clearIntent();
      return;
    }

    const finalPoint = goal.route[goal.route.length - 1];
    const finalDist = this.distanceTo(finalPoint);
    if (now - this.intentHudAt > 180) {
      this.intentHudAt = now;
      this.hud.setGoal(goal.label, fmtDist(finalDist));
    }

    const waypoint = goal.route[goal.index];
    if (!waypoint) return;
    const waypointDist = this.distanceTo(waypoint);
    if (waypointDist > 0.82) return;

    if (goal.index >= goal.route.length - 1) {
      goal.arrived = true;
      goal.arrivedAt = now;
      this.hud.setGoal(goal.label, 'aquí');
      this.speak(this.intentArrivalText(goal), { priority: 2, log: true });
      return;
    }

    goal.index += 1;
    const next = goal.route[goal.index];
    if (!this.voice.speaking) {
      this.speak(`Bien. Ahora ${next.label} queda ${this.intentDirection(next)}, a ${fmtDist(this.distanceTo(next))}.`, { priority: 1, log: true });
    }
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

  renderContext(key, payload, id) {
    this.contextCurrentId = id;
    if (this.contextMuted === id) {
      this.hud.hideContext();
      return;
    }
    this.hud.showContext(key, payload);
  }

  /* ================= Escaneo activo con la cámara POV ================= */
  isDescendant(object, root) {
    let node = object;
    while (node) {
      if (node === root) return true;
      node = node.parent;
    }
    return false;
  }

  scanItemKey(item) {
    return `${item.id || item.name}|${item.level ?? ''}`;
  }

  scanCandidates(target) {
    const raw = target.type === 'fridge' ? (target.products || []) : (target.items || []);
    const items = raw.filter((item) => item.object);
    if (!items.length) return [];
    this.scanRay.camera = this.camera;
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    );
    const camPos = this.camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const maxDist = target.type === 'fridge' ? 2.8 : 3.2;
    const candidates = [];
    for (const item of items) {
      this.scanBox.setFromObject(item.object);
      if (this.scanBox.isEmpty()) continue;
      this.scanBox.getBoundingSphere(this.scanSphere);
      const sphere = this.scanSphere.clone();
      const dist = sphere.center.distanceTo(camPos);
      if (dist > maxDist || dist < 0.08) continue;
      if (!frustum.intersectsSphere(sphere)) continue;
      const dir = sphere.center.clone().sub(camPos).normalize();
      if (dir.dot(forward) < 0.15) continue;
      candidates.push({ item, dist, center: sphere.center.clone(), radius: sphere.radius });
    }
    if (!candidates.length) return [];
    const visible = [];
    for (const candidate of candidates) {
      if (this.isVisibleFromCamera(candidate)) visible.push(candidate);
    }
    // Si el propio estante tapa el centro del objeto, el barrido aún puede
    // verlo desde otro ángulo; se conserva lo que está dentro del frustum.
    const result = visible.length ? visible : candidates;
    result.sort((a, b) => a.dist - b.dist);
    return result;
  }

  collectScanSweep() {
    const scan = this.scan;
    if (!scan) return;
    const pitchSteps = 10;
    const yawSteps = 3;
    const savedPitch = this.viewPitch;
    const savedYaw = this.viewYaw;
    const range = scan.yawRange || 0;
    for (let yi = 0; yi < yawSteps; yi += 1) {
      const yawFactor = yawSteps === 1 ? 0 : (yi / (yawSteps - 1)) * 2 - 1;
      this.viewYaw = scan.baseYaw + yawFactor * range;
      for (let pi = 0; pi < pitchSteps; pi += 1) {
        this.viewPitch = lerp(scan.pitchFrom, scan.pitchTo, pi / (pitchSteps - 1));
        this.updateCamera(1 / 60, true);
        for (const candidate of this.scanCandidates(scan.target)) {
          const key = this.scanItemKey(candidate.item);
          const prev = scan.found.get(key);
          if (!prev || candidate.dist < prev.dist) scan.found.set(key, candidate);
        }
      }
    }
    this.viewYaw = savedYaw;
    this.viewPitch = savedPitch;
    this.updateCamera(1 / 60, true);
  }

  isVisibleFromCamera(candidate) {
    const camPos = this.camera.position;
    const radius = Math.max(0.02, candidate.radius || 0.02);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const offsets = [
      [0, 0],
      [radius * 0.55, 0],
      [-radius * 0.55, 0],
      [0, radius * 0.45],
      [0, -radius * 0.45],
    ];
    for (const [ox, oy] of offsets) {
      const point = candidate.center.clone()
        .addScaledVector(right, ox)
        .addScaledVector(up, oy);
      const dir = point.sub(camPos);
      const len = dir.length();
      if (len < 0.05) return true;
      dir.divideScalar(len);
      this.scanRay.set(camPos, dir);
      this.scanRay.near = 0.02;
      this.scanRay.far = len + 0.2;
      this.scanRay.camera = this.camera;
      const hit = this.scanRay.intersectObjects(this.env.targets, true)[0];
      if (!hit) return true;
      if (this.isDescendant(hit.object, candidate.item.object)) return true;
      if (hit.distance >= len - 0.1) return true;
    }
    return false;
  }

  startScan(target) {
    if (!target) return;
    if (this.intentPromptOpen) this.closeIntentPrompt();
    this.stopIntro();
    this.cancelDemo();
    if (this.held) this.returnHeld({ silent: true });
    if (this.seated) this.standUp();
    if (target.type === 'fridge' && !this.fridgeOpen) this.toggleFridge(true);

    const look = target.look || new THREE.Vector3(
      target.point.x,
      target.type === 'table' ? 0.85 : 1.15,
      target.point.z
    );
    const dx = look.x - this.player.x;
    const dz = look.z - this.player.z;
    if (Math.hypot(dx, dz) > 0.04) {
      this.player.yaw = Math.atan2(dx, dz);
      this.viewYaw = this.player.yaw;
    }
    this.camMode = 'pov';
    this.hud.setCameraMode('pov');
    const config = target.scanPitch || (target.type === 'shelf'
      ? { from: 0.2, to: -0.62, duration: 2100 }
      : target.type === 'table'
        ? { from: 0.08, to: -0.72, duration: 1500 }
        : { from: 0.12, to: -0.78, duration: 2000 });
    this.viewPitch = config.from;
    const yawRange = target.type === 'table' ? 0.38 : target.type === 'shelf' ? 0.24 : 0.2;
    this.scan = {
      seq: ++this.scanSeq,
      target,
      found: new Map(),
      items: [],
      done: false,
      empty: false,
      summary: '',
      startedAt: performance.now(),
      lastSample: 0,
      pitchFrom: config.from,
      pitchTo: config.to,
      duration: config.duration,
      baseYaw: this.viewYaw,
      yawRange,
    };
    this.contextMuted = null;
    this.contextCurrentId = null;
    this.contextTimer = 1;
    this.hud.hideContext();
    this.hud.showScan('Escaneando con la cámara', `${target.label} · barrido POV`);
    this.updateCamera(1 / 60, true);
    this.speak('Escaneando con la cámara.', { priority: 0, log: false });
  }

  updateScan() {
    const scan = this.scan;
    if (!scan || scan.done) return;
    const now = performance.now();
    const t = clamp((now - scan.startedAt) / scan.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    this.viewPitch = lerp(scan.pitchFrom, scan.pitchTo, eased);
    // Barrido horizontal suave: centro → derecha → centro → izquierda → centro.
    // Así una superficie ancha entra completa en el frustum también en móvil.
    this.viewYaw = scan.baseYaw + Math.sin(eased * Math.PI * 2) * (scan.yawRange || 0);
    this.camMode = 'pov';
    this.updateCamera(1 / 60, true);
    if (now - scan.lastSample > 120) {
      scan.lastSample = now;
      for (const candidate of this.scanCandidates(scan.target)) {
        const key = this.scanItemKey(candidate.item);
        const prev = scan.found.get(key);
        if (!prev || candidate.dist < prev.dist) scan.found.set(key, candidate);
      }
    }
    if (t >= 1) this.finishScan();
  }

  finishScan() {
    const scan = this.scan;
    if (!scan || scan.done) return;
    // Con pocos fps el muestreo de 120 ms puede saltarse los extremos del
    // barrido. Reconstruimos el barrido con pasos fijos para contar todos
    // los objetos que sí son visibles desde la cámara.
    this.collectScanSweep();
    scan.items = [...scan.found.values()].sort((a, b) => a.dist - b.dist);
    scan.done = true;
    scan.empty = scan.items.length === 0;
    this.viewYaw = scan.baseYaw;
    this.viewPitch = scan.target.finalPitch
      ?? (scan.target.type === 'fridge' ? -0.6 : scan.target.type === 'table' ? -0.45 : -0.3);
    // El encuadre final se asienta con la misma amortiguación que el barrido;
    // así no hay un salto seco al terminar de reconocer la superficie.
    this.updateCamera(1 / 60);
    this.contextMuted = null;
    this.contextTimer = 1;

    if (scan.empty) {
      this.hud.showScan('Sin lectura clara', 'Acércate y vuelve a escanear', { mode: 'error', autoHide: 3200 });
      this.speak('No distingo ningún objeto desde aquí. Acércate un poco, gira hacia la superficie y vuelve a escanear.', { priority: 2, log: true });
      return;
    }

    scan.summary = this.buildScanSummary(scan.items.map((entry) => entry.item));
    this.hud.showScan('Escaneo completado', `${scan.items.length} objetos · F para acercar`, { autoHide: 2800 });
    this.speak(`${scan.summary} ${scan.items.length === 1 ? 'Pulsa F para acercarlo.' : 'Pulsa F para acercar el primero.'}`, { priority: 2, log: true });
  }

  buildScanSummary(items) {
    const groups = new Map();
    for (const item of items) {
      const category = item.category || 'objetos';
      if (!groups.has(category)) groups.set(category, { category, items: [], count: 0 });
      const group = groups.get(category);
      group.items.push(item);
      group.count += Number(item.count) || 1;
    }
    const ordered = [...groups.values()].sort((a, b) => b.count - a.count);
    const phrases = [];
    for (const group of ordered) {
      if (group.items.length === 1) {
        const item = group.items[0];
        const itemCount = Number(item.count) || 1;
        if (item.summary && itemCount === group.count) {
          phrases.push(item.summary);
          continue;
        }
        if (group.count === 1 && item.voice) {
          phrases.push(item.voice);
          continue;
        }
      }
      const [one, many] = CATEGORY_WORDS[group.category] || ['objeto', 'objetos'];
      phrases.push(pluralFor(group.count, group.count === 1 ? one : many));
    }
    const shown = phrases.slice(0, 4);
    let list = this.joinEs(shown);
    const extra = phrases.length - shown.length;
    if (extra > 0) list += extra === 1 ? ' y algún objeto más' : ` y ${numEs(extra)} tipos de objetos más`;
    return `Con la cámara veo ${list}.`;
  }

  ensureHeldStage() {
    if (this.heldStage) return;
    const stage = new THREE.Group();
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.15),
      new THREE.MeshBasicMaterial({ color: 0x050a12, transparent: true, opacity: 0.97, depthWrite: true })
    );
    backdrop.position.set(0, 0, -1.0);
    stage.add(backdrop);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x3ee0d0, transparent: true, opacity: 0.28, toneMapped: false });
    for (const [w, h, x, y] of [
      [1.7, 0.012, 0, 0.575],
      [1.7, 0.012, 0, -0.575],
      [0.012, 1.15, -0.85, 0],
      [0.012, 1.15, 0.85, 0],
    ]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w, h), borderMat);
      line.position.set(x, y, -0.995);
      stage.add(line);
    }
    stage.visible = false;
    this.camera.add(stage);
    this.heldStage = stage;
  }

  takeHeldItem(item) {
    if (!item?.object) return;
    if (this.held?.item === item) return;
    if (this.held) this.returnHeld({ silent: true });
    this.stopIntro();
    this.cancelDemo();
    this.ensureHeldStage();
    this.camera.updateMatrixWorld(true);
    const object = item.object;
    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const size = box.getSize(new THREE.Vector3());
    const factor = clamp(0.11 / Math.max(0.04, sphere.radius), 0.6, 1.25);
    const held = {
      item,
      object,
      parent: object.parent,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    };
    this.camera.attach(object);
    this.env.group.visible = false;
    if (this.heldStage) this.heldStage.visible = true;
    object.position.set(0.02, -0.04, -0.72);
    const showCover = item.category === 'libros' || (size.x < size.z * 0.75 && size.z > size.y * 0.75);
    if (showCover) object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    else object.quaternion.set(0, 0, 0, 1);
    object.scale.copy(held.scale).multiplyScalar(factor);
    held.materials = [];
    object.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const originals = Array.isArray(node.material) ? node.material : [node.material];
      const clones = originals.map((material) => {
        const clone = material.clone();
        if (clone.color) clone.color.multiplyScalar(0.8);
        if (clone.emissive) clone.emissive.multiplyScalar(0.35);
        if ('emissiveIntensity' in clone) clone.emissiveIntensity *= 0.55;
        return clone;
      });
      held.materials.push({ mesh: node, originals });
      node.material = Array.isArray(node.material) ? clones : clones[0];
    });
    this._heldExposure = this.renderer.toneMappingExposure;
    this.renderer.toneMappingExposure = 0.9;
    this.held = held;
    this.contextMuted = null;
    this.contextCurrentId = null;
    this.contextTimer = 1;
    this.hud.hideContext();
    this.renderHeldContext();
    this.hud.showScan('Objeto acercado', `${item.name} · F para devolver`, { mode: 'held' });
    const title = item.title || item.name;
    const detail = item.detail || item.voice || 'Lo tienes delante de la cámara.';
    this.speak(`Tienes «${title}» delante de la cámara. ${detail} Pulsa F para devolverlo.`, { priority: 3, log: true });
  }

  returnHeld({ silent = false } = {}) {
    if (!this.held) return;
    const held = this.held;
    this.held = null;
    if (this.heldStage) this.heldStage.visible = false;
    this.env.group.visible = this.mode !== 'model';
    if (this._heldExposure) {
      this.renderer.toneMappingExposure = this._heldExposure;
      this._heldExposure = null;
    }
    if (held.materials) {
      for (const entry of held.materials) {
        const current = entry.mesh.material;
        entry.mesh.material = Array.isArray(current) ? entry.originals : entry.originals[0];
        for (const material of (Array.isArray(current) ? current : [current])) material.dispose?.();
      }
      held.materials = null;
    }
    if (held.parent) {
      held.parent.add(held.object);
      held.object.position.copy(held.position);
      held.object.quaternion.copy(held.quaternion);
      held.object.scale.copy(held.scale);
    }
    if (!silent) {
      this.contextMuted = null;
      this.contextTimer = 1;
      this.hud.showScan('Objeto devuelto', 'En su sitio · puedes volver a escanear', { autoHide: 1700 });
      this.speak('Objeto devuelto a su sitio.', { priority: 1, log: false });
      this.updateInteractions(0.2);
    }
  }

  clearScan() {
    if (this.held) this.returnHeld({ silent: true });
    this.scan = null;
    this.hud?.hideScan();
    this.hud?.hideContext();
    this.contextMuted = null;
    this.contextCurrentId = null;
  }

  getPreferredScanItem() {
    if (!this.scan?.done || !this.scan.items.length) return null;
    if (this.fridgeSelected) {
      const match = this.scan.items.find((entry) => entry.item.id === this.fridgeSelected);
      if (match) return match.item;
    }
    return this.scan.items[0].item;
  }

  renderHeldContext() {
    if (!this.held) return;
    const item = this.held.item;
    this.renderContext(`held:${item.id || item.name}:${this.scan?.seq || 0}`, {
      eyebrow: 'OBJETO ACERCADO · CÁMARA POV',
      title: item.title || item.name,
      text: item.detail || item.voice || 'El objeto está delante de la cámara del arnés.',
      items: [{ label: item.name, meta: item.category || 'objeto' }],
      actions: [{ label: 'Devolver objeto', hint: 'F', primary: true, onClick: () => this.returnHeld() }],
    }, 'held');
  }

  renderScanTarget(target, near, distLabel, zone) {
    const scan = this.scan?.target?.id === target.id ? this.scan : null;
    if (!scan) {
      const closed = target.type === 'fridge' && !this.fridgeOpen;
      this.renderContext(`scan-prompt:${target.id}`, {
        eyebrow: `${zone} · A ${distLabel}`,
        title: target.label,
        text: closed
          ? 'Puerta cerrada. Abre la nevera y escanea el interior con la cámara en POV; AURA solo reconocerá lo que esté a la vista.'
          : target.type === 'fridge'
            ? 'El interior está abierto. Pulsa E para barrer con la cámara y contar los productos visibles.'
            : 'La cámara del arnés está en POV. Pulsa E para hacer un barrido vertical y reconocer solo lo que está a la vista.',
        items: [],
        actions: [{
          label: closed ? 'Abrir y escanear' : 'Escanear con la cámara',
          hint: 'E',
          primary: true,
          onClick: () => this.startScan(target),
        }],
      }, target.id);
      return;
    }

    if (!scan.done) {
      this.renderContext(`scan-progress:${target.id}:${scan.seq}`, {
        eyebrow: `ESCANEO POV · ${zone}`,
        title: `Barriendo ${target.label.toLowerCase()}`,
        text: 'Mantén la mirada en la superficie. La cámara está recorriendo el estante o la mesa para reconocer los objetos visibles.',
        items: [],
        actions: [],
      }, target.id);
      return;
    }

    if (scan.empty) {
      this.renderContext(`scan-empty:${target.id}:${scan.seq}`, {
        eyebrow: `ESCANEO POV · ${zone}`,
        title: `${target.label} · sin lectura clara`,
        text: 'No distingo objetos desde esta posición. Acércate un poco, orienta la cámara hacia la superficie y vuelve a escanear.',
        items: [],
        actions: [
          { label: 'Volver a escanear', hint: 'E', primary: true, onClick: () => this.startScan(target) },
          ...(target.type === 'fridge' ? [{ label: 'Cerrar nevera', onClick: () => this.toggleFridge(false) }] : []),
        ],
      }, target.id);
      return;
    }

    const items = scan.items.map((entry) => entry.item);
    const actions = items.slice(0, 6).map((item, index) => ({
      label: `Acercar ${lowerFirst(item.name)}`,
      hint: index === 0 ? 'F' : undefined,
      primary: index === 0,
      onClick: () => this.takeHeldItem(item),
    }));
    actions.push({ label: 'Volver a escanear', hint: 'E', onClick: () => this.startScan(target) });
    if (target.type === 'fridge') {
      actions.push({ label: 'Cerrar nevera', onClick: () => this.toggleFridge(false) });
    }
    this.renderContext(`scan:${target.id}:${scan.seq}:${items.length}`, {
      eyebrow: `ESCANEO POV · ${zone}`,
      title: `${target.label} · escaneo activo`,
      text: `${scan.summary} El reconocimiento se ha hecho con la cámara del arnés; puedes acercar un objeto con F.`,
      items: items.map((item) => ({ label: item.name, meta: item.title || item.category || 'objeto' })),
      actions,
    }, target.id);
  }

  sitOnSofa(sofa) {
    if (!sofa?.seats?.length) return;
    if (this.intentPromptOpen) this.closeIntentPrompt();
    this.clearScan();
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
    if (this.intentPromptOpen) this.closeIntentPrompt();
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
    if (!open && this.held?.item && this.fridgeSelected) this.returnHeld({ silent: true });
    this.fridgeOpen = open;
    this.fridgeSelected = null;
    this.env.setFridgeOpen?.(open);
    this.contextMuted = null;
    this.contextTimer = 1;
    if (!open) {
      this.scan = null;
      this.hud.hideScan();
    }
    if (open) {
      this.hud.toast('Nevera abierta · escanea el interior', 3000);
      this.speak('Nevera abierta. Pulsa E para escanear el interior con la cámara.', { priority: 2, log: false });
    } else {
      this.hud.toast('Nevera cerrada');
      this.speak('Nevera cerrada.', { priority: 2, log: false });
    }
  }

  selectFridgeProduct(id) {
    if (this.intentPromptOpen) this.closeIntentPrompt();
    this.stopIntro();
    const fridge = this.env.interactables?.find((i) => i.type === 'fridge');
    const product = fridge?.products?.find((p) => p.id === id);
    if (!product) return;
    this.fridgeSelected = id;
    this.contextMuted = null;
    this.contextTimer = 1;
    this.hud.toast(`${product.name} · ${product.level}`, 3000);
    this.hud.showScan('Producto seleccionado', `${product.name} · F para acercarlo`, { autoHide: 2600 });
    this.speak(`${product.title || product.name}. ${product.detail || product.voice}`, { priority: 2, log: true });
  }

  interact() {
    if (this.intentPromptOpen) this.closeIntentPrompt();
    this.stopIntro();
    if (this.held) {
      this.returnHeld();
      return;
    }
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
    if (near.type === 'fridge' || near.type === 'shelf' || near.type === 'table') this.startScan(near);
    else if (near.type === 'sofa') this.sitOnSofa(near);
  }

  updateInteractions(dt) {
    this.updateScan();

    if (this.held) {
      const target = this.scan?.target;
      if (target && this.distanceTo(target.point) > target.radius + 1.3) {
        this.returnHeld({ silent: true });
      } else {
        this.renderHeldContext();
        return;
      }
    }

    // Mientras el usuario elige un plan, la tarjeta de intenciones tiene
    // prioridad y no se muestran tarjetas contextuales superpuestas.
    if (this.intentPromptOpen) {
      this.hud.hideContext();
      return;
    }

    this.contextTimer += dt;
    if (this.contextTimer < 0.18) return;
    this.contextTimer = 0;
    const list = this.env.interactables || [];
    const fridge = list.find((i) => i.type === 'fridge');

    // Cerrar la nevera al alejarse
    if (this.fridgeOpen && fridge && this.distanceTo(fridge.point) > 2.55) {
      this.fridgeOpen = false;
      this.fridgeSelected = null;
      this.env.setFridgeOpen?.(false);
      if (this.scan?.target?.type === 'fridge') {
        this.scan = null;
        this.hud.hideScan();
      }
      this.contextMuted = null;
      this.hud.hideContext();
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
      if (this.scan) {
        this.scan = null;
        this.hud.hideScan();
      }
      this.hud.hideContext();
      this.contextCurrentId = null;
      this.contextMuted = null;
      return;
    }
    if (this.scan && this.scan.target?.id !== near.id) {
      this.scan = null;
      this.hud.hideScan();
    }
    if (this.contextMuted && this.contextMuted !== near.id) this.contextMuted = null;
    const d = this.distanceTo(near.point);
    const distLabel = d < 1 ? `${Math.round(d * 100)} cm` : `${d.toFixed(1).replace('.', ',')} m`;
    const zone = (this.zone || '').toUpperCase();

    if (near.type === 'fridge') {
      if (!this.fridgeOpen) {
        this.renderContext(`fridge:closed:${d.toFixed(1)}`, {
          eyebrow: `NEVERA · A ${distLabel} · ${zone}`,
          title: 'Nevera',
          text: 'Puerta cerrada. Abre la nevera y escanea el interior con la cámara para localizar productos visibles.',
          items: [],
          actions: [{ label: 'Abrir y escanear', hint: 'E', primary: true, onClick: () => this.startScan(near) }],
        }, near.id);
        return;
      }
      this.renderScanTarget(near, near, distLabel, zone);
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

    if (near.type === 'shelf' || near.type === 'table') {
      this.renderScanTarget(near, near, distLabel, zone);
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
    this.hud.updateDetections(this.camera, this.held ? [] : this.env.obstacles, sensor, this.camMode === 'pov' && !this.held);

    this.updateZone(dt);
    this.updateInteractions(dt);
    this.updateIntent();
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
    if (moving) {
      this.stopIntro();
      if (this.intentPromptOpen) this.closeIntentPrompt();
    }

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
      const targetX = p.x + fx * 0.03;
      const targetY = p.y;
      const targetZ = p.z + fz * 0.03;
      const cam = this.povCam;
      if (snap || !cam.ready) {
        cam.x = targetX;
        cam.y = targetY;
        cam.z = targetZ;
        cam.yaw = this.viewYaw;
        cam.pitch = this.viewPitch;
        cam.ready = true;
      } else {
        const posAlpha = 1 - Math.exp(-20 * dt);
        const yawAlpha = 1 - Math.exp(-10 * dt);
        const pitchAlpha = 1 - Math.exp(-12 * dt);
        cam.x = THREE.MathUtils.lerp(cam.x, targetX, posAlpha);
        cam.y = THREE.MathUtils.lerp(cam.y, targetY, posAlpha);
        cam.z = THREE.MathUtils.lerp(cam.z, targetZ, posAlpha);
        const yawDelta = wrapAngle(this.viewYaw - cam.yaw);
        cam.yaw = wrapAngle(cam.yaw + THREE.MathUtils.lerp(0, yawDelta, yawAlpha));
        cam.pitch = THREE.MathUtils.lerp(cam.pitch, this.viewPitch, pitchAlpha);
      }
      this.camera.position.set(cam.x, cam.y, cam.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(cam.pitch, cam.yaw + Math.PI, 0);
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

  /* ================= Tutor de voz y riesgo ================= */
  presentObstacle(label) {
    if (!label || label === 'Obstáculo' || label === 'Obstáculo bajo') return 'un obstáculo';
    if (label === 'Pared') return 'una pared';
    const l = lowerFirst(label);
    if (/^(mesa|silla|estantería|nevera|lámpara|planta|ducha|isla|barra|encimera|consola|lavabo|cama|alfombra|puerta|ventana|radio|taza|botella|bañera|toalla)/.test(l)) {
      return `una ${l}`;
    }
    return `un ${l}`;
  }

  definiteObstacle(label) {
    if (!label || label === 'Obstáculo' || label === 'Obstáculo bajo') return 'el obstáculo';
    if (label === 'Pared') return 'la pared';
    const l = lowerFirst(label);
    if (/^(mesa|silla|estantería|nevera|lámpara|planta|ducha|isla|barra|encimera|consola|lavabo|cama|alfombra|puerta|ventana|radio|taza|botella|bañera|toalla)/.test(l)) {
      return `la ${l}`;
    }
    return `el ${l}`;
  }

  pluralObstacle(label) {
    const l = lowerFirst(label || 'objeto');
    const parts = l.split(' ');
    const head = parts[0];
    if (/z$/.test(head)) parts[0] = `${head.slice(0, -1)}ces`;
    else if (/[aeiouáéíóú]$/.test(head)) parts[0] = `${head}s`;
    else parts[0] = `${head}es`;
    return parts.join(' ');
  }

  riskSideDetail(side, hazards, lowGroups) {
    const hazard = hazards.get(side);
    if (!hazard) return null;
    const lows = (lowGroups[side] || []).slice().sort((a, b) => a.d - b.d);
    const nearestLow = lows[0];
    const useWall = !hazard.low && (!nearestLow || hazard.d <= nearestLow.d + 0.05);
    const entries = useWall || !lows.length ? [{ label: hazard.label, d: hazard.d }] : lows;
    const unique = new Map();
    for (const entry of entries) {
      if (!entry.label) continue;
      const prev = unique.get(entry.label);
      if (!prev) unique.set(entry.label, { label: entry.label, count: 1, d: entry.d });
      else prev.count += 1;
    }
    const labels = [...unique.values()].sort((a, b) => a.d - b.d);
    if (!labels.length) labels.push({ label: hazard.label, count: 1, d: hazard.d });
    return { hazard, labels, d: Math.min(hazard.d, ...labels.map((item) => item.d)) };
  }

  riskSideSentence(side, hazards, lowGroups) {
    const detail = this.riskSideDetail(side, hazards, lowGroups);
    if (!detail) return '';
    const visible = detail.labels.slice(0, 3);
    const list = this.joinEs(visible.map((entry) =>
      entry.count > 1
        ? `${numEs(entry.count)} ${this.pluralObstacle(entry.label)}`
        : this.presentObstacle(entry.label)
    ));
    const extra = detail.labels.length > visible.length ? ' y algún objeto más' : '';
    const distance = `, a ${fmtDist(detail.d)}`;
    if (side === 'front') return `Al frente tienes ${list}${extra}${distance}.`;
    const sideWord = side === 'left' ? 'izquierda' : 'derecha';
    if (visible.length === 1 && visible[0].count === 1 && !extra) {
      return `A tu ${sideWord} está ${this.definiteObstacle(visible[0].label)}${distance}.`;
    }
    return `A tu ${sideWord} tienes ${list}${extra}${distance}.`;
  }

  updateRisk(dt, sensor) {
    this.riskTimer += dt;
    if (this.riskTimer < 0.18) return;
    this.riskTimer = 0;
    if (!this.lidarEnabled) return;
    if (this.intro.active) return;
    if (performance.now() < this.riskArmAt) return;
    if (this.lidar.cycles < 1) return;
    // Durante un escaneo o una inspección el usuario está quieto y la voz
    // principal es la de la cámara; no se añaden avisos de proximidad.
    if ((this.scan || this.held) && this.speed < 0.2) return;
    if (this.intentPromptOpen) return;

    const scan = this.lidar.scan;
    const now = performance.now();
    const fwdX = Math.sin(this.player.yaw);
    const fwdZ = Math.cos(this.player.yaw);
    const origin = new THREE.Vector3(this.player.x, 0.55, this.player.z);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    const hazards = new Map();
    const addHazard = (side, d, label, low = false) => {
      if (!isFinite(d) || d > 2.4) return;
      const prev = hazards.get(side);
      if (!prev || d < prev.d) hazards.set(side, { side, d, label: label || 'Obstáculo', low });
    };

    // Obstáculos bajos: la cámara de profundidad los localiza y el ángulo
    // relativo permite agruparlos por lado sin disparar un aviso por paso.
    const lowBySide = {};
    const lowGroups = { front: [], left: [], right: [] };
    for (const obs of this.env.obstacles) {
      if (!obs.low) continue;
      box.setFromObject(obs.mesh);
      if (box.isEmpty()) continue;
      box.getCenter(center);
      const dx = center.x - this.player.x;
      const dz = center.z - this.player.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx * fwdX + dz * fwdZ) / len < 0.2) continue;
      const d = Math.max(0.05, box.distanceToPoint(origin));
      if (d > 2.4) continue;
      const rel = wrapAngle(Math.atan2(dx, dz) - this.player.yaw);
      const side = Math.abs(rel) <= 0.55 ? 'front'
        : rel > 0.55 && rel <= 1.45 ? 'right'
          : rel < -0.55 && rel >= -1.45 ? 'left' : null;
      if (!side) continue;
      const entry = { d, label: obs.label, rel };
      lowGroups[side].push(entry);
      if (!lowBySide[side] || d < lowBySide[side].d) lowBySide[side] = entry;
    }

    if (lowBySide.front) addHazard('front', lowBySide.front.d, lowBySide.front.label, true);
    if (isFinite(scan.front) && scan.front < 2.35) {
      const prev = hazards.get('front');
      if (!prev || scan.front < prev.d - 0.04) addHazard('front', scan.front, scan.frontHit?.label || 'Pared');
    }
    if (lowBySide.left) addHazard('left', lowBySide.left.d, lowBySide.left.label, true);
    if (isFinite(scan.left) && scan.left < 0.72) {
      const prev = hazards.get('left');
      if (!prev || scan.left < prev.d - 0.04) addHazard('left', scan.left, scan.leftHit?.label || 'Pared');
    }
    if (lowBySide.right) addHazard('right', lowBySide.right.d, lowBySide.right.label, true);
    if (isFinite(scan.right) && scan.right < 0.72) {
      const prev = hazards.get('right');
      if (!prev || scan.right < prev.d - 0.04) addHazard('right', scan.right, scan.rightHit?.label || 'Pared');
    }

    const frontD = hazards.get('front')?.d ?? Infinity;
    const nearestD = hazards.size ? Math.min(...[...hazards.values()].map((h) => h.d)) : Infinity;
    let level = 'clear';
    if (frontD < 0.8 || nearestD < 0.55) level = 'critical';
    else if (frontD < 1.45 || nearestD < 0.8) level = 'danger';
    else if (frontD < 2.35 || nearestD < 1.3) level = 'warn';
    this.risk = level;

    const sides = ['front', 'left', 'right'].filter((side) => hazards.has(side));
    const signature = `${level}|${sides.map((side) => hazards.get(side)?.label || '').join('|')}`;
    const tutor = this.tutor;
    const critical = level === 'critical';

    if (level === 'clear') {
      if (tutor.warned && now - tutor.lastAt > 1200 && now - tutor.lastClearAt > 9000) {
        tutor.warned = false;
        tutor.lastClearAt = now;
        tutor.lastAt = now;
        tutor.lastLevel = 'clear';
        tutor.lastSignature = '';
        this.speak('Camino despejado. Puedes continuar con tranquilidad.', { priority: 1, log: true });
      }
      return;
    }

    const leftBlocked = hazards.has('left');
    const rightBlocked = hazards.has('right');
    const leftOpen = Math.min(scan.frontLeft, scan.left);
    const rightOpen = Math.min(scan.frontRight, scan.right);
    let turn = rightOpen >= leftOpen ? 'right' : 'left';
    if (leftBlocked && !rightBlocked) turn = 'right';
    if (rightBlocked && !leftBlocked) turn = 'left';
    const turnWord = turn === 'right' ? 'derecha' : 'izquierda';

    // Describimos los elementos concretos que hay a cada lado; nunca una
    // frase genérica sin nombres ni referencias espaciales concretas.
    const obstacleSentence = sides
      .map((side) => this.riskSideSentence(side, hazards, lowGroups))
      .filter(Boolean)
      .join(' ');

    let recommendation = '';
    const sideOnly = !isFinite(frontD) && sides.length > 0;
    if (frontD < 0.8) {
      recommendation = leftBlocked && rightBlocked
        ? 'Detente un momento y da un paso atrás; hay poco espacio a los lados.'
        : `Detente un momento y da un paso atrás. Después gira ligeramente a la ${turnWord}.`;
    } else if (sideOnly) {
      recommendation = leftBlocked && rightBlocked
        ? 'Reduce el paso y retrocede un poco para dejar espacio.'
        : `Desplázate un poco a la ${turnWord} para dejar espacio.`;
    } else if (leftBlocked && rightBlocked) {
      recommendation = 'Reduce el paso; hay poco espacio a ambos lados.';
    } else {
      recommendation = `Gira ligeramente a la ${turnWord} para seguir avanzando.`;
    }

    let text = `${obstacleSentence} ${recommendation}`.trim();
    if (critical) text = `Vamos con calma. ${text}`;

    const input = this.input;
    let movingToward = false;
    let movingAway = false;
    for (const side of sides) {
      if (side === 'front') {
        if (input.z > 0.1) movingToward = true;
        else if (input.z < -0.1) movingAway = true;
      } else if (side === 'left') {
        if (input.x < -0.1) movingToward = true;
        else if (input.x > 0.1) movingAway = true;
      } else if (side === 'right') {
        if (input.x > 0.1) movingToward = true;
        else if (input.x < -0.1) movingAway = true;
      }
    }

    const changed = level !== tutor.lastLevel;
    const newScenario = signature !== tutor.lastSignature;
    const minGap = critical ? 2400 : changed ? 2600 : 5200;
    const canSpeak = !this.voice.speaking || critical;
    if (!canSpeak) return;
    if (movingAway && !movingToward && !changed) return;

    let shouldSpeak = false;
    if ((newScenario || changed) && now - tutor.lastAt > minGap) shouldSpeak = true;
    else if (movingToward && now - tutor.lastAt > (critical ? 7000 : 15000)) shouldSpeak = true;
    if (!shouldSpeak) return;

    tutor.lastAt = now;
    tutor.lastLevel = level;
    tutor.lastSignature = signature;
    tutor.warned = true;
    const logLevel = level === 'critical' ? 'danger' : level === 'danger' ? 'warn' : 'info';
    this.speak(text, { priority: critical ? 3 : level === 'danger' ? 2 : 1, log: true, level: logLevel });
    if (this.audioEnabled && this.sonarEnabled) {
      this.sonar.ping(isFinite(frontD) ? frontD : nearestD, Math.sin(hazards.get('front')?.rel || 0));
    }
    if (critical && this.sonarEnabled && this.audioEnabled && navigator.vibrate) navigator.vibrate([30, 50, 30]);

    // Pulsos sonoros solo mientras el riesgo sigue activo y hay desplazamiento.
    this.sonarTimer += dt;
    if (this.audioEnabled && this.sonarEnabled && this.speed > 0.15 && (level === 'critical' || level === 'danger') && this.sonarTimer > 1.4) {
      this.sonarTimer = 0;
      this.sonar.ping(isFinite(frontD) ? frontD : nearestD, Math.sin(hazards.get('front')?.rel || 0));
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
      if (this.held) {
        const item = this.held.item;
        answer = `Tienes «${item.title || item.name}» delante de la cámara. ${item.detail || item.voice || ''}`.trim();
      } else if (this.scan?.done && this.scan.items.length) {
        answer = `${this.scan.summary} El escaneo se ha hecho con la cámara en POV.`;
      } else if (!isFinite(scan.front) || scan.front > 4.5) {
        answer = 'Tienes el camino despejado al frente por más de cuatro metros.';
      } else {
        const rel = scan.frontHit
          ? wrapAngle(Math.atan2(scan.frontHit.x - this.player.x, scan.frontHit.z - this.player.z) - this.player.yaw)
          : 0;
        const where = rel > 0.16 ? 'a tu derecha' : rel < -0.16 ? 'a tu izquierda' : 'frente a ti';
        const pass = scan.frontRight > scan.frontLeft + 0.4
          ? 'Hay espacio a la derecha para continuar.'
          : scan.frontLeft > scan.frontRight + 0.4
            ? 'Hay espacio a la izquierda para continuar.'
            : 'Conviene reducir el paso y girar despacio.';
        answer = `Tienes ${this.presentObstacle(scan.frontHit?.label)} ${where}, a ${fmtDist(scan.front)}. ${pass}`;
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
