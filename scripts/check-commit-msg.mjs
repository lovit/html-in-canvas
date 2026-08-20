#!/usr/bin/env node
// 커밋 메시지가 conventional commit 형식인지 확인한다. commit-msg 훅에서 호출된다.
//
//   <type>(<scope>): <한국어 설명>
//
// scope 는 생략할 수 있다. 되돌리기/머지/fixup 커밋은 검사하지 않는다.

import { readFile } from 'node:fs/promises';

const TYPES = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'style', 'perf'];
const SUBJECT_MAX = 50;

const PATTERN = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9._/-]+\\))?!?: (.+)$`);
const SKIP = /^(Merge |Revert |fixup! |squash! )/;

const path = process.argv[2];
if (!path) {
  console.error('커밋 메시지 파일 경로가 필요합니다');
  process.exit(1);
}

const raw = await readFile(path, 'utf8');
const subject = raw.split('\n').find((l) => !l.startsWith('#') && l.trim() !== '') ?? '';

if (SKIP.test(subject)) process.exit(0);

const problems = [];
const match = subject.match(PATTERN);

if (!match) {
  problems.push(`형식이 맞지 않습니다: "${subject}"`);
  problems.push(`  기대 형식: <type>(<scope>): <설명>`);
  problems.push(`  쓸 수 있는 type: ${TYPES.join(', ')}`);
} else {
  const description = match[3];
  if (description.endsWith('.')) problems.push('설명은 마침표로 끝내지 않습니다');
  if (description.length > SUBJECT_MAX) {
    problems.push(`설명이 ${description.length}자입니다. ${SUBJECT_MAX}자 이내로 줄여주세요`);
  }
}

if (problems.length > 0) {
  console.error('커밋 메시지를 고쳐주세요.\n');
  for (const p of problems) console.error(p);
  console.error('\n예: feat(gallery): drawElementImage 기본 예제 추가');
  process.exit(1);
}
