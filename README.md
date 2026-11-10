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

Este repositorio contiene un **simulador web interactivo** del sistema: una persona usuaria con el arnés recorre una **casa domótica adaptada** (sala, cocina y baño), un corredor institucional o un laberinto; el LiDAR emite pulsos en tiempo real y el panel de telemetría muestra batería, latencia, sectores de riesgo, alertas espaciales y el pipeline Edge AI.

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

- Tres entornos navegables: **Casa** (vivienda adaptada con sala, cocina, pasillo y baño), **Corredor** (pasillo institucional con banco, columnas, estanterías, puertas y señalética) y **Laberinto** (calles con esquinas y pasillos estrechos). Se cambia desde el selector del dock.
- **480 rayos LiDAR** por barrido, alcance de 12 m y visualización de pulsos, puntos de impacto y vectores de mapeo. El origen de medida se calibra en la cara frontal del arnés; las distancias del tutor parten del sensor, no del centro del avatar.
- Sectores de riesgo (frente, izquierda, derecha, frente-izquierda/frente-derecha) calculados a **10 Hz** sobre el barrido. Las paredes paralelas al rumbo se tratan como límites del pasillo, no como bloqueos frontales.
- Detección de **obstáculos bajos** (bancos, bolardos, macetas) con la cámara simulada.
- Sensores de **IMU / SLAM** representados en el radar y en la telemetría.
- El avatar es un humanoide estilizado de proporciones anatómicas (hombros, cintura, cadera, manos y pies), con ropa y bastón; camina, corre y gira con animación procedural y micro-movimientos de respiración y postura. El arnés va ajustado a la altura del pecho y la cámara POV hereda esos micro-movimientos con interpolación suave.

### 3. Casa domótica adaptada

El entorno **Casa** reproduce una vivienda real con paredes, puertas, ventanas y mobiliario modelados a escala. Incluye:

- **Sala**: sofá de dos plazas, mesa de centro, mueble de TV, planta y dos estanterías. La lámpara de pie se ha retirado del recorrido del avatar y ahora vive junto al mueble de TV. La mesa de centro tiene un mando, una revista y dos tazas que se escanean en POV y se pueden acercar con `F`. Al acercarse a una estantería, AURA **no recita de memoria**: invita a pulsar `E` y solo describe lo que la cámara reconoce en ese momento.
- **Cocina**: barra con taburetes y lámparas colgantes, encimera, mesa de desayuno y **nevera interactiva**. Sobre la barra hay un frutero, tres platos, tres vasos y una tabla de picar; todos se reconocen con la cámara POV. La nevera contiene leche, manzanas, agua, queso, jugo de naranja y mantequilla. Con `E` se abre la puerta, se enciende la luz interior y comienza un barrido en primera persona. El resumen agrupa cantidades (*«Con la cámara veo tres manzanas, tres productos lácteos y dos bebidas»*); `1`–`6` seleccionan un producto y `F` lo acerca al arnés para leer su ficha.
- **Mesa de desayuno**: libro de recetas, dos tazas y un frutero con tres manzanas. También se escanea en POV y sus objetos se pueden acercar con `F`.
- **Diálogo de intenciones**: tras el primer gesto de la persona usuaria, AURA pregunta de forma proactiva *«¿Qué te gustaría hacer? ¿Quieres ir al baño, a la cocina o tomar algo en la nevera?»* y muestra cuatro opciones táctiles. El plan elige una ruta con puntos de referencia, indica la dirección y la distancia del primer tramo, avisa al llegar y deja un objetivo visible en la etiqueta de zona. Se puede reabrir con `I`.
- **Escaneo activo POV**: al interactuar con estanterías, nevera o mesa, la cámara pasa a primera persona y hace un barrido vertical con un paneo horizontal suave antes de responder. Solo entran en el resumen los objetos que han pasado por el frustum y no estaban ocultos; las cantidades se agrupan por categorías para no saturar: *«Con la cámara veo seis libros, tres objetos decorativos, dos aparatos electrónicos y una cesta de mimbre»*.
- **Acercar objetos**: con `F` (o tocando la acción «Acercar») el objeto sale de la estantería, la nevera o la mesa, se coloca sobre un fondo de inspección oscuro delante de la cámara y AURA lee su título y descripción detallada. `F`, `E` o `Esc` lo devuelven a su sitio.
- **Pasillos y accesos**: el vano sala-cocina, la puerta del baño y la entrada principal tienen **1,8 m** de luz; el resto de circulaciones mantiene al menos 1,8 m para que el avatar y el arnés pasen sin rozar.
- **Sentarse**: junto al sofá, `S` sienta al avatar; la cámara pasa a la altura de los ojos sentado, el arnés y la caja AURA bajan con el cuerpo, las piernas se flexionan y el LiDAR sigue activo. `S`, `E` o `Esc` vuelven a poner de pie.
- Colisiones AABB precisas para paredes, puertas y mobiliario; los objetos bajos también alimentan la detección de riesgos de la cámara.

### 4. Interfaz de voz local (Edge AI)

- **Tutor de movilidad sin fatiga auditiva**: nada de «¡Alto!» ni un aviso por cada paso. El tutor solo considera el corredor real de marcha: un objeto junto al costado no genera alarma si la persona puede pasar sin tocarlo, y los objetos a más de 1,30 m no se anuncian como si fueran una colisión inminente. Cuando el rumbo sí está comprometido, nombra el elemento concreto —*«Al frente tienes una mesa de centro, a 48 centímetros. Reduce el paso y corrige el rumbo; el paso está bloqueado.»*— y propone un giro.
- **Silencio inteligente**: un mismo escenario no se repite mientras el usuario avanza en una dirección segura; solo se vuelve a hablar si cambia el riesgo, si el usuario sigue acercándose tras un espacio de 7 s en riesgo crítico o 15 s en riesgo moderado, o si el camino queda despejado (un único mensaje de confirmación, con 9 s de margen). El diálogo de intenciones no interrumpe un aviso de riesgo y se pospone mientras AURA está hablando.
- Durante un escaneo o una inspección con el objeto acercado, el tutor baja la voz y deja el protagonismo al reconocimiento de la cámara.
- Subtítulos sincronizados en el panel **Voz local**. La voz no se solapa: mantiene hasta ocho frases pendientes, elimina duplicados y las ordena por prioridad (FIFO si empatan). Una frase más prioritaria puede interrumpir una locución informativa; la prioridad crítica interrumpe cualquier locución y las frases que no interrumpen esperan su turno.
- Sonar de proximidad opcional (Web Audio) para una pista no verbal de cercanía.
- La demo sintetiza la voz en el propio navegador (Web Speech API, es-ES) y simula el pipeline **Whisper tiny + Piper TTS (davefx)** del Raspberry Pi 5. No hay peticiones de audio a servidores.
- Preguntas rápidas («¿Qué hay delante?», «¿Por dónde salgo?», «Describe el entorno») y micrófono si el navegador expone reconocimiento de voz.

### 5. Telemetría y control

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
| Caminar | `W` `A` `S` `D` |
| Girar el torso y la cámara | `←` `→` (mantener) |
| Inclinar la cámara | `↑` `↓` (mantener) |
| Correr | `Shift` (mantener) |
| Cambiar 3ª persona / POV | `Space` |
| Encender/apagar LiDAR | `L` |
| Activar/desactivar voz | `V` |
| Reiniciar posición | `R` |
| Mostrar/ocultar paneles | `M` |
| Escanear con la cámara POV (nevera, estantería, mesa) | `E` |
| Acercar / devolver el objeto escaneado | `F` |
| Sentarse / levantarse del sofá | `S` (junto al sofá) |
| Elegir producto de la nevera | `1` `2` `3` `4` `5` `6` |
| Abrir el plan de intenciones | `I` |
| Cambiar de entorno | Botones **Casa / Corredor / Laberinto** del dock |
| Cerrar fichas, tarjetas, plan y paneles | `Esc` |
| Mirar alrededor | Arrastrar con el ratón |
| Zoom | Rueda del ratón |
| Inspeccionar el dispositivo | Pestaña **Modelo 3D** → arrastrar y pulsar los puntos |

### Móvil

- D-pad en la barra inferior para caminar.
- Botones de cámara (3ª persona / POV AURA), entorno (Casa / Corredor / Laberinto), recorrido automático y reinicio.
- La tarjeta contextual ofrece «Escanear con la cámara» y «Acercar …» como botones táctiles; no hace falta teclado.
- La tarjeta de intenciones permite elegir baño, cocina, nevera o seguir explorando; el objetivo y su distancia quedan visibles junto a la zona.
- Botones de telemetría y voz en la barra superior.
- Arrastrar sobre la escena para mirar; las flechas del teclado giran el torso y la cámara de forma gradual sin ratón.
- El D-pad de la barra inferior sigue siendo la locomoción táctil; las flechas físicas no desplazan al avatar.

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
│   ├── home.js                # Casa: sala, cocina, baño, estanterías, nevera y sofá
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
- **Contenido de la Casa** generado en código: muebles, productos de la nevera y objetos de las estanterías. Títulos y descripciones detalladas se leen con la misma cola de voz local solo después de que la cámara POV los haya visto.

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
- Interacciones anunciadas en voz y en la tarjeta contextual, no solo visualmente; botones de producto con etiqueta y atajo de teclado.

## Créditos

Prototipo y documentos de referencia: **AURA · Asistencia visual**. Modelo 3D, escenas y simulación construidos con Three.js. Voces en español: Web Speech API (demo) y referencia Piper `es_ES` (arquitectura propuesta).
