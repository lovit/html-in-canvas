---
description: 머지가 끝난 worktree 와 브랜치를 정리한다
allowed-tools:
  - Bash
---

다음 순서로 실행하라.

## 상태 파악

```bash
git worktree list
gh pr list --state merged --author @me --json number,headRefName,mergedAt,url
```

worktree 브랜치와 머지된 PR 을 짝지어 정리 대상을 찾는다.

## 확인

정리 대상 목록을 보여주고 확인받는다.

## 정리 실행

```bash
git worktree remove ../html-in-canvas-worktrees/feature/<n>
git branch -d feature/<n>
```

정리 후 남은 worktree 목록을 보여준다.

## 주의사항

- 지금 사용 중인 worktree 는 지우지 않는다
- 미커밋 변경이 있으면 `git worktree remove` 가 실패한다. 실패하면 알리고 수동 처리를 안내한다
- 브랜치 삭제는 `-d` 를 쓴다. `-D` 는 사용자가 명시적으로 요청할 때만 쓴다
- PR 없이 만들어진 worktree 는 따로 나열해 사용자가 판단하게 한다
