---
description: GitHub 이슈를 만들고 worktree branch 를 분기한다
allowed-tools:
  - Bash
  - Read
  - Write
argument-hint: <이슈 제목>
---

다음 순서로 실행하라.

## 사전 확인

1. `gh auth status` 로 인증을 확인한다. `GH_TOKEN` 은 `~/.zshenv` 에 있으므로 대개 이미 인증돼 있다. "not logged into any GitHub hosts" 가 나와도 `gh auth login` 을 시키지 말고 환경변수부터 확인한다
2. `git remote get-url origin` 으로 원격 저장소를 확인한다

## 이슈 본문 작성

3. `$ARGUMENTS` 가 비어 있으면 이슈 제목을 물어본다
4. 이슈 본문을 파일에 쓴다. 셸 히어독에 긴 문단을 직접 넣지 말고 임시 파일에 쓴 뒤 넘긴다. 예제 이슈면 `.github/ISSUE_TEMPLATE/gallery.md` 형식을, 그 외에는 `.github/ISSUE_TEMPLATE/bug.md` 형식이나 자유 형식을 쓴다. 문단 안에서 줄을 바꾸지 않는다
5. 하드랩 검사를 통과시킨다

```bash
node scripts/check-hard-wrap.mjs <본문 파일>
```

6. 본문 초안을 사용자에게 보여주고 확인받는다

## 이슈 생성

```bash
gh issue create --title "$ARGUMENTS" --body-file <본문 파일> --label enhancement
```

생성된 이슈 URL 에서 번호를 뽑는다.

## Worktree 생성

```bash
git fetch origin main
git worktree add ../html-in-canvas-worktrees/feature/<n> -b feature/<n> origin/main
```

경로를 알리고 그 worktree 에서 새 세션을 시작하도록 안내한다.

## 주의사항

- worktree 디렉터리가 이미 있으면 알리고 기존 것을 쓸지 물어본다
- 브랜치 `feature/<n>` 이 이미 있으면 `origin/main` 대신 그 브랜치에서 분기한다
