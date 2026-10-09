import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test', 'tests/*.test.mjs'], { stdio: 'inherit', env: { ...process.env, DUEL_COMPASS_INTEGRATION: '1' } });
process.exitCode = result.status ?? 1;
