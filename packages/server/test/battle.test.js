// The battle socket end to end over real WebSockets: hello → welcome and sealed frames; malformed messages, binary
// frames and a second key for a taken seat close the connection; a command reaches the arbiter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createHttpServer, createBattleRoom } from '../src/index.js';

/** A server with a battle room on a free port. */
async function start() {
  const room = createBattleRoom({ seed: 3 }), server = createHttpServer({ rootDir: process.cwd(), onUpgrade: room.upgrade });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { room, url: (/** @type {number} */ seat) => `ws://127.0.0.1:${addr.port}/battle?seat=${seat}`, close: () => { room.close(); server.close(); } };
}

/** Opens a socket and collects what it receives. @param {string} url */
function open(url) {
  const ws = new WebSocket(url), got = /** @type {any[]} */ ([]);
  /** @type {Promise<{ code: number, reason: string }>} */
  const closed = new Promise((r) => ws.on('close', (code, reason) => r({ code, reason: String(reason) })));
  ws.on('message', (d) => got.push(JSON.parse(String(d))));
  return { ws, got, closed, ready: new Promise((r) => ws.on('open', r)) };
}

/** @param {number} ms */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('hello → welcome with a snapshot, then sealed frames; a command reaches the arbiter', async () => {
  const s = await start();
  try {
    const a = open(s.url(0));
    await a.ready;
    a.ws.send(JSON.stringify({ t: 'hello', v: 1, seat: 0, key: 'ka', since: -1 }));
    await wait(400);
    assert.equal(a.got[0].t, 'welcome');
    assert.ok(a.got.some((m) => m.t === 'frames'));
    a.ws.send(JSON.stringify({ t: 'cmd', at: s.room.host.sealed + 9, cmd: { type: 'deploy', op: 'char_503_rang', row: 3, col: 2, dir: 0 } }));
    await wait(600);
    assert.equal(s.room.host.world.units.filter((u) => u.kind === 0).length, 1);
    a.ws.close();
  } finally { s.close(); }
});

test('malformed and binary messages close the connection; a taken seat refuses another key', async () => {
  const s = await start();
  try {
    const bad = open(s.url(1));
    await bad.ready;
    bad.ws.send(JSON.stringify({ t: 'hello', v: 1, seat: 1, key: 'k', since: -1, admin: true }));
    assert.deepEqual(await bad.closed, { code: 1008, reason: 'unknown field admin' });
    const bin = open(s.url(1));
    await bin.ready;
    bin.ws.send(Buffer.from([1, 2, 3]));
    assert.equal((await bin.closed).code, 1003);
    const first = open(s.url(0));
    await first.ready;
    first.ws.send(JSON.stringify({ t: 'hello', v: 1, seat: 0, key: 'owner', since: -1 }));
    await wait(100);
    const thief = open(s.url(0));
    await thief.ready;
    thief.ws.send(JSON.stringify({ t: 'hello', v: 1, seat: 0, key: 'other', since: -1 }));
    assert.deepEqual(await thief.closed, { code: 1008, reason: 'seat taken' });
    const early = open(s.url(1));
    await early.ready;
    early.ws.send(JSON.stringify({ t: 'hash', frame: 30, hash: 1 }));
    assert.deepEqual(await early.closed, { code: 1008, reason: 'say hello first' });
    first.ws.close();
  } finally { s.close(); }
});

test('upgrades to other paths or seats are refused', async () => {
  const s = await start();
  try {
    for (const url of [s.url(2), s.url(-1), s.url(0).replace('/battle', '/other')]) {
      const x = open(url);
      x.ws.on('error', () => {});
      assert.ok((await x.closed).code >= 1000);
    }
  } finally { s.close(); }
});
