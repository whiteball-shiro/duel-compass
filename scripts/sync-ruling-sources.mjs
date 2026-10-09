import { refreshRulingSources } from '../skill/backend/ruling-sources.mjs';

if (!process.argv.includes('--allow-network-update')) {
  console.error('This command requires an explicitly authorized update. Run with --allow-network-update.');
  process.exitCode = 1;
} else {
  try {
    const manifest = await refreshRulingSources({ allowNetworkUpdate: true });
    console.log(JSON.stringify({ version: manifest.version, importedAt: manifest.importedAt, files: manifest.files }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
