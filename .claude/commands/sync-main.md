---
description: main 을 최신화하고 현재 브랜치를 rebase 한다
allowed-tools:
  - Bash
---

다음 순서로 실행하라.

## 현재 상태 확인

1. `git status` 로 미커밋 변경을 확인한다. 있으면 `/commit` 이나 `git stash` 를 먼저 안내한다
2. `git branch --show-current` 로 현재 브랜치를 확인한다

## main 업데이트

```bash
git fetch origin main
git log --oneline HEAD..origin/main    # main 에만 있는 commit
git log --oneline origin/main..HEAD    # 현재 브랜치에만 있는 commit
```

## 브랜치별 처리

현재 브랜치가 `main` 이면 fast-forward 한다.

```bash
git merge --ff-only origin/main
```

feature 브랜치면 rebase 를 권하되 사용자에게 선택지를 준다. 충돌이 나면 파일을 알리고 사용자가 직접 풀도록 안내한다. 이어서 `git rebase --continue`, 취소는 `git rebase --abort`.

```bash
git rebase origin/main
```

끝나면 현재 브랜치와 main 과의 차이를 요약한다.

## 주의사항

- rebase 후 push 는 force 가 필요하다. 사용자에게 명시적으로 알리고 확인받는다
- 여러 사람이 함께 쓰는 브랜치는 rebase 대신 merge 를 권한다
