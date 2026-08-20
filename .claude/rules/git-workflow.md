# Git 워크플로 규칙

## Conventional Commit 형식

```text
<type>(<scope>): <한국어 설명>

<선택: 한국어 본문 — 왜 이 변경이 필요한지>

<선택: footer>
Closes #<issue-number>
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### Type 표

| type       | 의미                     |
| ---------- | ------------------------ |
| `feat`     | 새 기능, 새 예제         |
| `fix`      | 버그 수정                |
| `refactor` | 동작 변화 없는 구조 개선 |
| `docs`     | 문서만 변경              |
| `test`     | 검사 스크립트 추가/수정  |
| `chore`    | 도구, 설정, CI           |
| `style`    | 포매팅 (로직 변화 없음)  |
| `perf`     | 성능 개선                |

주로 쓰는 scope: 예제 디렉터리 이름(`01-hello-world`), `galleries`, `docs`, `scripts`, `claude`, `ci`.

### Subject 규칙

- 한국어 50자 이내 (`scripts/check-commit-msg.mjs` 가 검사한다)
- 마침표로 끝내지 않는다
- type 과 scope 는 영어 소문자

## Commit Unit 분리 원칙

**한 commit = 한 의도.** 다음은 섞지 않는다.

- 리팩터링 + 기능 추가
- 여러 무관한 버그 수정
- 예제 코드 + 도구 설정 변경

### 좋은 분리 예시

```text
feat(03-interactive-form): 폼 예제 뼈대와 index.html 추가
feat(03-interactive-form): 반환 DOMMatrix 로 히트테스트 위치 동기화
docs(03-interactive-form): 튜토리얼 본문 작성
```

### 나쁜 예시

```text
feat: 예제 추가            # 어떤 예제인지 모른다
update                     # 무엇을? 왜?
Feat: 기능 추가함.         # type 대문자, 마침표
```

## Commit 실행 절차

### 1단계: 변경사항 파악

```bash
git status
git diff
```

### 2단계: 의도 분석

diff 를 읽고 변경사항을 의도 단위로 나눈다. 단일 의도면 바로 3단계로 간다. 여러 의도가 섞였으면 분리 계획을 먼저 사용자에게 보여주고 확인받는다.

### 3단계: 메시지 초안 제시 후 실행

```bash
git add <관련 파일>
git commit -m "<type>(<scope>): <한국어 설명>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

커밋 본문에도 하드랩을 넣지 않는다. 문단은 한 줄로 쓴다.

## 브랜치 규칙

- 이름: `feature/{issue-number}` (예: `feature/42`)
- worktree 위치: `../html-in-canvas-worktrees/feature/<n>`
- 기본 분기점: `origin/main`
- 사용자가 명시적으로 요청하지 않으면 현재 브랜치에서 직접 작업하지 않는다

## PR 규칙

- PR body 에 `Closes #N` 필수
- 예제 PR 에는 브라우저에서 실제로 동작하는 화면 스크린샷을 넣는다
- 본문은 파일에 써서 `--body-file` 로 넘긴다. 하드랩 검사를 먼저 통과시킨다
- 머지 전 `/review` 실행 권장

## Worktree 사용법

```bash
git worktree add ../html-in-canvas-worktrees/feature/42 -b feature/42 origin/main
git worktree list
git worktree remove ../html-in-canvas-worktrees/feature/42
git branch -d feature/42
```

## Push 인증

`origin` 은 SSH 로 연결되어 있고 SSH 키 인증이 된다. `git push` 가 그대로 동작한다. HTTPS 로 바꿔야 한다면 macOS 기본 credential helper 대신 `GH_TOKEN` 을 쓴다.

```bash
git -c credential.helper='!f() { echo username=lovit; echo password=$GH_TOKEN; }; f' push origin <branch>
```
