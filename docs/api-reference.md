# HTML-in-Canvas API 요약

> 확인 시점: 2026-08-21 / 확인 환경: Chrome 151.0.7922.138 (macOS, `--enable-blink-features=CanvasDrawElement`). 표준화 전 API 라서 이름과 동작이 바뀔 수 있다. 원문은 [WICG/html-in-canvas](https://github.com/WICG/html-in-canvas) 설명서를 본다.

## 이름이 바뀐 이력

초기 제안에는 `CanvasRenderingContext2D.drawElement()` 와 `placeElement()` 가 있었다. 지금 구현된 이름은 다르다. 오래된 블로그 글이나 기억을 그대로 따라 쓰면 `undefined` 만 만난다.

| 옛 이름 | 지금 이름 |
| --- | --- |
| `ctx.drawElement(el, x, y)` | `ctx.drawElementImage(el, x, y)` |
| `ctx.placeElement(el, x, y)` | 별도 메서드 없음. `drawElementImage()` 가 돌려주는 `DOMMatrix` 를 엘리먼트의 `transform` 에 되먹여서 같은 효과를 낸다 |
| (없음) | `canvas.captureElementImage(el)` → `ElementImage` |

## 핵심 흐름

```js
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const card = document.querySelector('#card'); // canvas 의 직계 자식

// 1. canvas 자식들을 레이아웃 대상으로 편입한다. 이걸 안 켜면 자식은 그려지지도, 측정되지도 않는다.
canvas.layoutSubtree = true;

// 2. 자식의 렌더링이 바뀔 때마다 paint 이벤트가 온다. 여기서 다시 그린다.
canvas.addEventListener('paint', (event) => {
  ctx.reset();
  const matrix = ctx.drawElementImage(card, 40, 20);

  // 3. 그려진 위치와 DOM 위치를 맞춰야 클릭, 포커스, 스크린리더가 제자리를 찾는다.
  card.style.transform = matrix.toString();
});

// 4. 첫 프레임을 요청한다.
canvas.requestPaint();
```

## WebIDL

```webidl
partial interface HTMLCanvasElement {
  [CEReactions, Reflect] attribute boolean layoutSubtree;
  attribute EventHandler onpaint;
  undefined requestPaint();
  ElementImage captureElementImage(Element element);
  DOMMatrix getElementTransform((Element or ElementImage) element, DOMMatrix drawTransform);
};

interface mixin CanvasDrawElementImage {
  DOMMatrix drawElementImage((Element or ElementImage) element, double dx, double dy);
  DOMMatrix drawElementImage((Element or ElementImage) element, double dx, double dy, double dwidth, double dheight);
  DOMMatrix drawElementImage((Element or ElementImage) element, double sx, double sy, double swidth, double sheight, double dx, double dy);
  DOMMatrix drawElementImage((Element or ElementImage) element, double sx, double sy, double swidth, double sheight, double dx, double dy, double dwidth, double dheight);
};
CanvasRenderingContext2D includes CanvasDrawElementImage;
OffscreenCanvasRenderingContext2D includes CanvasDrawElementImage;

[Exposed=Window]
interface PaintEvent : Event {
  readonly attribute FrozenArray<Element> changedElements;
};

[Exposed=(Window,Worker), Transferable]
interface ElementImage {
  readonly attribute double width;
  readonly attribute double height;
  undefined close();
};

partial interface WebGLRenderingContext {
  undefined texElementImage2D(GLenum target, GLenum internalformat,
                         (Element or ElementImage) element,
                         optional WebGLCopyElementImageConfig config = {});
};

partial interface GPUQueue {
  undefined copyElementImageToTexture(GPUCopyElementImageSource source,
                                 GPUCopyElementImageDestination destination,
                                 GPUExtent3D copySize);
};
```

`drawElementImage()` 의 인자 개수는 `drawImage()` 와 같은 규칙을 따른다. 3인자는 위치만, 5인자는 위치와 크기, 7인자와 9인자는 소스 사각형을 잘라 쓴다.

`getElementTransform()` 은 그리지 않고 행렬만 구한다. 위치 동기화(03 참고)에는 보통 `drawElementImage()` 의 반환값이면 충분하므로 이 저장소의 예제에서는 쓰지 않는다. 그릴 자리를 미리 알아야 하거나, 그리지 않는 엘리먼트의 히트 테스트 위치만 맞추고 싶을 때 쓴다.

## 지켜야 하는 조건

- 대상 엘리먼트는 `<canvas>` 의 **직계 자식**이어야 한다. 손자는 안 된다
- `<canvas>` 에 `layoutSubtree` 가 켜져 있어야 한다
- 대상은 박스를 생성해야 한다. `display: none` 이면 그릴 수 없다
- 첫 스냅샷이 찍히기 전에 `drawElementImage()` 를 부르면 예외가 난다. 그래서 `paint` 이벤트 안에서 그리는 것이 정석이다
- 소스 엘리먼트의 CSS `transform` 은 **그리기에서 무시된다**. 대신 히트 테스트와 접근성에는 계속 적용된다. 이 비대칭이 위치 동기화 패턴의 이유다
- 캔버스의 현재 변환 행렬(CTM)은 적용된다. `ctx.rotate()` 후에 그리면 회전해서 그려진다
- 넘치는 내용은 엘리먼트의 border box 로 잘린다
- `paint` 이벤트는 자손이 조상보다 먼저 발생한다(역 트리 순서). 이벤트 안에서 만든 DOM 변경은 다음 프레임에 반영된다
- 캔버스가 아예 렌더링되지 않는 위치에 있으면 `paint` 안에서 그려도 `InvalidStateError` 가 난다. 스냅샷 기록이 없기 때문이다. 뷰포트 밖으로 스크롤한 정도로는 생기지 않고, 숨긴 iframe 처럼 렌더링 자체가 일어나지 않을 때 생긴다. `galleries/_shared/support.js` 의 `guardPaint()` 가 이 경우를 넘긴다

## 실제로 부딪힌 것들

예제를 만들며 확인한 것들이다. 명세만 읽어서는 알기 어려웠던 자리다.

### 반환 행렬을 쓰려면 `transform-origin: 0 0`

`drawElementImage()` 가 돌려주는 행렬은 요소의 **왼쪽 위**를 기준으로 만들어진다. 그런데 CSS `transform` 은 기본적으로 요소 한가운데(`50% 50%`)를 축으로 걸린다. 이동만 하는 행렬은 축이 어디든 결과가 같아서 01~14 에서는 드러나지 않지만, 회전이나 확대가 들어가면 그림과 클릭 자리가 어긋난다(17 참고).

```css
#stage iframe {
  transform-origin: 0 0;
}
```

### 요소가 올라가는 크기는 진입점마다 다르다

| 진입점                        | 나오는 크기   | 확인한 예                        |
| ----------------------------- | ------------- | -------------------------------- |
| `captureElementImage()`       | 디바이스 픽셀 | 360×440 프레임 → 720×880 (DPR 2) |
| `copyElementImageToTexture()` | CSS 픽셀      | 380×240 카드 → 380×240           |

둥근 모서리가 있으면 가장자리가 1px 씩 늘기도 한다(380×240 카드가 382×242 로 올라왔다). WebGPU 텍스처는 조금 넉넉하게 잡고 필요한 만큼만 읽는 편이 안전하다(20 참고).

### WebGPU 쪽 인자 모양

두 번째 인자가 `{ texture }` 가 아니라 `{ destination: { texture } }` 다.

```js
device.queue.copyElementImageToTexture({ source: card }, { destination: { texture } }, [
  width,
  height,
]);
```

- 대상 텍스처의 `usage` 에 `RENDER_ATTACHMENT` 가 없으면 **아무 말 없이** 빈 텍스처가 된다
- 캔버스에 `getContext('webgpu')` 를 먼저 불러 두지 않으면 `containing canvas does not have a rendering context` 로 막힌다
- WebGPU 의 검증 오류는 예외로 오지 않는다. `device.addEventListener('uncapturederror', ...)` 를 달아 두는 편이 좋다

### 스크롤이 생기는 iframe

Chrome 151.0.7922.172 에서는 자식 문서가 프레임보다 길어 스크롤이 생기면 **스크롤바만 그려진다.** 자세한 것은 [알려진 문제](known-issues.md)에 있다.

## 그려지지 않는 것 (read-back-allowed rendering)

캔버스는 픽셀을 읽을 수 있으므로, 읽히면 안 되는 정보는 애초에 그려지지 않는다. 캔버스를 오염시키는 대신 해당 요소만 빠지거나 기본값으로 대체된다.

- cross-origin `<iframe>`, `<img>` 등 교차 출처 콘텐츠와 `url()` 참조
- `:visited` 방문 기록 스타일
- 시스템 색상, 테마, 사용자 설정
- 맞춤법·문법 검사 밑줄
- JavaScript 가 원래 못 읽는 자동완성 대기 값
- 서브픽셀 안티에일리어싱
- IME 팝업과 IME 전용 텍스트 서식
- 자막 관련 사용자 설정

반대로 검색 하이라이트, 스크롤바 모양, 캐럿 깜빡임 주기, `forced-colors` 미디어 쿼리는 허용된다.

## 기능 감지

```js
const ctx = canvas.getContext('2d');
const supported = typeof ctx?.drawElementImage === 'function' && 'layoutSubtree' in canvas;
```

저장소 공통 헬퍼는 [`galleries/_shared/support.js`](../galleries/_shared/support.js) 에 있다.

## 참고 링크

- [WICG/html-in-canvas 설명서](https://github.com/WICG/html-in-canvas)
- [Chrome for Developers: HTML-in-Canvas origin trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
- [html-in-canvas.dev 데모 모음](https://html-in-canvas.dev/)
