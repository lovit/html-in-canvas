// 17. 캔버스 위의 미니 브라우저.
//
// 03 에서 폼이 눌리게 했고, 11 에서 문서를 곡면에 올렸다. 둘을 합치려 하면 벽에 부딪힌다.
//
// drawElementImage() 가 돌려주는 DOMMatrix 는 CSS transform 에 그대로 꽂힌다.
// 그런데 CSS transform 은 아핀 변환만 표현한다. 곡면처럼 아핀이 아닌 왜곡은
// 하나의 행렬로 적을 수 없고, 따라서 히트 테스트를 맞출 수 없다.
//
// 그래서 두 모드를 두고, 곡면 쪽은 보기 전용이라고 화면에 적는다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

/** 캔버스가 보여 주는 창의 크기. 문서 전체가 아니라 이만큼만 잘라 그린다. */
const VIEW_W = 360;
const VIEW_H = 300;

/** 곡면 모드에서 문서를 자를 세로 조각 수. 많을수록 매끄럽고 그리는 횟수가 는다. */
const STRIPS = 120;
const SPREAD = 1.15; // 원기둥에 감기는 각도(라디안)
const FOCAL = 900; // 원근. 작을수록 세게 휜다

const stage = document.querySelector('#stage');
const frame = document.querySelector('#frame');
const address = document.querySelector('#address');
const inputs = {
  rotate: document.querySelector('#rotate'),
  zoom: document.querySelector('#zoom'),
  skew: document.querySelector('#skew'),
  scroll: document.querySelector('#scroll'),
};
const metrics = {
  docHeight: document.querySelector('#m-docheight'),
  history: document.querySelector('#m-history'),
  hits: document.querySelector('#m-hits'),
  error: document.querySelector('#m-error'),
  paints: document.querySelector('#m-paints'),
};

const ctx = stage.getContext('2d');
const centerX = stage.width / 2;
const centerY = stage.height / 2;

let mode = 'affine';
let docHeight = VIEW_H;
let paintCount = 0;

/** drawElementImage() 가 마지막으로 돌려준 행렬. 문서 좌표를 캔버스 좌표로 옮길 때 쓴다. */
let lastMatrix = null;

/**
 * 이 브라우저의 히스토리.
 *
 * iframe 의 history 는 부모 문서의 세션 히스토리와 하나로 묶여 있다.
 * 그래서 frame.contentWindow.history.back() 을 부르면 iframe 이 아니라
 * 페이지 전체가 뒤로 갈 수 있다. 브라우저처럼 굴려면 자기 스택을 들고 있어야 한다.
 */
const trail = ['src/site-home.html'];
let trailIndex = 0;

if (ensureSupport()) {
  start();
}

function start() {
  stage.layoutSubtree = true;
  stage.addEventListener('paint', guardPaint(onPaint));

  frame.addEventListener('load', onFrameLoad);
  wireControls();

  // 마크업으로 들어간 첫 문서는 이 스크립트가 붙기 전에 이미 로드됐을 수 있다.
  if (frame.contentDocument?.readyState === 'complete') onFrameLoad();
  stage.requestPaint();
}

/* 브라우저 껍데기 --------------------------------------------------------- */

function wireControls() {
  document.querySelector('#back').addEventListener('click', () => step(-1));
  document.querySelector('#forward').addEventListener('click', () => step(1));
  document.querySelector('#reload').addEventListener('click', () => go(trail[trailIndex]));

  for (const input of Object.values(inputs)) {
    input.addEventListener('input', () => {
      showOutputs();
      stage.requestPaint();
    });
  }

  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      mode = radio.value;
      document.querySelector('#mode-note').textContent =
        mode === 'affine'
          ? '회전·확대·기울이기까지는 클릭이 그림을 따라갑니다.'
          : '조각마다 다르게 그려서 하나의 행렬로 적을 수 없습니다. 클릭은 받지 않습니다.';
      metrics.hits.textContent = '—';
      stage.requestPaint();
    });
  }

  document.querySelector('#check').addEventListener('click', checkLinks);
  showOutputs();
}

/**
 * 문서 안의 링크를 가로챈다.
 *
 * 그냥 두면 링크가 iframe 을 이동시키고, 그 기록이 부모의 세션 히스토리에 섞인다.
 * 같은 출처라서 안쪽 문서에 리스너를 달 수 있으니, 이동은 우리 스택으로 돌린다.
 */
function interceptLinks(doc) {
  doc.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    event.preventDefault();
    visit(link.getAttribute('href'));
  });
}

/** 새 주소로 간다. 스택의 뒤쪽은 잘라 낸다. 브라우저의 뒤로 가기와 같은 규칙이다. */
function visit(href) {
  const url = href.startsWith('src/') ? href : `src/${href}`;
  trail.length = trailIndex + 1;
  trail.push(url);
  trailIndex = trail.length - 1;
  go(url);
}

/** 스택 안에서 앞뒤로 옮긴다. */
function step(direction) {
  const next = trailIndex + direction;
  if (next < 0 || next >= trail.length) return;
  trailIndex = next;
  go(trail[trailIndex]);
}

/**
 * 실제 이동. replace() 로 바꿔서 부모의 세션 히스토리를 늘리지 않는다.
 * 이 브라우저의 뒤로 가기는 위의 trail 이 담당한다.
 */
function go(url) {
  frame.contentWindow.location.replace(new URL(url, document.baseURI).href);
}

/**
 * 문서가 바뀌면 프레임을 문서 높이만큼 키운다.
 *
 * 프레임보다 문서가 길면 스크롤이 생기고, 스크롤이 생긴 iframe 은 지금 Chrome 에서
 * 캔버스에 그려지지 않는다. docs/known-issues.md 를 보라. 그래서 스크롤은
 * 문서에 맡기지 않고 캔버스가 창을 잘라 내는 방식으로 대신한다.
 */
function onFrameLoad() {
  const doc = frame.contentDocument;
  interceptLinks(doc);
  // 먼저 창 높이로 되돌리고 잰다. 프레임이 크면 scrollHeight 가 그 크기까지 부풀어
  // 문서가 실제로 얼마나 긴지 알 수 없다.
  frame.height = String(VIEW_H);
  docHeight = Math.max(VIEW_H, doc.documentElement.scrollHeight);
  frame.height = String(docHeight);

  address.value = trail[trailIndex];
  metrics.docHeight.textContent = `${docHeight}px`;
  metrics.history.textContent = `${trailIndex + 1}/${trail.length} (브라우저 세션 ${frame.contentWindow.history.length})`;
  metrics.hits.textContent = '—';

  inputs.scroll.max = String(Math.max(0, docHeight - VIEW_H));
  if (Number(inputs.scroll.value) > Number(inputs.scroll.max))
    inputs.scroll.value = inputs.scroll.max;

  showOutputs();
  stage.requestPaint();
}

/* 그리기 ------------------------------------------------------------------ */

function onPaint() {
  paintCount += 1;
  metrics.paints.textContent = String(paintCount);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, stage.width, stage.height);

  if (mode === 'affine') drawAffine();
  else drawCurved();
}

/**
 * 아핀 모드. 회전·확대·기울이기를 캔버스 변환으로 걸고 창 하나를 그린다.
 * 반환 행렬에는 캔버스 변환과 잘라 낸 위치가 모두 들어 있다.
 */
function drawAffine() {
  const scrollY = Number(inputs.scroll.value);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((Number(inputs.rotate.value) * Math.PI) / 180);
  ctx.scale(Number(inputs.zoom.value) / 100, Number(inputs.zoom.value) / 100);
  ctx.transform(1, 0, Math.tan((Number(inputs.skew.value) * Math.PI) / 180), 1, 0, 0);
  ctx.translate(-VIEW_W / 2, -VIEW_H / 2);

  shadow(0, 0, VIEW_W, VIEW_H);
  const matrix = ctx.drawElementImage(frame, 0, scrollY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  ctx.restore();

  // 이 한 줄이 클릭을 그림에 붙인다.
  lastMatrix = matrix;
  frame.style.transform = matrix.toString();
  frame.style.pointerEvents = 'auto';

  metrics.error.textContent = '0px (아핀이라 오차가 없다)';
}

/**
 * 곡면 모드. 문서를 세로로 잘라 조각마다 다른 자리·다른 크기로 그린다.
 * 조각 하나하나는 아핀이지만 전체로는 아니다.
 */
function drawCurved() {
  const scrollY = Number(inputs.scroll.value);
  const sliceWidth = VIEW_W / STRIPS;

  for (let i = 0; i < STRIPS; i += 1) {
    const left = project(i / STRIPS, 0);
    const right = project((i + 1) / STRIPS, 0);
    const bottom = project(i / STRIPS, 1);

    const width = right.x - left.x;
    const height = bottom.y - left.y;
    if (width <= 0 || height <= 0) continue;

    ctx.drawElementImage(
      frame,
      i * sliceWidth,
      scrollY,
      sliceWidth,
      VIEW_H,
      left.x,
      left.y,
      width + 0.6, // 조각 사이에 실틈이 보이지 않게 아주 조금 겹친다
      height,
    );

    // 원기둥이라는 느낌은 음영이 만든다. 가장자리로 갈수록 어둡게 덮는다.
    const angle = ((i + 0.5) / STRIPS - 0.5) * SPREAD;
    ctx.save();
    ctx.globalAlpha = 0.55 * (1 - Math.cos(angle) ** 1.5);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(left.x, left.y, width + 0.6, height);
    ctx.restore();
  }

  // 그림이 아핀이 아니므로 히트 테스트를 맞출 방법이 없다. 아예 빼 둔다.
  // 10 에서 배운 것: 그리지 않은(맞출 수 없는) 요소는 히트 테스트에서 빼야 한다.
  lastMatrix = null;
  frame.style.transform = 'none';
  frame.style.pointerEvents = 'none';

  const { max, at } = affineError();
  metrics.error.textContent = `최대 ${max.toFixed(1)}px (가로 ${(at.u * 100).toFixed(0)}%, 세로 ${(at.v * 100).toFixed(0)}% 지점)`;
}

/** 문서 위의 상대 좌표 (u, v) 가 곡면 모드에서 화면 어디로 가는지. */
function project(u, v) {
  const angle = (u - 0.5) * SPREAD;
  const radius = VIEW_W / SPREAD;
  const depth = (1 - Math.cos(angle)) * radius;
  const perspective = FOCAL / (FOCAL + depth);

  return {
    x: centerX + Math.sin(angle) * radius * perspective,
    y: centerY + (v - 0.5) * VIEW_H * perspective,
  };
}

/**
 * 곡면을 아핀 하나로 흉내 내면 얼마나 어긋나는지 잰다.
 *
 * 세 귀퉁이(왼위, 오른위, 왼아래)를 정확히 맞추는 아핀을 만든 다음,
 * 문서 위 여러 점에서 실제 자리와 얼마나 벌어지는지 본다. 이 값이 0 이 아니면
 * 하나의 CSS transform 으로는 적을 수 없다는 뜻이다.
 */
function affineError() {
  const origin = project(0, 0);
  const alongX = project(1, 0);
  const alongY = project(0, 1);

  let max = 0;
  let at = { u: 0, v: 0 };

  for (let iu = 0; iu <= 10; iu += 1) {
    for (let iv = 0; iv <= 10; iv += 1) {
      const u = iu / 10;
      const v = iv / 10;
      const real = project(u, v);
      const guess = {
        x: origin.x + u * (alongX.x - origin.x) + v * (alongY.x - origin.x),
        y: origin.y + u * (alongX.y - origin.y) + v * (alongY.y - origin.y),
      };
      const distance = Math.hypot(real.x - guess.x, real.y - guess.y);
      if (distance > max) {
        max = distance;
        at = { u, v };
      }
    }
  }

  return { max, at };
}

/** 종이 밑에 깔리는 그림자. 캔버스 좌표계 안에서 그린다. */
function shadow(x, y, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.roundRect(x + 6, y + 10, width, height, 10);
  ctx.fill();
  ctx.restore();
}

/* 히트 테스트 확인 --------------------------------------------------------- */

/**
 * 문서 안의 링크 세 개가 그려진 자리에서 실제로 잡히는지 확인한다.
 * elementFromPoint 가 iframe 을 돌려주면 그 자리를 안쪽 문서가 받는다는 뜻이다.
 */
function checkLinks() {
  const doc = frame.contentDocument;
  const links = [...doc.querySelectorAll('nav a')];

  if (!lastMatrix) {
    metrics.hits.textContent = `0/${links.length} (그림에 맞출 행렬이 없다)`;
    return;
  }

  let hit = 0;
  for (const link of links) {
    const rect = link.getBoundingClientRect();
    const inDocument = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    // 문서 좌표 → 캔버스 좌표 → 화면 좌표. 행렬이 첫 단계를 맡는다.
    const onCanvas = lastMatrix.transformPoint(new DOMPoint(inDocument.x, inDocument.y));
    const point = canvasToScreen(onCanvas);

    // 그 화면 좌표를 다시 문서 좌표로 되돌려, 정말 그 링크가 있는지 확인한다.
    const back = lastMatrix.inverse().transformPoint(new DOMPoint(onCanvas.x, onCanvas.y));
    const found =
      document.elementFromPoint(point.x, point.y) === frame && doc.elementFromPoint(back.x, back.y);

    if (found && (found === link || link.contains(found))) hit += 1;
  }

  metrics.hits.textContent =
    mode === 'affine' ? `${hit}/${links.length} 정확` : `${hit}/${links.length} (보기 전용)`;
}

/** 캔버스 비트맵 좌표를 화면(뷰포트) 좌표로 옮긴다. CSS 로 줄여 놨을 수 있다. */
function canvasToScreen(point) {
  const box = stage.getBoundingClientRect();
  return {
    x: box.left + point.x * (box.width / stage.width),
    y: box.top + point.y * (box.height / stage.height),
  };
}

function showOutputs() {
  document.querySelector('output[for="rotate"]').textContent = `${inputs.rotate.value}°`;
  document.querySelector('output[for="zoom"]').textContent = `${inputs.zoom.value}%`;
  document.querySelector('output[for="skew"]').textContent = `${inputs.skew.value}°`;
  document.querySelector('output[for="scroll"]').textContent = `${inputs.scroll.value}px`;
}
