// 16. 중첩의 한계.
//
// "html in html" 이 몇 겹까지 되는지 재 본다. 답은 한 줄로 요약된다.
//   문서는 몇 겹이든 그려지고, 그리는 캔버스는 한 겹도 중첩되지 않는다.
//
// 왜 그런지도 숫자로 보인다. 캔버스의 자식은 페이지에 렌더링되지 않으므로
// 안쪽 캔버스에는 paint 가 올 이유가 없다. 그런데 바깥이 그 서브트리를 그릴 때는
// 자식이 그려진다. 이 비대칭이 이 예제의 내용이다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const MIDDLE = '191,219,254'; // page-middle.html 의 배경 #bfdbfe
const INNER = '220,252,231'; // page-inner.html 의 배경 #dcfce7
const LONG = '254,226,226'; // page-long.html 의 배경 #fee2e2

const el = (id) => document.querySelector(`#${id}`);
const set = (id, value) => {
  el(id).textContent = value;
};

/** 안쪽 캔버스가 paint 를 몇 번 받았는지 센다. 이 값이 이 예제의 핵심 숫자다. */
let innerPaints = 0;

if (ensureSupport()) {
  start();
}

function start() {
  setupDocuments();
  setupDrawingCanvas();
  setupPlainCanvas();
  setupSnapshotOwner();
  setupScrollingFrame();

  el('remeasure').addEventListener('click', measureAll);
  setTimeout(measureAll, 400);
}

function measureAll() {
  for (const id of ['c-docs', 'c-drawing', 'c-plain', 'c-owner', 'c-scroll']) {
    el(id).requestPaint();
  }
}

/* 1. 문서 → iframe → iframe -------------------------------------------------- */

function setupDocuments() {
  const stage = el('c-docs');
  const ctx = stage.getContext('2d');
  stage.layoutSubtree = true;

  stage.addEventListener(
    'paint',
    guardPaint(() => {
      ctx.clearRect(0, 0, stage.width, stage.height);
      ctx.drawElementImage(el('doc-middle'), 0, 0);

      const report = scan(ctx, stage);
      set('m-docs-filled', `${report.filled} / ${report.total}`);
      set('m-docs-middle', pixels(report, MIDDLE));
      set('m-docs-inner', pixels(report, INNER));
      verdict(
        'v-docs',
        report.colors.get(INNER) > 0,
        '문서 세 겹이 한 번에 그려졌다',
        '안쪽 문서가 빠졌다',
      );
    }),
  );
}

/* 2. 캔버스 → 그리는 캔버스 -------------------------------------------------- */

function setupDrawingCanvas() {
  const stage = el('c-drawing');
  const ctx = stage.getContext('2d');
  const inner = el('inner-drawing');

  // 안쪽 캔버스도 바깥과 똑같이 준비한다. 자기 자식을 그리려고 기다리는 상태다.
  inner.layoutSubtree = true;
  inner.addEventListener(
    'paint',
    guardPaint(() => {
      innerPaints += 1;
      inner.getContext('2d').drawElementImage(inner.firstElementChild, 0, 0);
    }),
  );
  inner.requestPaint(); // 불러도 오지 않는다. 그것이 이 칸의 결론이다.

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint(() => {
      ctx.clearRect(0, 0, stage.width, stage.height);
      ctx.drawElementImage(inner, 0, 0);

      const report = scan(ctx, stage);
      set('m-drawing-filled', `${report.filled} / ${report.total}`);
      set('m-drawing-top', topColor(report));
      set('m-drawing-paints', `${innerPaints}회`);
      verdict(
        'v-drawing',
        innerPaints === 0 && report.filled > 0,
        '안쪽은 한 번도 그리지 못했다. 대신 그 자식 DOM 이 그려졌다',
        '예상과 다르다',
      );
    }),
  );
}

/* 3. 캔버스 → 평범한 캔버스 -------------------------------------------------- */

function setupPlainCanvas() {
  const stage = el('c-plain');
  const ctx = stage.getContext('2d');
  const inner = el('inner-plain');

  // layoutSubtree 를 켜지 않은, 그냥 그림을 그리는 캔버스다.
  const innerCtx = inner.getContext('2d');
  innerCtx.fillStyle = '#16a34a';
  innerCtx.fillRect(0, 0, inner.width, inner.height);
  innerCtx.fillStyle = '#f0fdf4';
  innerCtx.font = "600 15px system-ui, 'Apple SD Gothic Neo', sans-serif";
  innerCtx.fillText('fillRect 로 칠한 비트맵', 16, 80);

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint(() => {
      ctx.clearRect(0, 0, stage.width, stage.height);
      ctx.drawElementImage(inner, 0, 0);

      const report = scan(ctx, stage);
      set('m-plain-filled', `${report.filled} / ${report.total}`);
      set('m-plain-top', topColor(report));
      verdict(
        'v-plain',
        report.filled > report.total * 0.9,
        '비트맵은 그대로 합성된다',
        '비트맵이 오지 않았다',
      );
    }),
  );
}

/* 4. 다른 캔버스에서 뜬 스냅샷 ----------------------------------------------- */

function setupSnapshotOwner() {
  const owner = el('c-owner');
  const ownerCtx = owner.getContext('2d');
  const borrower = el('c-borrow');
  const borrowerCtx = borrower.getContext('2d');
  owner.layoutSubtree = true;

  owner.addEventListener(
    'paint',
    guardPaint(() => {
      ownerCtx.clearRect(0, 0, owner.width, owner.height);
      ownerCtx.drawElementImage(el('chip'), 0, 0);

      const image = owner.captureElementImage(el('chip'));
      set('m-owner-size', `${image.width}×${image.height}`);

      borrowerCtx.clearRect(0, 0, borrower.width, borrower.height);
      try {
        borrowerCtx.drawElementImage(image, 0, 0);
        set('m-borrow-result', '예외 없이 그려졌다');
        verdict('v-borrow', false, '', '이 브라우저에서는 캔버스를 건너뛸 수 있다');
      } catch (error) {
        set('m-borrow-result', error.name);
        verdict('v-borrow', true, error.message.replace(/^Failed[^:]*: /, ''), '');
      }

      // 스냅샷은 쓰고 나면 놓아준다. 15 에서 배운 것이다.
      image.close();
    }),
  );
}

/* 5. 스크롤이 생기는 iframe -------------------------------------------------- */

function setupScrollingFrame() {
  const stage = el('c-scroll');
  const ctx = stage.getContext('2d');
  const frame = el('doc-long');
  stage.layoutSubtree = true;

  stage.addEventListener(
    'paint',
    guardPaint(() => {
      ctx.clearRect(0, 0, stage.width, stage.height);
      ctx.drawElementImage(frame, 0, 0);

      const report = scan(ctx, stage);
      set('m-scroll-filled', `${report.filled} / ${report.total}`);
      set('m-scroll-top', topColor(report));

      // 안쪽 문서에 실제로 그 색이 칠해져 있는지 같은 출처라서 직접 확인할 수 있다.
      const body = frame.contentDocument?.body;
      set('m-scroll-expected', body ? getComputedStyle(body).backgroundColor : '읽지 못함');

      verdict(
        'v-scroll',
        report.filled < report.total * 0.1,
        '문서는 멀쩡한데 스크롤바만 그려졌다',
        '이 버전에서는 스크롤이 있어도 그려진다',
      );
    }),
  );
}

/* 재기 도구 ------------------------------------------------------------------ */

/** 캔버스를 훑어 불투명 픽셀 수와 색별 개수를 센다. */
function scan(ctx, canvas) {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Map();
  let filled = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    filled += 1;
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    colors.set(key, (colors.get(key) ?? 0) + 1);
  }

  return { filled, total: canvas.width * canvas.height, colors };
}

function pixels(report, color) {
  const count = report.colors.get(color) ?? 0;
  return count > 0 ? `${count}px (rgb(${color}))` : '없음';
}

function topColor(report) {
  const [key, count] = [...report.colors.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return key ? `rgb(${key}) × ${count}` : '없음';
}

function verdict(id, good, goodText, badText) {
  const node = el(id);
  node.textContent = good ? goodText : badText;
  node.classList.toggle('good', good);
  node.classList.toggle('bad', !good);
}
