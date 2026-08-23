---
description: 현재 브랜치를 push 하고 GitHub PR 을 만든다
allowed-tools:
  - Bash
  - Read
  - Write
---

다음 순서로 실행하라.

## 사전 확인

1. `git status` 로 미커밋 변경을 확인한다. 있으면 `/commit` 을 먼저 하도록 안내한다
2. `git branch --show-current` 가 `main` 이면 중단한다
3. 브랜치명 `feature/42` 에서 이슈 번호 `42` 를 뽑는다. 실패하면 물어본다

## 검사 통과 확인

PR 을 올리기 전에 검사를 돌린다. 실패하면 고치고 다시 커밋한다.

```bash
prek run --all-files
mise run check
```

## Push

```bash
git push -u origin HEAD
```

## PR 본문 작성

컨텍스트를 모은다.

```bash
gh issue view <n> --json title,body
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```

`.github/PULL_REQUEST_TEMPLATE.md` 를 읽어 본문을 파일에 쓴다. `Closes #<n>` 을 반드시 넣고, 예제 PR 이면 브라우저에서 실제로 동작하는 스크린샷을 넣는다. 문단 안에서 줄을 바꾸지 않는다.

저장소 안의 이미지를 링크할 때는 **브랜치가 아니라 커밋 SHA** 를 쓴다. `git rev-parse HEAD` 로 얻는다. 머지하며 브랜치를 지우면 `blob/feature/N/...` 링크가 전부 404 가 된다.

하드랩 검사를 통과시킨다.

```bash
node scripts/check-hard-wrap.mjs <본문 파일>
```

제목과 본문 초안을 사용자에게 보여주고 확인받는다.

## PR 생성

```bash
gh pr create --title "<제목>" --body-file <본문 파일> --base main
```

PR URL 을 안내한다.

## 주의사항

- PR 이 이미 있으면 `gh pr view` 로 기존 URL 을 안내하고 중단한다
