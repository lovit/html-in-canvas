---
description: 4개 sub-agent 를 병렬로 돌려 PR 을 리뷰하고 통합 리포트를 만든다
allowed-tools:
  - Bash
  - Read
  - Task
argument-hint: [pr-number]
---

@.claude/rules/review-policy.md 를 따라 리뷰하라.

## 리뷰 대상 결정

`$ARGUMENTS` 에 PR 번호가 있으면 그 PR 을 본다.

```bash
gh pr view $ARGUMENTS --json number,title,body,url
gh pr diff $ARGUMENTS
```

번호가 없으면 현재 브랜치로 판단한다.

- `gh pr list --head $(git branch --show-current) --json number,url` 로 PR 이 있는지 확인한다
- PR 이 없으면 `git diff origin/main...HEAD` 를 쓴다

## 컨텍스트 수집

브랜치명이나 PR 본문의 `Closes #\d+` 에서 이슈 번호를 뽑고 `gh issue view` 로 Acceptance Criteria 를 가져온다. 변경된 파일 목록과 commit 히스토리도 함께 모은다.

## 병렬 리뷰

sub-agent 4개를 한 번에 띄운다. 각 agent 에게 diff, 이슈 정보, 변경 파일 목록을 함께 넘긴다.

- `code-quality-reviewer`
- `issue-goal-reviewer`
- `security-reviewer`
- `docs-tutorial-reviewer`

## 통합 리포트

결과를 Critical / Important / Suggestions / Strengths 로 합친다. 여러 agent 가 같은 것을 지적하면 하나로 묶는다. 마지막에 판정(Approve 또는 Request Changes)과 근거를 적는다.

PR 번호가 있으면 `gh pr comment` 로 게시할지 물어본다. 게시할 때도 본문은 파일에 써서 `--body-file` 로 넘기고 하드랩 검사를 먼저 통과시킨다.
