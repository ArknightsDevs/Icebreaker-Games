// 阵地足球锦标 (docs/spec/room.md 房间-15): a session outside a room asks for a stage with its lineup and training
// effect and gets a match of its own — the lineup and the effect's runes for seat 0, nobody for seat 1 —; the server
// refuses a stage, lineup or effect that is not right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@aue/schema';
import { matchContent } from '@aue/content';
import { createHttpServer, createLobby, createBattles, lobbyMessageProblem, projectViews, recruits, cupMatch } from '../src/index.js';

/** A well-formed lineup operator. @param {string} id @param {number} [skill] */
const pick = (id, skill = 0) => ({ e: { id, elite: 2, level: 90, potential: 1, trust: 100, skills: [10, 10, 10], modules: [] }, skill, module: -1 });
const LINEUP = [pick('char_613_acmedc', 2), pick('char_611_acnipe', 1), pick('char_002_amiya')];

test('[房间-15] a stage\'s match: the lineup for seat 0 with the training effect\'s runes, nobody for seat 1; what is not right is refused', async () => {
  const m = cupMatch('act1football_sub-1-2', 9, LINEUP, 'act1football_relic_02');
  assert.ok('match' in m);
  assert.deepEqual(m.match.decks.map((d) => d.map((e) => e.id)), [['char_613_acmedc', 'char_611_acnipe', 'char_002_amiya'], []]);
  assert.deepEqual([m.match.level, m.match.difficulty, m.match.seed], ['act1football_sub-1-2', 'NORMAL', 9]);
  assert.deepEqual(m.match.runes?.map((r) => r.map((x) => x.key)), [['env_gbuff_new'], []]);
  const c = await matchContent(m.match);
  assert.deepEqual(c.decks?.[0].filter((k) => k.startsWith('char_')), ['char_613_acmedc#0', 'char_611_acnipe#0', 'char_002_amiya#0'], 'the engine takes it, with the level\'s ball card');
  const plain = cupMatch('act1football_01', 9, LINEUP, '');
  assert.ok('match' in plain && plain.match.runes?.[0].length === 0, 'no training effect');
  const tr = cupMatch('act1football_tr01', 9, [], '');
  assert.ok('match' in tr && tr.match.decks.every((d) => d.length === 0), 'PF-TR-1: the level\'s own operators only');
  const err = (/** @type {ReturnType<typeof cupMatch>} */ x) => ('error' in x ? x.error : 'ok');
  assert.equal(err(cupMatch('act1multi_01', 9, LINEUP, '')), '没有这一关');
  assert.equal(err(cupMatch('act1football_01', 9, LINEUP, 'act1football_relic_09')), '没有这个训练效果');
  assert.match(err(cupMatch('act1football_01', 9, [], '')), /^上场干员不对/);
  assert.equal(lobbyMessageProblem({ t: 'cup', level: 'act1football_01', lineup: [], relic: '', assist: null }), null);
  assert.match(String(lobbyMessageProblem({ t: 'cup', level: 'act1football_01', lineup: [] })), /fields/);
  assert.match(String(lobbyMessageProblem({ t: 'cup', level: 'act1football_01', lineup: Array(13).fill(0), relic: '', assist: null })), /malformed/);
  assert.match(String(lobbyMessageProblem({ t: 'cup', level: 'act1football_01', lineup: [], relic: '', assist: 3 })), /malformed/);
});

/** A lobby and its battles on a free port, alone matches started as the server starts them. */
async function start() {
  const battles = createBattles({ onEnd: (id) => lobby.rooms.ended(id) });
  const lobby = createLobby({ projects: projectViews(), recruits: await recruits(), startMatch: (m, keys) => battles.start(m, keys),
    startTraining: (m, key) => battles.start(m, [key], { absent: [1] }) });
  const server = createHttpServer({ rootDir: process.cwd(), onUpgrade: (req, socket, head) => { if (!lobby.upgrade(req, socket, head) && !battles.upgrade(req, socket, head)) socket.destroy(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  return { port, close: () => { lobby.close(); battles.close(); server.close(); } };
}

/** A socket that collects what it receives; `next(t)` waits for the next message of a type. @param {string} url */
function open(url) {
  const ws = new WebSocket(url), got = /** @type {any[]} */ ([]), waiting = /** @type {{ t: string, r: (m: any) => void }[]} */ ([]);
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)), i = waiting.findIndex((w) => w.t === m.t);
    if (i >= 0) waiting.splice(i, 1)[0].r(m); else got.push(m);
  });
  ws.on('error', () => {});
  const next = (/** @type {string} */ t) => {
    const i = got.findIndex((m) => m.t === t);
    return i >= 0 ? Promise.resolve(got.splice(i, 1)[0]) : new Promise((r) => waiting.push({ t, r }));
  };
  return { ws, next, send: (/** @type {any} */ m) => ws.send(JSON.stringify(m)), ready: new Promise((r) => ws.on('open', r)) };
}

test('[房间-15] a support unit: last in seat 0\'s deck, marked (engine 同步-9), a 13th after twelve; one in the lineup or on PF-TR-1 refused', async () => {
  const twelve = Array.from({ length: 12 }, (_, i) => pick(['char_613_acmedc', 'char_611_acnipe', 'char_002_amiya', 'char_003_kalts', 'char_172_svrash', 'char_010_chen',
    'char_017_huang', 'char_102_texas', 'char_103_angel', 'char_112_siege', 'char_113_cqbw', 'char_115_headbr'][i]));
  const m = cupMatch('act1football_01', 9, twelve, '', pick('char_1028_texas2', 2));
  assert.ok('match' in m);
  const deck = m.match.decks[0];
  assert.deepEqual([deck.length, deck.at(-1)?.id, deck.at(-1)?.assist, deck.filter((d) => d.assist).length], [13, 'char_1028_texas2', true, 1]);
  const c = await matchContent(m.match);
  assert.ok(c.decks?.[0].includes('char_1028_texas2#0'), 'the engine takes a deck of thirteen with its support unit');
  const err = (/** @type {ReturnType<typeof cupMatch>} */ x) => ('error' in x ? x.error : 'ok');
  assert.match(err(cupMatch('act1football_01', 9, twelve, '', pick('char_002_amiya'))), /^助战不对/);
  assert.match(err(cupMatch('act1football_tr01', 9, [], '', pick('char_002_amiya'))), /^助战不对/);
});

test('[房间-15] the lobby starts a stage alone (engine 同步-14): the start names it, seat 0 plays the lineup; not from a room', async () => {
  const s = await start();
  try {
    const a = open(`ws://127.0.0.1:${s.port}/lobby`);
    await a.ready;
    a.send({ t: 'hello', key: 'key-c', name: 'C' });
    a.send({ t: 'cup', level: 'act1football_01', lineup: [], relic: '', assist: null });
    assert.match((await a.next('error')).msg, /^上场干员不对/);
    a.send({ t: 'cup', level: 'act1football_01', lineup: LINEUP, relic: '', assist: null });
    const go = await a.next('start');
    assert.deepEqual([go.seat, go.cup, go.training], [0, 'act1football_01', undefined]);
    const b = open(`ws://127.0.0.1:${s.port}/battle?match=${go.match}&seat=0`);
    await b.ready;
    b.send({ t: 'hello', v: PROTOCOL_VERSION, seat: 0, key: 'key-c', since: -1 });
    const welcome = await b.next('welcome');
    assert.deepEqual([welcome.match.level, welcome.match.decks.map((/** @type {any[]} */ d) => d.length)], ['act1football_01', [3, 0]]);
    b.send({ t: 'ready' });
    let f = await b.next('frames');
    while (f.to < 10) f = await b.next('frames');
    assert.ok(f.to >= 10, 'frames are sealed without seat 1');
    a.send({ t: 'create' });
    await a.next('room');
    a.send({ t: 'cup', level: 'act1football_01', lineup: LINEUP, relic: '', assist: null });
    assert.equal((await a.next('error')).msg, '已在房间里，不能参赛');
  } finally { s.close(); }
});
