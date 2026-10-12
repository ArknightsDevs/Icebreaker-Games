// CLI: node packages/server/src/main.js [--port 8700] [--match <file.json>]   (env AUE_ASSETS_DIR: the local assets directory)
// Without --match the room plays the default match (IG-1 at 初级赛 with two default decks).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHttpServer } from './http.js';
import { readFileSync } from 'node:fs';
import { createMatchRoom, DEFAULT_MATCH } from './battle.js';
import { kitDir, nodeKits } from './kits.js';

/** @param {string[]} argv @returns {number} */
export function parsePort(argv) {
  const i = argv.indexOf('--port');
  if (i < 0) return 8700;
  const port = Number(argv[i + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port needs an integer from 0 to 65535');
  return port;
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2), file = args.includes('--match') ? args[args.indexOf('--match') + 1] : null;
const kitsDir = kitDir(rootDir);
console.log(kitsDir ? `kits: ${kitsDir}` : 'kits: none (operators fight on the engine’s own)');
const room = await createMatchRoom(file ? JSON.parse(readFileSync(file, 'utf8')) : DEFAULT_MATCH, {
  log: (line) => console.log(line), ...(kitsDir ? { kits: (/** @type {string[]} */ ids) => nodeKits(kitsDir, ids) } : {}),
});
const server = await startHttpServer({ rootDir, port: parsePort(args), onUpgrade: room.upgrade, kitsDir });
const addr = server.address();
if (addr !== null && typeof addr === 'object') console.log(`http://${addr.address}:${addr.port}/`);
