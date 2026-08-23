# 예제 코드 스타일

## 빌드하지 않는다

번들러, 트랜스파일러, npm 의존성을 쓰지 않는다. 예제는 정적 서버에 올린 파일 그대로 브라우저에서 돌아가야 한다. 3D 예제도 Three.js 같은 라이브러리 없이 raw WebGL2 로 쓴다.

이유는 학습용이기 때문이다. 몇 년 뒤에 열어도 그대로 돌아가야 하고, 읽는 사람이 API 자체에 집중할 수 있어야 한다.

## 디렉터리 구조

```text
galleries/NN-job-name/
├── README.md      # 튜토리얼 본문. h1 으로 시작한다
├── index.html
└── src/
    ├── main.js    # <script type="module">
    └── style.css
```

디렉터리 이름은 `NN-kebab-case` 이고 번호가 학습 순서다. 파일이 더 필요하면 `src/` 아래에 둔다. 예제가 만들어 내는 산출물은 `output/` 에 넣는다(gitignore 됨).

## 필수 규칙

### 기능 감지와 폴백

모든 예제는 `../../_shared/support.js` 를 써서 API 지원 여부를 먼저 확인한다. 미지원이면 안내 배너를 띄우고 조용히 멈춘다. 콘솔에 에러를 던지고 화면을 비워 두지 않는다.

`ensureSupport()` 는 인자를 받지 않는다. WebGL 확장까지 필요하면 `{ webgl: true }` 를 준다.

```js
import { ensureSupport, guardPaint } from '../../_shared/support.js';

// 미지원이면 배너를 이미 띄웠으므로 여기서 조용히 끝낸다.
if (ensureSupport()) {
  start();
}

// WebGL 예제라면
if (ensureSupport({ webgl: true })) {
  start();
}
```

### paint 이벤트 안에서 그린다

첫 스냅샷 전에 `drawElementImage()` 를 부르면 예외가 난다. `requestPaint()` 로 시작하고 그리기는 `paint` 핸들러 안에서 한다.

핸들러는 `guardPaint()` 로 감싼다. 캔버스가 아예 렌더링되지 않는 위치에 있으면 `paint` 안에서 그려도 `InvalidStateError` 가 나는데, 그릴 수 없는 프레임은 조용히 건너뛰는 것이 맞다.

```js
import { ensureSupport, guardPaint } from '../../_shared/support.js';

canvas.addEventListener(
  'paint',
  guardPaint(() => draw(ctx)),
);
```

### 위치 동기화를 빠뜨리지 않는다

인터랙션이나 접근성이 필요한 엘리먼트를 그렸다면 반환된 `DOMMatrix` 를 `element.style.transform` 에 넣는다. 이걸 빼면 화면과 클릭 위치가 어긋난다.

## JavaScript

- ES module 을 쓴다. `type="module"` 없는 스크립트를 쓰지 않는다
- `const` 를 기본으로 하고 재할당이 필요할 때만 `let` 을 쓴다. `var` 는 쓰지 않는다
- 세미콜론을 쓴다. 작은따옴표를 쓴다. prettier 가 정리한다
- DOM 조회는 파일 상단에 모아 둔다
- 이벤트 핸들러는 이름 있는 함수로 뽑는다. 무슨 일이 언제 일어나는지 이름으로 드러나야 한다

## HTML

- `<!doctype html>` 과 `<meta charset="utf-8">` 로 시작한다
- `lang="ko"` 를 붙인다
- 캔버스에 그릴 엘리먼트는 `<canvas>` 의 **직계 자식**으로 둔다. 손자는 그릴 수 없다
- 폼 컨트롤에는 `<label>` 을 붙인다. 접근성이 이 API 의 핵심 주제다

## CSS

- `../_shared/base.css` 를 먼저 불러오고 예제별 `src/style.css` 를 덧붙인다
- 색상은 CSS 변수로 뺀다. 다크 모드는 `prefers-color-scheme` 으로 대응한다
- `<canvas>` 자식에 `display: none` 을 쓰지 않는다. 박스가 없으면 그릴 수 없다

## 주석

한국어로 쓴다. "무엇을" 이 아니라 "왜" 를 적는다. 코드를 읽으면 아는 내용을 다시 적지 않는다.

```js
// 나쁨: canvas 의 layoutSubtree 를 true 로 설정한다
// 좋음: 이걸 켜야 canvas 자식이 레이아웃 대상이 된다. 끄면 측정도 그리기도 안 된다.
canvas.layoutSubtree = true;
```

## 튜토리얼의 코드 조각

README 에 코드를 인용할 때는 소스에서 그대로 복사한다. 들여쓰기는 왼쪽에 붙여도 되지만 줄 내용은 바꾸지 않는다. 빌드가 조각을 소스에서 찾아 GitHub 링크를 붙이는데, 손으로 고쳐 쓴 조각은 찾지 못해 링크가 빠진다.

설명을 위해 일부러 줄이거나 지어낸 조각은 그대로 두면 된다. 링크만 안 붙을 뿐 문제가 되지 않는다.

소스를 고쳤으면 그 코드를 인용한 README 도 함께 고친다. `mise run check:snippets` 로 어긋난 것을 찾을 수 있다.

## README 뼈대

예제 README 는 같은 순서를 지킨다. 읽는 사람이 다음에 뭐가 나올지 알고 읽게 하기 위해서다.

1. h1 제목과 한 줄 요약
2. 무엇을 배우나
3. 실행 방법
4. 핵심 코드 (조각을 하나씩 떼어 설명)
5. 직접 해볼 것
6. 막히는 지점
7. 다음 예제 링크
