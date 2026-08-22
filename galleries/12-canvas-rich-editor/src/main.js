// 12. 캔버스 리치텍스트 에디터.
//
// 03 에서 폼 컨트롤이 캔버스 안에서 동작하는 것을 봤다. contenteditable 도 마찬가지다.
// 다른 점은 편집되는 글자에 실시간으로 효과를 입힐 수 있다는 것이다.
//
// 확인해 보니 캔버스 2D 의 상태가 drawElementImage 에도 그대로 먹는다.
// filter, shadowBlur, shadowOffset, globalAlpha, globalCompositeOperation 전부.
// 그래서 "엘리먼트를 그린다" 를 "이미지를 그린다" 와 똑같이 다루면 된다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const DRAW_X = 40;
const DRAW_Y = 18;

/** 외곽선을 만들 때 실루엣을 밀어 낼 여덟 방향. */
const OUTLINE_DIRECTIONS = [
  [1, 0],
  [0.7, 0.7],
  [0, 1],
  [-0.7, 0.7],
  [-1, 0],
  [-0.7, -0.7],
  [0, -1],
  [0.7, -0.7],
];

const stage = document.querySelector('#stage');
const editor = document.querySelector('#editor');
const log = document.querySelector('#log');
const caretNote = document.querySelector('#caret-note');

const controls = {
  glowOn: document.querySelector('#glow-on'),
  glow: document.querySelector('#glow'),
  glowColor: document.querySelector('#glow-color'),
  outlineOn: document.querySelector('#outline-on'),
  outline: document.querySelector('#outline'),
  outlineColor: document.querySelector('#outline-color'),
  gradientOn: document.querySelector('#gradient-on'),
  blur: document.querySelector('#blur'),
};

let paintCount = 0;

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
      draw(ctx);
    }),
  );
  stage.requestPaint();

  // 슬라이더는 문서를 바꾸지 않으므로 paint 가 저절로 오지 않는다. 직접 부른다.
  for (const input of Object.values(controls)) {
    input.addEventListener('input', () => {
      syncOutputs();
      stage.requestPaint();
    });
  }

  for (const button of document.querySelectorAll('.toolbar button[data-command]')) {
    button.addEventListener('mousedown', (event) => {
      // 버튼을 눌러도 에디터에서 포커스가 빠지지 않게 한다
      event.preventDefault();
      document.execCommand(button.dataset.command, false);
      // execCommand 는 문서를 바꾸므로 paint 가 알아서 온다
    });
  }

  document.querySelector('#clear').addEventListener('click', () => {
    controls.glowOn.checked = false;
    controls.outlineOn.checked = false;
    controls.gradientOn.checked = false;
    controls.blur.value = '0';
    syncOutputs();
    stage.requestPaint();
  });

  editor.addEventListener('focus', () => {
    caretNote.textContent = '커서가 들어왔습니다. 타이핑해 보세요.';
  });
  editor.addEventListener('compositionstart', () => {
    caretNote.textContent = '한글 조합 중…';
  });
  editor.addEventListener('compositionend', () => {
    caretNote.textContent = '조합이 끝났습니다.';
  });

  syncOutputs();
}

function draw(ctx) {
  ctx.reset();

  const glow = controls.glowOn.checked ? Number(controls.glow.value) : 0;
  const outline = controls.outlineOn.checked ? Number(controls.outline.value) : 0;
  const blur = Number(controls.blur.value);

  // 1. 본문부터 그린다. 이 draw 가 돌려주는 행렬로 위치를 맞춘다.
  ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
  const matrix = ctx.drawElementImage(editor, DRAW_X, DRAW_Y);
  ctx.filter = 'none';

  // 2. 그라디언트로 덮기. source-atop 은 이미 그려진 곳에만 얹으므로 글자 모양이 유지된다.
  //    아직 글로우와 외곽선을 그리기 전이라 본문만 물든다.
  if (controls.gradientOn.checked) {
    const gradient = ctx.createLinearGradient(DRAW_X, 0, stage.width - DRAW_X, stage.height);
    gradient.addColorStop(0, '#f472b6');
    gradient.addColorStop(0.5, '#c084fc');
    gradient.addColorStop(1, '#38bdf8');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, stage.width, stage.height);
  }

  // 3. 여기부터는 destination-over 다. 새로 그리는 것이 이미 있는 것 "뒤" 로 들어간다.
  //    그래야 외곽선과 글로우가 글자를 덮지 않고 테두리로만 보인다.
  ctx.globalCompositeOperation = 'destination-over';

  if (outline > 0) {
    ctx.shadowColor = controls.outlineColor.value;
    ctx.shadowBlur = 0;
    for (const [dx, dy] of OUTLINE_DIRECTIONS) {
      ctx.shadowOffsetX = dx * outline;
      ctx.shadowOffsetY = dy * outline;
      ctx.drawElementImage(editor, DRAW_X, DRAW_Y);
    }
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  if (glow > 0) {
    ctx.shadowColor = controls.glowColor.value;
    ctx.shadowBlur = glow;
    // 겹칠수록 진해진다. 네온은 한 번으로는 밋밋하다.
    for (let i = 0; i < 3; i += 1) ctx.drawElementImage(editor, DRAW_X, DRAW_Y);
    ctx.shadowBlur = 0;
  }

  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'source-over';

  // 03 에서 배운 것. 이걸 빼면 커서와 클릭이 엉뚱한 곳으로 간다.
  editor.style.transform = matrix.toString();

  log.textContent = `paint ${paintCount}회 · 글자 수 ${editor.textContent.trim().length} · 효과 ${describeEffects(glow, outline, blur)}`;
}

function describeEffects(glow, outline, blur) {
  const parts = [];
  if (glow > 0) parts.push(`글로우 ${glow}`);
  if (outline > 0) parts.push(`외곽선 ${outline}`);
  if (blur > 0) parts.push(`흐림 ${blur}`);
  if (controls.gradientOn.checked) parts.push('그라디언트');
  return parts.length > 0 ? parts.join(', ') : '없음';
}

function syncOutputs() {
  for (const name of ['glow', 'outline', 'blur']) {
    const out = document.querySelector(`output[for="${name}"]`);
    if (out) out.textContent = controls[name].value;
  }
}
