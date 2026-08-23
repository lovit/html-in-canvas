// 15. 문서 사이 전환.
//
// 11 에서 iframe 을 통째로 그렸다. 여기서는 그 문서를 다른 문서로 바꾸는 순간을 다룬다.
//
// 재료는 두 가지다.
//   1. captureElementImage() 로 뜬 스냅샷은 원본이 바뀌어도 얼어 있다
//   2. 얼린 그림과 살아 있는 요소를 한 프레임에 함께 그릴 수 있다
// 둘을 겹치면 프레임워크 없이 View Transition 을 손으로 만들 수 있다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const PAGES = ['a', 'b', 'c'];
const FRAME_X = 200;
const FRAME_Y = 20;
const FRAME_W = 360;
const FRAME_H = 440;

const stage = document.querySelector('#stage');
const frame = document.querySelector('#frame');
const durationInput = document.querySelector('#duration');
const metrics = {
  current: document.querySelector('#m-current'),
  frozen: document.querySelector('#m-frozen'),
  frozenClock: document.querySelector('#m-frozen-clock'),
  liveClock: document.querySelector('#m-live-clock'),
  paints: document.querySelector('#m-paints'),
};

let index = 0;
let paintCount = 0;

/** 전환 중에만 값이 있다. 끝나면 close() 하고 null 로 되돌린다. */
let frozen = null;
let transition = null;

/** paint 안에서만 스냅샷을 뜰 수 있으므로, 눌린 것을 여기 적어 두고 다음 paint 에서 처리한다. */
let pending = null;

if (ensureSupport()) {
  start();
}

function start() {
  stage.layoutSubtree = true;
  stage.addEventListener('paint', guardPaint(onPaint));
  stage.requestPaint();

  document.querySelector('#next').addEventListener('click', () => request(1));
  document.querySelector('#prev').addEventListener('click', () => request(-1));
  durationInput.addEventListener('input', showDuration);

  showDuration();
  readLiveClock();
}

/** 전환을 예약한다. 실제 스냅샷은 다음 paint 안에서 뜬다. */
function request(direction) {
  if (transition || pending) return; // 도는 중에 또 누르면 무시한다
  pending = { direction };
  stage.requestPaint();
}

function onPaint() {
  paintCount += 1;
  metrics.paints.textContent = String(paintCount);

  if (pending) {
    const { direction } = pending;
    pending = null;
    freezeAndGo(direction);
  }

  draw();
}

/**
 * 지금 문서를 얼리고 다음 문서로 보낸다.
 *
 * captureElementImage() 는 paint 안에서만 부를 수 있다. 이 함수는 onPaint 에서만 불린다.
 */
function freezeAndGo(direction) {
  frozen = stage.captureElementImage(frame);
  metrics.frozen.textContent = `살아 있음 (${frozen.width}×${frozen.height} 디바이스 픽셀)`;
  metrics.frozenClock.textContent = readClock() ?? '—';

  index = (index + direction + PAGES.length) % PAGES.length;
  metrics.current.textContent = PAGES[index].toUpperCase();

  // 새 문서가 다 그려진 다음에 전환을 시작해야 첫 프레임이 빈 종이가 되지 않는다.
  frame.addEventListener(
    'load',
    () => {
      transition = {
        direction,
        started: performance.now(),
        duration: Number(durationInput.value),
        mode: document.querySelector('input[name="mode"]:checked').value,
      };
      requestAnimationFrame(step);
    },
    { once: true },
  );
  frame.src = `src/page-${PAGES[index]}.html`;
}

/** 전환이 도는 동안 매 프레임 다시 그리라고 시킨다. 10 에서 쓴 구조 그대로다. */
function step() {
  if (!transition) return;
  stage.requestPaint();
  requestAnimationFrame(step);
}

function draw() {
  ctx().clearRect(0, 0, stage.width, stage.height);

  if (!transition) {
    drawPage(frame, FRAME_X, FRAME_Y, FRAME_W, FRAME_H, 1, true);
    return;
  }

  const elapsed = performance.now() - transition.started;
  const t = ease(Math.min(1, elapsed / transition.duration));

  if (transition.mode === 'push') drawPush(t);
  else if (transition.mode === 'zoom') drawZoom(t);
  else drawFade(t);

  if (elapsed >= transition.duration) finish();
}

/** 크로스페이드. 같은 자리에서 하나는 사라지고 하나는 나타난다. */
function drawFade(t) {
  drawPage(frozen, FRAME_X, FRAME_Y, FRAME_W, FRAME_H, 1 - t, false);
  drawPage(frame, FRAME_X, FRAME_Y, FRAME_W, FRAME_H, t, true);
}

/** 밀어내기. 옛 문서가 나가고 새 문서가 그 자리로 들어온다. */
function drawPush(t) {
  const shift = (FRAME_W + 80) * transition.direction;
  drawPage(frozen, FRAME_X - shift * t, FRAME_Y, FRAME_W, FRAME_H, 1, false);
  drawPage(frame, FRAME_X + shift * (1 - t), FRAME_Y, FRAME_W, FRAME_H, 1, true);
}

/** 확대. 옛 문서는 커지면서 흐려지고 새 문서는 제 크기로 자란다. */
function drawZoom(t) {
  drawScaled(frozen, 1 + 0.2 * t, 1 - t, false);
  drawScaled(frame, 0.86 + 0.14 * t, t, true);
}

function drawScaled(target, scale, alpha, isLive) {
  const width = FRAME_W * scale;
  const height = FRAME_H * scale;
  const x = FRAME_X + (FRAME_W - width) / 2;
  const y = FRAME_Y + (FRAME_H - height) / 2;
  drawPage(target, x, y, width, height, alpha, isLive);
}

/**
 * 종이 한 장을 그린다. target 은 살아 있는 iframe 일 수도, 얼린 ElementImage 일 수도 있다.
 * 부르는 쪽에서는 둘을 구별하지 않는다. 같은 drawElementImage() 로 그려진다.
 *
 * isLive 인 쪽만 반환 행렬을 style.transform 에 되먹인다. 그래야 그림이 있는 자리에서
 * 클릭과 포커스가 잡힌다. 03 에서 배운 것이다.
 */
function drawPage(target, x, y, width, height, alpha, isLive) {
  if (alpha <= 0) return;

  const context = ctx();
  backdrop(x, y, width, height, alpha);

  context.globalAlpha = alpha;
  const matrix = context.drawElementImage(target, x, y, width, height);
  context.globalAlpha = 1;

  if (isLive) frame.style.transform = matrix.toString();
}

/** 종이 밑에 깔리는 그림자. 캔버스가 하는 일이라 문서는 이것을 모른다. */
function backdrop(x, y, width, height, alpha) {
  const context = ctx();
  context.save();
  context.globalAlpha = alpha * 0.4;
  context.fillStyle = '#020617';
  context.beginPath();
  context.roundRect(x + 8, y + 12, width, height, 12);
  context.fill();
  context.restore();
}

function finish() {
  transition = null;

  // 다 쓴 스냅샷은 놓아준다. 놓아주면 width 가 0 이 되고 다시 그릴 수 없다.
  frozen.close();
  metrics.frozen.textContent = `닫힘 (width ${frozen.width})`;
  frozen = null;

  stage.requestPaint();
}

/** 3차 ease-out. 시작은 빠르고 끝은 부드럽다. */
function ease(t) {
  return 1 - (1 - t) ** 3;
}

function ctx() {
  return stage.getContext('2d');
}

function readClock() {
  return frame.contentDocument?.getElementById('clock')?.textContent;
}

/** 안쪽 문서의 시계를 읽어 바깥에도 보여 준다. 같은 출처라서 읽을 수 있다. */
function readLiveClock() {
  setInterval(() => {
    const value = readClock();
    metrics.liveClock.textContent = value ? `${value}초` : '—';
  }, 150);
}

function showDuration() {
  document.querySelector('output[for="duration"]').textContent = `${durationInput.value}ms`;
}
