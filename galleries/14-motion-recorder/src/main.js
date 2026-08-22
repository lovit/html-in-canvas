// 14. HTML 모션그래픽 녹화기.
//
// 확인한 것 두 가지를 붙였다.
//   1. 그린 엘리먼트 안의 CSS 애니메이션이 paint 를 매 프레임 부른다
//   2. 그렇게 갱신되는 캔버스는 captureStream() 으로 영상이 된다
//
// 그래서 이 파일에는 애니메이션 루프가 없다. 타임라인은 CSS 가 들고 있고
// JavaScript 는 녹화를 시작하고 멈추는 일만 한다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const CARD_WIDTH = 640;
const CARD_HEIGHT = 360;

const stage = document.querySelector('#stage');
const card = document.querySelector('#card');
const result = document.querySelector('#result');
const playback = document.querySelector('#playback');
const resultMeta = document.querySelector('#result-meta');
const download = document.querySelector('#download');
const recordButton = document.querySelector('#record');

const fields = {
  eyebrow: document.querySelector('#eyebrow'),
  title: document.querySelector('#title'),
  subtitle: document.querySelector('#subtitle'),
};
const views = {
  eyebrow: document.querySelector('#v-eyebrow'),
  title: document.querySelector('#v-title'),
  subtitle: document.querySelector('#v-subtitle'),
};

const themeSelect = document.querySelector('#theme');
const resolutionSelect = document.querySelector('#resolution');
const fpsSelect = document.querySelector('#fps');
const durationSelect = document.querySelector('#duration');
const metrics = {
  paints: document.querySelector('#m-paints'),
  status: document.querySelector('#m-status'),
};

let paintCount = 0;
let recording = false;
let objectUrl = null;

await document.fonts.ready;

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = stage.getContext('2d');

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint(() => {
      paintCount += 1;
      ctx.reset();
      // 카드는 640×360 이고 캔버스는 출력 해상도다. 그 크기에 맞춰 늘려 그린다.
      ctx.drawElementImage(card, 0, 0, stage.width, stage.height);
      metrics.paints.textContent = String(paintCount);
    }),
  );

  applyResolution();

  for (const [name, input] of Object.entries(fields)) {
    input.addEventListener('input', () => {
      views[name].textContent = input.value;
    });
  }

  themeSelect.addEventListener('change', () => {
    card.dataset.theme = themeSelect.value;
  });
  resolutionSelect.addEventListener('change', applyResolution);

  document.querySelector('#replay').addEventListener('click', restartAnimations);
  recordButton.addEventListener('click', record);
}

function applyResolution() {
  const [width, height] = resolutionSelect.value.split('x').map(Number);
  stage.width = width;
  stage.height = height;
  // width/height 를 바꾸면 컨텍스트가 초기화된다. 다시 그려 달라고 요청한다.
  stage.requestPaint();
}

/**
 * 애니메이션을 처음부터 다시 돌린다.
 * animation 을 잠깐 none 으로 두고 레이아웃을 강제로 다시 계산시키는 오래된 방법이다.
 */
function restartAnimations() {
  const animated = card.querySelectorAll('.bg, .eyebrow, h2, .subtitle, .accent, .badge');
  for (const element of animated) element.style.animation = 'none';
  void card.offsetWidth;
  for (const element of animated) element.style.animation = '';
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

async function record() {
  if (recording) return;
  if (typeof MediaRecorder !== 'function' || typeof stage.captureStream !== 'function') {
    metrics.status.textContent = '이 브라우저는 MediaRecorder 를 지원하지 않습니다';
    return;
  }

  recording = true;
  recordButton.disabled = true;
  result.hidden = true;

  const fps = Number(fpsSelect.value);
  const seconds = Number(durationSelect.value);
  const mimeType = pickMimeType();

  // 녹화와 애니메이션의 시작을 맞춘다. 그래야 첫 프레임부터 담긴다.
  restartAnimations();

  const stream = stage.captureStream(fps);
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const startedAt = performance.now();
  recorder.start();
  metrics.status.textContent = `녹화 중… ${seconds}초`;

  await new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true });
    setTimeout(() => recorder.stop(), seconds * 1000);
  });

  const elapsed = (performance.now() - startedAt) / 1000;
  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });

  if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);

  playback.src = objectUrl;
  download.href = objectUrl;
  download.download = `motion-${stage.width}x${stage.height}.webm`;
  resultMeta.textContent = `${stage.width}×${stage.height} · ${fps}fps · ${elapsed.toFixed(1)}초 · ${Math.round(blob.size / 1024)} KB · ${mimeType || '기본 코덱'}`;
  result.hidden = false;

  metrics.status.textContent = '녹화 완료';
  recording = false;
  recordButton.disabled = false;
}
