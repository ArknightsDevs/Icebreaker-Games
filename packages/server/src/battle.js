// The battle socket (M0.5): one two-seat room of the skeleton stage. A browser connects to /battle?seat=<0|1>; its first
// hello binds the seat to its key, so a later connection with another key cannot take the seat over. Every message is
// checked with clientMessageProblem before the lockstep host sees it; the host's clock is ticked on a timer.
import { WebSocketServer } from 'ws';
import { clientMessageProblem, MAX_SEAT } from '@aue/schema';
import { LockstepHost } from '@aue/net';
import { skeletonContent } from '@aue/content';

/** Largest message a browser may send, in bytes. */
export const MAX_MESSAGE = 4096;
const TICK_MS = 1000 / 60;

/**
 * @typedef {object} BattleRoomOptions
 * @property {number} [seats]
 * @property {number} [seed]
 * @property {() => number} [now] milliseconds
 * @property {(line: string) => void} [log]
 */

/** @param {BattleRoomOptions} [o] */
export function createBattleRoom(o = {}) {
  const now = o.now ?? (() => performance.now()), log = o.log ?? (() => {}), seats = o.seats ?? 2;
  /** @type {Map<number, import('ws').WebSocket>} */
  const sockets = new Map();
  /** @type {Map<number, string>} */
  const keys = new Map();
  const host = new LockstepHost({
    content: skeletonContent, seats, seed: o.seed ?? 1,
    send: (seat, msg) => { const ws = sockets.get(seat); if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); },
    onDesync: (d) => log(`desync seat ${d.seat} at frame ${d.frame}: ${d.theirs} != ${d.ours}`),
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  const timer = setInterval(() => host.tick(now()), TICK_MS);

  /** @param {import('ws').WebSocket} ws @param {number} seat @param {string} text */
  const onMessage = (ws, seat, text) => {
    /** @type {unknown} */
    let m;
    try { m = JSON.parse(text); } catch { m = null; }
    const why = clientMessageProblem(m);
    if (why) { ws.close(1008, why.slice(0, 120)); return; }
    const msg = /** @type {import('@aue/schema').ClientMessage} */ (m);
    if (msg.t === 'hello') hello(ws, seat, msg);
    else if (sockets.get(seat) !== ws) ws.close(1008, 'say hello first');
    else if (msg.t === 'cmd') host.command(seat, msg.at, msg.cmd);
    else host.hash(seat, msg.frame, msg.hash);
  };

  /** @param {import('ws').WebSocket} ws @param {number} seat @param {Extract<import('@aue/schema').ClientMessage, { t: 'hello' }>} msg */
  const hello = (ws, seat, msg) => {
    if (msg.seat !== seat || (keys.has(seat) && keys.get(seat) !== msg.key)) { ws.close(1008, 'seat taken'); return; }
    keys.set(seat, msg.key);
    const old = sockets.get(seat);
    sockets.set(seat, ws);
    if (old && old !== ws) old.close(1000, 'replaced');
    host.hello(seat, now());
    log(`seat ${seat} connected`);
  };

  return {
    host,
    /** Takes over an HTTP upgrade for /battle?seat=N. @param {import('node:http').IncomingMessage} req @param {import('node:stream').Duplex} socket @param {Buffer} head */
    upgrade(req, socket, head) {
      const url = new URL(req.url ?? '/', 'http://x'), seat = Number(url.searchParams.get('seat'));
      if (url.pathname !== '/battle' || !Number.isInteger(seat) || seat < 0 || seat >= Math.min(seats, MAX_SEAT + 1)) { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on('message', (data, binary) => { if (binary) ws.close(1003, 'text only'); else onMessage(ws, seat, String(data)); });
        ws.on('close', () => { if (sockets.get(seat) === ws) { sockets.delete(seat); host.bye(seat, now()); log(`seat ${seat} left`); } });
      });
    },
    close() { clearInterval(timer); for (const ws of sockets.values()) ws.close(1001, 'server closing'); wss.close(); },
  };
}
