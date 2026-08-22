#!/usr/bin/env node
// 의존성 없는 정적 파일 서버. 예제는 file:// 로도 대부분 열리지만,
// Worker 와 module script 는 http 스킴을 요구하므로 이 서버로 띄운다.
//
//   mise run serve            # 기본 포트 4173
//   PORT=5000 node scripts/serve.mjs

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
// 인자를 주면 그 디렉터리를 서비스한다. 발행 사이트(_site)를 미리 볼 때 쓴다.
const ROOT = process.argv[2] ? normalize(join(REPO_ROOT, process.argv[2])) : REPO_ROOT;
const PORT = Number(process.env.PORT ?? 4173);

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

/** 요청 경로를 저장소 안쪽 실제 경로로 바꾼다. 밖으로 나가려는 경로는 null. */
function resolveInsideRoot(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = normalize(join(ROOT, decoded));
  const rel = relative(ROOT, target);
  if (rel.startsWith('..' + sep) || rel === '..') return null;
  return target;
}

async function renderDirectory(dir, urlPath) {
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const items = visible
    .map((e) => {
      const name = e.isDirectory() ? `${e.name}/` : e.name;
      return `<li><a href="${encodeURIComponent(e.name)}${e.isDirectory() ? '/' : ''}">${name}</a></li>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${urlPath}</title>
<style>body{font:16px/1.7 system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1rem}
a{color:#0b57d0;text-decoration:none}a:hover{text-decoration:underline}li{margin:.2rem 0}</style>
<h1>${urlPath}</h1><ul>${items}</ul>`;
}

const server = createServer(async (req, res) => {
  const target = resolveInsideRoot(req.url ?? '/');
  if (!target) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    let info = await stat(target);
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
    res.writeHead(404, { 'content-type': MIME['.html'] }).end('<h1>404</h1>');
  }
});

server.listen(PORT, () => {
  const landing = process.argv[2] ? '' : 'galleries/';
  console.log(
    `정적 서버: http://localhost:${PORT}/${landing}  (${relative(REPO_ROOT, ROOT) || '.'})`,
  );
  console.log('플래그를 켠 Chrome 으로 열려면 다른 터미널에서: mise run chrome');
});
