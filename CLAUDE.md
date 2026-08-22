# html-in-canvas

HTML-in-Canvas API 를 예제로 익히는 학습용 저장소. `galleries/` 아래에 예제 하나씩 쌓고, 예제 하나가 이슈 하나다.

## 글쓰기 규칙 (가장 자주 어기는 것)

**문단 안에서 줄을 바꾸지 않는다.** 마크다운 파일, 이슈 본문, PR 본문, 커밋 본문 모두 해당한다. 문단이 아무리 길어도 한 줄로 이어 쓴다. 하드랩이 있으면 한 단어만 고쳐도 diff 가 여러 줄로 번지고, 읽는 사람 화면 폭에 따라 줄이 이상하게 끊긴다.

줄바꿈을 써도 되는 곳은 줄 자체가 의미를 갖는 곳뿐이다. 리스트 항목, 표의 행, 코드 블록 안, 인용문, 제목.

- 파일은 prettier 가 지킨다. `.prettierrc.json` 의 `proseWrap: "never"` 가 문단을 한 줄로 되돌린다.
- 이슈와 PR 본문은 훅이 못 잡는다. 본문을 파일에 쓰고 `node scripts/check-hard-wrap.mjs <파일>` 로 확인한 뒤 `gh issue create --body-file` / `gh pr create --body-file` 로 넘긴다. 셸 히어독에 손으로 줄바꿈을 넣지 않는다.

문체는 `/humanize-ko` 스킬과 @.claude/rules/writing-style.md 를 따른다. 쉬운 말로 쓰되 API 이름과 전문 용어는 원어 그대로 정확히 쓴다.

## 개발 워크플로

```text
/start-issue "예제 설명"   → GitHub 이슈 생성 + worktree branch 분기
예제 작업 + 브라우저에서 실제 확인
/commit                    → 의미 단위 분리, 한국어 conventional commit
/review                    → 4개 sub-agent 병렬 리뷰
/open-pr                   → PR 생성 (Closes #N 자동 포함)
머지 후: /worktree-clean   → 완료된 worktree/브랜치 정리
```

**기본 규칙**: 항상 이슈를 먼저 만들고 worktree 로 분기해서 작업한다. 사용자가 명시적으로 요청한 경우에만 현재 브랜치에서 직접 작업한다.

## 커밋 규칙

- 형식: `<type>(<scope>): <한국어 설명>`
- type: `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style` / `perf`
- 한 commit = 한 의도. 리팩터링과 기능 추가를 섞지 않는다
- subject 는 한국어 50자 이내, 마침표 없음 (`scripts/check-commit-msg.mjs` 가 검사한다)
- 자동 부착: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 자세한 예시: @.claude/rules/git-workflow.md

## 브랜치/PR 규칙

- 브랜치: `feature/{issue-number}` (예: `feature/42`)
- worktree 위치: `../html-in-canvas-worktrees/feature/<n>`
- PR body 에 `Closes #N` 필수
- PR 에는 브라우저에서 실제로 동작하는 화면 스크린샷을 첨부한다

## 도구

| 도구         | 용도                      | 명령                              |
| ------------ | ------------------------- | --------------------------------- |
| mise         | node 버전, 환경변수, task | `mise install`, `mise run <task>` |
| prek         | 커밋 전 자동 검사         | `prek run --all-files`            |
| prettier     | 포맷 + 하드랩 제거        | `mise run fmt`                    |
| markdownlint | 마크다운 린트             | `mise run lint:md`                |

```bash
mise install            # node 설치
mise run setup          # prek 훅 등록
mise run serve          # 정적 서버 (기본 http://localhost:4173)
mise run chrome         # 플래그를 켠 Chrome 을 전용 프로필로 실행
mise run check          # 갤러리 구조 + 하드랩 검사 (CI 와 동일)
mise run site           # 발행용 사이트를 _site/ 에 만든다
mise run site:serve     # 만든 사이트를 띄워 확인한다
```

`main` 에 푸시하면 `.github/workflows/pages.yml` 이 사이트를 <https://lovit.github.io/html-in-canvas/> 로 배포한다. 예제 파일은 손대지 않고 그대로 옮기므로, 로컬에서 동작하면 사이트에서도 동작한다.

## 예제 작성 규칙

예제는 빌드 없이 파일 그대로 돌아가야 한다. 번들러, 트랜스파일러, npm 의존성을 쓰지 않는다. 3D 예제도 Three.js 같은 라이브러리 없이 raw WebGL2 로 작성한다.

```text
galleries/NN-job-name/
├── README.md      # 튜토리얼 본문 (h1 으로 시작)
├── index.html
└── src/
    ├── main.js    # ES module
    └── style.css
```

- 디렉터리 이름은 `NN-kebab-case`. 번호가 학습 순서다
- 모든 예제는 `../_shared/support.js` 로 기능을 감지하고, 미지원 브라우저에서는 안내 배너를 띄운 뒤 조용히 멈춘다. 콘솔 에러를 던지고 끝내지 않는다
- 새 예제를 추가하면 `galleries/README.md` 목차에도 넣는다. `mise run check` 가 확인한다
- 코드 주석은 한국어로 쓰되, "무엇을" 이 아니라 "왜" 를 적는다

자세한 규칙: @.claude/rules/web-style.md

## API 주의사항

이 API 는 아직 표준화 전이고 이름이 바뀐 적이 있다. **초기 제안의 `drawElement()` / `placeElement()` 가 아니라 현재 이름은 `drawElementImage()` 다.** 기억에 의존하지 말고 @docs/api-reference.md 를 먼저 읽고, 의심스러우면 브라우저에서 직접 확인한다.

Chromium 147+ 에서 플래그가 필요하다. 셋업은 @docs/browser-setup.md 참고.

## 참고 문서

- API 요약: @docs/api-reference.md
- 브라우저 셋업: @docs/browser-setup.md
- 용어 대응표: @docs/glossary.md
- Git 워크플로: @.claude/rules/git-workflow.md
- 글쓰기 규칙: @.claude/rules/writing-style.md
- 예제 코드 스타일: @.claude/rules/web-style.md
- 리뷰 정책: @.claude/rules/review-policy.md
