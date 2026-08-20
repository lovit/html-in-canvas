// 04. paint 이벤트 — 바뀐 것만 다시 그린다.
//
// paint 이벤트는 "어떤 자식의 렌더링이 바뀌었다" 는 신호이고,
// event.changedElements 에 그 자식들이 들어 있다. 캔버스를 통째로 지우고
// 전부 다시 그리는 대신 바뀐 것만 지우고 다시 그리면 카드 수와 비용이 분리된다.

import { ensureSupport } from '../../_shared/support.js';

const stage = document.querySelector('#stage');
const countInput = document.querySelector('#count');
const runningToggle = document.querySelector('#running');
const changedLog = document.querySelector('#changed');

const metrics = {
  paints: document.querySelector('#m-paints'),
  drawn: document.querySelector('#m-drawn'),
  time: document.querySelector('#m-time'),
  total: document.querySelector('#m-total'),
};

const TILE_GAP = 12;
const PADDING = 16;

/** 카드마다 갱신 주기가 다르다. 그래야 매 프레임 바뀌는 카드가 일부만 남는다. */
const PERIODS = [180, 260, 340, 430, 520, 610, 700, 790, 880, 970, 1060, 1150];

let mode = 'full';
let tiles = [];
let placements = new Map();
let needsFullRedraw = true;
let paintCount = 0;
let totalDrawn = 0;
let timeSum = 0;
let timeSamples = 0;
let timer = null;

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = stage.getContext('2d');

  stage.layoutSubtree = true;
  stage.addEventListener('paint', (event) => onPaint(ctx, event));

  countInput.addEventListener('input', () => {
    syncOutputs();
    buildTiles();
  });

  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      mode = radio.value;
      resetMetrics();
      needsFullRedraw = true;
      stage.requestPaint();
    });
  }

  runningToggle.addEventListener('change', () => {
    if (runningToggle.checked) startTicking();
    else stopTicking();
  });

  syncOutputs();
  buildTiles();
  startTicking();
}

/** 카드를 canvas 자식으로 새로 만든다. 자식은 언제든 추가하고 지울 수 있다. */
function buildTiles() {
  stopTicking();
  for (const tile of tiles) tile.remove();

  const count = Number(countInput.value);
  tiles = Array.from({ length: count }, (_, index) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.index = String(index);

    const label = document.createElement('p');
    label.className = 'label';
    label.textContent = `TILE ${String(index + 1).padStart(2, '0')}`;

    const value = document.createElement('p');
    value.className = 'value';
    value.textContent = '0';

    tile.append(label, value);
    // canvas 의 직계 자식이어야 그릴 수 있다.
    stage.append(tile);
    return tile;
  });

  layoutTiles();
  resetMetrics();
  needsFullRedraw = true;
  stage.requestPaint();
  if (runningToggle.checked) startTicking();
}

/** 캔버스 안에서 카드가 놓일 자리를 미리 계산해 둔다. 부분 갱신에 필요하다. */
function layoutTiles() {
  placements = new Map();
  const first = tiles[0];
  if (!first) return;

  const box = first.getBoundingClientRect();
  const width = Math.round(box.width) || 132;
  const height = Math.round(box.height) || 62;
  const columns = Math.max(
    1,
    Math.floor((stage.width - PADDING * 2 + TILE_GAP) / (width + TILE_GAP)),
  );
  const rows = Math.ceil(tiles.length / columns);

  // 카드가 늘어나면 캔버스도 같이 키운다. height 를 바꾸면 컨텍스트가 초기화되므로
  // 이 다음에는 반드시 전부 다시 그려야 한다.
  const needed = PADDING * 2 + rows * (height + TILE_GAP) - TILE_GAP;
  if (stage.height !== needed) {
    stage.height = needed;
    needsFullRedraw = true;
  }

  tiles.forEach((tile, index) => {
    placements.set(tile, {
      x: PADDING + (index % columns) * (width + TILE_GAP),
      y: PADDING + Math.floor(index / columns) * (height + TILE_GAP),
      width,
      height,
    });
  });
}

function onPaint(ctx, event) {
  const changed = Array.from(event.changedElements ?? []);
  const started = performance.now();

  let drawn = 0;
  if (mode === 'full' || needsFullRedraw) {
    ctx.reset();
    for (const tile of tiles) drawn += drawTile(ctx, tile);
    needsFullRedraw = false;
  } else {
    for (const element of changed) drawn += drawTile(ctx, element, true);
  }

  const elapsed = performance.now() - started;
  paintCount += 1;
  totalDrawn += drawn;
  timeSum += elapsed;
  timeSamples += 1;

  metrics.paints.textContent = String(paintCount);
  metrics.drawn.textContent = String(drawn);
  metrics.time.textContent = `${(timeSum / timeSamples).toFixed(2)} ms`;
  metrics.total.textContent = String(totalDrawn);
  changedLog.textContent = `changedElements: ${
    changed.length === 0
      ? '(빈 배열)'
      : changed.map((el) => el.dataset.index ?? el.tagName).join(', ')
  }`;
}

/** 카드 하나를 그린다. clear 를 주면 그 자리만 지우고 다시 그린다. */
function drawTile(ctx, tile, clear = false) {
  const place = placements.get(tile);
  if (!place) return 0;
  if (clear) ctx.clearRect(place.x, place.y, place.width, place.height);
  ctx.drawElementImage(tile, place.x, place.y);
  return 1;
}

function startTicking() {
  stopTicking();
  const counters = tiles.map(() => 0);
  const last = tiles.map(() => performance.now());

  timer = setInterval(() => {
    const now = performance.now();
    tiles.forEach((tile, index) => {
      const period = PERIODS[index % PERIODS.length];
      if (now - last[index] < period) return;
      last[index] = now;
      counters[index] += 1;
      // 이 한 줄이 paint 이벤트를 부른다. requestPaint() 를 직접 부를 필요가 없다.
      tile.querySelector('.value').textContent = String(counters[index]);
    });
  }, 50);
}

function stopTicking() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function resetMetrics() {
  paintCount = 0;
  totalDrawn = 0;
  timeSum = 0;
  timeSamples = 0;
}

function syncOutputs() {
  document.querySelector('output[for="count"]').textContent = countInput.value;
}
