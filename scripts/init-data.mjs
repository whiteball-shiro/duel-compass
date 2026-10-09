import { resolveSkillConfig } from '../skill/backend/config.mjs';
import { initializeGithubCardData } from './github-card-data.mjs';
import { refreshRulingSources } from '../skill/backend/ruling-sources.mjs';
import { cp, mkdir, readFile, stat, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const config = resolveSkillConfig();
console.log('Initializing externally sourced data in ' + config.resourceRoot);
try {
  if (!process.argv.includes('--rulings-only')) {
    const fromIndex = process.argv.indexOf('--from');
    if (fromIndex >= 0) {
      const argument = process.argv[fromIndex + 1];
      if (!argument || argument.startsWith('--')) throw new Error('--from requires a directory containing cards.cdb.');
      const source = resolve(argument);
      const bytes = await readFile(join(source, 'cards.cdb'));
      if (bytes.subarray(0, 16).toString() !== 'SQLite format 3\0') throw new Error('The imported cards.cdb is not SQLite.');
      const destination = resolve(config.resourceRoot, 'lib');
      if (await stat(destination).then(() => true, () => false)) throw new Error('Import requires a fresh data directory; existing data will not be overwritten.');
      const stage = resolve(config.resourceRoot, 'import-' + randomUUID());
      await mkdir(stage, { recursive: true });
      for (const name of ['cards.cdb', 'strings.conf', 'lflist.conf', 'prerelease', 'ygopro-scripts', 'id-migrations.json']) {
        if (await stat(join(source, name)).then(() => true, () => false)) await cp(join(source, name), join(stage, name), { recursive: true, dereference: false });
      }
      await rename(stage, destination);
      console.log('Imported local card data from ' + source);
    } else {
      const result = await initializeGithubCardData({ resourceRoot: config.resourceRoot });
      console.log(JSON.stringify({ existing: result.existing, cards: result.cards, source: result.source }));
    }
    console.log('Card database, banlist and scripts initialized.');
  }
  if (!process.argv.includes('--cards-only')) {
    const result = await refreshRulingSources({ directory: config.rulingDataDir, allowNetworkUpdate: true });
    console.log('Ruling snapshot initialized: ' + result.version);
  }
} catch (error) { console.error('Data initialization failed: ' + error.message); process.exitCode = 1; }
