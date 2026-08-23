// 18. 여러 문서를 한 판에.
//
// 지금까지는 문서 하나나 둘을 그렸다. 열둘을 늘어놓으면 사정이 달라진다.
//
//   - 화면 밖으로 나간 것을 그릴 이유가 없다 (뷰포트 컬링)
//   - 바뀌지 않은 것을 다시 그릴 이유도 없다 (04 의 changedElements)
//   - 안 그린 것은 히트 테스트에서 빼야 한다 (10 에서 배운 것)
//
// 앞 예제에서 "그래도 된다" 정도였던 것들이 여기서는 지켜야 하는 규칙이 된다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const PANEL_W = 220;
const PANEL_H = 180;
const COLUMNS = 4;
const GAP_X = 44;
const GAP_Y = 44;

/** 패널 열두 장. 색만 다르고 구조는 같다. 세 장에만 시계가 돈다. */
const TONES = [
  '#1d4ed8',
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0891b2',
  '#4d7c0f',
  '#c2410c',
  '#1e40af',
  '#047857',
  '#a21caf',
  '#0369a1',
];
const LIVE = new Set([1, 5, 9]);

const stage = document.querySelector('#stage');
const ctx = stage.getContext('2d');
const zoomInput = document.querySelector('#zoom');
const cullToggle = document.querySelector('#cull');
const partialToggle = document.querySelector('#partial');
const metrics = {
  center: document.querySelector('#m-center'),
  visible: document.querySelector('#m-visible'),
  drawn: document.querySelector('#m-drawn'),
  average: document.querySelector('#m-average'),
  changed: document.querySelector('#m-changed'),
  paints: document.querySelector('#m-paints'),
};

const panels = [];
const camera = { x: -40, y: -30, zoom: 0.8 };
const history = [];

let paintCount = 0;
let needsFullRedraw = true;

/** 고르개로 고른 패널. 어느 것을 보러 갔는지 테두리로 남긴다. */
let selected = null;

if (ensureSupport()) {
  start();
}

function start() {
  buildPanels();

  stage.layoutSubtree = true;
  stage.addEventListener('paint', guardPaint(onPaint));

  buildPicker();
  wireCamera();
  wireControls();

  stage.requestPaint();
}

/** 패널 열두 장을 만들어 캔버스의 직계 자식으로 넣는다. */
function buildPanels() {
  for (let index = 0; index < TONES.length; index += 1) {
    const live = LIVE.has(index);
    const frame = document.createElement('iframe');

    frame.width = String(PANEL_W);
    frame.height = String(PANEL_H);
    frame.title = `패널 ${index + 1}`;
    // 스크롤이 생기면 캔버스에 그려지지 않는다. docs/known-issues.md
    frame.setAttribute('scrolling', 'no');
    frame.src = `src/panel.html?i=${index}&tone=${encodeURIComponent(TONES[index])}&live=${live ? 1 : 0}`;

    stage.append(frame);
    panels.push({
      index,
      frame,
      live,
      x: (index % COLUMNS) * (PANEL_W + GAP_X),
      y: Math.floor(index / COLUMNS) * (PANEL_H + GAP_Y),
    });
  }
}

/** 패널 수만큼 번호 버튼을 만든다. 패널을 늘리면 버튼도 따라 는다. */
function buildPicker() {
  const picker = document.querySelector('#picker');

  for (const panel of panels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(panel.index + 1);
    button.className = panel.live ? 'live' : '';
    button.title = `패널 ${panel.index + 1}${panel.live ? ' (시계가 도는 패널)' : ''}`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => focusPanel(panel));
    picker.append(button);
  }
}

/** 고른 패널을 화면 가운데로 가져온다. */
function focusPanel(panel) {
  const zoom = clampZoom(1.3);
  selected = panel;
  markPicker();

  moveCamera({
    zoom,
    x: panel.x + PANEL_W / 2 - stage.width / 2 / zoom,
    y: panel.y + PANEL_H / 2 - stage.height / 2 / zoom,
  });
  zoomInput.value = String(Math.round(zoom * 100));
  showZoom();
}

function markPicker() {
  const buttons = document.querySelectorAll('#picker button');
  buttons.forEach((button, index) => {
    button.setAttribute('aria-pressed', String(selected?.index === index));
  });
}

/* 그리기 ------------------------------------------------------------------ */

function onPaint(event) {
  paintCount += 1;

  const changed = new Set(event.changedElements ?? []);
  const visible = panels.filter(isOnScreen);
  const culling = cullToggle.checked;
  const candidates = culling ? visible : panels;

  // 바뀐 것만 그릴 수 있는 조건: 부분 갱신을 켰고, 카메라가 그대로이고,
  // 브라우저가 무엇이 바뀌었는지 알려 준 경우.
  const partial = partialToggle.checked && !needsFullRedraw && changed.size > 0;
  const targets = partial ? candidates.filter((panel) => changed.has(panel.frame)) : candidates;

  if (!partial) ground(0, 0, stage.width, stage.height);
  for (const panel of targets) drawPanel(panel, partial);

  // 그리지 않은 패널은 히트 테스트에서 뺀다. 안 빼면 화면 밖 패널이
  // 캔버스 왼쪽 위에 남아 엉뚱한 자리에서 클릭을 가로챈다.
  const drawn = new Set(candidates);
  for (const panel of panels) {
    if (drawn.has(panel)) continue;
    panel.frame.style.transform = 'none';
    panel.frame.style.pointerEvents = 'none';
  }

  needsFullRedraw = false;
  report(visible.length, targets.length, changed);
}

/** 패널 한 장. 부분 갱신일 때는 그 자리만 지우고 다시 그린다. */
function drawPanel(panel, partial) {
  const box = screenBox(panel);
  if (partial) ground(box.x - 10, box.y - 10, box.width + 32, box.height + 34);

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.roundRect(box.x + 5, box.y + 8, box.width, box.height, 8);
  ctx.fill();
  ctx.restore();

  const matrix = ctx.drawElementImage(panel.frame, box.x, box.y, box.width, box.height);

  // 고른 패널 표시. 부분 갱신에서도 이 패널을 다시 그릴 때 같이 그려지므로 잔상이 없다.
  if (selected === panel) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(box.x - 3, box.y - 3, box.width + 6, box.height + 6, 10);
    ctx.stroke();
    ctx.restore();
  }

  // 그린 자리에서 클릭과 입력이 잡히게 한다.
  // 회전은 없지만 확대가 들어가므로 transform-origin: 0 0 이 필요하다 (17 참고).
  panel.frame.style.transform = matrix.toString();
  panel.frame.style.pointerEvents = 'auto';
}

/** 바탕. 전체를 다시 그릴 때도, 패널 한 장만 고칠 때도 같은 코드를 쓴다. */
function ground(x, y, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.clearRect(x, y, width, height);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(x, y, width, height);

  // 눈금점. 끌 때 판이 움직인다는 것이 보인다.
  const step = 40 * camera.zoom;
  if (step >= 8) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
    const firstX = -((camera.x * camera.zoom) % step);
    const firstY = -((camera.y * camera.zoom) % step);
    for (let dx = firstX; dx < stage.width; dx += step) {
      for (let dy = firstY; dy < stage.height; dy += step) {
        if (dx < x - step || dx > x + width + step) continue;
        if (dy < y - step || dy > y + height + step) continue;
        ctx.fillRect(dx, dy, 1.5, 1.5);
      }
    }
  }
  ctx.restore();
}

/* 카메라 ------------------------------------------------------------------- */

function screenBox(panel) {
  return {
    x: (panel.x - camera.x) * camera.zoom,
    y: (panel.y - camera.y) * camera.zoom,
    width: PANEL_W * camera.zoom,
    height: PANEL_H * camera.zoom,
  };
}

/** 캔버스에 걸치는가. 걸치지 않으면 그리지 않는다. */
function isOnScreen(panel) {
  const box = screenBox(panel);
  return (
    box.x + box.width > 0 && box.y + box.height > 0 && box.x < stage.width && box.y < stage.height
  );
}

function moveCamera(changes) {
  Object.assign(camera, changes);
  needsFullRedraw = true;
  stage.requestPaint();
}

function wireCamera() {
  let dragging = null;

  // 패널이 히트 테스트를 받으므로 패널 위에서는 캔버스가 pointerdown 을 못 받는다.
  // Shift 를 누르고 있는 동안만 자식들을 히트 테스트에서 빼서 어디서든 끌 수 있게 한다.
  const setPanMode = (on) => stage.classList.toggle('pan', on);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') setPanMode(true);
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') setPanMode(false);
  });
  window.addEventListener('blur', () => setPanMode(false));

  stage.addEventListener('pointerdown', (event) => {
    dragging = { x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const scale = stage.getBoundingClientRect().width / stage.width;
    moveCamera({
      x: camera.x - (event.clientX - dragging.x) / (camera.zoom * scale),
      y: camera.y - (event.clientY - dragging.y) / (camera.zoom * scale),
    });
    dragging = { x: event.clientX, y: event.clientY };
  });

  const endDrag = () => {
    dragging = null;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const box = stage.getBoundingClientRect();
      const pointer = {
        x: ((event.clientX - box.left) / box.width) * stage.width,
        y: ((event.clientY - box.top) / box.height) * stage.height,
      };
      // 커서가 가리키던 지점이 제자리에 있도록 확대한다.
      const before = {
        x: camera.x + pointer.x / camera.zoom,
        y: camera.y + pointer.y / camera.zoom,
      };
      const zoom = clampZoom(camera.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));

      moveCamera({ zoom, x: before.x - pointer.x / zoom, y: before.y - pointer.y / zoom });
      zoomInput.value = String(Math.round(zoom * 100));
      showZoom();
    },
    { passive: false },
  );
}

function clampZoom(value) {
  return Math.min(1.5, Math.max(0.35, value));
}

function wireControls() {
  zoomInput.addEventListener('input', () => {
    const center = {
      x: camera.x + stage.width / 2 / camera.zoom,
      y: camera.y + stage.height / 2 / camera.zoom,
    };
    const zoom = clampZoom(Number(zoomInput.value) / 100);
    moveCamera({
      zoom,
      x: center.x - stage.width / 2 / zoom,
      y: center.y - stage.height / 2 / zoom,
    });
    showZoom();
  });

  document.querySelector('#fit').addEventListener('click', () => {
    selected = null;
    markPicker();
    const worldWidth = COLUMNS * (PANEL_W + GAP_X) - GAP_X;
    const worldHeight = Math.ceil(TONES.length / COLUMNS) * (PANEL_H + GAP_Y) - GAP_Y;
    const zoom = clampZoom(
      Math.min(stage.width / (worldWidth + 60), stage.height / (worldHeight + 60)),
    );
    moveCamera({
      zoom,
      x: worldWidth / 2 - stage.width / 2 / zoom,
      y: worldHeight / 2 - stage.height / 2 / zoom,
    });
    zoomInput.value = String(Math.round(zoom * 100));
    showZoom();
  });

  for (const toggle of [cullToggle, partialToggle]) {
    toggle.addEventListener('change', () => {
      needsFullRedraw = true;
      history.length = 0;
      document.querySelector('#method-note').textContent =
        cullToggle.checked || partialToggle.checked
          ? '켠 것만큼 그리는 장수가 줄어듭니다.'
          : '둘 다 끄면 매 프레임 열두 장을 전부 다시 그립니다.';
      stage.requestPaint();
    });
  }

  showZoom();
}

function showZoom() {
  document.querySelector('output[for="zoom"]').textContent = `${zoomInput.value}%`;
}

/* 측정값 ------------------------------------------------------------------- */

/** 캔버스 한가운데에 놓인 패널이 몇 번인지. 끌거나 확대하면 따라 바뀐다. */
function describeCenter() {
  const middle = { x: stage.width / 2, y: stage.height / 2 };
  const found = panels.find((panel) => {
    const box = screenBox(panel);
    return (
      middle.x >= box.x &&
      middle.x <= box.x + box.width &&
      middle.y >= box.y &&
      middle.y <= box.y + box.height
    );
  });
  if (!found) return '패널 없음 (빈자리)';
  return `패널 ${found.index + 1}${found.live ? ' · 시계' : ''}`;
}

function report(visible, drawn, changed) {
  history.push(drawn);
  if (history.length > 20) history.shift();
  const average = history.reduce((sum, value) => sum + value, 0) / history.length;

  metrics.center.textContent = describeCenter();
  metrics.visible.textContent = `${visible} / ${panels.length}`;
  metrics.drawn.textContent = `${drawn}장`;
  metrics.average.textContent = `${average.toFixed(1)}장`;
  metrics.changed.textContent =
    changed.size === 0
      ? '(빈 목록)'
      : [...changed]
          .map((element) => panels.find((panel) => panel.frame === element))
          .filter(Boolean)
          .map((panel) => panel.index + 1)
          .sort((a, b) => a - b)
          .join(', ') || `${changed.size}개 (패널 아님)`;
  metrics.paints.textContent = String(paintCount);
}
