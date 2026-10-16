// The room page (docs/spec/room.md): the lobby connection, the room as the server tells it, and the box and 常规队 of
// the local save. When the room's match starts the page goes to the battle page with the match and the seat; the
// battle page comes back here when it ends. The lobby key stays in this tab (session.js), so a reload or the way back
// takes the same seat. With the assets the page shows the activity's icons and plays its menu music (页面-5); with their
// lobby UI pack the room is drawn on the original lobby screens (页面-6), the page's HTML room staying the fallback.
import { ROSTER, loadTraining } from '@aue/content';
import { squadProblem, MODE } from '@icebreaker/mode-regular';
import { LOBBY_KEY, tabKey, localStore } from './session.js';
import { readSave, writeSave, squadOf, profileOf, newTag } from './save.js';
import { createBoxView } from './boxview.js';
import { renderRoom, entryIn } from './roomview.js';
import { CLOSED, clock, startingLineup, inviteText } from './roomtext.js';
import { loadRoomAtlas, styleIcon, modeIcon } from './roomart.js';
import { createRoomMusic } from './roommusic.js';
import { readSettings, writeSettings, VOLUMES } from './settings.js';
import { startLobby } from './lobbypage.js';
import { resultOf } from './lobbymap.js';

/** Where this tab's last match is kept, for a way back into it; where the battle page leaves its result (页面-6). */
const MATCH_KEY = 'ice.match', RESULT_KEY = 'ice.result';
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const store = localStore(), key = tabKey(LOBBY_KEY);
let save = readSave(store);
// a 代号 of its own from the first visit on (房间-1), kept with the save
if (!save.tag) { save = { ...save, tag: newTag() }; writeSave(store, save); }
const ASSETS = new URL('/assets/skeleton/', location.href), ART = new URL('ui/room/', ASSETS).href;
/** @type {import('./roomart.js').RoomAtlas | null} */
let atlas = null;
const music = createRoomMusic(new URL('audio/', ASSETS).href, readSettings(store).music);
/** @type {import('./roomview.js').RoomState} */
const S = { conn: '连接中', lobby: null, view: null, at: 0, draft: null, started: readStarted(), ping: null };
/** How often the page measures the lobby's latency (页面-6). */
const PING_MS = 2000;
/** @type {WebSocket | null} */
let ws = null;
let retry = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** The original lobby screens when the assets have them (页面-6). @type {Awaited<ReturnType<typeof startLobby>>} */
let lobby = null;

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
  if (lobby) { lobby.toast(text); return; }
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

const playerName = () => save.name || '博士';
/** @param {Record<string, unknown>} m */
const send = (m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); else toast('还没有连上服务器'); };
/** The name card last sent, so a save that does not change it sends nothing. */
let sentCard = '';
/** The save's name card to the lobby (房间-1): after hello, and whenever it changes. @param {boolean} [again] */
function sendCard(again = false) {
  const card = JSON.stringify(profileOf(save));
  if (ws?.readyState !== WebSocket.OPEN || (card === sentCard && !again)) return;
  sentCard = card;
  ws.send(JSON.stringify({ t: 'profile', ...profileOf(save) }));
}

/** @type {import('./roomview.js').RoomActions} */
const A = {
  send, squad: () => squadOf(save), squadProblem: () => squadProblem(squadOf(save)),
  nameOf: (id) => ROSTER[id]?.name ?? id,
  setDraft: (d) => { S.draft = d; draw(); },
  style: () => save.style,
  icon: (icon, variant) => styleIcon(atlas, ART, icon, variant),
  modeIcon: () => modeIcon(atlas, ART, MODE.type),
};

const box = createBoxView($('boxbody'), {
  roster: ROSTER, training: (id) => loadTraining(id), getSave: () => save, toast, icon: A.icon,
  setSave: (s) => {
    const renamed = s.name !== save.name;
    save = s;
    if (!writeSave(store, s)) toast('这个浏览器不让保存，关闭页面后 box 会丢失');
    if (renamed && ws?.readyState === WebSocket.OPEN) send({ t: 'hello', key, name: playerName() });
    sendCard();
    box.render();
    draw();
  },
});

/** The music button (页面-5): the music volume of the settings, 100% → 50% → 关 → 100%, saved for both pages. */
function drawMusic() {
  const v = readSettings(store).music;
  $('music').textContent = `音乐 ${v === 0 ? '关' : `${v * 100}%`}`;
}

function draw() {
  $('conn').textContent = S.conn;
  drawMusic();
  if (lobby) { lobby.draw(); return; }
  renderRoom($('screen'), S, A);
  $('box').hidden = !!S.view && !['setup', 'confirm'].includes(S.view.phase);
}

/** The box editor over the lobby screens (页面-6: the original's operator picker is not in the pack). @param {boolean} on */
function boxOpen(on) {
  document.body.classList.toggle('box-open', on);
  $('box').hidden = !on;
}

/** The battle page's result, once (页面-6). */
function takeResult() {
  let raw = null, bg = null;
  try {
    raw = sessionStorage.getItem(RESULT_KEY); bg = sessionStorage.getItem(`${RESULT_KEY}.bg`);
    sessionStorage.removeItem(RESULT_KEY); sessionStorage.removeItem(`${RESULT_KEY}.bg`);
  } catch { /* no result kept */ }
  const r = resultOf(raw);
  return r && bg?.startsWith('data:image/') ? { ...r, bg } : r;
}

/** The lobby screens when the assets have them; else the HTML room stays. */
async function lobbyMode() {
  lobby = await startLobby($('lobby'), {
    S, A, entry: (id) => save.box.find((e) => e.id === id) ?? null, editBox: () => boxOpen(true), invite: () => inviteText(S.view?.code ?? '', S.view?.members[0]?.name ?? '', S.view?.members[0]?.tag ?? ''),
    setStyle: (id) => { save = { ...save, style: id }; if (!writeSave(store, save)) toast('这个浏览器不让保存，关闭页面后 box 会丢失'); sendCard(); box.render(); draw(); },
    backButton: (on) => { $('back').hidden = !on; }, sfx: readSettings(store).sfx, card: () => ({ name: playerName(), ...profileOf(save) }),
  }).catch((e) => { console.error(e); return null; });
  if (!lobby) return;
  document.body.classList.add('lobby-on');
  $('lobby').hidden = false;
  $('boxbtn').hidden = false;
  $('boxclose').hidden = false;
  boxOpen(false);
  const r = takeResult();
  if (r) lobby.result(r);
  draw();
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
  if (m.t === 'pong') { if (typeof m.at === 'number') S.ping = performance.now() - m.at; return; }
  if (m.t === 'lobby') S.lobby = m;
  else if (m.t === 'room') onRoom(m);
  else if (m.t === 'error') { lobby?.failed(); toast(m.msg); }
  else if (m.t === 'closed') { S.view = null; S.draft = null; toast(CLOSED[m.why] ?? '房间已关闭'); }
  else if (m.t === 'start') {
    S.started = { match: m.match, seat: m.seat };
    writeStarted(S.started);
    const to = `/play?match=${encodeURIComponent(m.match)}&seat=${m.seat}`;
    // with the lobby screens the countdown and the start play first (页面-6)
    void Promise.all([lobby?.start(), music.leave()]).then(() => location.assign(to));
    draw();
    return;
  }
  draw();
}

function connect() {
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/lobby`);
  ws = sock;
  sock.onopen = () => { retry = 0; S.conn = '已连接'; sock.send(JSON.stringify({ t: 'hello', key, name: playerName() })); sendCard(true); ping(); draw(); };
  sock.onmessage = (e) => onMessage(JSON.parse(String(e.data)));
  sock.onclose = (e) => {
    S.conn = '重连中';
    S.ping = null;
    if (e.reason) toast(`连接断开：${e.reason}`);
    draw();
    setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
  };
}

/** The lobby's latency: the page's time sent and back (页面-6). */
function ping() { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping', at: performance.now() })); }

setInterval(ping, PING_MS);
setInterval(() => {
  for (const el of document.querySelectorAll('[data-until]')) el.textContent = clock(Number(/** @type {HTMLElement} */ (el).dataset['until']) - performance.now());
}, 250);
$('music').addEventListener('click', () => {
  const s = readSettings(store), next = VOLUMES[(VOLUMES.indexOf(s.music) + 1) % VOLUMES.length];
  writeSettings(store, { ...s, music: next });
  music.volume(next);
  drawMusic();
});
// a page may sound only after a gesture: the music starts on the first touch or key
addEventListener('pointerdown', () => { music.start(); lobby?.resume(); });
addEventListener('keydown', (e) => { music.start(); lobby?.resume(); if (e.key === 'Escape' && lobby) lobby.back(); });
$('back').addEventListener('click', () => lobby?.back());
$('boxbtn').addEventListener('click', () => boxOpen(!document.body.classList.contains('box-open')));
$('boxclose').addEventListener('click', () => { boxOpen(false); draw(); });
void loadRoomAtlas(ART).then((a) => { atlas = a; box.render(); draw(); });
box.render();
draw();
connect();
void lobbyMode();
// for end-to-end tests and the console
Object.assign(globalThis, { __room: { state: () => S, save: () => save, art: () => atlas !== null, lobby: () => lobby?.state() ?? null } });
