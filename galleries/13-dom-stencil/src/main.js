// 13. DOM 을 스텐실로.
//
// 12 에서 캔버스 합성 모드가 drawElementImage() 에도 먹는 것을 봤다.
// 그 성질을 끝까지 밀면 HTML 레이아웃 자체를 마스크로 쓸 수 있다.
//
// 중요한 것은 마스크가 색이 아니라 알파로 일한다는 점이다.
// 배경이 불투명한 엘리먼트를 마스크로 쓰면 사각형 전체가 남는다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const DRAW_X = 30;
const DRAW_Y = 18;

const MODE_NOTES = {
  'source-in': '마스크 모양만 남기고 그 안을 채운 것으로 바꾼다. 마스크의 색은 사라진다.',
  'source-atop': '마스크가 있는 곳에만 채울 것을 덮는다. 마스크의 반투명한 부분이 비쳐 보인다.',
  'destination-out': '채울 것이 지우개가 된다. 겹치는 곳이 뚫린다.',
  'destination-over': '채울 것이 마스크 뒤로 들어간다. 마스크가 그대로 보인다.',
};

const stage = document.querySelector('#stage');
const modeNote = document.querySelector('#mode-note');

const masks = new Map(
  ['mask-text', 'mask-cards', 'mask-mixed'].map((id) => [id, document.querySelector(`#${id}`)]),
);

let maskId = 'mask-text';
let fillKind = 'gradient';
let mode = 'source-in';
let noisePattern = null;

/**
 * 채울 것은 여기에 먼저 그린다.
 *
 * 합성 모드를 켠 채로 도형을 여러 번 그리면 나중 것이 앞의 것을 지운다.
 * source-in 은 "겹치는 곳만 남기고 나머지는 지운다" 이므로, 원을 다섯 개 그리면
 * 마지막 원만 남는다. 그래서 채울 그림을 따로 완성한 다음 한 번만 합성한다.
 */
let fillLayer = null;
let fillLayerCtx = null;

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = stage.getContext('2d');
  fillLayer = new OffscreenCanvas(stage.width, stage.height);
  fillLayerCtx = fillLayer.getContext('2d');
  noisePattern = makeNoisePattern(fillLayerCtx);

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint(() => draw(ctx)),
  );
  stage.requestPaint();

  wireRadios('mask', (value) => {
    maskId = value;
  });
  wireRadios('fill', (value) => {
    fillKind = value;
  });
  wireRadios('mode', (value) => {
    mode = value;
    modeNote.textContent = MODE_NOTES[value];
  });

  modeNote.textContent = MODE_NOTES[mode];

  // 움직이는 도형을 고른 동안에는 매 프레임 다시 그려야 한다.
  requestAnimationFrame(function tick() {
    if (fillKind === 'shapes') stage.requestPaint();
    requestAnimationFrame(tick);
  });
}

function draw(ctx) {
  ctx.reset();

  // 1. 마스크를 먼저 그린다. 이 그림의 알파가 곧 스텐실이다.
  ctx.drawElementImage(masks.get(maskId), DRAW_X, DRAW_Y);

  // 2. 채울 것을 따로 완성한 다음 한 번만 합성한다.
  drawFill(fillLayerCtx);
  ctx.globalCompositeOperation = mode;
  ctx.drawImage(fillLayer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function drawFill(ctx) {
  ctx.clearRect(0, 0, stage.width, stage.height);

  if (fillKind === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, stage.width, stage.height);
    gradient.addColorStop(0, '#f472b6');
    gradient.addColorStop(0.5, '#c084fc');
    gradient.addColorStop(1, '#38bdf8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, stage.width, stage.height);
    return;
  }

  if (fillKind === 'noise') {
    ctx.fillStyle = noisePattern;
    ctx.fillRect(0, 0, stage.width, stage.height);
    return;
  }

  drawShapes(ctx);
}

/**
 * 원 몇 개가 천천히 도는 그림. 배경을 칠하지 않는 것이 중요하다.
 * 배경까지 칠하면 마스크 안이 그 색으로 꽉 차서 도형이 움직여도 티가 안 난다.
 */
function drawShapes(ctx) {
  const seconds = performance.now() / 1000;
  const palette = ['#f97316', '#22d3ee', '#a3e635', '#f43f5e', '#818cf8', '#facc15'];

  palette.forEach((color, index) => {
    const phase = seconds * 0.55 + index * 1.05;
    const x = stage.width / 2 + Math.cos(phase) * (200 + index * 22);
    const y = stage.height / 2 + Math.sin(phase * 1.4) * (95 + index * 9);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 78 + index * 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** 노이즈는 한 번만 만들어 패턴으로 재사용한다. 매 프레임 난수를 돌릴 이유가 없다. */
function makeNoisePattern(ctx) {
  const size = 160;
  const tile = new OffscreenCanvas(size, size);
  const tileCtx = tile.getContext('2d');
  const image = tileCtx.createImageData(size, size);

  for (let i = 0; i < image.data.length; i += 4) {
    const value = 40 + Math.floor(Math.random() * 215);
    image.data[i] = value;
    image.data[i + 1] = Math.floor(value * 0.75);
    image.data[i + 2] = 255 - value;
    image.data[i + 3] = 255;
  }
  tileCtx.putImageData(image, 0, 0);

  return ctx.createPattern(tile, 'repeat');
}

function wireRadios(name, onChange) {
  for (const radio of document.querySelectorAll(`input[name="${name}"]`)) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      onChange(radio.value);
      stage.requestPaint();
    });
  }
}
