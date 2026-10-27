// The effect pack's index built off the server's own heap (docs/spec/site.md 站点-5): run as a worker thread, it reads
// the pack, parses it, builds the engine's index and posts it back. Parsing the whole pack takes several times its
// size while it runs; the index kept is about its size, so only the index reaches the server's heap.
import { readFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { effectIndex } from '@aue/render/fx-subset';

const data = JSON.parse(await readFile(/** @type {{ file: string }} */ (workerData).file, 'utf8'));
parentPort?.postMessage(effectIndex(data));
