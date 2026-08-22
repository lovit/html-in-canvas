// 튜토리얼의 코드 조각이 소스 어디에 있는지 찾는다.
//
// 튜토리얼은 함수 안의 코드를 왼쪽에 붙여 인용하므로 들여쓰기가 다르다.
// 공통 들여쓰기를 걷어낸 뒤 비교한다.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SOURCE_EXTENSIONS = /\.(js|mjs|css|html|svg)$/;

export const LANGUAGE_BY_EXTENSION = {
  '.js': 'js',
  '.mjs': 'js',
  '.css': 'css',
  '.html': 'html',
  '.svg': 'xml',
};

/** 예제 디렉터리 안의 소스 파일을 모은다. */
export async function listSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE_EXTENSIONS.test(entry.name)) continue;
    const full = join(entry.parentPath, entry.name);
    const text = await readFile(full, 'utf8');
    files.push({ rel: relative(dir, full), text, lines: text.split('\n') });
  }

  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** 마크다운의 코드 펜스를 순서대로 뽑는다. 렌더링 결과와 순서를 맞추는 데 쓴다. */
export function fenceBlocks(markdown) {
  const blocks = [];
  const pattern = /^```([a-zA-Z]*)\n([\s\S]*?)^```$/gm;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push({ lang: match[1], code: match[2].replace(/\n$/, '') });
  }
  return blocks;
}

/** 공통 들여쓰기를 걷어내고 줄 끝 공백을 정리한다. */
function dedent(lines) {
  const meaningful = lines.filter((line) => line.trim() !== '');
  if (meaningful.length === 0) return lines.map((line) => line.trimEnd());

  const pad = Math.min(...meaningful.map((line) => line.match(/^ */)[0].length));
  return lines.map((line) => line.slice(pad).trimEnd());
}

function windowMatches(fileLines, start, want) {
  const window = dedent(fileLines.slice(start, start + want.length));
  return want.every((line, index) => window[index] === line);
}

/** 여러 줄이 통째로 일치하는 자리를 찾는다. */
function findExact(files, wantLines) {
  for (const file of files) {
    for (let start = 0; start + wantLines.length <= file.lines.length; start += 1) {
      if (windowMatches(file.lines, start, wantLines)) {
        return { file: file.rel, start: start + 1, end: start + wantLines.length, exact: true };
      }
    }
  }
  return null;
}

/**
 * 통째로는 안 맞을 때, 조각의 첫 의미 있는 줄이 딱 한 곳에만 있으면 그 줄을 가리킨다.
 * 설명을 위해 줄인 조각이라도 "이 이야기가 사는 곳" 은 짚어 줄 수 있다.
 */
function findAnchor(files, wantLines) {
  const anchor = wantLines.find(
    (line) => line.trim().length >= 12 && !line.trim().startsWith('//'),
  );
  if (!anchor) return null;

  const hits = [];
  for (const file of files) {
    file.lines.forEach((line, index) => {
      if (line.trim() === anchor.trim())
        hits.push({ file: file.rel, start: index + 1, end: index + 1 });
    });
  }

  if (hits.length !== 1) return null;
  return { ...hits[0], exact: false };
}

/** 코드 조각이 어느 파일 몇 번째 줄에 있는지 찾는다. 못 찾으면 null. */
export function locate(files, code) {
  const wantLines = dedent(code.split('\n'));
  const meaningful = wantLines.filter((line) => line.trim() !== '');
  if (meaningful.length === 0) return null;

  return findExact(files, wantLines) ?? findAnchor(files, wantLines);
}
