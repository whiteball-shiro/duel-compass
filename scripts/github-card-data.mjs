import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import initSqlJs from 'sql.js';

export const CARD_SOURCE = Object.freeze({
  repository: 'https://github.com/inoribea/ygo-ai.git',
  commit: '60dde4b53ef5e7bfa1a1e7e86269551c8e6659ea',
  path: 'skill/resources/lib',
});

export async function validateCardData(directory) {
  const required = ['cards.cdb', 'lflist.conf', 'strings.conf', 'ygopro-scripts/constant.lua', 'ygopro-scripts/utility.lua', 'ygopro-scripts/procedure.lua'];
  for (const name of required) {
    const info = await stat(join(directory, name));
    if (!info.isFile() || !info.size) throw new Error('Required card data is missing or empty: ' + name);
  }
  const bytes = await readFile(join(directory, 'cards.cdb'));
  if (bytes.subarray(0, 16).toString() !== 'SQLite format 3\0') throw new Error('Invalid SQLite card database.');
  const SQL = await initSqlJs();
  const db = new SQL.Database(bytes);
  try {
    const count = Number(db.exec('SELECT count(*) FROM texts JOIN datas USING(id)')[0]?.values[0][0]);
    if (!Number.isSafeInteger(count) || count < 10000) throw new Error('Card database is incomplete.');
    return { cards: count, cardsSha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { db.close(); }
}

export async function initializeGithubCardData({ resourceRoot, runGit, onProgress = console.log } = {}) {
  if (!resourceRoot) throw new Error('resourceRoot is required.');
  const destination = resolve(resourceRoot, 'lib');
  if (await stat(destination).then(() => true, () => false)) {
    const validation = await validateCardData(destination);
    return { existing: true, directory: destination, ...validation };
  }
  const work = await mkdtemp(join(tmpdir(), 'duel-compass-github-'));
  const stage = resolve(resourceRoot, 'bootstrap-' + randomUUID());
  const execute = promisify(execFile);
  const gitCommand = runGit ?? (async args => {
    try {
      const result = await execute('git', args, { cwd: work, windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
      return result.stdout;
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Git is required for GitHub data initialization. Install Git and retry.');
      throw new Error('GitHub card data download failed: ' + (error.stderr || error.message));
    }
  });
  const git = args => gitCommand(args, { cwd: work });
  try {
    onProgress('Downloading the matched card database and scripts from GitHub at ' + CARD_SOURCE.commit);
    await git(['init', '--quiet']);
    await git(['remote', 'add', 'origin', CARD_SOURCE.repository]);
    await git(['sparse-checkout', 'init', '--cone']);
    await git(['sparse-checkout', 'set', CARD_SOURCE.path]);
    await git(['-c', 'protocol.version=2', 'fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', CARD_SOURCE.commit]);
    await git(['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    if ((await git(['rev-parse', 'HEAD'])).trim() !== CARD_SOURCE.commit) throw new Error('GitHub source commit mismatch.');
    const tree = await git(['ls-tree', '-r', 'HEAD', '--', CARD_SOURCE.path]);
    if (!tree.trim() || tree.split('\n').filter(Boolean).some(line => !/^(100644|100755) blob /.test(line))) throw new Error('Unexpected non-file entries in card data source.');
    const source = join(work, CARD_SOURCE.path);
    const validation = await validateCardData(source);
    await mkdir(resourceRoot, { recursive: true });
    await cp(source, stage, { recursive: true, dereference: false });
    await writeFile(join(stage, 'github-source.json'), JSON.stringify({ ...CARD_SOURCE, ...validation, initializedAt: new Date().toISOString() }, null, 2) + '\n');
    // Another initializer may have finished while the download was running.
    if (await stat(destination).then(() => true, () => false)) throw new Error('Card data appeared during initialization; existing data was preserved. Retry to validate it.');
    await rename(stage, destination);
    return { existing: false, directory: destination, ...validation, source: CARD_SOURCE };
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(stage, { recursive: true, force: true });
  }
}
