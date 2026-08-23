#!/usr/bin/env node
// GitHub Pages 로 올릴 정적 사이트를 _site/ 에 만든다.
//
//   mise run site          # 로컬에서 빌드
//   mise run site:serve    # 빌드한 결과를 띄워 확인
//
// 저장소 구조는 그대로 두고 필요한 것만 모은다. 의존성은 쓰지 않는다.
// 마크다운은 GitHub 의 렌더링 API 를 빌려 쓴다. CI 에서는 GITHUB_TOKEN 이 있으므로
// 곧바로 되고, 토큰이 없으면 원문을 그대로 보여 주는 쪽으로 물러선다.

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './html.mjs';
import { fenceBlocks, listSourceFiles, locate } from './snippets.mjs';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const OUT = join(ROOT, '_site');
const GALLERIES = join(ROOT, 'galleries');
const DOCS = join(ROOT, 'docs');

const ORIGIN_TRIAL_TOKEN = process.env.ORIGIN_TRIAL_TOKEN ?? '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
const REPO = process.env.GITHUB_REPOSITORY ?? 'lovit/html-in-canvas';

const SITE_TITLE = 'HTML-in-Canvas 갤러리';
const SITE_DESCRIPTION = 'HTML-in-Canvas API 를 예제로 익히는 학습용 저장소';

const CODE_LANGUAGES = new Set(['js', 'css', 'html']);

/**
 * 소스 링크는 브랜치가 아니라 빌드 시점의 커밋을 가리킨다.
 * main 을 가리키면 나중에 줄이 밀렸을 때 엉뚱한 곳을 짚게 된다.
 */
function currentCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'main';
  }
}

const COMMIT = currentCommit();

/** 커밋되지 않은 변경이 있으면 줄 번호가 링크와 어긋날 수 있다. 로컬 확인용 경고. */
function workingTreeIsDirty() {
  if (process.env.GITHUB_SHA) return false;
  try {
    return (
      execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !== ''
    );
  } catch {
    return false;
  }
}

function blobUrl(path, range = '') {
  return `https://github.com/${REPO}/blob/${COMMIT}/${path}${range}`;
}

function treeUrl(path) {
  return `https://github.com/${REPO}/tree/${COMMIT}/${path}`;
}

// ---------------------------------------------------------------- 마크다운

/** GitHub 에 마크다운 렌더링을 맡긴다. 표와 코드 펜스를 정확히 처리해 준다. */
async function renderMarkdown(markdown) {
  if (!GITHUB_TOKEN) return null;

  const response = await fetch('https://api.github.com/markdown', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: markdown, mode: 'gfm', context: REPO }),
  });

  if (!response.ok) {
    console.warn(`마크다운 렌더링 실패 (${response.status}). 원문으로 대체합니다.`);
    return null;
  }
  return response.text();
}

/** 카드 요약처럼 한 줄짜리 텍스트에 쓰는 최소 변환. 인라인 코드와 강조만 처리한다. */
function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** 문서끼리 거는 링크는 .md 로 적혀 있다. 발행본에서는 .html 을 가리켜야 한다. */
function rewriteLinks(html) {
  return html.replace(/(href=")([^"]+?)\.md(#[^"]*)?(")/g, (match, head, path, hash, tail) => {
    if (/^https?:/.test(path)) return match;
    return `${head}${path}.html${hash ?? ''}${tail}`;
  });
}

// ---------------------------------------------------------------- 페이지 틀

function metaTags() {
  if (!ORIGIN_TRIAL_TOKEN) return '';
  // 이 태그가 있으면 방문자가 플래그를 켜지 않아도 API 가 열린다.
  return `\n    <meta http-equiv="origin-trial" content="${ORIGIN_TRIAL_TOKEN}" />`;
}

function page({ title, body, depth = 0, wide = false }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${up}site.css" />${metaTags()}
  </head>
  <body class="${wide ? 'wide' : ''}">
    <header class="site-header">
      <a class="site-home" href="${up}index.html">${SITE_TITLE}</a>
      <nav>
        <a href="${up}galleries/index.html">예제</a>
        <a href="${up}docs/api-reference.html">API 요약</a>
        <a href="${up}docs/browser-setup.html">브라우저 셋업</a>
      </nav>
    </header>
    <main>
${body}
    </main>
    <footer class="site-footer">
      <p>이 API 는 아직 표준화 전이라 Chromium 계열에서 플래그가 필요합니다. <a href="${up}docs/browser-setup.html">셋업 방법</a>을 보세요.</p>
    </footer>
  </body>
</html>
`;
}

/**
 * 렌더링된 코드 블록 아래에 소스 링크를 붙인다.
 *
 * 마크다운의 펜스 순서와 렌더링 결과의 블록 순서가 같다는 점을 이용한다.
 * 소스에서 찾지 못한 조각에는 아무것도 붙이지 않는다. 설명을 위해 줄여 쓴 조각까지
 * 억지로 어딘가에 연결하면 오히려 헷갈린다.
 */
function attachSourceLinks(html, { blocks, files, dirPath }) {
  const containers = /<div class="highlight[\s\S]*?<\/pre><\/div>|<pre[^>]*>[\s\S]*?<\/pre>/g;
  let index = 0;
  let linked = 0;

  const result = html.replace(containers, (match) => {
    const block = blocks[index];
    index += 1;
    if (!block || !CODE_LANGUAGES.has(block.lang)) return match;

    const found = locate(files, block.code);
    if (!found) return match;

    linked += 1;
    const range = found.exact ? `#L${found.start}-L${found.end}` : `#L${found.start}`;
    const label = found.exact
      ? `${found.file}:${found.start}-${found.end}`
      : `${found.file}:${found.start}`;
    const note = found.exact ? '소스 보기' : '소스에서 이 부분';
    const url = blobUrl(`${dirPath}/${found.file}`, range);

    return `${match}\n<p class="source-link"><a href="${url}" target="_blank" rel="noreferrer">${note} · <code>${label}</code></a></p>`;
  });

  return { html: result, linked };
}

/** 튜토리얼 끝에 붙는 소스 파일 목록. 링크가 안 붙은 조각도 여기서 찾아갈 수 있다. */
function sourceListSection(files, dirPath) {
  const items = files
    .map((file) => {
      const url = blobUrl(`${dirPath}/${file.rel}`);
      return `        <li><a href="${url}" target="_blank" rel="noreferrer"><code>${file.rel}</code></a> <span>${file.lines.length}줄</span></li>`;
    })
    .join('\n');

  return `      <section class="source-list">
        <h2>이 예제의 소스</h2>
        <p>줄 번호까지 고정된 링크입니다. 지금 보고 있는 사이트를 만든 커밋을 가리킵니다.</p>
        <ul>
${items}
        </ul>
        <p><a href="${treeUrl(dirPath)}" target="_blank" rel="noreferrer">폴더 전체 보기</a></p>
      </section>
`;
}

// ---------------------------------------------------------------- 갤러리 훑기

/** README 의 h1 과 첫 문단을 뽑아 목록에 쓴다. 두 곳에 같은 내용을 적지 않기 위해서다. */
function summarize(markdown) {
  const lines = markdown.split('\n');
  const titleLine = lines.find((line) => line.startsWith('# ')) ?? '# 제목 없음';
  const title = titleLine.slice(2).trim();

  const afterTitle = lines.slice(lines.indexOf(titleLine) + 1);
  const summary = afterTitle.find(
    (line) => line.trim() !== '' && !line.startsWith('!') && !line.startsWith('#'),
  );

  return { title, summary: (summary ?? '').trim() };
}

async function collectGalleries() {
  const entries = await readdir(GALLERIES, { withFileTypes: true });
  const names = entries
    .filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'),
    )
    .map((entry) => entry.name)
    .sort();

  const galleries = [];
  for (const name of names) {
    const markdown = await readFile(join(GALLERIES, name, 'README.md'), 'utf8');
    const hasShot = await readFile(join(GALLERIES, name, 'screenshot.png')).then(
      () => true,
      () => false,
    );
    galleries.push({ name, markdown, hasShot, ...summarize(markdown) });
  }
  return galleries;
}

// ---------------------------------------------------------------- 만들기

async function writePage(relativePath, html) {
  const target = join(OUT, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
}

async function buildMarkdownPage(
  markdown,
  relativePath,
  title,
  { extraTop = '', source = null } = {},
) {
  const rendered = await renderMarkdown(markdown);
  let inner = rendered ? rewriteLinks(rendered) : `<pre class="raw">${escapeHtml(markdown)}</pre>`;
  let linked = 0;

  if (rendered && source) {
    const attached = attachSourceLinks(inner, source);
    inner = attached.html;
    linked = attached.linked;
  }

  const tail = source ? sourceListSection(source.files, source.dirPath) : '';
  const depth = relativePath.split('/').length - 1;
  const body = `${extraTop}      <article class="markdown">${inner}</article>\n${tail}`;
  await writePage(relativePath, page({ title, body, depth }));
  return linked;
}

async function buildLanding(galleries) {
  const cards = galleries
    .map((gallery) => {
      const thumb = gallery.hasShot
        ? `<img src="galleries/${gallery.name}/screenshot.png" alt="" loading="lazy" />`
        : '';
      return `        <li class="card">
          <a class="card-shot" href="galleries/${gallery.name}/">${thumb}</a>
          <div class="card-body">
            <h3><a href="galleries/${gallery.name}/">${escapeHtml(gallery.title)}</a></h3>
            <p>${inlineMarkdown(gallery.summary)}</p>
            <p class="card-links">
              <a href="galleries/${gallery.name}/">데모 열기</a>
              <a href="galleries/${gallery.name}/readme.html">튜토리얼 읽기</a>
              <a href="${treeUrl(`galleries/${gallery.name}`)}" target="_blank" rel="noreferrer">소스</a>
            </p>
          </div>
        </li>`;
    })
    .join('\n');

  const trialNote = ORIGIN_TRIAL_TOKEN
    ? '<p class="lede-note">이 사이트는 origin trial 토큰을 쓰고 있어서 Chrome 148~154 에서는 플래그를 켜지 않아도 예제가 동작합니다. 그 밖의 버전에서는 안내 배너가 뜹니다.</p>'
    : '<p class="lede-note">예제를 실제로 돌리려면 Chromium 147 이상에서 플래그를 켜야 합니다. 켜지 않아도 페이지와 설명은 그대로 볼 수 있습니다.</p>';

  const body = `      <h1>${SITE_TITLE}</h1>
      <p class="lede">${SITE_DESCRIPTION}. 번호 순서대로 따라가면 앞 예제에서 배운 것을 뒤 예제가 다시 씁니다.</p>
      ${trialNote}

      <h2>플래그 켜기</h2>
      <p>주소창에 <code>chrome://flags/#canvas-draw-element</code> 를 열고 "Enable the new drawElement API for Canvas" 를 Enabled 로 바꾼 뒤 재시작하면 됩니다. 자세한 방법과 명령줄로 켜는 법은 <a href="docs/browser-setup.html">브라우저 셋업</a>에 있습니다.</p>

      <h2>예제</h2>
      <ul class="cards">
${cards}
      </ul>
`;
  await writePage('index.html', page({ title: SITE_TITLE, body, wide: true }));
}

async function buildGalleryIndex(galleries) {
  const markdown = await readFile(join(GALLERIES, 'README.md'), 'utf8');
  const rendered = await renderMarkdown(markdown);
  const body = rendered
    ? `      <article class="markdown">${rewriteLinks(rendered)}</article>`
    : `      <article class="markdown"><pre class="raw">${escapeHtml(markdown)}</pre></article>`;

  const links = galleries
    .map(
      (gallery) =>
        `        <li><a href="${gallery.name}/">${gallery.title}</a> · <a href="${gallery.name}/readme.html">튜토리얼</a></li>`,
    )
    .join('\n');

  await writePage(
    'galleries/index.html',
    page({
      title: `예제 목록 — ${SITE_TITLE}`,
      depth: 1,
      body: `${body}\n      <h2>바로 가기</h2>\n      <ul class="plain">\n${links}\n      </ul>\n`,
    }),
  );
}

/** 예제 페이지에 origin trial 태그를 끼워 넣는다. 저장소 파일은 건드리지 않는다. */
async function injectTrialToken(relativePath) {
  if (!ORIGIN_TRIAL_TOKEN) return;
  const target = join(OUT, relativePath);
  const html = await readFile(target, 'utf8');
  await writeFile(
    target,
    html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />${metaTags()}`),
  );
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const galleries = await collectGalleries();

  // 예제는 있는 그대로 복사한다. 사이트에서도 로컬에서와 똑같이 돌아야 한다.
  await cp(GALLERIES, join(OUT, 'galleries'), { recursive: true });
  await cp(DOCS, join(OUT, 'docs'), { recursive: true });
  await cp(join(ROOT, 'site', 'site.css'), join(OUT, 'site.css'));
  // Actions 로 발행하면 Jekyll 을 거치지 않지만, 실수로 브랜치 발행으로 돌아가도 안전하도록 둔다.
  await writeFile(join(OUT, '.nojekyll'), '');

  await buildLanding(galleries);
  await buildGalleryIndex(galleries);

  let totalBlocks = 0;
  let totalLinked = 0;

  for (const gallery of galleries) {
    const dirPath = `galleries/${gallery.name}`;
    const files = await listSourceFiles(join(GALLERIES, gallery.name));
    const blocks = fenceBlocks(gallery.markdown);
    const top = `      <p class="crumb"><a href="./">이 예제 데모 열기</a></p>\n`;

    totalBlocks += blocks.filter((block) => CODE_LANGUAGES.has(block.lang)).length;
    totalLinked += await buildMarkdownPage(
      gallery.markdown,
      `${dirPath}/readme.html`,
      `${gallery.title} — ${SITE_TITLE}`,
      { extraTop: top, source: { blocks, files, dirPath } },
    );

    await injectTrialToken(`${dirPath}/index.html`);
  }

  for (const entry of await readdir(DOCS)) {
    if (!entry.endsWith('.md')) continue;
    const markdown = await readFile(join(DOCS, entry), 'utf8');
    const { title } = summarize(markdown);
    await buildMarkdownPage(
      markdown,
      `docs/${basename(entry, '.md')}.html`,
      `${title} — ${SITE_TITLE}`,
    );
  }

  const built = await countFiles(OUT);
  console.log(`_site/ 생성 완료 — 예제 ${galleries.length}개, 파일 ${built}개`);
  console.log(
    `소스 링크: 코드 블록 ${totalBlocks}개 중 ${totalLinked}개 (커밋 ${COMMIT.slice(0, 7)})`,
  );
  console.log(
    GITHUB_TOKEN ? '마크다운: GitHub 렌더링 사용' : '마크다운: 토큰이 없어 원문으로 출력',
  );
  console.log(
    ORIGIN_TRIAL_TOKEN
      ? 'origin trial: 토큰 적용됨'
      : 'origin trial: 토큰 없음 (방문자가 플래그를 켜야 함)',
  );

  if (workingTreeIsDirty()) {
    console.log('');
    console.log(
      '경고: 커밋되지 않은 변경이 있습니다. 소스 링크는 HEAD 를 가리키므로 줄 번호가 어긋날 수 있습니다.',
    );
  }
}

async function countFiles(dir) {
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += await countFiles(join(dir, entry.name));
    else count += 1;
  }
  return count;
}

await main();
