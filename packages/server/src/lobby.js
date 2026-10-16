// The lobby socket (docs/spec/room.md): a browser connects to /lobby, says hello with its session key and name, then
// creates or joins a room and goes through the allocation; rooms.js holds the state. Every message is checked with
// lobbyMessageProblem first; a connection that sends too much, too fast or malformed is closed.
import { WebSocketServer } from 'ws';
import { createRooms } from './rooms.js';

/** Largest message a browser may send to the lobby, in bytes (a squad of 30 operators fits). */
export const MAX_LOBBY_MESSAGE = 16384;
/** Messages a connection may send: a burst, refilled per second. */
const BURST = 30, REFILL = 10;

/** @param {unknown} x @returns {x is Record<string, unknown>} */
const isRecord = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
/** @param {unknown} x @param {number} max */
const shortText = (x, max) => typeof x === 'string' && x.length > 0 && x.length <= max;
/** An operator's id. @param {unknown} x */
const operatorId = (x) => typeof x === 'string' && /^char_[a-z0-9_]{1,40}$/.test(x);
/** A name card's assistant: an operator and its art (1: elite 1, 2: elite 2), or none. @param {unknown} x */
const assistPick = (x) => x === null || (isRecord(x) && Object.keys(x).sort().join() === 'art,id' && operatorId(x.id) && (x.art === 1 || x.art === 2));

/** Each message's fields beside `t`, and the check of their values. @type {Record<string, (m: Record<string, unknown>) => boolean>} */
const SHAPES = {
  hello: (m) => shortText(m.key, 64) && shortText(m.name, 16) && String(m.name).trim().length > 0,
  create: () => true, leave: () => true, kick: () => true, go: () => true, handover: () => true,
  ping: (m) => typeof m.at === 'number' && Number.isFinite(m.at),
  profile: (m) => typeof m.tag === 'string' && /^\d{4}$/.test(m.tag) && (m.avatar === '' || operatorId(m.avatar)) && assistPick(m.assist),
  join: (m) => shortText(m.code, 200),
  project: (m) => Number.isInteger(m.index),
  prepare: (m) => typeof m.on === 'boolean',
  ready: (m) => typeof m.on === 'boolean',
  confirm: (m) => isRecord(m.squad) && shortText(m.style, 16),
  pick: (m) => shortText(m.id, 32),
  lineup: (m) => Array.isArray(m.lineup) && m.lineup.length <= 12 && m.lineup.every((x) => isRecord(x) && Object.keys(x).sort().join() === 'id,module,skill'),
};
/** The fields each message has besides `t`. @type {Record<string, string>} */
const FIELDS = { hello: 'key,name', ping: 'at', profile: 'assist,avatar,tag', join: 'code', project: 'index', prepare: 'on', ready: 'on', confirm: 'squad,style', pick: 'id', lineup: 'lineup' };

/**
 * Why a lobby message is malformed, or null (room.md): a known type with exactly its fields, each of its kind; the
 * squad and the lineup are checked against the rules by the room (rooms.js, with the regular mode's squad rules).
 * @param {unknown} m @returns {string | null}
 */
export function lobbyMessageProblem(m) {
  if (!isRecord(m) || typeof m.t !== 'string' || !Object.hasOwn(SHAPES, m.t)) return 'not a lobby message';
  const want = ['t', ...(FIELDS[m.t] ? FIELDS[m.t].split(',') : [])].sort().join();
  if (Object.keys(m).sort().join() !== want) return `${m.t}: fields are not ${want}`;
  return SHAPES[m.t](m) ? null : `${m.t}: a field is malformed`;
}

/**
 * The lobby: its rooms and the upgrade of /lobby connections.
 * @param {Omit<import('./rooms.js').RoomsOptions, 'send' | 'now' | 'random'> & { now?: () => number, random?: () => number, log?: (line: string) => void }} o
 */
export function createLobby(o) {
  /** @type {Map<number, import('ws').WebSocket>} */
  const sockets = new Map();
  let next = 1;
  const rooms = createRooms({
    ...o, now: o.now ?? (() => Date.now()), random: o.random ?? Math.random,
    send: (id, msg) => { const ws = sockets.get(id); if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); },
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_LOBBY_MESSAGE });
  const timer = setInterval(() => rooms.tick(), 250);

  /** @param {import('ws').WebSocket} ws */
  function connect(ws) {
    const id = next++, bucket = { n: BURST, at: Date.now() };
    let hello = false;
    sockets.set(id, ws);
    ws.on('message', (data, binary) => {
      const now = Date.now();
      bucket.n = Math.min(BURST, bucket.n + ((now - bucket.at) / 1000) * REFILL);
      bucket.at = now;
      if (binary || --bucket.n < 0) { ws.close(1008, binary ? 'text only' : 'too many messages'); return; }
      let m;
      try { m = JSON.parse(String(data)); } catch { m = null; }
      const why = lobbyMessageProblem(m);
      if (why) { ws.close(1008, why.slice(0, 120)); return; }
      if (m.t === 'hello') { hello = true; rooms.hello(id, m.key, String(m.name).trim()); } else if (!hello) ws.close(1008, 'say hello first');
      // the latency the page shows (页面-6): its own time sent straight back
      else if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: m.at }));
      else if (m.t === 'profile') rooms.profile(id, { tag: m.tag, avatar: m.avatar, assist: m.assist });
      else rooms.message(id, m);
    });
    ws.on('close', () => { sockets.delete(id); if (hello) rooms.gone(id); });
  }

  return {
    rooms,
    /** Takes over an upgrade for /lobby; false for any other path. @param {import('node:http').IncomingMessage} req @param {import('node:stream').Duplex} socket @param {Buffer} head */
    upgrade(req, socket, head) {
      if (new URL(req.url ?? '/', 'http://x').pathname !== '/lobby') return false;
      wss.handleUpgrade(req, socket, head, connect);
      return true;
    },
    close() { clearInterval(timer); for (const ws of sockets.values()) ws.close(1001, 'server closing'); wss.close(); },
  };
}
