#!/usr/bin/env node
// 튜토리얼의 코드 조각이 실제 소스와 얼마나 맞는지 본다.
//
//   mise run check:snippets
//
// 일부러 줄여 쓴 조각도 있으므로 실패로 처리하지 않는다. 어긋난 것을 눈에 보이게 해서
// 소스만 고치고 튜토리얼을 두고 온 경우를 알아차리게 하는 것이 목적이다.

import { readdir, readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fenceBlocks, listSourceFiles, locate } from './snippets.mjs';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const GALLERIES = join(ROOT, 'galleries');
const CODE_LANGUAGES = new Set(['js', 'css', 'html']);

const entries = await readdir(GALLERIES, { withFileTypes: true });
const names = entries
  .filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'),
  )
  .map((entry) => entry.name)
  .sort();

let total = 0;
let exact = 0;
let anchored = 0;
const misses = [];

for (const name of names) {
  const markdown = await readFile(join(GALLERIES, name, 'README.md'), 'utf8');
  const files = await listSourceFiles(join(GALLERIES, name));
  const blocks = fenceBlocks(markdown).filter((block) => CODE_LANGUAGES.has(block.lang));

  let hitExact = 0;
  let hitAnchor = 0;

  for (const block of blocks) {
    total += 1;
    const found = locate(files, block.code);
    if (found?.exact) {
      exact += 1;
      hitExact += 1;
    } else if (found) {
      anchored += 1;
      hitAnchor += 1;
    } else {
      misses.push(`${name}  [${block.lang}]  ${block.code.split('\n')[0].trim().slice(0, 58)}`);
    }
  }

  console.log(
    `${name.padEnd(24)} 통째 ${hitExact} · 한 줄 ${hitAnchor} · 못 찾음 ${blocks.length - hitExact - hitAnchor}`,
  );
}

const linked = exact + anchored;
console.log('');
console.log(
  `코드 조각 ${total}개 중 ${linked}개에 링크가 붙습니다 (통째 ${exact}, 한 줄 ${anchored}).`,
);

if (misses.length > 0) {
  console.log('\n소스에서 찾지 못한 조각:');
  for (const miss of misses) console.log(`  ${miss}`);
  console.log('\n설명을 위해 줄여 쓴 조각이면 그대로 두면 됩니다.');
  console.log('소스를 고치고 튜토리얼을 두고 온 것이라면 맞춰 주세요.');
}
