// 08. OffscreenCanvas 워커 — 스냅샷을 떠서 워커로 넘긴다.
//
// 지금까지는 그리는 쪽과 그려지는 쪽이 같은 스레드였다. 여기서는 나눈다.
// 메인 스레드는 스냅샷만 뜨고, 합성은 워커가 한다.
//
// 알아 둘 제약이 하나 있다. ElementImage 는 그것을 뜬 캔버스에만 그릴 수 있다.
// 그래서 제어권을 워커에 넘길 캔버스와 자식을 담고 있는 캔버스가 같아야 한다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const stage = document.querySelector('#stage');
const cards = Array.from(stage.querySelectorAll('.card'));
const swayInput = document.querySelector('#sway');
const status = document.querySelector('#status');
const mainFrames = document.querySelector('#main-frames');
const sentCount = document.querySelector('#sent');

const SAMPLES = [
  ['스냅샷', '전송', '합성', '독립'],
  ['한 장', '넘기고', '워커가', '그린다'],
  ['소유권', '이전', 'transferable', 'close()'],
];

let sampleIndex = 0;
let sent = 0;
let frames = 0;

if (ensureSupport()) {
  start();
}

function start() {
  const worker = new Worker(new URL('./worker.js', import.meta.url));

  // 자식을 레이아웃 대상으로 편입한 다음에야 스냅샷을 뜰 수 있다.
  stage.layoutSubtree = true;

  // 제어권을 워커에 넘긴다. 이 순간부터 메인 스레드는 이 캔버스에 직접 그릴 수 없다.
  // 그래도 자식은 DOM 에 그대로 남고 paint 이벤트도 여기로 온다.
  const offscreen = stage.transferControlToOffscreen();
  worker.postMessage({ type: 'canvas', canvas: offscreen }, [offscreen]);

  worker.addEventListener('message', (event) => {
    if (event.data.type === 'ready') status.textContent = '워커가 그리는 중입니다.';
  });

  // 워커 스크립트를 못 불러오면 조용히 빈 캔버스만 남는다. 알아차릴 수 있게 해 둔다.
  worker.addEventListener('error', (event) => {
    status.textContent = `워커를 실행하지 못했습니다: ${event.message}`;
  });

  stage.addEventListener(
    'paint',
    guardPaint((event) => {
      const changed = Array.from(event.changedElements ?? []);
      // 처음에는 changedElements 가 전부를 담고 있다. 이후에는 바뀐 카드만 온다.
      const targets = changed.length > 0 ? changed : cards;
      for (const card of targets) sendSnapshot(worker, card);
    }),
  );
  stage.requestPaint();

  swayInput.addEventListener('input', () => {
    document.querySelector('output[for="sway"]').textContent = swayInput.value;
    worker.postMessage({ type: 'sway', value: Number(swayInput.value) / 100 });
  });

  document.querySelector('#swap').addEventListener('click', swapSample);
  document.querySelector('#block').addEventListener('click', blockMainThread);

  document.querySelector('output[for="sway"]').textContent = swayInput.value;
  countMainFrames();
}

/** 카드 한 장을 스냅샷으로 떠서 워커에 넘긴다. 반드시 paint 안에서 불러야 한다. */
function sendSnapshot(worker, card) {
  const index = cards.indexOf(card);
  if (index < 0) return;

  const image = stage.captureElementImage(card);
  // 두 번째 인자가 transfer 목록이다. 복사가 아니라 소유권이 넘어간다.
  worker.postMessage({ type: 'image', index, image }, [image]);

  sent += 1;
  sentCount.textContent = String(sent);
}

/** 메인 스레드를 통째로 붙잡는다. DOM 갱신도 이벤트 처리도 이 동안 멈춘다. */
function blockMainThread() {
  status.textContent = '메인 스레드를 2초 동안 막습니다…';
  const until = performance.now() + 2000;
  while (performance.now() < until) {
    // 일부러 아무것도 하지 않고 붙잡고 있는다.
  }
  status.textContent = '메인 스레드가 풀렸습니다. 캔버스 안 숫자를 확인해 보세요.';
}

function swapSample() {
  sampleIndex = (sampleIndex + 1) % SAMPLES.length;
  cards.forEach((card, index) => {
    card.querySelector('.headline').textContent = SAMPLES[sampleIndex][index];
  });
  // 내용이 바뀌었으니 paint 가 오고, 그 안에서 바뀐 카드만 다시 뜬다.
}

function countMainFrames() {
  requestAnimationFrame(function tick() {
    frames += 1;
    mainFrames.textContent = String(frames);
    requestAnimationFrame(tick);
  });
}
