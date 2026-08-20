# html-in-canvas

HTML-in-Canvas API 를 예제로 익히는 학습용 저장소. 예제를 순서대로 따라가면서 DOM 엘리먼트를 캔버스에 그리고, 그린 뒤에도 클릭과 스크린리더가 살아 있게 만드는 방법을 배운다.

## 이게 뭔가

캔버스로 UI 를 그리는 앱은 텍스트 줄바꿈, 폰트 폴백, 폼 컨트롤, 접근성을 전부 직접 구현해야 했다. HTML-in-Canvas 는 그 일을 CSS 엔진에 도로 맡긴다. `<canvas>` 의 자식 엘리먼트를 캔버스 컨텍스트에 그리고, 그린 위치에 맞춰 히트 테스트와 접근성 트리를 유지한다.

```js
canvas.layoutSubtree = true;
canvas.addEventListener('paint', () => {
  ctx.reset();
  card.style.transform = ctx.drawElementImage(card, 40, 20).toString();
});
canvas.requestPaint();
```

아직 표준화 전이고 Chromium 계열에서 플래그가 필요하다. 자세한 것은 [API 요약](docs/api-reference.md)과 [브라우저 셋업](docs/browser-setup.md)에 있다.

## 시작하기

```bash
mise trust && mise install   # node 설치
mise run setup               # prek 훅 등록
mise run serve               # 터미널 1: 정적 서버
mise run chrome              # 터미널 2: 플래그를 켠 Chrome
```

Chrome 이 `http://localhost:4173/galleries/` 를 연다. 거기서 예제를 하나씩 열어 보면 된다.

## 무엇이 들어 있나

| 경로                                | 내용                                                     |
| ----------------------------------- | -------------------------------------------------------- |
| [`galleries/`](galleries/README.md) | 예제 10개와 튜토리얼                                     |
| [`docs/`](docs/api-reference.md)    | API 요약, 브라우저 셋업, 용어 대응표                     |
| `scripts/`                          | 정적 서버와 검사 스크립트 (의존성 없음)                  |
| `.claude/`                          | 개발 워크플로 커맨드, 리뷰 에이전트, `/humanize-ko` 스킬 |

## 개발 워크플로

예제 하나가 이슈 하나다.

```text
/start-issue "예제 설명"   → 이슈 생성 + worktree 분기
작업 + 브라우저에서 확인
/commit                    → 한국어 conventional commit
/review                    → 4개 sub-agent 병렬 리뷰
/open-pr                   → PR 생성 (Closes #N 포함)
머지 후: /worktree-clean
```

## 도구

| 도구                                 | 용도                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| [mise](https://mise.jdx.dev/)        | node 버전, 환경변수, task 러너                           |
| [prek](https://github.com/j178/prek) | 커밋 전 자동 검사                                        |
| prettier                             | 포맷팅. `proseWrap: "never"` 로 마크다운 하드랩을 없앤다 |
| markdownlint                         | 마크다운 린트                                            |

```bash
mise run fmt      # 포맷팅 (하드랩도 여기서 풀린다)
mise run lint     # 포맷 + 마크다운 린트
mise run check    # 갤러리 구조 + 하드랩 검사
prek run --all-files
```

## 글쓰기 규칙

문단 안에서 줄을 바꾸지 않는다. 마크다운 파일, 이슈 본문, PR 본문 모두 해당한다. 자세한 이유와 예외는 [글쓰기 규칙](.claude/rules/writing-style.md)에 있다.

## 참고

- [WICG/html-in-canvas 설명서](https://github.com/WICG/html-in-canvas)
- [Chrome for Developers 블로그](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
- [html-in-canvas.dev 데모 모음](https://html-in-canvas.dev/)
