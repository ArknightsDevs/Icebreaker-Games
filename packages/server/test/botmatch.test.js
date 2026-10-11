// A whole match played by two bots over the lockstep host and clients in one process, on a simulated clock (the
// engine's 同步-1 … 同步-9 end to end, without sockets): each bot deploys its deck near the enemies and starts its
// manual skills; both turn 2× on. The match must end with a result, no seat may desync, and both clients must end in
// the arbiter's state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LockstepHost, LockstepClient } from '@aue/net';
import { matchContent } from '@aue/content';
import { deployProblem, stateHash } from '@aue/sim';
import { KIND, DIR } from '@aue/schema';
import { DEFAULT_MATCH } from '../src/battle.js';

const FRAME_MS = 1000 / 30, LIMIT = 30 * 60 * 30;

/** The direction from a tile towards a point. @param {number} dx @param {number} dy */
const facing = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? DIR.RIGHT : DIR.LEFT) : dy >= 0 ? DIR.UP : DIR.DOWN);

/**
 * The tile a bot would deploy an operator on: the free one its type allows nearest the nearest enemy (not under it),
 * in the bot's own half of the map when it can (so the two bots do not race for one tile), facing that enemy.
 * @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c @param {number} seat @param {string} op
 * @param {import('@aue/sim').Unit[]} enemies
 */
function tileFor(w, c, seat, op, enemies) {
  let best = null;
  for (let row = 0; row < c.level.height; row++) {
    for (let col = 0; col < c.level.width; col++) {
      const e = enemies.reduce((a, b) => (Math.hypot(b.x - col, b.y - row) < Math.hypot(a.x - col, a.y - row) ? b : a));
      const cmd = { type: /** @type {const} */ ('deploy'), op, row, col, dir: facing(e.x - col, e.y - row) };
      const own = (col < c.level.width / 2) === (seat === 0), d = Math.hypot(e.x - col, e.y - row) + (own ? 0 : 100);
      if (d >= 1 && (!best || d < best.d) && deployProblem(w, c, seat, cmd) === null) best = { d, cmd };
    }
  }
  return best?.cmd ?? null;
}

/**
 * A bot's deploy for this frame, or null: the first operator of its deck it can place, once enemies are on the field.
 * @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c @param {number} seat
 */
function deployOf(w, c, seat) {
  const enemies = w.units.filter((u) => u.kind === KIND.ENEMY && u.base?.neutral !== true);
  if (enemies.length === 0) return null;
  for (const op of c.decks?.[seat] ?? []) {
    const cmd = tileFor(w, c, seat, op, enemies);
    if (cmd) return cmd;
  }
  return null;
}

/** The bot's skill commands: every own manual skill that is ready. @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c @param {number} seat */
const skillsOf = (w, c, seat) => w.units
  .filter((u) => u.kind === KIND.OPERATOR && u.owner === seat && u.skill && u.skill.sp >= u.skill.cost && !u.skill.active && c.operators[u.key].skill?.type === 'MANUAL')
  .map((u) => ({ type: /** @type {const} */ ('skill'), unit: u.id }));

/** Messages through JSON, as the sockets would carry them. @param {unknown} m */
const wire = (m) => JSON.parse(JSON.stringify(m));

/**
 * Plays a match with two bots to its end (or the limit) and returns both clients' worlds, the arbiter's and the
 * desyncs seen.
 * @param {import('@aue/schema').Match} match
 */
async function play(match) {
  const content = await matchContent(match), desyncs = /** @type {unknown[]} */ ([]), toHost = /** @type {[number, any][]} */ ([]);
  const toClient = /** @type {any[][]} */ ([[], []]);
  const host = new LockstepHost({ content, seats: 2, seed: match.seed, match, send: (seat, m) => toClient[seat].push(wire(m)), onDesync: (d) => desyncs.push(d) });
  const clients = [0, 1].map((seat) => new LockstepClient({ content, send: (m) => toHost.push([seat, wire(m)]) }));
  const routes = /** @type {Record<string, (seat: number, m: any, now: number) => void>} */ ({
    cmd: (s, m) => host.command(s, m.at, m.cmd), hash: (s, m) => host.hash(s, m.frame, m.hash), speed: (s, m, now) => host.speed(s, m.on, now),
  });
  let now = 0;
  host.hello(0, now);
  host.hello(1, now);
  for (const cl of clients) cl.speed(true);
  for (let w = clients[0].world; !w || (w.result < 0 && w.frame <= LIMIT); w = clients[0].world) {
    now += FRAME_MS;
    for (const [seat, m] of toHost.splice(0)) routes[m.t]?.(seat, m, now);
    host.tick(now);
    clients.forEach((cl, seat) => { for (const m of toClient[seat].splice(0)) cl.receive(m); cl.pump(); });
    if (clients[0].world && clients[0].world.frame % 10 === 0) clients.forEach((cl, seat) => bot(cl, content, seat));
  }
  const [a, b] = clients.map((cl) => /** @type {import('@aue/sim').World} */ (cl.world));
  while (b.frame < a.frame) clients[1].playOne(b);
  return { a, b, host, desyncs };
}

/** One bot's turn: a deploy when it can, and its ready manual skills. @param {LockstepClient} cl @param {import('@aue/sim').Content} c @param {number} seat */
function bot(cl, c, seat) {
  const w = /** @type {import('@aue/sim').World} */ (cl.world), dep = deployOf(w, c, seat);
  if (dep) cl.command(dep);
  for (const s of skillsOf(w, c, seat)) cl.command(s);
}

/** @param {Awaited<ReturnType<typeof play>>} r */
const summary = (r) => `result ${r.a.result} at frame ${r.a.frame}; stages passed ${r.a.stage.passed}; stamps ${r.a.stage.stamps}; life ${r.a.players.map((p) => p.life).join('/')}`;

test('two bots play the default match to its end without a desync', { timeout: 600000 }, async () => {
  const r = await play(DEFAULT_MATCH);
  assert.deepEqual(r.desyncs, []);
  assert.ok(r.a.result === 0 || r.a.result === 1, `the match ended (${summary(r)})`);
  assert.equal(stateHash(r.a), stateHash(r.b));
  assert.ok(r.host.world.frame >= r.a.frame);
  console.log(`default match: ${summary(r)}`);
});

const STRONG = Object.freeze({ elite: 2, level: 90, potential: 1, trust: 100, skill: 0, skillLevel: 7 });

test('two bots with elite-2 six-stars play the same level through its stages', { timeout: 600000 }, async () => {
  const deck = (/** @type {string[]} */ ids) => ids.map((id) => ({ id, build: STRONG }));
  const match = { ...DEFAULT_MATCH, decks: [deck(['char_202_demkni', 'char_017_huang', 'char_103_angel', 'char_134_ifrit', 'char_2014_nian']), deck(['char_010_chen', 'char_263_skadi', 'char_222_bpipe', 'char_180_amgoat', 'char_291_aglina'])] };
  const r = await play(match);
  assert.deepEqual(r.desyncs, []);
  assert.ok(r.a.result === 0 || r.a.result === 1, `the match ended (${summary(r)})`);
  assert.equal(stateHash(r.a), stateHash(r.b));
  console.log(`strong match: ${summary(r)}`);
});
