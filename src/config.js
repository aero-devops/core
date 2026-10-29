import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export async function readConfig(filePath) {
  const absolutePath = resolve(filePath);
  const document = JSON.parse(await readFile(absolutePath, 'utf8'));
  if (!document || !Array.isArray(document.apps) || document.apps.length === 0) {
    throw new Error('Config must contain a nonempty apps array');
  }
  const names = new Set();
  const apps = [];
  for (const app of document.apps) {
    if (!app || typeof app.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(app.name)) {
      throw new Error('Each app needs a valid name');
    }
    if (names.has(app.name)) throw new Error(`Duplicate app name: ${app.name}`);
    names.add(app.name);
    if (typeof app.command !== 'string' || !app.command.trim()) throw new Error(`App ${app.name} needs a command`);
    if (app.args !== undefined && (!Array.isArray(app.args) || app.args.some((arg) => typeof arg !== 'string'))) {
      throw new Error(`App ${app.name} has invalid args`);
    }
    if (app.env !== undefined && (!app.env || typeof app.env !== 'object' || Array.isArray(app.env) || Object.values(app.env).some((value) => typeof value !== 'string'))) {
      throw new Error(`App ${app.name} has invalid env`);
    }
    if (app.timeoutMs !== undefined && (!Number.isSafeInteger(app.timeoutMs) || app.timeoutMs < 1 || app.timeoutMs > 86_400_000)) {
      throw new Error(`App ${app.name} has invalid timeoutMs`);
    }
    const cwd = app.cwd === undefined ? dirname(absolutePath) : resolve(dirname(absolutePath), app.cwd);
    apps.push({
      name: app.name,
      spec: {
        command: app.command,
        args: app.args ?? [],
        cwd,
        env: app.env ?? {},
        ...(app.timeoutMs ? { timeoutMs: app.timeoutMs } : {}),
      },
    });
  }
  return { apps, filePath: absolutePath };
}

