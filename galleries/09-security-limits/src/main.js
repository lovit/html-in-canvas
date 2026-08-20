// 09. 무엇이 그려지지 않나 — read-back-allowed rendering.
//
// 캔버스는 getImageData() 나 toDataURL() 로 픽셀을 읽을 수 있다. 그래서 브라우저는
// "읽히면 정보가 새는 것" 을 애초에 그리지 않는다. 캔버스를 오염시키는 대신
// 해당 부분만 빼는 쪽을 택한다. 무엇이 빠지는지 직접 부딪혀 본다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const LOCAL_BADGE = 'src/badge.svg';

/**
 * 외부 서버 없이 교차 출처를 만든다.
 * localhost 와 127.0.0.1 은 같은 컴퓨터를 가리키지만 브라우저에게는 다른 출처다.
 */
function crossOrigin() {
  const { protocol, hostname, port } = location;
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  const other = hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  return `${protocol}//${other}${port ? `:${port}` : ''}`;
}

const remote = crossOrigin();
const originNote = document.querySelector('#origin-note');

if (remote === null) {
  originNote.textContent =
    'file:// 로 열면 교차 출처 항목을 만들 수 없습니다. mise run serve 로 띄운 뒤 http://localhost 주소로 열어 주세요.';
} else {
  originNote.textContent = `교차 출처 항목은 ${remote} 에서 불러옵니다. 같은 컴퓨터지만 호스트 이름이 다르므로 브라우저에게는 다른 출처입니다.`;
  wireRemoteSources();
}

wireLocalSources();

if (ensureSupport()) {
  start();
}

function wireLocalSources() {
  for (const image of document.querySelectorAll('.specimen img.local')) {
    image.src = LOCAL_BADGE;
  }
}

function wireRemoteSources() {
  const base = `${remote}${location.pathname}`;
  for (const image of document.querySelectorAll('.specimen img.remote')) {
    image.src = new URL(LOCAL_BADGE, base).href;
  }
  for (const frame of document.querySelectorAll('.specimen iframe.remote-frame')) {
    frame.src = new URL('./', base).href;
  }
}

function start() {
  for (const canvas of document.querySelectorAll('.case-canvas')) {
    const specimen = canvas.querySelector('.specimen');
    const ctx = canvas.getContext('2d');

    mountClone(canvas, specimen);

    canvas.layoutSubtree = true;
    canvas.addEventListener(
      'paint',
      guardPaint(() => {
        ctx.reset();
        ctx.drawElementImage(specimen, 12, 12);
        reportTaint(canvas);
      }),
    );
    canvas.requestPaint();
  }
}

/** 왼쪽 패널에 붙일 복제본. 진짜 표본은 canvas 자식이라 화면에 나오지 않는다. */
function mountClone(canvas, specimen) {
  const name = canvas.dataset.case;
  const mount = document.querySelector(`[data-mount="${name}"]`);
  if (!mount) return;

  const clone = specimen.cloneNode(true);
  clone.removeAttribute('data-specimen');
  // 복제본의 iframe 과 img 는 src 속성이 함께 복사되므로 그대로 둔다.
  mount.append(clone);
}

/**
 * 이 캔버스에서 픽셀을 읽을 수 있는지 실제로 확인한다.
 * 읽을 수 있다면 위험한 내용이 그려지지 않았다는 뜻이다.
 */
function reportTaint(canvas) {
  const verdict = document.querySelector(`[data-verdict="${canvas.dataset.case}"]`);
  if (!verdict) return;

  try {
    canvas.toDataURL();
    verdict.textContent =
      'toDataURL() 성공 — 캔버스가 오염되지 않았습니다. 위험한 내용은 그려지지 않고 빠집니다.';
  } catch (error) {
    verdict.textContent = `toDataURL() 실패 (${error.name}) — 캔버스가 오염되었습니다.`;
  }
}
