import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/config.js';

test('resolves working directories beside config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aero-config-'));
  try {
    const file = join(dir, 'aero.json');
    await writeFile(file, JSON.stringify({ apps: [{ name: 'web', command: 'node', cwd: 'app', args: ['index.js'] }] }));
    const config = await readConfig(file);
    assert.equal(config.apps[0].spec.cwd, join(dir, 'app'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects duplicate app names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aero-config-'));
  try {
    const file = join(dir, 'aero.json');
    await writeFile(file, JSON.stringify({ apps: [{ name: 'web', command: 'node' }, { name: 'web', command: 'node' }] }));
    await assert.rejects(readConfig(file), /Duplicate app name/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

