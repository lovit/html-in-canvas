// 10. 접근성 있는 차트 — 지금까지 배운 것을 모아 쓸 만한 것을 만든다.
//
// 나누는 기준은 하나다. 그림은 캔버스가, 뜻이 있는 것은 HTML 이 맡는다.
//   막대, 격자선, 축 눈금 → ctx.fillRect / ctx.fillText
//   도시 이름, 값, 범례, 툴팁 → canvas 자식 HTML 을 drawElementImage 로
//
// 03 의 위치 동기화와 04 의 paint 이벤트, 02 의 좌표 감각이 전부 쓰인다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const CITIES = ['서울', '부산', '인천', '대구', '대전', '광주'];

const PLOT = { left: 66, top: 34, right: 706, bottom: 344 };
const COLUMN_WIDTH = 100;
const BAR_WIDTH = 52;
const ANIMATION_MS = 550;

const chart = document.querySelector('#chart');
const legend = document.querySelector('#legend');
const tooltip = document.querySelector('#tooltip');
const tooltipName = document.querySelector('#tooltip-name');
const tooltipValue = document.querySelector('#tooltip-value');
const tooltipDelta = document.querySelector('#tooltip-delta');
const status = document.querySelector('#status');
const tableBody = document.querySelector('#data-rows');

/** 도시마다 { current, previous } 를 들고 있다. */
let data = makeData();
let drawn = data.map((entry) => ({ ...entry }));
let animationStart = null;
let animationFrom = drawn.map((entry) => entry.current);
let hovered = -1;
const columns = [];

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = chart.getContext('2d');

  buildColumns();
  renderTable();

  chart.layoutSubtree = true;
  chart.addEventListener(
    'paint',
    guardPaint(() => paint(ctx)),
  );
  chart.requestPaint();

  document.querySelector('#shuffle').addEventListener('click', shuffle);
}

/** 막대마다 버튼을 하나씩 만들어 canvas 의 직계 자식으로 붙인다. */
function buildColumns() {
  data.forEach((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'column';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.city;

    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = formatValue(entry.current);

    button.append(name, value);
    button.addEventListener('focus', () => setHovered(index, '포커스'));
    button.addEventListener('blur', () => setHovered(-1));
    button.addEventListener('pointerenter', () => setHovered(index, '마우스'));
    button.addEventListener('pointerleave', () => setHovered(-1));

    // canvas 의 직계 자식이어야 그릴 수 있다.
    chart.append(button);
    columns.push({ button, value });
  });

  updateLabels();
}

function setHovered(index, how) {
  hovered = index;
  if (index >= 0) {
    const entry = data[index];
    const delta = entry.current - entry.previous;
    tooltipName.textContent = entry.city;
    tooltipValue.textContent = `이번 주 ${formatValue(entry.current)}`;
    tooltipDelta.textContent = `${delta >= 0 ? '▲' : '▼'} 지난 주 대비 ${formatValue(Math.abs(delta))}`;
    status.textContent = `${how}: ${entry.city} ${formatValue(entry.current)}`;
  } else {
    status.textContent = 'Tab 키를 눌러 막대를 하나씩 짚어 보세요.';
  }
  chart.requestPaint();
}

function paint(ctx) {
  const progress =
    animationStart === null ? 1 : Math.min(1, (performance.now() - animationStart) / ANIMATION_MS);
  const eased = 1 - (1 - progress) ** 3;

  drawn = data.map((entry, index) => ({
    ...entry,
    current: animationFrom[index] + (entry.current - animationFrom[index]) * eased,
  }));

  ctx.reset();
  drawGrid(ctx);
  drawBars(ctx);
  drawChildren(ctx);

  if (progress < 1) {
    requestAnimationFrame(() => chart.requestPaint());
  } else if (animationStart !== null) {
    animationStart = null;
  }
}

/** 격자선과 y 축 눈금. 숫자만 있는 축은 캔버스로 그리는 편이 간단하다. */
function drawGrid(ctx) {
  const max = axisMax();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (max / 4) * tick;
    const y = Math.round(PLOT.bottom - (PLOT.bottom - PLOT.top) * (tick / 4)) + 0.5;

    ctx.beginPath();
    ctx.moveTo(PLOT.left, y);
    ctx.lineTo(PLOT.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(value)), PLOT.left - 12, y);
  }
}

function drawBars(ctx) {
  const max = axisMax();
  const height = PLOT.bottom - PLOT.top;

  drawn.forEach((entry, index) => {
    const centerX = columnX(index) + COLUMN_WIDTH / 2;

    // 지난 주 막대는 뒤에 흐리게 깔린다.
    const previousHeight = (entry.previous / max) * height;
    ctx.fillStyle = 'rgba(71, 85, 105, 0.7)';
    ctx.fillRect(
      centerX - BAR_WIDTH / 2 + 8,
      PLOT.bottom - previousHeight,
      BAR_WIDTH,
      previousHeight,
    );

    const currentHeight = (entry.current / max) * height;
    ctx.fillStyle = index === hovered ? '#7dd3fc' : '#38bdf8';
    ctx.fillRect(
      centerX - BAR_WIDTH / 2 - 8,
      PLOT.bottom - currentHeight,
      BAR_WIDTH,
      currentHeight,
    );
  });

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
  ctx.beginPath();
  ctx.moveTo(PLOT.left, PLOT.bottom + 0.5);
  ctx.lineTo(PLOT.right, PLOT.bottom + 0.5);
  ctx.stroke();
}

/** HTML 자식들을 그린다. 반환된 행렬을 되먹여야 클릭과 포커스가 제자리를 찾는다. */
function drawChildren(ctx) {
  columns.forEach(({ button }, index) => {
    const matrix = ctx.drawElementImage(button, columnX(index), PLOT.top);
    button.style.transform = matrix.toString();
  });

  const legendMatrix = ctx.drawElementImage(legend, PLOT.right - 220, 6);
  legend.style.transform = legendMatrix.toString();

  if (hovered >= 0) {
    const x = Math.min(columnX(hovered) + COLUMN_WIDTH, PLOT.right - 170);
    const tooltipMatrix = ctx.drawElementImage(tooltip, x, PLOT.top + 12);
    tooltip.style.transform = tooltipMatrix.toString();
  } else {
    // 그리지 않을 때는 위치도 되돌린다. 안 그러면 보이지 않는 채로 마지막 자리에 남는다.
    tooltip.style.transform = 'none';
  }
}

function columnX(index) {
  const span = (PLOT.right - PLOT.left) / CITIES.length;
  return PLOT.left + span * index + (span - COLUMN_WIDTH) / 2;
}

function axisMax() {
  const highest = Math.max(...data.flatMap((entry) => [entry.current, entry.previous]));
  return Math.ceil(highest / 10) * 10;
}

function shuffle() {
  animationFrom = drawn.map((entry) => entry.current);
  data = makeData();
  animationStart = performance.now();
  updateLabels();
  renderTable();
  chart.requestPaint();
}

/** 버튼의 글자와 접근 이름을 함께 갱신한다. 스크린리더가 읽는 것은 이쪽이다. */
function updateLabels() {
  data.forEach((entry, index) => {
    const delta = entry.current - entry.previous;
    const direction = delta >= 0 ? '증가' : '감소';
    columns[index].value.textContent = formatValue(entry.current);
    columns[index].button.setAttribute(
      'aria-label',
      `${entry.city}, 이번 주 ${formatValue(entry.current)}, 지난 주 대비 ${formatValue(Math.abs(delta))} ${direction}`,
    );
  });
}

function renderTable() {
  tableBody.replaceChildren(
    ...data.map((entry) => {
      const row = document.createElement('tr');
      const head = document.createElement('th');
      head.scope = 'row';
      head.textContent = entry.city;

      const current = document.createElement('td');
      current.textContent = formatValue(entry.current);

      const previous = document.createElement('td');
      previous.textContent = formatValue(entry.previous);

      row.append(head, current, previous);
      return row;
    }),
  );
}

function makeData() {
  return CITIES.map((city) => ({
    city,
    current: 20 + Math.round(Math.random() * 70),
    previous: 20 + Math.round(Math.random() * 70),
  }));
}

function formatValue(value) {
  return `${Math.round(value)}천 명`;
}
