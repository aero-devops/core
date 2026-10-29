import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSupervisor } from 'aero-shell-runtime';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/fonts.css', ['fonts.css', 'text/css; charset=utf-8']],
  ['/fonts/PixelifySans.ttf', ['fonts/PixelifySans.ttf', 'font/ttf']],
  ['/fonts/SpaceMono-Regular.ttf', ['fonts/SpaceMono-Regular.ttf', 'font/ttf']],
  ['/favicon.png', ['favicon.png', 'image/png']],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export function createAeroServer(config, { supervisor = createSupervisor() } = {}) {
  const apps = new Map(config.apps.map((app) => [app.name, app.spec]));
  const server = createHttpServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return json(response, 403, { error: 'Local host only' });
    let url;
    try { url = new URL(request.url, `http://${host}`); }
    catch { return json(response, 400, { error: 'Invalid URL' }); }

    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { status: 'ok' });
    if (request.method === 'GET' && url.pathname === '/api/apps') {
      return json(response, 200, { apps: [...apps.keys()].map((name) => ({ name, ...(supervisor.status(name) ?? { state: 'stopped', pid: null, exitCode: null }) })) });
    }

    const match = /^\/api\/apps\/([a-zA-Z0-9_-]{1,64})(?:\/(logs|start|stop|restart))?$/.exec(url.pathname);
    if (match) {
      const [, name, action] = match;
      if (!apps.has(name)) return json(response, 404, { error: 'Unknown app' });
      if (request.method === 'GET' && action === 'logs') return json(response, 200, { name, lines: supervisor.logs(name) ?? [] });
      if (request.method === 'POST' && ['start', 'stop', 'restart'].includes(action)) {
        if (request.headers['x-aero-control'] !== '1' || request.headers.origin && request.headers.origin !== `http://${host}`) {
          return json(response, 403, { error: 'Control request denied' });
        }
        try {
          if (action === 'stop' || action === 'restart') {
            if (supervisor.status(name)?.state === 'running' || supervisor.status(name)?.state === 'stopping') await supervisor.stop(name);
            else if (action === 'stop') return json(response, 409, { error: 'App is not running' });
          }
          if (action === 'start' || action === 'restart') supervisor.start(name, apps.get(name));
          return json(response, 200, { app: supervisor.status(name) });
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }
    }
    if (request.method === 'GET' && STATIC.has(url.pathname)) {
      const [filename, contentType] = STATIC.get(url.pathname);
      try {
        const body = await readFile(join(PUBLIC_DIR, filename));
        response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        return response.end(body);
      } catch {
        return json(response, 500, { error: 'Static asset unavailable' });
      }
    }
    return json(response, 404, { error: 'Not found' });
  });
  return { server, supervisor };
}

