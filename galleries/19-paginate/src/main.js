// 19. 문서를 페이지로 자르기.
//
// 02 에서 배운 9인자 오버로드를 실전 크기로 쓴다. 같은 요소를 여러 번, 매번 다른
// 부분만 잘라 그리면 그것이 페이지 나누기가 된다.
//
// 원고는 자기가 잘리는 것을 모른다. 스크롤도 하지 않고 레이아웃도 바뀌지 않는다.
// 머리글과 쪽번호도 원고에 없다. 종이의 사정은 종이 쪽에서 처리한다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

/** 원고 폭. 캔버스 폭이 곧 종이 폭이 된다. */
const PAGE_W = 620;

const stage = document.querySelector('#stage');
const article = document.querySelector('#article');
const status = document.querySelector('#status');
const inputs = {
  height: document.querySelector('#height'),
  margin: document.querySelector('#margin'),
  overlap: document.querySelector('#overlap'),
  scale: document.querySelector('#scale'),
};
const marksToggle = document.querySelector('#marks');
const metrics = {
  docHeight: document.querySelector('#m-docheight'),
  pages: document.querySelector('#m-pages'),
  cuts: document.querySelector('#m-cuts'),
  fill: document.querySelector('#m-fill'),
  export: document.querySelector('#m-export'),
};

let pageIndex = 0;
let layout = { starts: [0], docHeight: 0, cuts: 0 };

/** 내보내는 동안만 값이 있다. 저장이 끝나면 비운다. */
let exporting = null;

if (ensureSupport()) {
  start();
}

function start() {
  stage.layoutSubtree = true;
  stage.addEventListener('paint', guardPaint(onPaint));

  for (const input of Object.values(inputs)) {
    input.addEventListener('input', () => {
      relayout();
      showOutputs();
    });
  }
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', relayout);
  }
  marksToggle.addEventListener('change', () => stage.requestPaint());

  document.querySelector('#prev').addEventListener('click', () => turn(-1));
  document.querySelector('#next').addEventListener('click', () => turn(1));
  document.querySelector('#save-page').addEventListener('click', () => save('page'));
  document.querySelector('#save-sheet').addEventListener('click', () => save('sheet'));

  showOutputs();
  relayout();
}

/* 페이지 계산 --------------------------------------------------------------- */

/** 머리글·쪽번호 자리를 뺀, 원고가 실제로 들어갈 높이. */
function contentHeight() {
  return Number(inputs.height.value) - Number(inputs.margin.value) * 2;
}

function mode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function scale() {
  return Number(inputs.scale.value);
}

/** 원고를 이루는 덩어리들. 문단, 표, 목록 하나하나가 덩어리다. */
function blocks() {
  const base = article.getBoundingClientRect().top;
  return [...article.children].map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top - base, bottom: box.bottom - base };
  });
}

/**
 * 어디서 끊을지 정한다.
 *
 * 같은 높이로 자르면 계산이 두 줄이고 글자가 반으로 잘린다.
 * 덩어리 단위로 자르면 글자는 멀쩡한 대신 장 끝에 여백이 남는다.
 */
function computeLayout() {
  const view = contentHeight();
  const overlap = Math.min(Number(inputs.overlap.value), view - 40);
  const list = blocks();
  const docHeight = list.length > 0 ? Math.ceil(list[list.length - 1].bottom) : 0;

  if (mode() === 'flow') {
    const starts = [0];
    for (const block of list) {
      const start = starts[starts.length - 1];
      // 이 덩어리가 이번 장에 다 들어가지 않으면 통째로 다음 장으로 넘긴다.
      if (block.bottom - start > view && block.top > start) starts.push(block.top);
    }
    return { starts, docHeight, cuts: 0, overlap: 0 };
  }

  const step = Math.max(40, view - overlap);
  const starts = [];
  for (let y = 0; y < docHeight; y += step) starts.push(y);
  if (starts.length === 0) starts.push(0);

  // 경계가 덩어리 한가운데를 지나가면 글자가 잘린다. 몇 개나 되는지 센다.
  let cuts = 0;
  for (const start of starts.slice(1)) {
    if (list.some((block) => block.top < start && block.bottom > start)) cuts += 1;
  }

  return { starts, docHeight, cuts, overlap };
}

function relayout() {
  layout = computeLayout();
  pageIndex = Math.min(pageIndex, layout.starts.length - 1);
  resizeCanvas();
  report();
  stage.requestPaint();
}

/** 캔버스 크기가 곧 내보낼 크기다. 보이는 크기는 CSS 가 잡는다. 06 에서 배운 것. */
function resizeCanvas() {
  const pageHeight = Number(inputs.height.value);
  stage.width = PAGE_W * scale();
  stage.height = pageHeight * scale();
  stage.style.aspectRatio = `${PAGE_W} / ${pageHeight}`;
}

function turn(direction) {
  const next = pageIndex + direction;
  if (next < 0 || next >= layout.starts.length) return;
  pageIndex = next;
  report();
  stage.requestPaint();
}

/* 그리기 -------------------------------------------------------------------- */

function onPaint() {
  const ctx = stage.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, stage.width, stage.height);

  if (exporting?.kind === 'sheet') {
    drawSheet(ctx);
  } else {
    ctx.save();
    ctx.scale(scale(), scale());
    drawPage(ctx, pageIndex, 0, 0);
    ctx.restore();
  }

  // 내보내기는 반드시 그린 직후, 이 자리에서 해야 한다.
  // requestAnimationFrame 에 미루면 paint 보다 먼저 돌아 빈 캔버스를 뜨게 된다.
  if (exporting) writeFile();
}

/**
 * 페이지 한 장. 원고에서 잘라 낼 세로 위치만 페이지마다 다르다.
 *
 * 머리글과 쪽번호는 원고에 없다. 여기서 캔버스가 얹는다.
 */
function drawPage(ctx, index, offsetX, offsetY) {
  const pageHeight = Number(inputs.height.value);
  const margin = Number(inputs.margin.value);
  const view = contentHeight();
  const start = layout.starts[index] ?? 0;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // 종이
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, pageHeight);

  // 원고에서 이 장에 해당하는 부분만 잘라 그린다
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, PAGE_W - margin * 2, view);
  ctx.clip();
  ctx.drawElementImage(article, 0, start, PAGE_W, view, 0, margin, PAGE_W, view);
  ctx.restore();

  drawFurniture(ctx, index, pageHeight, margin);
  if (marksToggle.checked) drawMarks(ctx, start, view, pageHeight, margin);

  ctx.restore();
}

/** 머리글, 쪽번호, 테두리. 종이 쪽의 장식이다. */
function drawFurniture(ctx, index, pageHeight, margin) {
  ctx.fillStyle = '#94a3b8';
  ctx.font = "11px system-ui, 'Apple SD Gothic Neo', sans-serif";
  ctx.textBaseline = 'alphabetic';

  ctx.textAlign = 'left';
  ctx.fillText('캔버스가 종이를 만든다', margin, Math.max(14, margin - 8));
  ctx.textAlign = 'right';
  ctx.fillText('HTML in Canvas · 19', PAGE_W - margin, Math.max(14, margin - 8));

  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = "600 12px system-ui, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(
    `${index + 1} / ${layout.starts.length}`,
    PAGE_W / 2,
    pageHeight - Math.max(10, margin - 10),
  );

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, PAGE_W - 1, pageHeight - 1);
}

/** 자른 자리 표시. 이 장이 원고의 어디를 잘라 왔는지 보인다. */
function drawMarks(ctx, start, view, pageHeight, margin) {
  ctx.save();
  ctx.strokeStyle = '#f97316';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(margin, margin + 0.5);
  ctx.lineTo(PAGE_W - margin, margin + 0.5);
  ctx.moveTo(margin, margin + view - 0.5);
  ctx.lineTo(PAGE_W - margin, margin + view - 0.5);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'left';
  // 글자 뒤에 흰 바탕을 깔아 원고와 겹쳐도 읽히게 한다.
  label(ctx, `원고 ${start}px`, margin + 4, margin + 11);
  label(ctx, `원고 ${start + view}px`, margin + 4, margin + view - 3);
  ctx.restore();
}

function label(ctx, text, x, y) {
  const width = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fillRect(x - 2, y - 9, width + 4, 12);
  ctx.fillStyle = '#c2410c';
  ctx.fillText(text, x, y);
}

/** 전체 시트. 모든 장을 한 장에 이어 붙인다. */
function drawSheet(ctx) {
  const pageHeight = Number(inputs.height.value);
  const columns = exporting.columns;

  ctx.save();
  ctx.scale(scale(), scale());
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, stage.width / scale(), stage.height / scale());

  layout.starts.forEach((_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawPage(ctx, index, 12 + column * (PAGE_W + 12), 12 + row * (pageHeight + 12));
  });
  ctx.restore();
}

/* 내보내기 ------------------------------------------------------------------ */

/**
 * 캔버스 자체가 내보낼 그림이다. 시트를 뽑을 때만 잠깐 캔버스를 키웠다가 되돌린다.
 * 이 캔버스 밖에서는 article 을 그릴 수 없으므로 다른 캔버스에 그려 둘 수가 없다.
 */
function save(kind) {
  const pageHeight = Number(inputs.height.value);
  const count = layout.starts.length;

  if (kind === 'sheet') {
    const columns = Math.min(3, count);
    const rows = Math.ceil(count / columns);
    exporting = { kind, columns, count };
    stage.width = (columns * (PAGE_W + 12) + 12) * scale();
    stage.height = (rows * (pageHeight + 12) + 12) * scale();
  } else {
    exporting = { kind, count };
  }

  // 크기를 바꾸면 컨텍스트가 초기화된다. 다시 그려 달라고 하고, 그린 자리에서 내보낸다.
  stage.requestPaint();
}

/** paint 안에서 불린다. 방금 그린 캔버스를 그대로 파일로 만든다. */
function writeFile() {
  const { kind, count } = exporting;
  const name =
    kind === 'sheet'
      ? `sheet-${count}pages-${stage.width}x${stage.height}.png`
      : `page-${pageIndex + 1}-${stage.width}x${stage.height}.png`;

  stage.toBlob((blob) => {
    if (!blob) {
      status.textContent = '내보내기에 실패했습니다.';
      finishExport();
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    // 같은 tick 에 회수하면 큰 blob 에서 다운로드가 시작되기 전에 사라질 수 있다.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = `${name} 저장됨 (${Math.round(blob.size / 1024)} KB)`;
    finishExport();
  }, 'image/png');
}

function finishExport() {
  exporting = null;
  resizeCanvas();
  report();
  stage.requestPaint();
}

/* 측정값 -------------------------------------------------------------------- */

function report() {
  const view = contentHeight();
  const start = layout.starts[pageIndex] ?? 0;
  const next = layout.starts[pageIndex + 1] ?? layout.docHeight;
  const used = Math.min(view, Math.max(0, next - start));

  document.querySelector('#pager-label').textContent = `${pageIndex + 1} / ${layout.starts.length}`;
  metrics.docHeight.textContent = `${layout.docHeight}px`;
  metrics.pages.textContent = `${layout.starts.length}장`;
  metrics.cuts.textContent = mode() === 'flow' ? '0개 (덩어리 단위)' : `${layout.cuts}개`;
  metrics.fill.textContent = `${Math.round((used / view) * 100)}%`;
  metrics.export.textContent = `${stage.width}×${stage.height}`;
}

function showOutputs() {
  document.querySelector('output[for="height"]').textContent = `${inputs.height.value}px`;
  document.querySelector('output[for="margin"]').textContent = `${inputs.margin.value}px`;
  document.querySelector('output[for="overlap"]').textContent = `${inputs.overlap.value}px`;
  document.querySelector('output[for="scale"]').textContent = `${inputs.scale.value}배`;
}
