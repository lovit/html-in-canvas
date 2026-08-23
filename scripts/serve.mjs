#!/usr/bin/env node
// 의존성 없는 정적 파일 서버. 예제는 file:// 로도 대부분 열리지만,
// Worker 와 module script 는 http 스킴을 요구하므로 이 서버로 띄운다.
//
//   mise run serve            # 저장소 루트, 기본 포트 4173
//   mise run site:serve       # 발행 사이트(_site) 미리보기
//   PORT=5000 node scripts/serve.mjs
//
// 개발용이지 공개용이 아니다. 루프백에만 바인딩하고 점 파일은 내주지 않는다.
// 저장소 루트를 서비스하는 이상 .git 과 .chrome-profile 이 사정거리 안에 있기 때문이다.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readdir, realpath } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './html.mjs';

const REPO_ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
// 인자를 주면 그 디렉터리를 서비스한다. 발행 사이트(_site)를 미리 볼 때 쓴다.
const ROOT = process.argv[2] ? normalize(join(REPO_ROOT, process.argv[2])) : REPO_ROOT;
const PORT = Number(process.env.PORT ?? 4173);
// 다른 기기에서 접근할 수 없게 한다. 카페 Wi-Fi 에서 저장소를 통째로 내주는 일을 막는다.
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.glsl': 'text/plain; charset=utf-8',
};

/** 경로에 점으로 시작하는 세그먼트가 있는지. .git, .env, .chrome-profile 을 막는다. */
function hasDotSegment(urlPath) {
  return urlPath.split('/').some((segment) => segment.startsWith('.') && segment !== '');
}

/**
 * 요청 경로를 서비스 디렉터리 안쪽 실제 경로로 바꾼다.
 * 밖으로 나가거나 점 파일을 노리는 경로는 null 을 준다.
 */
function resolveInsideRoot(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    // 잘못된 퍼센트 인코딩. 예전에는 여기서 던진 URIError 가 프로세스를 죽였다.
    return null;
  }

  if (hasDotSegment(decoded)) return null;

  const target = normalize(join(ROOT, decoded));
  const rel = relative(ROOT, target);
  if (rel.startsWith('..' + sep) || rel === '..') return null;
  return target;
}

/** 심링크를 따라간 실제 위치도 서비스 디렉터리 안이어야 한다. */
async function insideRootAfterSymlinks(target) {
  try {
    const real = await realpath(target);
    const rel = relative(await realpath(ROOT), real);
    return !(rel.startsWith('..' + sep) || rel === '..');
  } catch {
    return false;
  }
}

async function renderDirectory(dir, urlPath) {
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const items = visible
    .map((e) => {
      const name = escapeHtml(e.isDirectory() ? `${e.name}/` : e.name);
      return `<li><a href="${encodeURIComponent(e.name)}${e.isDirectory() ? '/' : ''}">${name}</a></li>`;
    })
    .join('\n');
  const title = escapeHtml(urlPath);
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.7 system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1rem}
a{color:#0b57d0;text-decoration:none}a:hover{text-decoration:underline}li{margin:.2rem 0}</style>
<h1>${title}</h1><ul>${items}</ul>`;
}

const server = createServer(async (req, res) => {
  try {
    const target = resolveInsideRoot(req.url ?? '/');
    if (target === null) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    // 없는 파일은 404 여야 한다. 그래서 존재를 먼저 확인하고 심링크를 따진다.
    let info = await stat(target);

    if (!(await insideRootAfterSymlinks(target))) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let filePath = target;

    if (info.isDirectory()) {
      const indexPath = join(target, 'index.html');
      const hasIndex = await stat(indexPath).then(
        () => true,
        () => false,
      );
      if (hasIndex) {
        filePath = indexPath;
        info = await stat(filePath);
      } else {
        const html = await renderDirectory(target, req.url ?? '/');
        res.writeHead(200, { 'content-type': MIME['.html'] }).end(html);
        return;
      }
    }

    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'content-length': info.size,
      // 예제를 고치고 새로고침하면 바로 반영되어야 한다
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(404, { 'content-type': MIME['.html'] });
    res.end('<h1>404</h1>');
  }
});

server.listen(PORT, HOST, () => {
  const landing = process.argv[2] ? '' : 'galleries/';
  console.log(
    `정적 서버: http://localhost:${PORT}/${landing}  (${relative(REPO_ROOT, ROOT) || '.'})`,
  );
  console.log('플래그를 켠 Chrome 으로 열려면 다른 터미널에서: mise run chrome');
});
