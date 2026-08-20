# 갤러리

HTML-in-Canvas 를 예제로 익힌다. 번호 순서대로 따라가면 앞 예제에서 배운 것을 뒤 예제가 다시 쓴다.

## 시작하기 전에

플래그를 켜지 않으면 모든 예제가 안내 배너만 띄우고 멈춘다. [브라우저 셋업](../docs/browser-setup.md)을 먼저 보자.

```bash
mise run serve    # 터미널 1
mise run chrome   # 터미널 2
```

API 이름과 제약은 [API 요약](../docs/api-reference.md)에 정리해 뒀다.

## 학습 순서

| # | 예제 | 배우는 것 |
| --- | --- | --- |
| 01 | [`01-hello-world`](./01-hello-world/) | `layoutSubtree`, `drawElementImage()`, `paint` 이벤트의 최소 조합 |
| 02 | [`02-draw-geometry`](./02-draw-geometry/) | 위치와 크기 인자, 소스 사각형, 캔버스 변환 행렬과의 관계 |
| 03 | [`03-interactive-form`](./03-interactive-form/) | 반환된 `DOMMatrix` 로 클릭과 포커스, 접근성 살리기 |
| 04 | [`04-paint-event`](./04-paint-event/) | `requestPaint()` 와 `changedElements` 로 바뀐 것만 다시 그리기 |
| 05 | [`05-international-text`](./05-international-text/) | RTL, CJK 세로쓰기, 결합 문자, 이모지를 `fillText()` 와 비교 |
| 06 | [`06-image-export`](./06-image-export/) | `toBlob()` 으로 카드 이미지 만들기, 픽셀 비율과 폰트 로딩 |
| 07 | [`07-webgl-texture`](./07-webgl-texture/) | `texElementImage2D()` 로 HTML 을 WebGL2 텍스처로 |
| 08 | [`08-offscreen-worker`](./08-offscreen-worker/) | `captureElementImage()` 로 얻은 `ElementImage` 를 워커로 넘기기 |
| 09 | [`09-security-limits`](./09-security-limits/) | 무엇이 그려지지 않는지 직접 확인하기 |
| 10 | `10-accessible-chart` | 도형은 캔버스로, 라벨은 HTML 로 만든 접근성 있는 차트 |

아직 만들어지지 않은 예제는 링크가 없다. 예제가 추가되면 이 표에 링크가 붙는다. 예제 하나가 이슈 하나이므로 [열린 이슈 목록](https://github.com/lovit/html-in-canvas/issues)에서 진행 상황을 볼 수 있다.

## 예제 공통 규칙

모든 예제는 빌드 없이 파일 그대로 돈다. 번들러도, npm 의존성도, CDN 스크립트도 쓰지 않는다. 3D 예제도 raw WebGL2 로 쓴다.

공통 자산은 `_shared/` 에 있다.

- `_shared/support.js` — 기능 감지와 미지원 안내 배너
- `_shared/base.css` — 예제 공통 스타일
