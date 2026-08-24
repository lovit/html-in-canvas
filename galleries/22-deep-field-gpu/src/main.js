// 22. 딥필드를 GPU 로.
//
// 21번과 같은 하늘을 WebGL2 로 그린다. 데이터는 같은 _shared/starfield.js 에서 나오고,
// 조작과 측정 패널도 같다. 다른 것은 그리는 경로뿐이다.
//
//   점  : 색·밝기별로 묶어 arc + fill  →  정점 버퍼 하나에 담아 gl.POINTS 한 번
//   카드: ctx.drawElementImage()       →  gl.texElementImage2D() 로 텍스처에 올려 쿼드에 붙임
//
// 그래서 하나가 없어진다. 반환 행렬이다. 2D 에서는 drawElementImage() 가 돌려주는 행렬을
// 그대로 style.transform 에 되먹였는데, WebGL 경로에는 돌려주는 것이 없다.
// 카드는 평면에 놓이므로 아핀이고, 그래서 행렬을 손으로 적을 수 있다. 17번에서 그은
// 경계("아핀까지만 맞출 수 있다")의 뒷면이다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';
import { buildProgram, createElementTexture } from '../../_shared/webgl.js';
import { starsInView, describeStar } from '../../_shared/starfield.js';

const WORLD_PX = 900;
const POOL_SIZE = 18;
const MIN_RADIUS_PX = 0.2;

/** 별 하나가 버퍼에서 차지하는 실수 개수: x, y, 반지름, 색 번호, 밝기. */
const STRIDE = 5;

const TONES = ['#a5b4fc', '#e0e7ff', '#fde68a', '#fdba74', '#fca5a5'];

const BOX = {
  chip: { width: 132, height: 40 },
  card: { width: 176, height: 132 },
};

const SKY_VERTEX = `#version 300 es
void main() {
  vec2 points[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  gl_Position = vec4(points[gl_VertexID], 0.0, 1.0);
}`;

const SKY_FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 viewport;
uniform vec3 camera; // x, y, 배율 × WORLD_PX

out vec4 color;

/** 성운 한 덩이. 세계 좌표에 박혀 있어서 확대하면 함께 커진다. */
vec3 cloud(vec2 world, vec2 center, float radius, vec3 tint) {
  float distance = length(world - center) / radius;
  float falloff = max(0.0, 1.0 - distance);
  return tint * falloff * falloff * falloff;
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x, viewport.y - gl_FragCoord.y);
  vec2 world = (screen - viewport * 0.5) / camera.z + camera.xy;

  vec3 rgb = vec3(0.012, 0.024, 0.06);
  rgb += cloud(world, vec2(0.32, 0.38), 0.22, vec3(0.10, 0.15, 0.33));
  rgb += cloud(world, vec2(0.63, 0.58), 0.26, vec3(0.16, 0.08, 0.26));
  rgb += cloud(world, vec2(0.50, 0.50), 0.50, vec3(0.02, 0.11, 0.14));

  color = vec4(rgb, 1.0);
}`;

const STAR_VERTEX = `#version 300 es
in vec2 position;   // 세계 좌표
in float radius;    // 화면 픽셀 반지름
in float tone;      // 색 번호
in float brightness;

uniform vec2 viewport;
uniform vec3 camera;
uniform vec3 palette[5];

out vec3 starColor;
out float starRadius;
out float starAlpha;
out float pointSize;

void main() {
  vec2 screen = (position - camera.xy) * camera.z + viewport * 0.5;
  vec2 clip = vec2(screen.x / viewport.x * 2.0 - 1.0, 1.0 - screen.y / viewport.y * 2.0);

  gl_Position = vec4(clip, 0.0, 1.0);

  // 후광까지 담을 만큼 넉넉하게 잡는다. 실제 별의 크기는 프래그먼트가 정한다.
  pointSize = clamp(radius * 7.0, 3.0, 48.0);
  gl_PointSize = pointSize;

  starColor = palette[int(tone)];
  starRadius = radius;
  starAlpha = brightness;
}`;

const STAR_FRAGMENT = `#version 300 es
precision highp float;

in vec3 starColor;
in float starRadius;
in float starAlpha;
in float pointSize;

out vec4 color;

void main() {
  float distance = length(gl_PointCoord - vec2(0.5)) * pointSize;

  // 알맹이와 후광. 21번이 두 번 그려 만든 것을 여기서는 한 번에 만든다.
  float core = 1.0 - smoothstep(starRadius - 0.5, starRadius + 0.5, distance);
  float halo = exp(-distance / max(1.0, starRadius * 1.8)) * 0.3 * step(1.5, starRadius);

  float alpha = clamp(core + halo, 0.0, 1.0) * starAlpha;
  if (alpha < 0.01) discard;

  color = vec4(starColor * alpha, alpha);
}`;

const CARD_VERTEX = `#version 300 es
in vec2 corner; // 0~1 사각형

uniform vec2 viewport;
uniform vec4 rect; // x, y, 너비, 높이 (화면 픽셀)

out vec2 uv;

void main() {
  vec2 screen = rect.xy + corner * rect.zw;
  vec2 clip = vec2(screen.x / viewport.x * 2.0 - 1.0, 1.0 - screen.y / viewport.y * 2.0);

  uv = corner;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const CARD_FRAGMENT = `#version 300 es
precision highp float;

in vec2 uv;
uniform sampler2D card;
out vec4 color;

void main() {
  vec4 texel = texture(card, uv);
  color = vec4(texel.rgb * texel.a, texel.a);
}`;

const stage = document.querySelector('#stage');
const zoomInput = document.querySelector('#zoom');
const windowInput = document.querySelector('#window');
const densityInput = document.querySelector('#density');
const chipsToggle = document.querySelector('#show-chips');
const cardsToggle = document.querySelector('#show-cards');
const metrics = {
  zoom: document.querySelector('#m-zoom'),
  depth: document.querySelector('#m-depth'),
  stars: document.querySelector('#m-stars'),
  fresh: document.querySelector('#m-new'),
  pool: document.querySelector('#m-pool'),
  uploads: document.querySelector('#m-uploads'),
  frame: document.querySelector('#m-frame'),
};

const camera = { x: 0.5, y: 0.5, zoom: 1 };
const cells = new Map();
const pool = [];
const assigned = new Map();

let gl = null;
let programs = null;
let starBuffer = null;
let starData = new Float32Array(STRIDE * 4096);
let starCount = 0;
let deepestCount = 0;

let selected = null;
let visible = [];
let maxDepth = 0;
let drawMs = 0;
let fps = 0;
let frames = 0;
let fpsSince = performance.now();
let uploads = 0;

/** 카메라와 깊이가 그대로면 별을 다시 모으지 않는다. 21번과 같은 규칙이다. */
let lastView = '';

if (ensureSupport({ webgl: true })) {
  start();
}

function start() {
  gl = stage.getContext('webgl2');
  programs = buildPrograms();
  buildPool();

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // 미리 곱해 둔 알파

  stage.layoutSubtree = true;

  // 텍스처에 올리는 일만 paint 안에서 한다. 07·11 과 같은 규칙이다.
  stage.addEventListener(
    'paint',
    guardPaint((event) => {
      const changed = new Set(event.changedElements ?? []);
      for (const slot of pool) {
        if (!slot.star) continue;
        if (slot.uploaded && changed.size > 0 && !changed.has(slot.element)) continue;
        uploadCard(slot);
      }
    }),
  );
  stage.requestPaint();

  wireCamera();
  wireControls();
  requestAnimationFrame(tick);
}

function buildPrograms() {
  const sky = buildProgram(gl, SKY_VERTEX, SKY_FRAGMENT);
  const stars = buildProgram(gl, STAR_VERTEX, STAR_FRAGMENT);
  const cards = buildProgram(gl, CARD_VERTEX, CARD_FRAGMENT);

  starBuffer = gl.createBuffer();

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

  return {
    sky: {
      program: sky,
      viewport: gl.getUniformLocation(sky, 'viewport'),
      camera: gl.getUniformLocation(sky, 'camera'),
    },
    stars: {
      program: stars,
      viewport: gl.getUniformLocation(stars, 'viewport'),
      camera: gl.getUniformLocation(stars, 'camera'),
      palette: gl.getUniformLocation(stars, 'palette'),
      position: gl.getAttribLocation(stars, 'position'),
      radius: gl.getAttribLocation(stars, 'radius'),
      tone: gl.getAttribLocation(stars, 'tone'),
      brightness: gl.getAttribLocation(stars, 'brightness'),
    },
    cards: {
      program: cards,
      quad,
      viewport: gl.getUniformLocation(cards, 'viewport'),
      rect: gl.getUniformLocation(cards, 'rect'),
      corner: gl.getAttribLocation(cards, 'corner'),
    },
  };
}

function buildPool() {
  for (let index = 0; index < POOL_SIZE; index += 1) {
    const element = document.createElement('div');
    element.className = 'label chip';
    element.innerHTML = `
      <b class="name"></b>
      <span class="kind"></span>
      <dl class="detail">
        <dt>거리</dt><dd class="distance"></dd>
        <dt>질량</dt><dd class="mass"></dd>
        <dt>깊이</dt><dd class="depth"></dd>
      </dl>
      <label class="logged"><input type="checkbox" /> 관측 기록</label>`;
    stage.append(element);
    pool.push({
      element,
      star: null,
      mode: 'chip',
      spot: null,
      texture: createElementTexture(gl),
      uploaded: false,
    });
  }
}

/* 한 프레임 --------------------------------------------------------------- */

function tick() {
  maxDepth = depthForZoom();

  const view = `${camera.x.toFixed(7)}:${camera.y.toFixed(7)}:${camera.zoom.toFixed(4)}:${maxDepth}:${density()}`;
  if (view !== lastView) {
    visible = starsInView(viewBounds(), maxDepth, cells, density());
    if (cells.size > 6000) cells.clear();
    lastView = view;
  }

  assignPool();

  const started = performance.now();
  packStars();
  render();
  drawMs = drawMs * 0.9 + (performance.now() - started) * 0.1;

  countFrame();
  report();
  requestAnimationFrame(tick);
}

/** 초당 프레임. 21번과 같은 방법으로 잰다. */
function countFrame() {
  frames += 1;
  const now = performance.now();
  if (now - fpsSince >= 500) {
    fps = Math.round((frames / (now - fpsSince)) * 1000);
    frames = 0;
    fpsSince = now;
  }
}

function depthForZoom() {
  const base = Math.floor(Math.log2(camera.zoom));
  return Math.min(22, Math.max(0, base + Number(windowInput.value)));
}

/** 칸마다 별을 몇 배로 낼지. 그리는 경로를 비교하려고 둔 손잡이다. */
function density() {
  return [1, 4, 16][Number(densityInput.value)];
}

function viewBounds() {
  const scale = camera.zoom * WORLD_PX;
  return {
    left: camera.x - stage.width / 2 / scale,
    right: camera.x + stage.width / 2 / scale,
    top: camera.y - stage.height / 2 / scale,
    bottom: camera.y + stage.height / 2 / scale,
  };
}

/** 보이는 별을 정점 버퍼 모양으로 담는다. 21번의 색·밝기 묶기가 여기서는 필요 없다. */
function packStars() {
  if (starData.length < visible.length * STRIDE) {
    starData = new Float32Array(visible.length * STRIDE * 2);
  }

  starCount = 0;
  deepestCount = 0;

  for (const star of visible) {
    const size = screenRadius(star);
    if (size < MIN_RADIUS_PX) continue;

    const offset = starCount * STRIDE;
    starData[offset] = star.x;
    starData[offset + 1] = star.y;
    starData[offset + 2] = Math.min(6, Math.max(0.45, size));
    starData[offset + 3] = TONES.indexOf(star.tone.color);
    starData[offset + 4] = size >= 1.2 ? 1 : size >= 0.6 ? 0.55 : 0.3;

    starCount += 1;
    if (star.depth === maxDepth) deepestCount += 1;
  }
}

function render() {
  gl.viewport(0, 0, stage.width, stage.height);

  const viewport = [stage.width, stage.height];
  const view = [camera.x, camera.y, camera.zoom * WORLD_PX];

  gl.useProgram(programs.sky.program);
  gl.uniform2fv(programs.sky.viewport, viewport);
  gl.uniform3fv(programs.sky.camera, view);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  drawStars(viewport, view);
  drawCards(viewport);
}

function drawStars(viewport, view) {
  const stars = programs.stars;
  gl.useProgram(stars.program);
  gl.uniform2fv(stars.viewport, viewport);
  gl.uniform3fv(stars.camera, view);
  gl.uniform3fv(stars.palette, PALETTE);

  gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, starData.subarray(0, starCount * STRIDE), gl.DYNAMIC_DRAW);

  const bytes = STRIDE * 4;
  gl.enableVertexAttribArray(stars.position);
  gl.vertexAttribPointer(stars.position, 2, gl.FLOAT, false, bytes, 0);
  gl.enableVertexAttribArray(stars.radius);
  gl.vertexAttribPointer(stars.radius, 1, gl.FLOAT, false, bytes, 8);
  gl.enableVertexAttribArray(stars.tone);
  gl.vertexAttribPointer(stars.tone, 1, gl.FLOAT, false, bytes, 12);
  gl.enableVertexAttribArray(stars.brightness);
  gl.vertexAttribPointer(stars.brightness, 1, gl.FLOAT, false, bytes, 16);

  gl.drawArrays(gl.POINTS, 0, starCount);
}

/** 카드는 텍스처를 붙인 쿼드다. 자리는 tick 에서 이미 정해 두었다. */
function drawCards(viewport) {
  const cards = programs.cards;
  gl.useProgram(cards.program);
  gl.uniform2fv(cards.viewport, viewport);

  gl.bindBuffer(gl.ARRAY_BUFFER, cards.quad);
  gl.enableVertexAttribArray(cards.corner);
  gl.vertexAttribPointer(cards.corner, 2, gl.FLOAT, false, 0, 0);

  for (const slot of pool) {
    if (!slot.star || !slot.spot || !slot.uploaded) continue;
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.uniform4f(cards.rect, slot.spot.x, slot.spot.y, slot.spot.width, slot.spot.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** paint 안에서만 불린다. 07·11 과 같은 제약이다. */
function uploadCard(slot) {
  const size = BOX[slot.mode];
  gl.bindTexture(gl.TEXTURE_2D, slot.texture);
  gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, slot.element, {
    width: size.width * 2,
    height: size.height * 2,
  });
  slot.uploaded = true;
  uploads += 1;
}

const PALETTE = new Float32Array(
  TONES.flatMap((hex) => [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]),
);

/* 요소 풀 ------------------------------------------------------------------ */

function pickLabelled() {
  const wantCards = cardsToggle.checked && camera.zoom >= 48;
  const chipCount = chipsToggle.checked ? (camera.zoom < 6 ? 6 : wantCards ? 7 : 12) : 0;
  const cardCount = wantCards ? 5 : 0;
  const limit = Math.min(POOL_SIZE, chipCount + cardCount);

  const brightest = [...visible].sort((a, b) => b.radius - a.radius);
  const chosen = [];
  const taken = [];

  const place = (star, mode) => {
    const size = BOX[mode];
    const point = toScreen(star);
    const spot = {
      x: Math.round(point.x + 14),
      y: Math.round(point.y - size.height / 2),
      width: size.width,
      height: size.height,
    };

    if (spot.x + spot.width > stage.width - 6 || spot.x < 6) return null;
    if (spot.y + spot.height > stage.height - 6 || spot.y < 6) return null;
    if (taken.some((other) => overlaps(other, spot))) return null;

    taken.push(spot);
    return { star, mode, spot, anchor: point };
  };

  if (selected) {
    const entry = place(selected, 'card');
    if (entry) chosen.push(entry);
  }

  for (const star of brightest) {
    if (chosen.length >= limit) break;
    if (star === selected) continue;
    if (screenRadius(star) < 1) continue;
    const entry = place(star, chosen.length < cardCount ? 'card' : 'chip');
    if (entry) chosen.push(entry);
  }
  return chosen;
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.width + 4 &&
    b.x < a.x + a.width + 4 &&
    a.y < b.y + b.height + 4 &&
    b.y < a.y + a.height + 4
  );
}

function assignPool() {
  const wanted = pickLabelled().slice(0, POOL_SIZE);
  const keep = new Set();

  for (const entry of wanted) {
    const slot = assigned.get(entry.star.id);
    if (slot) {
      keep.add(slot);
      slot.spot = entry.spot;
      slot.anchor = entry.anchor;
      if (slot.mode !== entry.mode) fill(slot, entry.star, entry.mode);
      sync(slot);
    }
  }

  const free = pool.filter((slot) => !keep.has(slot));
  for (const entry of wanted) {
    if (assigned.has(entry.star.id)) continue;
    const slot = free.pop();
    if (!slot) break;
    if (slot.star) assigned.delete(slot.star.id);
    fill(slot, entry.star, entry.mode);
    slot.spot = entry.spot;
    slot.anchor = entry.anchor;
    assigned.set(entry.star.id, slot);
    keep.add(slot);
    sync(slot);
  }

  for (const slot of pool) {
    if (keep.has(slot)) continue;
    if (slot.star) assigned.delete(slot.star.id);
    slot.star = null;
    slot.spot = null;
    slot.element.style.transform = 'none';
    slot.element.style.pointerEvents = 'none';
  }
}

/**
 * 카드가 그려질 자리를 요소에도 알려 준다.
 *
 * 2D 경로에서는 drawElementImage() 가 행렬을 돌려줬다. 여기서는 돌려주는 것이 없으니
 * 직접 적는다. 카드는 평면에 그대로 붙이므로 이동만 있는 아핀이다.
 * transform-origin: 0 0 이 있어야 이 값이 그대로 먹는다 (17 참고).
 */
function sync(slot) {
  slot.element.style.transform = `matrix(1, 0, 0, 1, ${slot.spot.x}, ${slot.spot.y})`;
  slot.element.style.pointerEvents = 'auto';
}

function fill(slot, star, mode) {
  const info = describeStar(star);
  const element = slot.element;

  element.className = `label ${mode}`;
  element.querySelector('.name').textContent = info.name;
  element.querySelector('.kind').textContent = `${info.kind} · ${info.color}`;
  element.querySelector('.distance').textContent = info.distance;
  element.querySelector('.mass').textContent = info.mass;
  element.querySelector('.depth').textContent = `${info.depth}층`;
  element.style.setProperty('--tone', star.tone.color);

  slot.star = star;
  slot.mode = mode;
  // 내용이 바뀌었으니 텍스처를 다시 올려야 한다. 다음 paint 에서 올라간다.
  slot.uploaded = false;
  stage.requestPaint();
}

/* 좌표와 조작 --------------------------------------------------------------- */

function toScreen(point) {
  const scale = camera.zoom * WORLD_PX;
  return {
    x: (point.x - camera.x) * scale + stage.width / 2,
    y: (point.y - camera.y) * scale + stage.height / 2,
  };
}

function fromScreen(point) {
  const scale = camera.zoom * WORLD_PX;
  return {
    x: (point.x - stage.width / 2) / scale + camera.x,
    y: (point.y - stage.height / 2) / scale + camera.y,
  };
}

function screenRadius(star) {
  return star.radius * camera.zoom * WORLD_PX;
}

function setZoom(zoom, anchor) {
  const next = Math.min(4096, Math.max(1, zoom));
  if (anchor) {
    const before = fromScreen(anchor);
    camera.zoom = next;
    const after = fromScreen(anchor);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
  } else {
    camera.zoom = next;
  }
  zoomInput.value = String(Math.round(Math.log2(camera.zoom) * 10));
  showOutputs();
}

function canvasPoint(event) {
  const box = stage.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * stage.width,
    y: ((event.clientY - box.top) / box.height) * stage.height,
  };
}

function wireCamera() {
  let dragging = null;
  let moved = 0;

  stage.addEventListener('pointerdown', (event) => {
    // 카드에서 올라온 이벤트는 카드가 쓸 일이다. 21번에서 배운 것.
    if (event.target !== stage) return;
    dragging = canvasPoint(event);
    moved = 0;
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const now = canvasPoint(event);
    const scale = camera.zoom * WORLD_PX;
    camera.x -= (now.x - dragging.x) / scale;
    camera.y -= (now.y - dragging.y) / scale;
    moved += Math.abs(now.x - dragging.x) + Math.abs(now.y - dragging.y);
    dragging = now;
  });

  stage.addEventListener('pointerup', (event) => {
    if (dragging && moved < 4) selectNear(canvasPoint(event));
    dragging = null;
  });
  stage.addEventListener('pointercancel', () => {
    dragging = null;
  });

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      setZoom(camera.zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18), canvasPoint(event));
    },
    { passive: false },
  );
}

function selectNear(point) {
  let best = null;
  let bestDistance = 26;

  for (const star of visible) {
    const screen = toScreen(star);
    const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
    if (distance < bestDistance) {
      best = star;
      bestDistance = distance;
    }
  }
  selected = best;
}

function wireControls() {
  zoomInput.addEventListener('input', () => setZoom(2 ** (Number(zoomInput.value) / 10)));
  windowInput.addEventListener('input', showOutputs);
  densityInput.addEventListener('input', showOutputs);

  document.querySelector('#reset').addEventListener('click', () => {
    camera.x = 0.5;
    camera.y = 0.5;
    selected = null;
    setZoom(1);
  });

  document.querySelector('#dive').addEventListener('click', () => {
    const target = visible[Math.floor(Math.random() * visible.length)];
    if (!target) return;
    camera.x = target.x;
    camera.y = target.y;
    selected = target;
    setZoom(camera.zoom * 8);
  });

  document.querySelector('#fingerprint').addEventListener('click', () => {
    document.querySelector('#fingerprint-out').textContent =
      `별 ${visible.length}개 · 지문 ${fingerprint()}`;
  });

  showOutputs();
}

function fingerprint() {
  const ids = visible.map((star) => star.id).sort();
  let value = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      value ^= id.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

function report() {
  const shown = pool.filter((slot) => slot.star).length;
  const cards = pool.filter((slot) => slot.star && slot.mode === 'card').length;

  metrics.zoom.textContent = `${camera.zoom < 10 ? camera.zoom.toFixed(1) : Math.round(camera.zoom)}배`;
  metrics.depth.textContent = `${maxDepth}층`;
  metrics.stars.textContent = `${starCount.toLocaleString()}개`;
  metrics.fresh.textContent = `${deepestCount.toLocaleString()}개`;
  metrics.pool.textContent = `${shown} / ${POOL_SIZE} (카드 ${cards})`;
  metrics.uploads.textContent = `${uploads.toLocaleString()}회`;
  metrics.frame.textContent = `${fps}fps · 그리기 ${drawMs.toFixed(1)}ms`;

  document.querySelector('#band-note').textContent =
    camera.zoom >= 48
      ? '지금은 정보 카드까지 나옵니다. 카드는 텍스처로 올라가 있지만 클릭은 그대로 됩니다.'
      : '더 확대하면 이름표가 정보 카드로 바뀝니다 (48배부터).';
}

function showOutputs() {
  document.querySelector('output[for="zoom"]').textContent =
    `${camera.zoom < 10 ? camera.zoom.toFixed(1) : Math.round(camera.zoom)}배`;
  document.querySelector('output[for="window"]').textContent = `${windowInput.value}층`;
  document.querySelector('output[for="density"]').textContent = `×${density()}`;
}
