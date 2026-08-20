# 리뷰 정책

## 리뷰 실행 흐름

`/review [pr-number]` 호출 시 이렇게 진행한다.

1. PR 번호가 있으면 `gh pr view {n}` 과 `gh pr diff {n}` 을 가져온다
2. 없으면 현재 브랜치의 `git diff origin/main...HEAD` 를 쓴다
3. 4개 sub-agent 를 병렬로 실행한다
4. 결과를 모아 통합 리포트를 만든다
5. PR 번호가 있으면 `gh pr comment {n}` 으로 게시할지 물어본다

## 리뷰어 4종

| Agent                    | 모델   | 담당                                                   |
| ------------------------ | ------ | ------------------------------------------------------ |
| `code-quality-reviewer`  | Sonnet | 가독성, 중복, 네이밍, ES module 규칙, commit 단위 분리 |
| `issue-goal-reviewer`    | Sonnet | Acceptance Criteria 달성 여부, scope creep 감지        |
| `security-reviewer`      | Opus   | XSS, 안전하지 않은 DOM 삽입, 비밀값 노출, 외부 리소스  |
| `docs-tutorial-reviewer` | Sonnet | 설명과 코드의 일치, 학습 순서, 하드랩, 기계적 문체     |

## 공통 출력 포맷

```markdown
## [에이전트 이름] 리뷰

### Critical (머지 전 필수 수정)

### Important (수정 권장)

### Suggestions (선택적 개선)

### Strengths (잘된 점)
```

각 항목 형식은 이렇게 쓴다.

```text
**파일**: galleries/01-hello-world/src/main.js:23
**이슈**: 무엇이 문제인지
**이유**: 왜 문제인지 (영향)
**제안**: 어떻게 수정할지
```

## 판정 기준

- **Approve**: Critical 이슈 없음, Acceptance Criteria 충족, 브라우저에서 동작 확인됨
- **Request Changes**: Critical 이슈 1건 이상, Acceptance Criteria 미달, 문서와 코드 불일치

## 리뷰어별 특이사항

### code-quality-reviewer

CLAUDE.md 와 `.claude/rules/web-style.md` 위반을 우선 확인한다. 특히 빌드 도구나 외부 의존성이 슬쩍 들어오지 않았는지 본다. False positive 는 보수적으로 걸러 확실한 것만 보고한다.

### issue-goal-reviewer

이슈 body 의 Acceptance Criteria 를 하나씩 체크한다. 이슈가 요구하지 않은 변경이 섞였으면 지적한다.

### security-reviewer

정적 사이트라도 `innerHTML` 로 사용자 입력을 넣는 패턴, 외부 스크립트 로드, 커밋에 섞인 토큰을 본다. 확실하지 않아도 의심되면 보고한다.

### docs-tutorial-reviewer

README 의 코드 조각이 실제 파일 내용과 같은지 대조한다. 앞 예제에서 안 배운 개념을 설명 없이 쓰고 있으면 지적한다. 하드랩과 번역투도 여기서 잡는다.
