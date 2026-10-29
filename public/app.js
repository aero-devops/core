const list = document.querySelector('#app-list');
const message = document.querySelector('#message');
const appCount = document.querySelector('#app-count');
const runningCount = document.querySelector('#running-count');
const serverTime = document.querySelector('#server-time');
let busy = false;

// Each service is drawn as Plate 2 draws it: a jet released from its
// source. While it runs, puffs travel down the jet; when it is stopping the
// jet comes loose from the source and drifts off; a stopped service is still
// air; a failed one leaves a short puff that scatters. Atkinson dither on
// the 4px cell grid, ink and chalk only.
const CELL = 4;
const filaments = new Map();
const still = matchMedia('(prefers-reduced-motion: reduce)');
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function filament(name) {
  if (!filaments.has(name)) {
    const canvas = document.createElement('canvas');
    canvas.className = 'filament';
    canvas.setAttribute('aria-hidden', 'true');
    filaments.set(name, { canvas, state: 'idle', phase: Math.random() * 10, detach: 0 });
  }
  return filaments.get(name);
}

function drawFilament(f) {
  const { canvas } = f;
  const cols = Math.max(20, Math.floor(canvas.clientWidth / CELL));
  const rows = Math.max(9, Math.floor(canvas.clientHeight / CELL));
  if (canvas.width !== cols) { canvas.width = cols; canvas.height = rows; }
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, cols, rows);
  ctx.fillStyle = '#f5f5f0';
  const mid = (rows - 1) / 2;
  const running = f.state === 'running';
  const stopping = f.state === 'stopping';
  const failed = f.state === 'failed';
  if (!running && !stopping && !failed) return; // still air
  const values = new Float32Array(cols * rows);
  for (let x = 0; x < cols; x++) {
    const width = 1.2 + rows * 0.3 * (x / cols); // fades out before the strip edges
    const reach = failed ? 30 : cols * 0.9;
    let life = Math.exp(-x / reach);
    if (failed) life *= 1 - smooth(10, 30, x);
    if (stopping) life *= smooth(f.detach, f.detach + 12, x);
    const puffs = failed ? 0.8 : 0.72 + 0.28 * Math.sin(x * 0.22 - f.phase);
    for (let r = 0; r < rows; r++) {
      const d = (r - mid) / width;
      values[r * cols + x] = Math.exp(-d * d) * Math.min(1.15, 2.1 / Math.sqrt(width)) * life * puffs * smooth(0, 3, x);
    }
  }
  // Atkinson error diffusion, as in the printed plates
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x; const on = values[i] >= 0.5;
    if (on) ctx.fillRect(x, y, 1, 1);
    const err = (values[i] - (on ? 1 : 0)) / 8;
    for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < cols && ny < rows) values[ny * cols + nx] += err;
    }
  }
}

// Redraw about 12 times a second: error-diffused grain shimmers if it is
// recomputed every frame, and smoke does not need 60 frames to move.
let frame = 0;
function animate() {
  if (frame++ % 5) { requestAnimationFrame(animate); return; }
  for (const f of filaments.values()) {
    if (f.state === 'running' && !still.matches) f.phase += 0.3;
    f.detach = f.state === 'stopping' ? f.detach + (still.matches ? 0 : 2.5) : 0;
    if (f.canvas.isConnected) drawFilament(f);
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed: ${response.status}`);
  return data;
}

function button(label, action, name, disabled) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'action';
  element.textContent = label;
  element.disabled = disabled;
  element.addEventListener('click', async () => {
    busy = true;
    message.textContent = '';
    element.disabled = true;
    try {
      await request(`/api/apps/${encodeURIComponent(name)}/${action}`, { method: 'POST', headers: { 'X-Aero-Control': '1' } });
      await refresh();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      busy = false;
      element.disabled = false;
    }
  });
  return element;
}

async function refresh() {
  if (busy && document.activeElement?.tagName !== 'BUTTON') return;
  try {
    const { apps } = await request('/api/apps');
    const panels = await Promise.all(apps.map(async (app) => {
      const panel = document.createElement('article');
      panel.className = 'app';
      panel.dataset.state = app.state;
      const head = document.createElement('div');
      head.className = 'app-head';
      const title = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = app.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = app.state === 'running' || app.state === 'stopping'
        ? `PID ${app.pid ?? 'pending'}`
        : app.state === 'failed'
          ? (app.error ?? (app.timedOut ? 'Timed out' : `Exited with code ${app.exitCode}`))
          : app.state === 'exited'
            ? (app.exitCode === null ? 'Stopped' : `Exited with code ${app.exitCode}`)
            : 'No active process';
      title.append(name, meta);
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = app.state;
      head.append(title, status);
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        button('Start', 'start', app.name, app.state === 'running' || app.state === 'stopping'),
        button('Stop', 'stop', app.name, app.state !== 'running'),
        button('Restart', 'restart', app.name, app.state === 'stopping'),
      );
      const logs = document.createElement('pre');
      const { lines } = await request(`/api/apps/${encodeURIComponent(app.name)}/logs`);
      logs.textContent = lines.length ? lines.map((line) => `[${line.stream}] ${line.text}`).join('\n') : 'Output will appear here when the service runs.';
      const flow = filament(app.name);
      flow.state = app.state;
      panel.append(head, flow.canvas, actions, logs);
      return panel;
    }));
    list.replaceChildren(...panels);
    if (!panels.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No services are configured.';
      list.append(empty);
    }
    appCount.textContent = `${apps.length} service${apps.length === 1 ? '' : 's'}`;
    const running = apps.filter((app) => app.state === 'running').length;
    runningCount.textContent = `${running} running`;
    serverTime.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    message.textContent = error.message;
  }
}

document.querySelector('#refresh').addEventListener('click', refresh);
refresh();
setInterval(() => { if (!busy) refresh(); }, 3000);

