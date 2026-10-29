import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAeroServer } from '../src/server.js';

test('serves the dashboard and controls a named process', async () => {
  const { server, supervisor } = createAeroServer({ apps: [{
    name: 'sample',
    spec: { command: process.execPath, args: ['-e', 'console.log("ready"); setInterval(() => {}, 1000)'] },
  }] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /The services on this machine/);
    const typography = await fetch(`${url}/fonts.css`);
    assert.equal(typography.status, 200);
    assert.match(await typography.text(), /Pixelify Sans/);
    for (const font of ['PixelifySans.ttf', 'SpaceMono-Regular.ttf']) {
      const asset = await fetch(`${url}/fonts/${font}`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('content-type'), /font\/ttf/);
      assert.ok((await asset.arrayBuffer()).byteLength > 1000);
    }
    const denied = await fetch(`${url}/api/apps/sample/start`, { method: 'POST' });
    assert.equal(denied.status, 403);
    const started = await fetch(`${url}/api/apps/sample/start`, { method: 'POST', headers: { 'X-Aero-Control': '1' } });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).app.state, 'running');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const logs = await (await fetch(`${url}/api/apps/sample/logs`)).json();
    assert.ok(logs.lines.some((line) => line.text === 'ready'));
    const stopped = await fetch(`${url}/api/apps/sample/stop`, { method: 'POST', headers: { 'X-Aero-Control': '1' } });
    assert.equal(stopped.status, 200);
    assert.equal((await stopped.json()).app.state, 'exited');
    const missing = await fetch(`${url}/api/apps/other/logs`);
    assert.equal(missing.status, 404);
  } finally {
    await supervisor.stopAll();
    await new Promise((resolve) => server.close(resolve));
  }
});

