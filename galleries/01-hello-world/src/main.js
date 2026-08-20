// 01. Hello World — drawElementImage() 로 HTML 을 캔버스에 그린다.
//
// 이 예제에서 실제로 새로 배우는 줄은 세 개뿐이다.
//   canvas.layoutSubtree = true
//   ctx.drawElementImage(element, x, y)
//   canvas.requestPaint()
// 나머지는 비교용 fillText 코드와 화면 장식이다.

import { ensureSupport } from '../../_shared/support.js';

const stage = document.querySelector('#stage');
const card = document.querySelector('#card');
const plain = document.querySelector('#plain');
const cardTitle = document.querySelector('#card-title');
const cardBody = document.querySelector('#card-body');
const swapButton = document.querySelector('#swap');
const status = document.querySelector('#status');

const SAMPLES = [
  {
    title: '안녕하세요 👋',
    body: '이 카드는 <canvas> 안에 들어 있는 평범한 div 입니다. 줄바꿈도, 이모지도, 그림자도 CSS 가 알아서 합니다.',
  },
  {
    title: 'مرحبا 안녕 Hello',
    body: '아랍어와 한글과 라틴 문자가 한 문단에 섞여도 폰트 폴백과 양방향 처리가 그대로 동작합니다.',
  },
  {
    title: '긴 문단도 접힙니다',
    body: '캔버스 텍스트 API 로 이 문장을 그리려면 글자 폭을 재고 어디서 끊을지 직접 정해야 합니다. 한국어는 단어 사이 공백이 드물어서 그 계산이 특히 성가십니다.',
  },
];

let sampleIndex = 0;
let paintCount = 0;

// 오른쪽 비교용 캔버스는 이 API 와 무관하므로 지원 여부와 상관없이 그린다.
drawWithFillText();
swapButton.addEventListener('click', swapSample);

if (ensureSupport()) {
  start();
}

function start() {
  const ctx = stage.getContext('2d');

  // 이걸 켜야 canvas 자식이 레이아웃 대상이 된다. 끄면 측정도 그리기도 되지 않는다.
  stage.layoutSubtree = true;

  // 첫 스냅샷이 찍히기 전에 그리면 예외가 난다. 그래서 그리기는 paint 안에서만 한다.
  stage.addEventListener('paint', () => {
    ctx.reset();
    ctx.drawElementImage(card, 30, 25);

    paintCount += 1;
    status.textContent = `paint 이벤트 ${paintCount}회`;
  });

  // 첫 프레임을 요청한다. 이후로는 자식이 바뀔 때마다 paint 가 알아서 온다.
  stage.requestPaint();
}

function swapSample() {
  sampleIndex = (sampleIndex + 1) % SAMPLES.length;
  const sample = SAMPLES[sampleIndex];

  cardTitle.textContent = sample.title;
  cardBody.textContent = sample.body;

  // 왼쪽 캔버스는 paint 이벤트가 알아서 다시 그린다. 오른쪽은 우리가 직접 그려야 한다.
  drawWithFillText();
}

/** 같은 내용을 캔버스 텍스트 API 로 그린다. 비교 대상이다. */
function drawWithFillText() {
  const ctx = plain.getContext('2d');
  const sample = SAMPLES[sampleIndex];

  ctx.reset();

  // 배경과 둥근 모서리는 직접 그려야 한다. 그라디언트도 직접 만든다.
  const gradient = ctx.createLinearGradient(30, 25, 410, 205);
  gradient.addColorStop(0, '#1d4ed8');
  gradient.addColorStop(1, '#7c3aed');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(30, 25, 380, 180, 14);
  ctx.fill();

  ctx.fillStyle = 'rgb(255 255 255 / 88%)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('HTML IN CANVAS', 58, 61);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(sample.title, 58, 97);

  // 줄바꿈이 없다. 한 줄로 쭉 나가다가 캔버스 밖에서 잘린다.
  ctx.fillStyle = 'rgb(248 250 252 / 88%)';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(sample.body, 58, 133);
}
