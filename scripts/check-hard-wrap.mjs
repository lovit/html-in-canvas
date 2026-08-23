#!/usr/bin/env node
// 마크다운 문단 중간의 줄바꿈(하드랩)을 찾아낸다.
//
// 문단은 한 줄로 이어 쓴다. 줄바꿈은 리스트 항목, 표의 행, 코드 블록,
// 인용문처럼 줄 자체가 의미를 갖는 곳에서만 쓴다. 하드랩이 있으면
// diff 가 지저분해지고, 에디터 폭에 따라 읽는 느낌이 달라진다.
//
//   node scripts/check-hard-wrap.mjs                 # 추적 중인 모든 .md
//   node scripts/check-hard-wrap.mjs issue-body.md   # 특정 파일 (이슈/PR 본문 초안 검사용)
//
// 정말 필요한 파일에는 <!-- allow-hard-wrap --> 를 넣어 예외 처리한다.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const ESCAPE_HATCH = '<!-- allow-hard-wrap -->';

const IS_FENCE = /^\s*(```|~~~)/;
const IS_HEADING = /^\s{0,3}#{1,6}\s/;
const IS_SETEXT_UNDERLINE = /^\s{0,3}(=+|-{2,})\s*$/;
const IS_LIST_ITEM = /^\s*([-*+]|\d+[.)])(\s+|\s*$)/;
const IS_TABLE_ROW = /^\s*\|/;
const IS_QUOTE = /^\s*>/;
const IS_HTML_BLOCK = /^\s*<\/?[a-zA-Z!]/;
const IS_INDENTED_CODE = /^ {4,}\S/;
const IS_LINK_DEF = /^\s*\[[^\]]+\]:\s/;
const IS_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** 문단 본문으로 취급할 줄인지 판단한다. */
function isProse(line, nextLine) {
  if (line.trim() === '') return false;
  if (IS_FENCE.test(line)) return false;
  if (IS_HEADING.test(line)) return false;
  if (IS_HR.test(line)) return false;
  if (IS_TABLE_ROW.test(line)) return false;
  if (IS_QUOTE.test(line)) return false;
  if (IS_HTML_BLOCK.test(line)) return false;
  if (IS_INDENTED_CODE.test(line)) return false;
  if (IS_LINK_DEF.test(line)) return false;
  // setext 제목(밑줄이 따라오는 줄)은 제목이지 문단이 아니다
  if (nextLine !== undefined && IS_SETEXT_UNDERLINE.test(nextLine)) return false;
  return true;
}

/** 리스트 항목의 첫 줄인지. 항목 자체는 한 줄이면 정상, 다음 줄로 이어지면 하드랩이다. */
function isListItem(line) {
  return IS_LIST_ITEM.test(line);
}

function findHardWraps(text) {
  if (text.includes(ESCAPE_HATCH)) return [];

  const lines = text.split('\n');
  const problems = [];
  let inFence = false;
  let fenceMarker = '';
  let inFrontMatter = lines[0]?.trim() === '---';
  // 이슈·PR 템플릿은 여러 줄 HTML 주석으로 안내를 적는다. 그 안은 검사하지 않는다.
  let inComment = false;

  /** 직전 줄이 "이어질 수 있는" 줄이었는지 (문단 본문 또는 리스트 항목) */
  let prevContinuable = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (inFrontMatter) {
      if (i > 0 && line.trim() === '---') inFrontMatter = false;
      prevContinuable = false;
      continue;
    }

    if (inComment) {
      if (line.includes('-->')) inComment = false;
      prevContinuable = false;
      continue;
    }
    if (line.includes('<!--') && !line.includes('-->')) {
      inComment = true;
      prevContinuable = false;
      continue;
    }

    const fence = line.match(IS_FENCE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
      }
      prevContinuable = false;
      continue;
    }
    if (inFence) {
      prevContinuable = false;
      continue;
    }

    const prose = isProse(line, lines[i + 1]);
    const listItem = isListItem(line);

    // 앞줄이 이어질 수 있는 줄이었는데 이번 줄도 문단 본문이면 문단이 두 줄로 쪼개진 것이다
    if (prevContinuable && prose && !listItem) {
      problems.push({ line: i + 1, text: line.trim() });
    }

    if (line.endsWith('  ') && line.trim() !== '') {
      problems.push({ line: i + 1, text: line.trim(), reason: '줄 끝 공백 두 칸(강제 줄바꿈)' });
    }

    prevContinuable = prose || listItem;
  }

  return problems;
}

function targetFiles() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;
  const out = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

let failed = false;
for (const file of targetFiles()) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    console.error(`${file}: 읽을 수 없습니다`);
    failed = true;
    continue;
  }

  for (const p of findHardWraps(text)) {
    failed = true;
    const reason = p.reason ?? '문단 중간 줄바꿈';
    console.error(`${file}:${p.line}: ${reason} → ${p.text.slice(0, 60)}`);
  }
}

if (failed) {
  console.error('');
  console.error('문단은 줄바꿈 없이 한 줄로 이어 쓴다. 자동으로 고치려면: mise run fmt');
  process.exit(1);
}
