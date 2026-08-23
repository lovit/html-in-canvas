#!/usr/bin/env node
// 튜토리얼의 코드 조각이 실제 소스와 얼마나 맞는지 본다.
//
//   mise run check:snippets                    # 검사
//   node scripts/check-snippets.mjs --update   # 기준치 갱신
//
// 일부러 줄여 쓴 조각이 있으므로 "못 찾은 것이 있으면 실패" 로 만들 수 없다.
// 대신 예제마다 링크가 붙은 수를 기준치로 적어 두고, 그 수가 줄면 실패시킨다.
// 줄었다는 것은 전에는 소스와 맞던 조각이 어긋났다는 뜻이다.
//
// 소스를 고치고 튜토리얼을 두고 오는 실수가 세 번 반복돼서 넣었다.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fenceBlocks, listSourceFiles, locate } from './snippets.mjs';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const GALLERIES = join(ROOT, 'galleries');
const BASELINE = join(ROOT, 'scripts', 'snippet-baseline.json');
const CODE_LANGUAGES = new Set(['js', 'css', 'html']);
const UPDATE = process.argv.includes('--update');

/** 예제마다 링크가 붙은 수를 적어 둔 파일. 없으면 전부 0 으로 본다. */
async function readBaseline() {
  try {
    return JSON.parse(await readFile(BASELINE, 'utf8'));
  } catch {
    return {};
  }
}

const baseline = await readBaseline();

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
const current = {};
const regressions = [];

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

  const linkedHere = hitExact + hitAnchor;
  current[name] = linkedHere;

  const expected = baseline[name] ?? 0;
  if (linkedHere < expected) regressions.push({ name, expected, linkedHere });

  console.log(
    `${name.padEnd(24)} 통째 ${hitExact} · 한 줄 ${hitAnchor} · 못 찾음 ${blocks.length - hitExact - hitAnchor}` +
      (linkedHere < expected ? `  ← 기준치 ${expected} 에서 줄었다` : ''),
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

if (UPDATE) {
  await writeFile(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log('\n기준치를 갱신했습니다: scripts/snippet-baseline.json');
  process.exit(0);
}

if (regressions.length > 0) {
  console.error('\n전에는 소스와 맞던 조각이 어긋났습니다.');
  for (const item of regressions) {
    console.error(`  ${item.name}: ${item.expected}개 → ${item.linkedHere}개`);
  }
  console.error('\n소스를 고쳤다면 README 의 코드 조각도 함께 고쳐 주세요.');
  console.error(
    '일부러 줄인 것이라면 기준치를 갱신합니다: node scripts/check-snippets.mjs --update',
  );
  process.exit(1);
}

if (Object.entries(current).some(([name, count]) => count > (baseline[name] ?? 0))) {
  console.log('\n기준치보다 늘어난 예제가 있습니다. 갱신해 두면 다음부터 그 수를 지킵니다.');
  console.log('  node scripts/check-snippets.mjs --update');
}
