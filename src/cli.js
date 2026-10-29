#!/usr/bin/env node
import { resolve } from 'node:path';
import { readConfig } from './config.js';
import { createAeroServer } from './server.js';

function argument(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

try {
  const configPath = resolve(argument('--config', 'aero.json'));
  const port = Number(argument('--port', '4173'));
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535');
  const config = await readConfig(configPath);
  const { server, supervisor } = createAeroServer(config);
  server.listen(port, '127.0.0.1', () => {
    console.log(`Aero is managing ${config.apps.length} app(s) at http://127.0.0.1:${port}`);
  });
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    await supervisor.stopAll();
    process.exitCode = 0;
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Aero could not start: ${error.message}`);
  process.exitCode = 1;
}

