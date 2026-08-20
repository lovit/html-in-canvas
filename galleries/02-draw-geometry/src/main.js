// 02. 좌표와 변환 — drawElementImage() 의 인자 규칙과 캔버스 변환 행렬.
//
// 배우는 것은 세 가지다.
//   1. 인자 개수에 따라 의미가 달라진다 (drawImage 와 같은 규칙)
//   2. 캔버스의 현재 변환 행렬은 그리기에 적용된다
//   3. 소스 엘리먼트의 CSS transform 은 그리기에서 무시된다

import { ensureSupport } from '../../_shared/support.js';

const stage = document.querySelector('#stage');
const card = document.querySelector('#card');
const sourceMount = document.querySelector('#source-mount');
const sourceRect = document.querySelector('#source-rect');
const callText = document.querySelector('#call');
const hint = document.querySelector('#hint');
const resetButton = document.querySelector('#reset');
const cssTransform = document.querySelector('#css-transform');

const sliders = {
  dx: document.querySelector('#dx'),
  dy: document.querySelector('#dy'),
  dw: document.querySelector('#dw'),
  dh: document.querySelector('#dh'),
  sx: document.querySelector('#sx'),
  sy: document.querySelector('#sy'),
  sw: document.querySelector('#sw'),
  sh: document.querySelector('#sh'),
  rot: document.querySelector('#rot'),
  scl: document.querySelector('#scl'),
};

const DEFAULTS = {
  dx: 40,
  dy: 40,
  dw: 300,
  dh: 170,
  sx: 0,
  sy: 0,
  sw: 150,
  sh: 90,
  rot: 0,
  scl: 100,
};

const HINTS = {
  3: '크기를 생략하면 화면 밖에서와 같은 크기로 그려진다. 캔버스 좌표계 기준이다.',
  5: 'dwidth 와 dheight 로 늘리거나 줄인다. 비율을 깨면 그대로 찌그러진다.',
  7: '소스 사각형만 잘라서 원래 크기 그대로 그린다. 왼쪽 점선이 잘리는 영역이다.',
  9: '잘라낸 영역을 원하는 크기로 늘려 그린다. 확대경처럼 쓸 수 있다.',
};

let mode = 3;

// 왼쪽 패널에 보여 줄 복제본. 원본은 canvas 자식이라 화면에 직접 나오지 않는다.
const clone = card.cloneNode(true);
clone.removeAttribute('id');
clone.className = 'card-clone';
sourceMount.append(clone);

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = stage.getContext('2d');

  stage.layoutSubtree = true;
  stage.addEventListener('paint', () => draw(ctx));
  stage.requestPaint();

  for (const input of Object.values(sliders)) {
    input.addEventListener('input', () => {
      syncOutputs();
      updateSourceRect();
      updateCallText();
      // 슬라이더는 DOM 을 바꾸지 않으므로 paint 가 저절로 오지 않는다. 직접 요청한다.
      stage.requestPaint();
    });
  }

  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      mode = Number(radio.value);
      updateFieldsetState();
      updateSourceRect();
      updateCallText();
      hint.textContent = HINTS[mode];
      stage.requestPaint();
    });
  }

  cssTransform.addEventListener('change', () => {
    // 소스에 CSS transform 을 걸어도 캔버스 그림은 그대로다. 히트 테스트에만 적용된다.
    card.style.transform = cssTransform.checked ? 'rotate(12deg)' : '';
    clone.style.transform = card.style.transform;
    stage.requestPaint();
  });

  resetButton.addEventListener('click', () => {
    for (const [key, value] of Object.entries(DEFAULTS)) sliders[key].value = String(value);
    cssTransform.checked = false;
    card.style.transform = '';
    clone.style.transform = '';
    syncOutputs();
    updateSourceRect();
    updateCallText();
    stage.requestPaint();
  });

  syncOutputs();
  updateFieldsetState();
  updateSourceRect();
  updateCallText();
  hint.textContent = HINTS[mode];
}

function value(name) {
  return Number(sliders[name].value);
}

function draw(ctx) {
  ctx.reset();

  // 캔버스 변환은 캔버스 한가운데를 기준으로 건다. 그래야 회전해도 화면 밖으로 잘 안 나간다.
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((value('rot') * Math.PI) / 180);
  ctx.scale(value('scl') / 100, value('scl') / 100);
  ctx.translate(-cx, -cy);

  const { dx, dy, dw, dh, sx, sy, sw, sh } = readAll();

  if (mode === 3) ctx.drawElementImage(card, dx, dy);
  else if (mode === 5) ctx.drawElementImage(card, dx, dy, dw, dh);
  else if (mode === 7) ctx.drawElementImage(card, sx, sy, sw, sh, dx, dy);
  else ctx.drawElementImage(card, sx, sy, sw, sh, dx, dy, dw, dh);
}

function readAll() {
  return {
    dx: value('dx'),
    dy: value('dy'),
    dw: value('dw'),
    dh: value('dh'),
    sx: value('sx'),
    sy: value('sy'),
    sw: value('sw'),
    sh: value('sh'),
  };
}

function syncOutputs() {
  for (const [name, input] of Object.entries(sliders)) {
    const out = document.querySelector(`output[for="${name}"]`);
    if (out) out.textContent = name === 'scl' ? `${input.value}%` : input.value;
  }
}

/** 왼쪽 복제본 위에 소스 사각형을 점선으로 표시한다. 7인자와 9인자에서만 의미가 있다. */
function updateSourceRect() {
  if (mode !== 7 && mode !== 9) {
    sourceRect.hidden = true;
    return;
  }
  const box = clone.getBoundingClientRect();
  const parent = sourceRect.parentElement.getBoundingClientRect();
  sourceRect.hidden = false;
  sourceRect.style.left = `${box.left - parent.left + value('sx')}px`;
  sourceRect.style.top = `${box.top - parent.top + value('sy')}px`;
  sourceRect.style.width = `${value('sw')}px`;
  sourceRect.style.height = `${value('sh')}px`;
}

function updateFieldsetState() {
  const sizeUsed = mode === 5 || mode === 9;
  const sourceUsed = mode === 7 || mode === 9;
  for (const name of ['dw', 'dh'])
    sliders[name].closest('label').classList.toggle('dim', !sizeUsed);
  for (const name of ['sx', 'sy', 'sw', 'sh']) {
    sliders[name].closest('label').classList.toggle('dim', !sourceUsed);
  }
}

function updateCallText() {
  const { dx, dy, dw, dh, sx, sy, sw, sh } = readAll();
  const args = {
    3: [dx, dy],
    5: [dx, dy, dw, dh],
    7: [sx, sy, sw, sh, dx, dy],
    9: [sx, sy, sw, sh, dx, dy, dw, dh],
  }[mode];
  callText.textContent = `ctx.drawElementImage(card, ${args.join(', ')})`;
}
