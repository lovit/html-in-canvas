// 모든 예제가 공유하는 기능 감지와 안내 배너.
//
// HTML-in-Canvas 는 플래그 뒤에 있어서 대부분의 브라우저에서는 그냥 없다.
// 없을 때 콘솔 에러만 남기고 빈 화면을 보여 주면 무엇이 잘못됐는지 알 수 없으므로,
// 무엇을 켜야 하는지 화면에 띄운다.

/** 이 문서에서 API 를 쓸 수 있는지 확인한다. */
export function isSupported() {
  const probe = document.createElement('canvas');
  const ctx = probe.getContext('2d');
  return typeof ctx?.drawElementImage === 'function' && 'layoutSubtree' in probe;
}

/** WebGL2 쪽 확장까지 필요한 예제용. */
export function isWebGLSupported() {
  const gl = document.createElement('canvas').getContext('webgl2');
  return Boolean(gl) && typeof gl.texElementImage2D === 'function';
}

const BANNER_ID = 'hic-support-banner';

/** 미지원 안내 배너를 문서 맨 앞에 띄운다. 이미 떠 있으면 아무것도 하지 않는다. */
export function showUnsupportedBanner(detail = '') {
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');

  const title = document.createElement('strong');
  title.textContent = '이 브라우저에서는 HTML-in-Canvas 가 꺼져 있습니다';

  const body = document.createElement('p');
  body.textContent =
    detail ||
    'Chromium 147 이상에서 플래그를 켜야 예제가 동작합니다. 켜지 않아도 페이지는 그대로 볼 수 있습니다.';

  const how = document.createElement('pre');
  how.textContent = 'mise run serve\nmise run chrome';

  const link = document.createElement('a');
  link.href = '../../docs/browser-setup.md';
  link.textContent = '브라우저 셋업 문서 보기';

  banner.append(title, body, how, link);
  document.body.prepend(banner);

  if (!document.getElementById(`${BANNER_ID}-style`)) {
    const style = document.createElement('style');
    style.id = `${BANNER_ID}-style`;
    style.textContent = `
      #${BANNER_ID} {
        margin: 0 0 1.5rem;
        padding: 1rem 1.25rem;
        border: 1px solid #d97706;
        border-radius: 8px;
        background: #fffbeb;
        color: #7c2d12;
        font: 15px/1.6 system-ui, sans-serif;
      }
      #${BANNER_ID} p { margin: 0.5rem 0; }
      #${BANNER_ID} pre {
        margin: 0.5rem 0;
        padding: 0.6rem 0.8rem;
        border-radius: 6px;
        background: #78350f;
        color: #fef3c7;
        font-size: 13px;
        overflow-x: auto;
      }
      #${BANNER_ID} a { color: #b45309; }
      @media (prefers-color-scheme: dark) {
        #${BANNER_ID} { background: #2b1c06; border-color: #b45309; color: #fde68a; }
        #${BANNER_ID} a { color: #fbbf24; }
      }
    `;
    document.head.append(style);
  }
}

/**
 * 예제 시작점에서 부른다. 지원하면 true, 아니면 배너를 띄우고 false 를 준다.
 * 호출한 쪽은 false 를 받으면 조용히 끝내면 된다.
 */
export function ensureSupport({ webgl = false } = {}) {
  if (!isSupported()) {
    showUnsupportedBanner();
    return false;
  }
  if (webgl && !isWebGLSupported()) {
    showUnsupportedBanner(
      'HTML-in-Canvas 는 켜져 있지만 WebGL2 의 texElementImage2D 를 쓸 수 없습니다. 하드웨어 가속이 꺼져 있는지 확인해 보세요.',
    );
    return false;
  }
  return true;
}

/**
 * paint 핸들러를 감싸 준다.
 *
 * paint 안에서 그리더라도 캔버스가 아예 렌더링되지 않는 위치에 있으면
 * 자식의 스냅샷 기록이 없어서 InvalidStateError 가 난다.
 * (숨긴 iframe, 화면 밖으로 밀어 둔 컨테이너 등)
 * 그릴 수 없는 프레임은 조용히 건너뛴다. 다음 프레임에 다시 그리면 된다.
 *
 *   canvas.addEventListener('paint', guardPaint((event) => { ... }));
 */
export function guardPaint(draw) {
  return (event) => {
    try {
      draw(event);
    } catch (error) {
      // 그릴 수 없는 상태만 넘긴다. 다른 실수는 그대로 드러나야 한다.
      if (error.name !== 'InvalidStateError') throw error;
    }
  };
}
