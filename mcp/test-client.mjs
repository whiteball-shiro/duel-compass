// Standalone end-to-end test of the ygo-tools MCP server over stdio.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const ROOT = dirname(SERVER);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SERVER],
  cwd: ROOT,
});

const client = new Client({ name: 'ygo-test', version: '1.0.0' });
await client.connect(transport);

const list = await client.listTools();
console.log('TOOL_COUNT', list.tools.length);
console.log('TOOL_NAMES', list.tools.map((t) => t.name).join(', '));
console.log('SAMPLE_SCHEMA', JSON.stringify(list.tools.find((t) => t.name === 'queryCards').inputSchema));

const res = await client.callTool({ name: 'queryCards', arguments: { action: 'get', id: 89631139 } });
console.log('QUERY_CALL_CONTENT', (res.content[0]?.text ?? '').slice(0, 900));

// deck set + get round-trip to prove stateful engine works through MCP
await client.callTool({ name: 'manageSessionDeck', arguments: { action: 'set', ydk: `#main\n89631139\n#extra\n#side\n` } });
const deck = await client.callTool({ name: 'manageSessionDeck', arguments: { action: 'get' } });
console.log('DECK_GET', (deck.content[0]?.text ?? '').slice(0, 300));

await client.close();
console.log('DONE');
process.exit(0);
