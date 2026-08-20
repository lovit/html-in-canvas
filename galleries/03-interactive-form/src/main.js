// 03. 인터랙티브 폼 — 그린 위치와 DOM 위치를 맞춘다.
//
// 02 에서 소스 엘리먼트의 CSS transform 이 그리기에서 무시되는 것을 봤다.
// 그 자리가 비어 있는 이유가 여기 있다. 그린 위치를 알려 주는 행렬을 거기에 끼우면
// 클릭, 포커스, 스크린리더가 전부 그림을 따라온다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const stage = document.querySelector('#stage');
const panel = document.querySelector('#panel');
const syncToggle = document.querySelector('#sync');
const rotInput = document.querySelector('#rot');
const sclInput = document.querySelector('#scl');
const log = document.querySelector('#log');

// 캔버스 안에서 폼을 그릴 위치
const DRAW_X = 120;
const DRAW_Y = 60;

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = stage.getContext('2d');

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint(() => draw(ctx)),
  );
  stage.requestPaint();

  for (const input of [rotInput, sclInput]) {
    input.addEventListener('input', () => {
      syncOutputs();
      stage.requestPaint();
    });
  }

  syncToggle.addEventListener('change', () => {
    stage.requestPaint();
    log.textContent = syncToggle.checked
      ? '동기화 켜짐 — 보이는 곳을 누르면 그 컨트롤이 반응한다.'
      : '동기화 꺼짐 — 폼은 캔버스 왼쪽 위에 그대로 있다. 그림이 있는 곳을 눌러도 반응하지 않는다.';
  });

  // 폼이 실제로 살아 있다는 것을 보여 주는 로그
  panel.addEventListener('focusin', (event) => report('포커스', event.target));
  panel.addEventListener('input', (event) => report('입력', event.target));
  panel.addEventListener('click', (event) => {
    if (event.target.id === 'submit') {
      const data = new FormData(panel);
      log.textContent = `주문 접수: ${data.get('name')} / ${data.get('city')} / 빠른 배송 ${data.get('fast') ? '예' : '아니오'}`;
      return;
    }
    report('클릭', event.target);
  });

  syncOutputs();
}

function draw(ctx) {
  ctx.reset();

  const cx = stage.width / 2;
  const cy = stage.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((Number(rotInput.value) * Math.PI) / 180);
  ctx.scale(Number(sclInput.value) / 100, Number(sclInput.value) / 100);
  ctx.translate(-cx, -cy);

  // 반환값은 "이 엘리먼트를 그린 자리로 옮기려면 이렇게 하라" 는 행렬이다.
  const matrix = ctx.drawElementImage(panel, DRAW_X, DRAW_Y);

  // 이 한 줄이 이 예제의 전부다. 소스의 transform 은 그리기에 영향을 주지 않으므로
  // 여기에 행렬을 넣어도 그림이 흔들리지 않는다. 히트 테스트와 접근성만 따라 움직인다.
  panel.style.transform = syncToggle.checked ? matrix.toString() : 'none';
}

function report(kind, target) {
  const name = target.id || target.tagName.toLowerCase();
  const value = target.type === 'checkbox' ? String(target.checked) : (target.value ?? '');
  log.textContent = `${kind}: ${name}${value === '' ? '' : ` = ${value}`}`;
}

function syncOutputs() {
  document.querySelector('output[for="rot"]').textContent = `${rotInput.value}도`;
  document.querySelector('output[for="scl"]').textContent = `${sclInput.value}%`;
}
