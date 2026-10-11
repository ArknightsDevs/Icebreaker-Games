// CLI: node packages/server/src/main.js [--port 8700]   (env AUE_ASSETS_DIR: the local assets directory)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHttpServer } from './http.js';
import { createBattleRoom } from './battle.js';

/** @param {string[]} argv @returns {number} */
export function parsePort(argv) {
  const i = argv.indexOf('--port');
  if (i < 0) return 8700;
  const port = Number(argv[i + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port needs an integer from 0 to 65535');
  return port;
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const room = createBattleRoom({ log: (line) => console.log(line) });
const server = await startHttpServer({ rootDir, port: parsePort(process.argv.slice(2)), onUpgrade: room.upgrade });
const addr = server.address();
if (addr !== null && typeof addr === 'object') console.log(`http://${addr.address}:${addr.port}/`);
