// The room page with the original lobby screens (docs/spec/page.md 页面-6, engine ADR 0063): when the assets have the
// lobby UI pack (ui/lobby.json), the room is drawn on it — the entry page, the squad page, the prepare page through
// the room's steps, the result after a match — over the whole page, with toasts in its notify view and leaving asked
// in its confirm dialog. The page logic stays the platform's room flow; without the pack (or with ?html) the page's
// own HTML room stays.
import { createUi } from '@aue/ui';
import { ROSTER, loadTraining } from '@aue/content';
import { STYLES, TOASTS } from '@icebreaker/mode-regular';
import { openPart, closePart, setSwitch } from './lobbykit.js';
import { PAGES, pageOf, newLocal } from './lobbymap.js';
import { createEntry } from './lobbyentry.js';
import { createSquad } from './lobbysquad.js';
import { createPrepare } from './lobbyprepare.js';
import { createFinish } from './lobbyfinish.js';
import { createLobbySound } from './lobbysound.js';
import { AFTER_TICK } from './lobby3d.js';
import { startLobbyFx } from './lobbyfx.js';
import { entryIn } from './roomview.js';
import { styleIcon, loadRoomAtlas, spriteUrl, MODE_ICONS } from './roomart.js';

/** @typedef {import('./roomview.js').RoomState} RoomState @typedef {import('./roomview.js').RoomActions} RoomActions */
/**
 * What the room page gives the lobby: its state and actions, the save's box entries, setting the style, opening the
 * page's box editor, its back button shown or not, the invitation text, the sound volume.
 * @typedef {{ S: RoomState, A: RoomActions, entry: (id: string) => import('@icebreaker/mode-regular').BoxEntry | null, setStyle: (id: string) => void,
 *   editBox: () => void, backButton: (on: boolean) => void, invite: () => string, sfx: number }} LobbyHost
 */

const ASSETS = new URL('/assets/skeleton/', location.href), UI = new URL('ui/', ASSETS).href, ROOM_ART = new URL('ui/room/', ASSETS).href;

/** @param {URL | string} url */
const fetchJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** A picture of the lobby pack's common art by its number (0–5), or null. @param {any} lobby @param {string} kind @param {number} i */
function lobbyArt(lobby, kind, i) {
  const key = lobby?.art?.[kind]?.[Math.max(0, Math.min(5, i))];
  return key && lobby.sprites?.[key] ? new URL(lobby.sprites[key].uri, UI).href : null;
}

/**
 * The pictures cards take (页面-6): avatars from the manifest, profession and elite icons from the battle UI pack, the
 * rarity strips and potential marks the lobby pack carries (the game's common ones; the battle pack's rarity sprites
 * are the deploy cards' glows), skill icons from the skill icon index, the operators' half-length portraits from the
 * portrait index (by elite phase: the elite-2 one from elite 2 when there is one).
 * @param {any} battle @param {any} manifest @param {any} skills @param {any} lobby the lobby pack @param {any} portraits
 * @returns {import('./lobbycards.js').CardArt}
 */
function cardArt(battle, manifest, skills, lobby, portraits) {
  const card = battle?.hud?.card, url = (/** @type {string | null | undefined} */ key) => (key && battle?.sprites?.[key] ? new URL(battle.sprites[key].uri, UI).href : null);
  return {
    avatar: (id) => (manifest?.files?.[`avatar:${id}`] ? new URL(manifest.files[`avatar:${id}`].file, ASSETS).href : null),
    portrait: (id, elite) => {
      const p = portraits?.portraits?.[id], file = p ? (elite >= 2 && p['2']) || p['1'] : null;
      return file ? new URL(`portraits/${file}`, ASSETS).href : null;
    },
    profession: (p) => (card?.professions?.[p] ? { url: url(card.professions[p].sprite), color: card.professions[p].color } : null),
    elite: (phase) => url(card?.elite?.[phase]),
    rarity: (r) => lobbyArt(lobby, 'rarity', r - 1),
    potential: (p) => lobbyArt(lobby, 'potential', p - 1),
    skill: (id) => (skills?.icons?.[id] ? new URL(skills.icons[id], new URL('skills/', UI)).href : null),
  };
}

/**
 * Starts the lobby screens over a host element, or null when the assets have no lobby pack (or the page asks for its
 * HTML room with ?html).
 * @param {HTMLElement} el @param {LobbyHost} H
 */
export async function startLobby(el, H) {
  if (new URLSearchParams(location.search).has('html')) return null;
  const pack = await fetchJson(new URL('lobby.json', UI));
  if (!pack?.screens) return null;
  const [battle, manifest, skills, atlas, portraits] = await Promise.all([fetchJson(new URL('battle.json', UI)), fetchJson(new URL('manifest.json', ASSETS)),
    fetchJson(new URL('skills/index.json', UI)), loadRoomAtlas(ROOM_ART), fetchJson(new URL('portraits/index.json', ASSETS))]);
  const sound = createLobbySound(new URL('audio/', ASSETS).href, H.sfx);
  const ui = createUi(/** @type {any} */ ({ pack, host: el, base: UI, sound: (/** @type {string} */ b) => sound.play(b) }));
  await ui.load();
  // the screens' particle effects, when the assets have them (页面-6)
  void startLobbyFx(ui, UI).catch(() => null);
  return lobbyOn(ui, H, { cards: cardArt(battle, manifest, skills, pack, portraits), atlas, sound, pack });
}

/**
 * Copies a text through a hidden text box (the page runs on LAN addresses, where the clipboard API is not there:
 * 页面-3); false when the browser would not copy. @param {string} text
 */
function copyText(text) {
  const box = document.createElement('textarea');
  box.value = text;
  box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(box);
  box.select();
  /** @type {boolean} */
  let ok;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  box.remove();
  return ok;
}

/** A toast in the notify view, gone after 3 seconds. @param {any} ui @param {string} text */
function toastOn(ui, text) {
  const n = openPart(ui, PAGES.notify, 80);
  n.text(n.view().txtNotify ?? '@txt_notify', text);
  setTimeout(() => closePart(n), 3000);
}

/** A question in the confirm dialog: confirm runs fn. @param {any} ui @param {string} text @param {string} yes @param {() => void} fn */
function askOn(ui, text, yes, fn) {
  const d = openPart(ui, PAGES.dialog, 70), f = d.view();
  d.text(f.dialogContentText, text);
  d.text(f.confirmBtnText, yes);
  d.text(f.cancelBtnText, '取消');
  setSwitch(d, f.confirmOnlyToggle, false);
  d.tap('@obj_btns/panel_two_options/panel_confirm/hotspot', () => { closePart(d); fn(); });
  d.tap('@obj_btns/panel_two_options/panel_cancel/hotspot', () => closePart(d));
}

/** The UI's clock, its size following the page, and a few ticks a second. @param {any} ui @param {() => void} tick */
function runUi(ui, tick) {
  let at = performance.now();
  const loop = (/** @type {number} */ now) => {
    ui.tick(Math.min(0.1, (now - at) / 1000));
    at = now;
    for (const f of AFTER_TICK) f();
    // a focused or clicked node can scroll the clipped layer: it never scrolls
    if (ui.layer.scrollLeft || ui.layer.scrollTop) { ui.layer.scrollLeft = 0; ui.layer.scrollTop = 0; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const fit = () => ui.resize(innerWidth, innerHeight);
  addEventListener('resize', fit);
  fit();
  setInterval(tick, 250);
}

/**
 * The skill ids of operators, loaded on first ask (null until then); `changed` when some came.
 * @param {() => void} changed
 */
function skillIdsOf(changed) {
  /** @type {Map<string, string[]>} */
  const ids = new Map();
  let version = 0;
  return {
    /** @param {string} id @param {number} k */
    get: (id, k) => {
      if (!ids.has(id)) {
        ids.set(id, []);
        void loadTraining(id).then((t) => { ids.set(id, t.skills.map((s) => s?.id ?? '')); version++; changed(); }, () => undefined);
      }
      return ids.get(id)?.[k] || null;
    },
    version: () => version,
  };
}

/**
 * The context the prepare page's steps work with.
 * @param {LobbyHost} H @param {any} G @param {import('./lobbymap.js').Local} L
 * @param {{ draw: () => void, back: () => void, toast: (t: string) => void, ask: (t: string, y: string, fn: () => void) => void, icon: any, skills: ReturnType<typeof skillIdsOf> }} K
 * @returns {import('./lobbystage.js').StepCtx}
 */
function stepCtx(H, G, L, K) {
  const S = H.S, A = H.A;
  return {
    send: A.send, projects: () => S.lobby?.projects ?? [], art: () => G.pack.art, cards: G.cards, styleIcon: K.icon, toast: K.toast,
    leave: () => K.ask('确定要离开房间吗？', '离开', () => A.send({ t: 'leave' })), kick: () => K.ask('确定要请离协作者吗？', '请离', () => A.send({ t: 'kick' })),
    back: K.back, offline: () => S.conn !== '已连接', list: (open) => { L.list = open; K.draw(); }, sub: (sub) => { L.sub = sub; K.draw(); },
    copy: () => K.toast(copyText(H.invite()) ? TOASTS.roomIdCopySuccess : H.invite()),
    nameOf: A.nameOf, rosterOf: (id) => ROSTER[id] ?? null, squad: A.squad, squadProblem: A.squadProblem, style: A.style, setDraft: A.setDraft,
    entryOf: (seat, id) => entryIn(S, seat, id) ?? (seat === S.view?.you ? H.entry(id) : null), skillId: K.skills.get, version: K.skills.version,
    modeIcon: () => spriteUrl(G.atlas, ROOM_ART, MODE_ICONS.NORMAL),
  };
}

/**
 * Each page's maker. @param {any} ui @param {LobbyHost} H @param {any} G @param {import('./lobbymap.js').Local} L
 * @param {{ X: import('./lobbystage.js').StepCtx, draw: () => void }} K @returns {Record<string, () => any>}
 */
function pageMakers(ui, H, G, L, K) {
  const { X, draw } = K;
  const A = H.A;
  return {
    entry: () => createEntry(ui, { create: () => A.send({ t: 'create' }), join: (code) => A.send({ t: 'join', code }), squad: () => { L.squad = true; draw(); },
      squadProblem: A.squadProblem, roomPanel: (on) => { L.room = on; } }),
    squad: () => createSquad(ui, { squad: A.squad, style: A.style, setStyle: H.setStyle, editBox: H.editBox, nameOf: A.nameOf,
      rosterOf: (id) => ROSTER[id] ?? null, cards: G.cards, styleIcon: X.styleIcon, back: X.back, home: () => { L.squad = false; draw(); } }),
    prepare: () => createPrepare(ui, X),
    finish: () => createFinish(ui, /** @type {any} */ (L.finish), { project: (level) => X.projects().find((p) => p.level === level) ?? null, done: () => { L.finish = null; draw(); } }),
  };
}

/** The owner's toast when the mate joins or leaves (页面-6); the count now. @param {any} v @param {number} was @param {(t: string) => void} toast */
function memberToast(v, was, toast) {
  const n = v?.members.length ?? 0;
  if (v && v.you === 0 && was && n !== was) toast(n > was ? TOASTS.roomCollaboratorJoinRoom : TOASTS.roomCollaboratorExitRoom);
  return n;
}

/**
 * The lobby on a loaded UI.
 * @param {any} ui @param {LobbyHost} H @param {{ cards: import('./lobbycards.js').CardArt, atlas: any, sound: ReturnType<typeof createLobbySound>, pack: any }} G
 */
function lobbyOn(ui, H, G) {
  const L = newLocal(), S = H.S;
  /** @type {{ key: string, c: any }} */
  let page = { key: '', c: null };
  let members = 0;
  /** @param {string} style @param {'' | '_tiny' | '_show'} variant */
  const icon = (style, variant) => { const s = STYLES.find((x) => x.id === style); return s ? styleIcon(G.atlas, ROOM_ART, s.icon, /** @type {any} */ (variant)) : null; };
  const toast = (/** @type {string} */ t) => toastOn(ui, t), skills = skillIdsOf(() => draw());
  const X = stepCtx(H, G, L, { draw: () => draw(), back: () => back(), toast, ask: (t, y, fn) => askOn(ui, t, y, fn), icon, skills });
  const makers = pageMakers(ui, H, G, L, { X, draw: () => draw() });

  function draw() {
    const key = pageOf(S, L);
    if (key !== page.key) {
      page.c?.close();
      page = { key, c: makers[key]() };
      // the pages' own top menus (the game's common one) do the going back: the page's button stays hidden
      H.backButton(false);
    }
    if (S.view?.phase !== 'lineup') L.sub = 'sel';
    members = memberToast(S.view, members, toast);
    page.c?.update?.(S, L);
  }

  /** The page's back (页面-6): the result on, out of the squad page or the room panel, the stage list, a lineup view back, else leaving. */
  function back() {
    if (page.key === 'finish') { L.finish = null; draw(); return; }
    if (page.key === 'squad') { if (!page.c.back()) { L.squad = false; draw(); } return; }
    if (page.key === 'entry') { void page.c.back(); return; }
    if (L.list) { L.list = false; draw(); return; }
    if (S.view?.phase !== 'lineup' || L.sub === 'sel') { X.leave(); return; }
    if (S.view.ready[S.view.you]) H.A.send({ t: 'ready', on: false });
    L.sub = L.sub === 'check' ? 'skill' : 'sel';
    draw();
  }

  runUi(ui, () => { if (page.key === 'prepare') page.c?.tick(S); });
  return {
    ui, draw, toast, back,
    /** A match's result to show first. @param {import('./lobbymap.js').MatchResult} r */
    result: (r) => { L.finish = r; draw(); },
    /** A join that came to nothing. */
    failed: () => { if (page.key === 'entry') page.c.failed(); },
    /** Before the match: the countdown and the start (at most 8 seconds). */
    start: () => Promise.race([page.key === 'prepare' ? page.c.start(S) : Promise.resolve(), new Promise((done) => { setTimeout(done, 8000); })]),
    /** The player's sound volume, 0–1. @param {number} v */
    volume: (v) => G.sound.volume(v),
    resume: () => G.sound.resume(),
    /** What the lobby shows, for tests. */
    state: () => ({ page: page.key, local: { ...L }, sounds: G.sound.heard() }),
  };
}
