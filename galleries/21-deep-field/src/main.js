// 21. 딥필드.
//
// 점은 캔버스가 찍고, 그 점이 무엇인지 말하는 카드는 HTML 이 맡는다.
// 10번(접근성 차트)의 분업을 수천 개 규모로 키운 것이다.
//
// 여기서 처음 나오는 것은 HTML 요소를 풀에 담아 돌려 쓰는 일이다.
// 지금까지 예제는 캔버스 자식 수가 고정이었다. 보이는 별이 계속 바뀌는 화면에서는
// 요소를 별마다 만들 수 없으므로, 스물네 개를 만들어 두고 갈아 끼운다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';
import { starsInView, describeStar } from '../../_shared/starfield.js';

/** 배율 1 에서 세계(0~1 정사각형) 한 변이 차지하는 픽셀. */
const WORLD_PX = 900;

/**
 * HTML 요소 풀 크기.
 *
 * 한 화면에 동시에 띄우는 최대치(카드 5 + 이름표 12)보다 하나 크게 잡았다.
 * 사전 측정에서 카드 100장을 그려도 0.54ms 였으니 더 키워도 되지만,
 * 풀은 "동시에 필요한 만큼" 이면 충분하다.
 */
const POOL_SIZE = 18;

/** 별이 이보다 작게 그려지면 찍지 않는다. */
const MIN_RADIUS_PX = 0.2;

/** 흐린 별을 표현하는 세 단계. 알파가 같은 것끼리 묶어야 한 번에 채울 수 있다. */
const BANDS = [
  { from: 1.2, alpha: 1 },
  { from: 0.6, alpha: 0.55 },
  { from: 0, alpha: 0.3 },
];

/** 이름표와 카드의 크기. src/style.css 와 맞춰 둔 값이다. */
const BOX = {
  chip: { width: 132, height: 40 },
  card: { width: 176, height: 132 },
};

const stage = document.querySelector('#stage');
const ctx = stage.getContext('2d');
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
  frame: document.querySelector('#m-frame'),
};

/** 카메라. 가운데 세계 좌표와 배율. */
const camera = { x: 0.5, y: 0.5, zoom: 1 };

/** 칸 결과 보관함. 카메라가 조금 움직였다고 같은 칸을 다시 만들 이유가 없다. */
const cells = new Map();

/** 풀. slot.star 가 지금 이 요소가 맡은 별이다. */
const pool = [];

/** 별 id → slot. 같은 별이 계속 보이면 자리를 그대로 유지한다. */
const assigned = new Map();

let selected = null;
let visible = [];
let maxDepth = 0;
let drawMs = 0;
let fps = 0;
let frames = 0;
let fpsSince = performance.now();
let paintCount = 0;

/** 카메라와 깊이가 그대로면 별을 다시 모으지 않는다. 같은 답이 나오는 계산이다. */
let lastView = '';

/** 마지막 paint 에서 실제로 찍은 별. 화면에 걸치기만 하고 너무 흐린 별은 빠진다. */
let drawn = { total: 0, deepest: 0 };

if (ensureSupport()) {
  start();
}

function start() {
  buildPool();

  stage.layoutSubtree = true;
  stage.addEventListener('paint', guardPaint(onPaint));

  wireCamera();
  wireControls();

  requestAnimationFrame(tick);
}

/** 요소를 미리 만들어 둔다. 이 뒤로는 개수가 변하지 않는다. */
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
    pool.push({ element, star: null, mode: 'chip' });
  }
}

/* 한 프레임 --------------------------------------------------------------- */

/**
 * DOM 을 고치는 일은 여기서만 한다.
 *
 * paint 안에서 고쳐도 다음 프레임에야 반영되고, 매 프레임 글자를 새로 쓰면
 * 그 변경이 다시 paint 를 부르는 고리가 된다. 배정이 실제로 바뀐 자리만 고친다.
 */
function tick() {
  maxDepth = depthForZoom();

  const view = `${camera.x.toFixed(7)}:${camera.y.toFixed(7)}:${camera.zoom.toFixed(4)}:${maxDepth}:${density()}`;
  if (view !== lastView) {
    visible = starsInView(viewBounds(), maxDepth, cells, density());
    if (cells.size > 6000) cells.clear();
    lastView = view;
  }

  assignPool();
  countFrame();
  report();

  stage.requestPaint();
  requestAnimationFrame(tick);
}

/** 초당 프레임. 22번과 같은 방법으로 재야 두 경로를 견줄 수 있다. */
function countFrame() {
  frames += 1;
  const now = performance.now();
  if (now - fpsSince >= 500) {
    fps = Math.round((frames / (now - fpsSince)) * 1000);
    frames = 0;
    fpsSince = now;
  }
}

/** 배율이 오르면 깊이가 따라 는다. 깊이 창만큼 더 깊은 층까지 그린다. */
function depthForZoom() {
  const base = Math.floor(Math.log2(camera.zoom));
  return Math.min(22, Math.max(0, base + Number(windowInput.value)));
}

/** 칸마다 별을 몇 배로 낼지. 그리는 경로를 비교하려고 둔 손잡이다. */
function density() {
  return [1, 4, 16][Number(densityInput.value)];
}

function viewBounds() {
  const half = { x: stage.width / 2, y: stage.height / 2 };
  const scale = camera.zoom * WORLD_PX;
  return {
    left: camera.x - half.x / scale,
    right: camera.x + half.x / scale,
    top: camera.y - half.y / scale,
    bottom: camera.y + half.y / scale,
  };
}

/**
 * 지금 배율에서 HTML 이 맡을 별들. 큰 별부터 고르고, 자리를 여기서 정한다.
 *
 * 자리를 paint 가 아니라 여기서 정하는 이유는 두 가지다. 겹치는 이름표를 미리
 * 걸러야 풀을 헛되이 쓰지 않고, paint 는 그리기만 하게 두는 편이 읽기 쉽다.
 */
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

/** 풀 자리를 나눠 준다. 이미 맡고 있는 별이면 그 자리를 그대로 둔다. */
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
  }

  // 남은 자리는 비운다. 비운 자리는 그리지도, 히트 테스트에 잡히지도 않는다.
  for (const slot of pool) {
    if (keep.has(slot)) continue;
    if (slot.star) assigned.delete(slot.star.id);
    slot.star = null;
    slot.spot = null;
    slot.element.style.transform = 'none';
    slot.element.style.pointerEvents = 'none';
  }
}

/** 요소 하나에 별 하나를 앉힌다. 배정이 바뀔 때만 불린다. */
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
}

/* 그리기 ------------------------------------------------------------------- */

function onPaint() {
  paintCount += 1;
  const started = performance.now();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky();
  drawStars();
  drawLabels();

  drawMs = drawMs * 0.9 + (performance.now() - started) * 0.1;
}

function drawSky() {
  ctx.fillStyle = '#03060f';
  ctx.fillRect(0, 0, stage.width, stage.height);

  // 성운. 세계 좌표에 박혀 있어서 확대하면 함께 커진다.
  const clouds = [
    { x: 0.32, y: 0.38, r: 0.22, color: 'rgba(56, 89, 189, 0.30)' },
    { x: 0.63, y: 0.58, r: 0.26, color: 'rgba(147, 51, 234, 0.20)' },
    { x: 0.5, y: 0.5, r: 0.5, color: 'rgba(14, 116, 144, 0.12)' },
  ];

  for (const cloud of clouds) {
    const center = toScreen(cloud);
    const radius = cloud.r * camera.zoom * WORLD_PX;
    if (radius < 2) continue;
    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
    gradient.addColorStop(0, cloud.color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, stage.width, stage.height);
  }
}

/**
 * 별을 색깔별로 모아 한 번에 채운다.
 *
 * 사전 측정에서 20만 점을 하나씩 fillRect 로 찍으면 31ms 였는데,
 * 한 경로에 모아 한 번에 채우면 17ms 였다. 색이 다섯 가지뿐이라 다섯 번이면 된다.
 */
function drawStars() {
  const batches = new Map();
  drawn = { total: 0, deepest: 0 };

  for (const star of visible) {
    const size = screenRadius(star);
    if (size < MIN_RADIUS_PX) continue;
    const point = toScreen(star);
    if (point.x < -8 || point.y < -8 || point.x > stage.width + 8 || point.y > stage.height + 8) {
      continue;
    }

    // 아주 작은 별도 한 점으로는 찍는다. 대신 흐리게. 딥필드의 뿌연 느낌이 여기서 나온다.
    const band = BANDS.findIndex((entry) => size >= entry.from);
    const key = `${star.tone.color}|${band}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { color: star.tone.color, alpha: BANDS[band].alpha, points: [] };
      batches.set(key, batch);
    }
    batch.points.push(point.x, point.y, Math.min(6, Math.max(0.45, size)));
    drawn.total += 1;
    if (star.depth === maxDepth) drawn.deepest += 1;
  }

  for (const batch of batches.values()) {
    ctx.globalAlpha = batch.alpha;
    ctx.fillStyle = batch.color;
    ctx.beginPath();
    for (let i = 0; i < batch.points.length; i += 3) {
      const radius = batch.points[i + 2];
      ctx.moveTo(batch.points[i] + radius, batch.points[i + 1]);
      ctx.arc(batch.points[i], batch.points[i + 1], radius, 0, Math.PI * 2);
    }
    ctx.fill();

    // 후광은 큰 별에만. 전부에 씌우면 화면이 뿌옇게 뭉갠다.
    ctx.globalAlpha = batch.alpha * 0.16;
    ctx.beginPath();
    let glows = 0;
    for (let i = 0; i < batch.points.length; i += 3) {
      const radius = batch.points[i + 2];
      if (radius < 2) continue;
      glows += 1;
      ctx.moveTo(batch.points[i] + radius * 3.4, batch.points[i + 1]);
      ctx.arc(batch.points[i], batch.points[i + 1], radius * 3.4, 0, Math.PI * 2);
    }
    if (glows > 0) ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** 배정된 요소를 그리고, 반환 행렬을 되먹여 그 자리에서 눌리게 한다. */
function drawLabels() {
  for (const slot of pool) {
    if (!slot.star || !slot.spot) continue;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.beginPath();
    ctx.moveTo(slot.anchor.x, slot.anchor.y);
    ctx.lineTo(slot.spot.x, slot.anchor.y);
    ctx.stroke();
    ctx.restore();

    const matrix = ctx.drawElementImage(slot.element, slot.spot.x, slot.spot.y);
    slot.element.style.transform = matrix.toString();
    slot.element.style.pointerEvents = 'auto';
  }
}

function toScreen(point) {
  const scale = camera.zoom * WORLD_PX;
  return {
    x: (point.x - camera.x) * scale + stage.width / 2,
    y: (point.y - camera.y) * scale + stage.height / 2,
  };
}

function screenRadius(star) {
  return star.radius * camera.zoom * WORLD_PX;
}

/* 조작 --------------------------------------------------------------------- */

function setZoom(zoom, anchor) {
  const next = Math.min(4096, Math.max(1, zoom));
  if (anchor) {
    // 커서가 가리키던 자리가 제자리에 있도록 중심을 옮긴다.
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

function fromScreen(point) {
  const scale = camera.zoom * WORLD_PX;
  return {
    x: (point.x - stage.width / 2) / scale + camera.x,
    y: (point.y - stage.height / 2) / scale + camera.y,
  };
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
    // 카드나 이름표에서 올라온 이벤트다. 카메라를 끌 일이 아니라 그 요소가 쓸 일이다.
    // 이것을 거르지 않으면 setPointerCapture 가 포인터를 뺏어 체크박스가 눌리지 않는다.
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

  const endDrag = (event) => {
    if (dragging && moved < 4) selectNear(canvasPoint(event));
    dragging = null;
  };
  stage.addEventListener('pointerup', endDrag);
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

/** 빈 하늘을 누르면 가장 가까운 별을 고른다. 카드가 있는 자리는 카드가 먼저 받는다. */
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
  zoomInput.addEventListener('input', () => {
    setZoom(2 ** (Number(zoomInput.value) / 10));
  });
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

/** 지금 보이는 별 id 를 모아 접은 값. 같은 자리를 다시 보면 같아야 한다. */
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

/* 측정값 ------------------------------------------------------------------- */

function report() {
  const shown = pool.filter((slot) => slot.star).length;
  const cards = pool.filter((slot) => slot.star && slot.mode === 'card').length;

  metrics.zoom.textContent = `${camera.zoom < 10 ? camera.zoom.toFixed(1) : Math.round(camera.zoom)}배`;
  metrics.depth.textContent = `${maxDepth}층`;
  metrics.stars.textContent = `${drawn.total.toLocaleString()}개`;
  metrics.fresh.textContent = `${drawn.deepest.toLocaleString()}개`;
  metrics.pool.textContent = `${shown} / ${POOL_SIZE} (카드 ${cards})`;
  metrics.frame.textContent = `${fps}fps · 그리기 ${drawMs.toFixed(1)}ms`;

  document.querySelector('#band-note').textContent =
    camera.zoom >= 48
      ? '지금은 정보 카드까지 나옵니다. 카드 안 체크박스가 실제로 눌립니다.'
      : '더 확대하면 이름표가 정보 카드로 바뀝니다 (48배부터).';
}

function showOutputs() {
  document.querySelector('output[for="zoom"]').textContent =
    `${camera.zoom < 10 ? camera.zoom.toFixed(1) : Math.round(camera.zoom)}배`;
  document.querySelector('output[for="window"]').textContent = `${windowInput.value}층`;
  document.querySelector('output[for="density"]').textContent = `×${density()}`;
}
