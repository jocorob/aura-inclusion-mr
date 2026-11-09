<div align="center">

# AURA · Simulador de asistencia visual en realidad mixta

**Arnés inteligente con LiDAR ToF, cámara frontal y procesamiento Edge AI en Raspberry Pi 5.**
Simulación interactiva en el navegador con Three.js y WebXR.

[**Abrir el simulador →**](https://jocorob.github.io/aura-inclusion-mr/)

</div>

---

## Qué es AURA

AURA es un prototipo de asistencia visual para personas ciegas o con baja visión. El dispositivo se lleva en el pecho mediante un arnés y combina:

- **LiDAR ToF RPLIDAR C1** en la parte superior de la caja (5 000 pts/s, 12 m, 10 Hz) para medir distancias y mapear el entorno.
- **Cámara frontal** de 1080p / 30 fps con HDR para detección de obstáculos bajos y lectura de contexto.
- **IMU de 9 ejes** para estabilización y fusión sensorial.
- **Raspberry Pi 5** como núcleo de cómputo local: SLAM ligero, evaluación de riesgos y voz sintetizada **sin enviar datos a la nube**.

Este repositorio contiene un **simulador web interactivo** del sistema: una persona usuaria con el arnés recorre un entorno urbano simulado, el LiDAR emite pulsos en tiempo real y el panel de telemetría muestra batería, latencia, sectores de riesgo, alertas espaciales y el pipeline Edge AI.

<div align="center">
  <img src="./aura%20prototipo%20foto%20realista.jpeg" alt="Prototipo AURA" width="45%">
  &nbsp;
  <img src="./aura%20prototipo%20foto%20realista%20con%20persona%20invidente.jpeg" alt="AURA usado por una persona invidente" width="45%">
  <br>
  <sub>Prototipo físico de referencia y montaje real sobre el usuario.</sub>
</div>

## Demo

**https://jocorob.github.io/aura-inclusion-mr/**

Se despliega automáticamente en GitHub Pages con cada push a `main` (ver [Despliegue](#despliegue-automático)).

> Para realidad virtual/aumentada se necesita un navegador compatible con WebXR (Chrome/Edge en Android, Quest Browser, etc.) y conexión HTTPS. La simulación 3D funciona en cualquier navegador moderno con WebGL 2.

## Funcionalidades

### 1. Modelo 3D detallado del dispositivo

| Componente | Detalle en el simulador |
|---|---|
| Arnés de pecho | Correas con hebillas, cinta reflectante y etiqueta textil AURA |
| Caja AURA | Cuerpo navy `#2b3a55` con marco rojo, logotipo AURA, pantalla y LED de estado |
| Cámara frontal | Módulo con lente, aro metálico y montura sobre la caja |
| LiDAR ToF | Tambor RPLIDAR C1 giratorio con ventana óptica, anillo LED y etiqueta |
| Usuario | Persona con gafas oscuras, ojos cerrados, bastón blanco con banda roja y ropa de calle |

En la pestaña **Modelo 3D** se puede orbitar, hacer zoom y pulsar los puntos de anotación para ver la ficha técnica de cada componente.

### 2. Simulación sensorial en tiempo real

- Dos entornos navegables: **Corredor** (pasillo institucional con banco, columnas, estanterías, puertas y señalética) y **Laberinto** (calles con esquinas y pasillos estrechos).
- **480 rayos LiDAR** por barrido, alcance de 12 m y visualización de pulsos, puntos de impacto y vectores de mapeo.
- Sectores de riesgo (frente, izquierda, derecha, frente-izquierda/frente-derecha) calculados a **10 Hz** sobre el barrido.
- Detección de **obstáculos bajos** (bancos, bolardos, macetas) con la cámara simulada.
- Sensores de **IMU / SLAM** representados en el radar y en la telemetría.
- El avatar camina, corre y gira con animación procedural de piernas, brazos y bastón.

### 3. Interfaz de voz local (Edge AI)

- Alertas en español natural con distancia, lado y recomendación de paso: *«Pared al frente a 1,2 metros. Paso libre a la derecha.»*, *«¡Alto! Obstáculo a tu izquierda a 40 centímetros.»*.
- Subtítulos sincronizados en el panel **Voz local**, cola de mensajes con prioridad y repetición controlada para no saturar.
- Sonar de proximidad opcional (Web Audio) para una pista no verbal de cercanía.
- La demo sintetiza la voz en el propio navegador (Web Speech API, es-ES) y simula el pipeline **Whisper tiny + Piper TTS (davefx)** del Raspberry Pi 5. No hay peticiones de audio a servidores.
- Preguntas rápidas («¿Qué hay delante?», «¿Por dónde salgo?», «Describe el entorno») y micrófono si el navegador expone reconocimiento de voz.

### 4. Telemetría y control

- Batería, autonomía estimada, consumo, voltaje y estado de carga.
- **Latencia local**, carga de CPU, temperatura y FPS.
- Radar LiDAR de 360° con sectores de riesgo y traza del barrido.
- Registro de alertas con hora.
- Pipeline Edge AI con estado de cada etapa y contador **0 B de datos enviados a la nube**.
- Paneles ocultables, avisos y diseño responsive (escritorio, tablet y móvil).

## Cómo usar el simulador

### Escritorio

| Acción | Control |
|---|---|
| Caminar | `W` `A` `S` `D` o flechas |
| Correr | `Shift` (mantener) |
| Cambiar 3ª persona / POV | `Space` |
| Encender/apagar LiDAR | `L` |
| Activar/desactivar voz | `V` |
| Reiniciar posición | `R` |
| Mostrar/ocultar paneles | `M` |
| Cerrar fichas y paneles | `Esc` |
| Mirar alrededor | Arrastrar con el ratón |
| Zoom | Rueda del ratón |
| Inspeccionar el dispositivo | Pestaña **Modelo 3D** → arrastrar y pulsar los puntos |

### Móvil

- D-pad en la barra inferior para caminar.
- Botones de cámara (3ª persona / POV AURA), entorno (Corredor / Laberinto), recorrido automático y reinicio.
- Botones de telemetría y voz en la barra superior.
- Arrastrar sobre la escena para mirar.

### Realidad extendida (WebXR)

- **VR**: sesión inmersiva con la escena a escala real y el LiDAR en el espacio virtual.
- **AR**: el dispositivo se muestra flotando frente a la cámara del teléfono, con dom-overlay para conservar la interfaz.
- Los botones VR/AR solo aparecen si `navigator.xr` y el visor/navegador lo permiten.

## Arquitectura

```text
.
├── index.html                 # Shell de la interfaz (paneles, dock, overlay XR)
├── src/
│   ├── main.js                # App: render, cámara, entrada, riesgo, XR, modo modelo
│   ├── device.js              # Avatar + arnés + caja + cámara + LiDAR (Three.js)
│   ├── environment.js         # Corredor y laberinto: geometría, colisiones, obstáculos
│   ├── lidar.js               # Barrido de 480 rayos, puntos, sectores y etiquetas
│   ├── voice.js               # Cola de voz, subtítulos y sonar
│   ├── telemetry.js           # Batería, latencia, CPU, FPS y pipeline
│   ├── hud.js                 # Radar, registro, anotaciones y fichas
│   ├── studio.js              # Set de exhibición del modelo 3D
│   ├── style.css              # Sistema de diseño (rojo AURA / cian sensor)
│   └── utils.js               # Texturas, geometrías y utilidades
├── .github/workflows/deploy.yml  # Build + deploy automático a GitHub Pages
└── vite.config.js
```

- **Three.js r187** para el render PBR, sombras, bloom y post-proceso.
- **Vite 8** para desarrollo y build estático.
- **WebXR API** para sesiones inmersivas VR/AR.
- **Web Audio API** para el sonar y **Web Speech API** para la voz en español.
- Geometría y texturas generadas en canvas: no se descargan modelos ni imágenes externas.

## Desarrollo local

Requisitos: Node.js 22+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
npm run preview  # sirve el build
```

El servidor de desarrollo escucha en `0.0.0.0` para poder abrirse desde otros dispositivos de la red.

## Despliegue automático

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) se ejecuta en cada push a `main` y también manualmente desde **Actions → Deploy AURA Simulator to GitHub Pages → Run workflow**:

1. `npm ci` y `npm run build`.
2. `actions/configure-pages` prepara Pages.
3. `actions/upload-pages-artifact` publica `dist/`.
4. `actions/deploy-pages` publica en el entorno `github-pages`.

**Requisito único en el repositorio:** en **Settings → Pages**, la fuente debe ser **GitHub Actions**. El workflow intenta habilitarla automáticamente (`enablement: true`); si el token no tiene permisos de administración, basta con seleccionar esa opción una vez.

URL publicada: **https://jocorob.github.io/aura-inclusion-mr/**

## Privacidad por diseño

AURA procesa audio, vídeo y escaneo LiDAR **dentro del dispositivo**. El simulador muestra explícitamente `0 B` de datos enviados a la nube y ninguna llamada de red para la voz o los sensores. Los números de latencia, consumo y pipeline son una representación de la arquitectura Edge; no se envía telemetría real.

## Accesibilidad

- Contraste alto y tipografía monoespaciada para datos críticos.
- Estados de riesgo codificados por color **y** texto (no solo color).
- Controles de teclado completos, foco visible, etiquetas ARIA y `aria-live` para las alertas.
- Botones táctiles grandes y diseño responsive.
- Modo de movimiento reducido respetado por CSS (`prefers-reduced-motion`).

## Créditos

Prototipo y documentos de referencia: **AURA · Asistencia visual**. Modelo 3D, escenas y simulación construidos con Three.js. Voces en español: Web Speech API (demo) y referencia Piper `es_ES` (arquitectura propuesta).
