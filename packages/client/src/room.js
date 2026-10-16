// The room page (docs/spec/room.md): the lobby connection, the room as the server tells it, and the box and 常规队 of
// the local save. When the room's match starts the page goes to the battle page with the match and the seat; the
// battle page comes back here when it ends. The lobby key stays in this tab (session.js), so a reload or the way back
// takes the same seat.
import { ROSTER, loadTraining } from '@aue/content';
import { squadProblem } from '@icebreaker/mode-regular';
import { LOBBY_KEY, tabKey, localStore } from './session.js';
import { readSave, writeSave, squadOf } from './save.js';
import { createBoxView } from './boxview.js';
import { renderRoom, entryIn } from './roomview.js';
import { CLOSED, clock, startingLineup } from './roomtext.js';

/** Where this tab's last match is kept, for a way back into it. */
const MATCH_KEY = 'ice.match';
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const store = localStore(), key = tabKey(LOBBY_KEY);
let save = readSave(store);
/** @type {import('./roomview.js').RoomState} */
const S = { conn: '连接中', lobby: null, view: null, at: 0, draft: null, started: readStarted() };
/** @type {WebSocket | null} */
let ws = null;
let retry = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;

/** @returns {{ match: string, seat: number } | null} */
function readStarted() {
  try { return JSON.parse(sessionStorage.getItem(MATCH_KEY) ?? 'null'); } catch { return null; }
}
/** @param {{ match: string, seat: number } | null} s */
function writeStarted(s) {
  try { if (s) sessionStorage.setItem(MATCH_KEY, JSON.stringify(s)); else sessionStorage.removeItem(MATCH_KEY); } catch { /* the way back is a convenience */ }
}

/** @param {string} text */
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

const playerName = () => save.name || '博士';
/** @param {Record<string, unknown>} m */
const send = (m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); else toast('还没有连上服务器'); };

/** @type {import('./roomview.js').RoomActions} */
const A = {
  send, squad: () => squadOf(save), squadProblem: () => squadProblem(squadOf(save)),
  nameOf: (id) => ROSTER[id]?.name ?? id,
  setDraft: (d) => { S.draft = d; draw(); },
};

const box = createBoxView($('box'), {
  roster: ROSTER, training: (id) => loadTraining(id), getSave: () => save, toast,
  setSave: (s) => {
    const renamed = s.name !== save.name;
    save = s;
    if (!writeSave(store, s)) toast('这个浏览器不让保存，关闭页面后 box 会丢失');
    if (renamed && ws?.readyState === WebSocket.OPEN) send({ t: 'hello', key, name: playerName() });
    box.render();
    draw();
  },
});

function draw() {
  renderRoom($('screen'), S, A);
  $('conn').textContent = S.conn;
  $('box').hidden = !!S.view && !['setup', 'confirm'].includes(S.view.phase);
}

/** A room view: the lineup a player starts from once the lineups are set (房间-5). @param {any} v */
function onRoom(v) {
  if (v.phase !== 'lineup') S.draft = null;
  else if (!S.draft) S.draft = startingLineup(v.options[v.you], (id) => entryIn({ ...S, view: v }, v.you, id));
  if (v.phase === 'setup' && S.started) { S.started = null; writeStarted(null); }
  S.view = v;
  S.at = performance.now();
}

/** @param {any} m */
function onMessage(m) {
  if (m.t === 'lobby') S.lobby = m;
  else if (m.t === 'room') onRoom(m);
  else if (m.t === 'error') toast(m.msg);
  else if (m.t === 'closed') { S.view = null; S.draft = null; toast(CLOSED[m.why] ?? '房间已关闭'); }
  else if (m.t === 'start') {
    S.started = { match: m.match, seat: m.seat };
    writeStarted(S.started);
    location.assign(`/play?match=${encodeURIComponent(m.match)}&seat=${m.seat}`);
    return;
  }
  draw();
}

function connect() {
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/lobby`);
  ws = sock;
  sock.onopen = () => { retry = 0; S.conn = '已连接'; sock.send(JSON.stringify({ t: 'hello', key, name: playerName() })); draw(); };
  sock.onmessage = (e) => onMessage(JSON.parse(String(e.data)));
  sock.onclose = (e) => {
    S.conn = '重连中';
    if (e.reason) toast(`连接断开：${e.reason}`);
    draw();
    setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
  };
}

setInterval(() => {
  for (const el of document.querySelectorAll('[data-until]')) el.textContent = clock(Number(/** @type {HTMLElement} */ (el).dataset['until']) - performance.now());
}, 250);
box.render();
draw();
connect();
// for end-to-end tests and the console
Object.assign(globalThis, { __room: { state: () => S, save: () => save } });
