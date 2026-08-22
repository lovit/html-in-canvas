# 브라우저 셋업

HTML-in-Canvas 는 아직 플래그 뒤에 있다. 플래그를 켜지 않으면 `ctx.drawElementImage` 가 `undefined` 라서 모든 예제가 안내 배너만 띄우고 멈춘다.

## 지원 현황

| 브라우저               | 상태               |
| ---------------------- | ------------------ |
| Chrome / Chromium 147+ | 플래그로 사용 가능 |
| Brave 1.89.132+        | 플래그로 사용 가능 |
| Firefox, Safari        | 구현 계획 없음     |

## 방법 1: 전용 프로필로 띄우기 (권장)

평소 쓰는 Chrome 프로필은 그대로 두고, 실험 플래그를 켠 별도 인스턴스를 띄운다. 저장소에 task 로 만들어 뒀다.

```bash
mise run serve    # 터미널 1: 정적 서버
mise run chrome   # 터미널 2: 플래그를 켠 Chrome
```

`mise run chrome` 이 실제로 하는 일은 이것이다.

```bash
open -na "Google Chrome" --args \
  --enable-blink-features=CanvasDrawElement \
  --user-data-dir="$PWD/.chrome-profile" \
  --no-first-run --no-default-browser-check \
  "http://localhost:4173/galleries/"
```

`--user-data-dir` 를 따로 주면 기존 창과 별개의 인스턴스가 뜬다. 프로필 디렉터리는 `.gitignore` 에 들어 있으니 지워도 된다.

macOS 가 아니면 `open -na` 대신 실행 파일을 직접 부른다.

```bash
google-chrome --enable-blink-features=CanvasDrawElement --user-data-dir=/tmp/canvas-profile http://localhost:4173/galleries/
```

## 방법 2: chrome://flags

주소창에 `chrome://flags/#canvas-draw-element` 를 열고 "Enable the new drawElement API for Canvas" 를 Enabled 로 바꾼 뒤 재시작한다. 브라우저 전체에 적용되므로 평소 브라우징에도 실험 기능이 켜진다는 점만 알아 두자. Brave 는 `brave://flags/#canvas-draw-element`.

## 방법 3: origin trial (발행된 사이트용)

사이트를 방문하는 사람에게 플래그를 켜라고 하기는 어렵다. Chrome 의 origin trial 에 출처를 등록하면 그 출처에서는 플래그 없이 API 가 열린다.

1. [Chrome Origin Trials](https://developer.chrome.com/origintrials) 에서 HTML-in-Canvas 트라이얼을 찾아 등록한다
2. Origin 에 `https://lovit.github.io` 를 넣는다. 하위 경로 전체에 적용된다
3. 발급된 토큰을 저장소 Settings > Secrets and variables > Actions 에 `ORIGIN_TRIAL_TOKEN` 이름으로 넣는다
4. 다음 배포부터 모든 페이지에 아래 태그가 들어간다

```html
<meta http-equiv="origin-trial" content="발급받은 토큰" />
```

토큰은 정해진 Chrome 마일스톤까지만 유효하다. 이 트라이얼은 148 에서 시작해 154 까지 연장됐다. 만료되면 브라우저가 태그를 무시하므로 사이트가 깨지지는 않고 안내 배너가 뜨는 상태로 돌아간다.

시크릿을 넣지 않아도 빌드와 배포는 그대로 된다. 그때는 방문자가 직접 플래그를 켜야 한다.

## 켜졌는지 확인하기

DevTools 콘솔에 붙여 넣는다.

```js
const c = document.createElement('canvas');
console.log(typeof c.getContext('2d').drawElementImage, 'layoutSubtree' in c);
// 켜짐:  function true
// 꺼짐:  undefined false
```

## 헤드리스로 확인하기

CI 나 스크립트에서 확인할 때 쓴다. WebGL 예제까지 확인하려면 `--use-angle=swiftshader` 를 함께 준다.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --no-sandbox --use-angle=swiftshader \
  --enable-blink-features=CanvasDrawElement \
  --dump-dom "http://localhost:4173/galleries/01-hello-world/"
```

## 잘 안 될 때

| 증상 | 원인 |
| --- | --- |
| `drawElementImage is not a function` | 플래그가 안 켜졌거나, 플래그 없는 창에서 열었다 |
| 자식 엘리먼트가 아예 안 보인다 | `canvas.layoutSubtree = true` 를 빠뜨렸다 |
| `InvalidStateError` | 첫 `paint` 이벤트 전에 그렸다. `requestPaint()` 로 시작하고 `paint` 안에서 그린다 |
| 클릭이 엉뚱한 곳에서 먹는다 | 반환된 `DOMMatrix` 를 엘리먼트 `transform` 에 안 넣었다 |
| 이미지 한 칸이 통째로 빈다 | cross-origin 리소스라 read-back-allowed 규칙에 걸렸다 |
