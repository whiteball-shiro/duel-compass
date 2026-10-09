import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import initSqlJs from 'sql.js';
import { initializeGithubCardData, validateCardData, CARD_SOURCE } from '../scripts/github-card-data.mjs';

async function fixture(directory) {
  await mkdir(join(directory, 'ygopro-scripts'), { recursive: true });
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE texts(id INTEGER); CREATE TABLE datas(id INTEGER); WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<10000) INSERT INTO texts SELECT n FROM seq; INSERT INTO datas SELECT id FROM texts;');
  await writeFile(join(directory, 'cards.cdb'), db.export());
  db.close();
  for (const name of ['lflist.conf', 'strings.conf', 'ygopro-scripts/constant.lua', 'ygopro-scripts/utility.lua', 'ygopro-scripts/procedure.lua']) await writeFile(join(directory, name), 'synthetic fixture');
}

test('first setup pins GitHub data, validates it and keeps existing data on a repeat', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'duel-compass-install-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const runGit = async (args, { cwd }) => {
    calls.push(args);
    if (args[0] === 'checkout') await fixture(join(cwd, CARD_SOURCE.path));
    if (args[0] === 'rev-parse') return CARD_SOURCE.commit + '\n';
    if (args[0] === 'ls-tree') return '100644 blob abc\tskill/resources/lib/cards.cdb\n';
    return '';
  };
  const result = await initializeGithubCardData({ resourceRoot: directory, runGit, onProgress: () => {} });
  assert.equal(result.cards, 10000);
  assert.equal(result.existing, false);
  assert.ok(calls.some(args => args.includes('fetch') && args.includes(CARD_SOURCE.commit)));
  assert.ok(calls.some(args => args.includes(CARD_SOURCE.repository)));
  const provenance = await readFile(join(directory, 'lib', 'github-source.json'), 'utf8');
  assert.equal(JSON.parse(provenance).commit, CARD_SOURCE.commit);
  const repeat = await initializeGithubCardData({ resourceRoot: directory, runGit: () => { throw new Error('should not download'); } });
  assert.equal(repeat.existing, true);
  assert.equal(await readFile(join(directory, 'lib', 'github-source.json'), 'utf8'), provenance);
});

test('wrong checkout cannot install or leave a partial card directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'duel-compass-install-failure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(initializeGithubCardData({ resourceRoot: directory, onProgress: () => {}, runGit: async args => args[0] === 'rev-parse' ? 'wrong' : '' }), /commit mismatch/);
  assert.deepEqual(await readdir(directory), []);
});

test('incomplete data is rejected and cannot be mistaken for a completed setup', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'duel-compass-incomplete-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await fixture(directory);
  await writeFile(join(directory, 'cards.cdb'), 'not a database');
  await assert.rejects(validateCardData(directory), /SQLite/);
});
