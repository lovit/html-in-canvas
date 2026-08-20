#!/usr/bin/env node
// 갤러리 예제가 약속한 구조를 지키는지, 목차와 링크가 어긋나지 않는지 확인한다.
//
//   node scripts/check-galleries.mjs
//
// 검사 항목
//   1. 디렉터리 이름이 NN-kebab-case 인가
//   2. README.md 와 index.html 이 있고, README 가 h1 으로 시작하는가
//   3. index.html 이 참조하는 로컬 파일이 실제로 있는가
//   4. galleries/README.md 목차에 모든 예제가 빠짐없이 들어 있는가
//   5. 마크다운의 상대 링크가 실제 파일을 가리키는가

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const GALLERIES = join(ROOT, 'galleries');
const NAME_PATTERN = /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;
// 앞선 참조: 아직 만들지 않은 뒤 예제를 미리 링크하는 것은 정상이다.
// 다만 오타를 놓치지 않도록, galleries/README.md 로드맵에 있는 이름만 허용한다.
const PLANNED_LINK = /^\.\.\/(\d{2}-[a-z0-9-]+)\/?$/;

const errors = [];
const fail = (file, message) => errors.push(`${relative(ROOT, file)}: ${message}`);

const exists = (p) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** HTML 에서 참조하는 로컬 경로를 뽑는다. */
function localRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const value = m[1].trim();
    if (!value) continue;
    if (/^(https?:|data:|blob:|mailto:|#|\/\/)/.test(value)) continue;
    refs.push(value.split(/[?#]/)[0]);
  }
  return refs;
}

/** 마크다운에서 상대 링크를 뽑는다. */
function localLinks(md) {
  const links = [];
  const withoutCode = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const value = m[1].trim();
    if (/^(https?:|data:|mailto:|#)/.test(value)) continue;
    links.push(value.split('#')[0]);
  }
  return links.filter(Boolean);
}

/** galleries/README.md 로드맵에 이름이 오른 예제 목록. 아직 없어도 링크를 허용한다. */
async function plannedNames() {
  const tocPath = join(GALLERIES, 'README.md');
  if (!(await exists(tocPath))) return new Set();
  const toc = await readFile(tocPath, 'utf8');
  const names = new Set();
  for (const m of toc.matchAll(/`(\d{2}-[a-z0-9-]+)`/g)) names.add(m[1]);
  for (const m of toc.matchAll(/\]\(\.\/(\d{2}-[a-z0-9-]+)\//g)) names.add(m[1]);
  return names;
}

const PLANNED = await plannedNames();

/** 아직 만들지 않은 뒤 예제를 가리키는 링크인지 판단한다. */
function isPlannedLink(fromPath, link) {
  const inGallery = dirname(fromPath).startsWith(GALLERIES);
  const match = link.match(PLANNED_LINK);
  return inGallery && match !== null && PLANNED.has(match[1]);
}

async function checkLinks(mdPath) {
  const md = await readFile(mdPath, 'utf8');
  for (const link of localLinks(md)) {
    if (isPlannedLink(mdPath, link)) continue;
    const target = normalize(join(dirname(mdPath), link));
    if (!(await exists(target))) fail(mdPath, `깨진 링크: ${link}`);
  }
}

if (!(await exists(GALLERIES))) {
  console.log('galleries/ 가 아직 없습니다. 검사할 것이 없습니다.');
  process.exit(0);
}

const entries = await readdir(GALLERIES, { withFileTypes: true });
const galleryDirs = entries
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort();

for (const name of galleryDirs) {
  const dir = join(GALLERIES, name);

  if (!NAME_PATTERN.test(name)) {
    fail(dir, '디렉터리 이름은 NN-kebab-case 여야 합니다 (예: 01-hello-world)');
  }

  for (const required of ['README.md', 'index.html']) {
    if (!(await exists(join(dir, required)))) fail(dir, `${required} 가 없습니다`);
  }

  const readmePath = join(dir, 'README.md');
  if (await exists(readmePath)) {
    const readme = await readFile(readmePath, 'utf8');
    const firstLine = readme.split('\n').find((l) => l.trim() !== '') ?? '';
    if (!firstLine.startsWith('# ')) fail(readmePath, 'README 는 h1 제목으로 시작해야 합니다');
    await checkLinks(readmePath);
  }

  const indexPath = join(dir, 'index.html');
  if (await exists(indexPath)) {
    const html = await readFile(indexPath, 'utf8');
    for (const ref of localRefs(html)) {
      if (isPlannedLink(indexPath, ref)) continue;
      const target = normalize(join(dir, ref));
      if (!(await exists(target))) fail(indexPath, `참조하는 파일이 없습니다: ${ref}`);
    }
  }
}

// 목차 정합성
const indexMd = join(GALLERIES, 'README.md');
if (!(await exists(indexMd))) {
  fail(indexMd, '갤러리 목차 파일이 없습니다');
} else {
  const toc = await readFile(indexMd, 'utf8');
  for (const name of galleryDirs) {
    if (!toc.includes(`(./${name}/`)) fail(indexMd, `목차에 ${name} 링크가 없습니다`);
  }
  await checkLinks(indexMd);
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error(`\n${errors.length}건의 문제가 있습니다.`);
  process.exit(1);
}

console.log(`갤러리 ${galleryDirs.length}개 검사 통과`);
