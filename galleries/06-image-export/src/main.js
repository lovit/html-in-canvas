// 06. 이미지 내보내기 — HTML 카드를 PNG 파일로 뽑는다.
//
// 지금까지는 SVG foreignObject 에 직렬화한 HTML 을 넣고 이미지로 불러오는
// 우회로를 썼다. 이 예제는 두 방법을 나란히 놓고 무엇이 다른지 본다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const stage = document.querySelector('#stage');
const legacy = document.querySelector('#legacy');
const legacyFigure = document.querySelector('#fo-figure');
const card = document.querySelector('#card');
const status = document.querySelector('#status');

const fields = {
  eyebrow: document.querySelector('#eyebrow'),
  title: document.querySelector('#title'),
  subtitle: document.querySelector('#subtitle'),
  author: document.querySelector('#author'),
};
const views = {
  eyebrow: document.querySelector('#v-eyebrow'),
  title: document.querySelector('#v-title'),
  subtitle: document.querySelector('#v-subtitle'),
  author: document.querySelector('#v-author'),
};

const themeSelect = document.querySelector('#theme');
const scaleSelect = document.querySelector('#scale');
const legacyToggle = document.querySelector('#show-legacy');

// 웹폰트를 쓰든 시스템 폰트를 쓰든, 폰트가 준비되기 전에 그리면 배치가 어긋난다.
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
      ctx.reset();
      // 카드는 1200×630 이고 캔버스 백킹 스토어는 배율만큼 크다. 그 크기에 맞춰 늘려 그린다.
      ctx.drawElementImage(card, 0, 0, stage.width, stage.height);
    }),
  );

  applyScale();

  for (const [name, input] of Object.entries(fields)) {
    input.addEventListener('input', () => {
      // 카드의 텍스트를 바꾸면 paint 가 알아서 온다.
      views[name].textContent = input.value;
      if (legacyToggle.checked) drawLegacy();
    });
  }

  themeSelect.addEventListener('change', () => {
    card.dataset.theme = themeSelect.value;
    if (legacyToggle.checked) drawLegacy();
  });

  scaleSelect.addEventListener('change', applyScale);

  legacyToggle.addEventListener('change', () => {
    legacyFigure.hidden = !legacyToggle.checked;
    if (legacyToggle.checked) drawLegacy();
  });

  document.querySelector('#save-png').addEventListener('click', () => save('image/png', 'png'));
  document.querySelector('#save-jpeg').addEventListener('click', () => save('image/jpeg', 'jpg'));

  reportStatus();
}

/** 배율을 바꾸면 백킹 스토어 해상도만 바뀐다. 보이는 크기는 CSS 가 고정한다. */
function applyScale() {
  const scale = Number(scaleSelect.value);
  stage.width = CARD_WIDTH * scale;
  stage.height = CARD_HEIGHT * scale;
  legacy.width = stage.width;
  legacy.height = stage.height;
  // width/height 를 바꾸면 컨텍스트가 초기화된다. 다시 그려 달라고 요청한다.
  stage.requestPaint();
  if (legacyToggle.checked) drawLegacy();
  reportStatus();
}

function reportStatus() {
  const dpr = window.devicePixelRatio;
  const suggestion =
    dpr > 1
      ? `이 화면의 기기 픽셀 비율은 ${dpr} 입니다. 화면과 같은 선명도로 뽑으려면 ${Math.ceil(dpr)}배를 고르세요.`
      : '이 화면의 기기 픽셀 비율은 1 입니다.';
  status.textContent = `내보낼 크기 ${stage.width}×${stage.height}. ${suggestion}`;
}

function save(type, extension) {
  stage.toBlob((blob) => {
    if (!blob) {
      status.textContent = '내보내기에 실패했습니다. 캔버스가 오염되지 않았는지 확인하세요.';
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `og-card-${stage.width}x${stage.height}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
    status.textContent = `${link.download} 저장됨 (${Math.round(blob.size / 1024)} KB)`;
  }, type);
}

/**
 * 예전 방식: 카드를 직렬화해 SVG foreignObject 에 넣고 이미지로 불러온다.
 * 외부 스타일시트가 따라오지 않으므로 스타일이 통째로 빠진다.
 */
function drawLegacy() {
  const ctx = legacy.getContext('2d');
  const serialized = new XMLSerializer().serializeToString(card);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div></foreignObject></svg>`;

  const image = new Image();
  image.addEventListener('load', () => {
    ctx.reset();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, legacy.width, legacy.height);
    ctx.drawImage(image, 0, 0, legacy.width, legacy.height);
  });
  image.addEventListener('error', () => {
    ctx.reset();
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, 0, legacy.width, legacy.height);
    ctx.fillStyle = '#fecaca';
    ctx.font = `${Math.round(legacy.width / 28)}px system-ui, sans-serif`;
    ctx.fillText(
      'foreignObject 이미지를 불러오지 못했습니다',
      legacy.width / 12,
      legacy.height / 2,
    );
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
