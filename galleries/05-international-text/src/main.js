// 05. 다국어 텍스트 — 레이아웃 엔진이 대신해 주는 일.
//
// 왼쪽 캔버스는 HTML 표본을 그대로 그리고, 오른쪽 캔버스는 같은 문자열을
// fillText() 로 한 번 찍는다. 글리프를 그리는 일은 어느 쪽이든 폰트가 한다.
// 갈리는 것은 줄바꿈, 방향, 루비처럼 글자 위에 얹히는 층이다.

import { ensureSupport } from '../../_shared/support.js';

const SPECIMEN_FONT = "17px system-ui, 'Apple SD Gothic Neo', sans-serif";

// 폰트가 준비되기 전에 그리면 폴백 폰트로 재는 값이 남는다. 특히 폭 계산이 어긋난다.
await document.fonts.ready;

drawAllWithFillText();

if (ensureSupport()) {
  drawAllWithElement();
}

/** 왼쪽: HTML 표본을 그대로 그린다. */
function drawAllWithElement() {
  for (const canvas of document.querySelectorAll('.html-canvas')) {
    const specimen = canvas.querySelector('.specimen');
    const ctx = canvas.getContext('2d');

    canvas.layoutSubtree = true;
    canvas.addEventListener('paint', () => {
      ctx.reset();
      ctx.drawElementImage(specimen, 12, 12);
    });
    canvas.requestPaint();
  }
}

/** 오른쪽: 같은 문자열을 캔버스 텍스트 API 로 찍는다. 줄바꿈도 방향 처리도 없다. */
function drawAllWithFillText() {
  for (const canvas of document.querySelectorAll('.text-canvas')) {
    const ctx = canvas.getContext('2d');

    ctx.reset();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(12, 12, 396, canvas.height - 24, 8);
    ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.font = SPECIMEN_FONT;
    ctx.textBaseline = 'top';
    // 한 번만 찍는다. 캔버스 폭을 넘으면 그냥 잘린다.
    ctx.fillText(canvas.dataset.text ?? '', 26, 26);
  }
}
