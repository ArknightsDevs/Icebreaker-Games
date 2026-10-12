// The battle page: the battle worker, the three.js field, the HUD, the controls, the skill bar and the deploy bar. The
// seat comes from ?seat=<n>; the session key stays in sessionStorage so a reload rejoins the same seat. The match
// settings come with the server's welcome (engine spec 同步-9): the field and the decks are built once its content is
// ready. Assets come from the host's /assets/skeleton/ (a local directory, AUE_ASSETS_DIR); without them the page says
// so and draws nothing — the battle runs either way. Units are Spine figures when the assets have their models
// (spine/index.json), else cards; the map is built from the level's tile kit (kits/index.json), else flat tiles.
import { startBattle } from '@aue/worker';
import { createBattleRenderer, loadTextures, loadSpineModels, loadTileKit, loadEffectPack } from '@aue/render';
import { matchContent } from '@aue/content';
import { createDeck } from './deck.js';
import { createSkillBar, skillRows } from './skills.js';
import { createControls, costAskerAfter } from './controls.js';
import { matchText } from './stage.js';
import { createUi, createBattleHud, cardViews } from '@aue/ui';
import { loadUiPack, deckCards, hudState, requestsAfter, unitBars } from './battlehud.js';
import { Hand } from './gestures.js';

const ASSETS = new URL('/assets/skeleton/', location.href);

const seat = Math.max(0, Math.min(7, Number(new URLSearchParams(location.search).get('seat') ?? 0) || 0));
/** ?bars: the page's own bars even when the assets have the original UI. */
const BARS = new URLSearchParams(location.search).has('bars');
const key = sessionKey(seat);
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {number} s */
function sessionKey(s) {
  const name = `ice.key.${s}`;
  try {
    const k = sessionStorage.getItem(name) ?? crypto.randomUUID();
    sessionStorage.setItem(name, k);
    return k;
  } catch { return crypto.randomUUID(); }
}

/** @param {string} text */
function notice(text) { const n = $('notice'); n.textContent = text; n.hidden = false; }

/** @param {import('@aue/schema').View} view @param {string} net @param {string} match */
function drawHud(view, net, match) {
  $('hud').innerHTML = '';
  view.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = i === seat ? 'player me' : 'player';
    d.textContent = `${i === seat ? '我方' : '协作者'} · 生命 ${p.life} · 费用 ${p.cost}`;
    $('hud').append(d);
  });
  for (const [cls, text] of [['match', match], ['net', `第 ${view.frame} 帧 · ${net}`]]) {
    const n = document.createElement('div');
    n.className = cls;
    n.textContent = text;
    $('hud').append(n);
  }
}

/** The local assets: their manifest and textures, or null (and a notice) when the host has none. */
async function assets() {
  const res = await fetch(new URL('manifest.json', ASSETS)).catch(() => null);
  if (!res?.ok) { notice('没有找到本地素材（主机需要设置 AUE_ASSETS_DIR）。没有贴图的东西不显示，所以战场不绘制，对局照常进行。'); return null; }
  const manifest = await res.json();
  return { manifest, textures: await loadTextures(manifest, ASSETS.href) };
}

/**
 * The Spine models of a match's operators and enemies the assets have; none without a model index.
 * @param {{ operators: Record<string, { char?: string }>, enemies: Record<string, unknown> }} content
 */
async function spineModels(content) {
  const res = await fetch(new URL('spine/index.json', ASSETS)).catch(() => null);
  if (!res?.ok) return new Map();
  const ids = [...Object.entries(content.operators).map(([k, o]) => o.char ?? k), ...Object.keys(content.enemies)];
  return loadSpineModels(await res.json(), new URL('spine/', ASSETS).href, ids);
}

/** The map theme's tile kit a level uses (the engine's 渲染-7), or null when the assets have no kit index. @param {string} level */
async function tileKit(level) {
  const res = await fetch(new URL('kits/index.json', ASSETS)).catch(() => null);
  if (!res?.ok) return null;
  return loadTileKit(await res.json(), new URL('kits/', ASSETS).href, level);
}

/** Each deck operator's skill (1-based) by its character, for its skill's own effects (the engine's 渲染-11). @param {import('@aue/schema').Match} match */
const skillSlots = (match) => Object.fromEntries((match.decks ?? []).flat().filter((d) => d.build.skill >= 0).map((d) => [d.id.split('#')[0], d.build.skill + 1]));

/** The units' attack effects (the engine's 渲染-10), or null when the assets have none. */
async function effectPack() {
  const res = await fetch(new URL('fx/units.json', ASSETS)).catch(() => null);
  return res?.ok ? loadEffectPack(await res.json()) : null;
}

/**
 * The page's side of a match once its content is ready: the field, the deck (own operators with an avatar only — a
 * thing without a texture is not shown) and the content for the skill bar and the HUD.
 * @param {import('@aue/schema').Match} match @param {Awaited<ReturnType<typeof assets>>} art
 * @param {() => void} changed called when the deck's selection or facing changes
 */
async function setUp(match, art, changed) {
  const content = await matchContent(match), models = art ? await spineModels(/** @type {any} */ (content)) : new Map();
  const kit = art ? await tileKit(match.level) : null, effects = art ? await effectPack() : null;
  const enemies = /** @type {Record<string, { levelType?: string }>} */ (/** @type {any} */ (content).enemies);
  const leaders = new Set(Object.entries(enemies).filter(([, e]) => e.levelType === 'BOSS').map(([k]) => k));
  // with the original UI the units' bars are its own (the engine's 界面-19), not the renderer's
  const pack = art && !BARS ? await loadUiPack(ASSETS) : null;
  const renderer = art ? createBattleRenderer({ canvas: /** @type {HTMLCanvasElement} */ ($('field')), level: content.level, textures: art.textures, view: content.level.view, models, leaders,
    kit, effects, skills: skillSlots(match), bars: !pack }) : null;
  const avatar = (/** @type {string} */ id) => art?.manifest.files[`avatar:${id}`] ? new URL(art.manifest.files[`avatar:${id}`].file, ASSETS).href : null;
  const ops = (content.decks?.[seat] ?? []).map((k) => ({ id: k, name: content.operators[k].name, avatar: avatar(content.operators[k].char ?? k) }))
    .filter((o) => o.avatar !== null).map((o) => ({ ...o, avatar: /** @type {string} */ (o.avatar) }));
  const ui = renderer && pack ? await originalUi(match, content, avatar, pack) : null;
  return { content, renderer, deck: ui ? null : createDeck($('deck'), ops, changed), ui, match, leaders };
}

/**
 * The original battle UI over the field (the engine's 界面-10…14) when the assets have its pack, else null (the page
 * keeps its own bars).
 * @param {import('@aue/schema').Match} match @param {any} content @param {(id: string) => string | null} avatar
 * @param {NonNullable<Awaited<ReturnType<typeof loadUiPack>>>} loaded the battle UI pack
 */
async function originalUi(match, content, avatar, loaded) {
  const host = $('ui'), base = new URL('ui/', ASSETS).href;
  const ui = createUi({ pack: loaded.pack, host, base });
  await ui.load();
  const deck = deckCards(match, content, seat, avatar);
  const hud = createBattleHud(ui, { deck, coop: (match.decks?.length ?? 1) === 2 });
  document.body.classList.add('original-ui');
  return { ui, hud, deck, icons: loaded.icons, iconBase: new URL('skills/', base).href };
}

let markSeq = 0;

/**
 * The deploy highlight and the range (engine 渲染-8, 渲染-9) for the deck's selection and the pointer's tile, as the
 * worker works them out from its world; only the latest answer is shown.
 * @param {Awaited<ReturnType<typeof setUp>> | null} game @param {{ row: number, col: number } | null} pointer
 * @param {ReturnType<typeof startBattle>['marks']} marks
 */
function markField(game, pointer, marks) {
  const r = game?.renderer;
  if (!game || !r || !game.deck) return;
  const sel = game.deck.selected(), seq = ++markSeq;
  marks({ op: sel?.op ?? null, dir: sel?.dir ?? 0, tile: pointer }).then((m) => {
    if (seq !== markSeq) return;
    r.highlight(sel ? m.deployable : null);
    r.range(m.range ? m.range.keys : null, m.range?.heal);
  });
}

/**
 * The page's state: the match's side once ready, the connection, the speed and pause state, the last frame, the
 * content keys of the units seen, the pointer's tile, the original UI's state and hand.
 * @typedef {{ game: Awaited<ReturnType<typeof setUp>> | null, net: string, costAsker: number, players: number,
 *   control: import('./controls.js').Control | null, lastView: import('@aue/schema').View | null, unitKeys: Map<number, string>,
 *   pointer: { row: number, col: number } | null, hudNow: import('@aue/ui').HudState | null, hand: Hand | null,
 *   requests: import('./battlehud.js').Requests,
 *   battle: ReturnType<typeof startBattle>, mark: () => void, skills: ReturnType<typeof createSkillBar>, bar: () => void }} Page
 */

async function main() {
  const art = await assets();
  /** @type {Page} */
  const P = /** @type {any} */ ({ game: null, net: '连接中', costAsker: -1, players: 1, control: null, lastView: null, unitKeys: new Map(), pointer: null, hudNow: null, hand: null,
    requests: { answer: null, pauseSince: -1, now: 0 } });
  P.mark = () => markField(P.game, P.pointer, (q) => P.battle.marks(q));
  P.skills = createSkillBar($('skills'), (id) => P.battle.command({ type: 'skill', unit: id }), (id) => P.battle.command({ type: 'retreat', unit: id }));
  /** @type {Record<string, () => void>} */
  const acts = {
    'speed-on': () => P.battle.speed(true), 'speed-off': () => P.battle.speed(false), pause: () => P.battle.pause(), resume: () => P.battle.resume(),
    'pause-yes': () => P.battle.pauseReply(true), 'pause-no': () => P.battle.pauseReply(false), ask: () => P.battle.command({ type: 'ask' }),
    'cost-yes': () => P.battle.command({ type: 'answer', accept: 1 }), 'cost-no': () => P.battle.command({ type: 'answer', accept: 0 }),
  };
  const controls = createControls($('controls'), (a) => acts[a]?.());
  P.bar = () => controls({ control: P.control, costAsker: P.costAsker, seat, mate: P.players === 2 ? 1 - seat : -1 });
  P.battle = startBattle({
    workerUrl: new URL('/m/@aue/worker/src/worker.js', location.href),
    wsUrl: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/battle?seat=${seat}`,
    seat, key,
    onFrame: (view, events, keys, status) => onFrame(P, { view, events, keys, status }),
    onNet: (s) => {
      P.net = s.state === 'open' || s.state === 'match' ? '已连接' : s.state === 'closed' ? '重连中' : `消息有误：${s.reason}`;
      if (s.state === 'match' && s.match && !P.game) setUp(s.match, art, () => P.mark()).then((g) => { P.game = g; start(P, g); }, (e) => notice(`出错了：${e instanceof Error ? e.message : String(e)}`));
    },
    onControl: (c) => { P.control = c; P.bar(); },
  });
  // for end-to-end tests and the console
  const b = P.battle;
  Object.assign(globalThis, { __battle: { seat, debug: b.debug, command: b.command, speed: b.speed, ready: () => P.game !== null, ui: () => (P.game?.ui ? 'original' : 'bars') } });
}

/**
 * A frame: the field, the HUD line, and the original UI (or the page's bars).
 * @param {Page} P @param {{ view: import('@aue/schema').View, events: Record<string, string | number>[], keys: Record<string, string>, status: import('@aue/worker').Status }} f
 */
function onFrame(P, f) {
  const { view, events, status } = f, game = P.game;
  for (const [id, k] of Object.entries(f.keys)) P.unitKeys.set(Number(id), k);
  P.players = view.players.length;
  P.costAsker = costAskerAfter(P.costAsker, events);
  // every key seen so far: units that appeared before the renderer was ready get their figures too
  game?.renderer?.update(view, Object.fromEntries([...P.unitKeys].map(([id, k]) => [id, k.split('#')[0]])), events);
  drawHud(view, P.net, matchText(status, /** @type {any} */ (game?.content.level)?.stages ?? [], view.frame));
  if (game?.ui) {
    P.requests = requestsAfter(P.requests, { events, control: P.control, seat, frame: view.frame, now: performance.now() });
    const level = /** @type {any} */ (game.content.level);
    P.hudNow = hudState({ view, status, control: P.control, seat, options: level.options, selected: P.hand?.selected() ?? null, stages: level.stages, requests: P.requests,
      offline: P.net === '重连中' });
    const r = /** @type {NonNullable<typeof game.renderer>} */ (game.renderer), k = game.ui.ui.canvas.k;
    P.hudNow.units = unitBars(view, { leaders: game.leaders, keyOf: (id) => P.unitKeys.get(id)?.split('#')[0], shows: (id) => r.shows(id),
      at: (u) => r.screenOf(u.x, u.y, u.z).map((v) => v / k), operators: game.content.operators, unitKey: (id) => P.unitKeys.get(id) });
    game.ui.hud.update(P.hudNow);
    P.hand?.frame(view);
  } else {
    P.mark();
    if (game) P.skills.update(skillRows(view, P.unitKeys, seat, game.content.operators));
  }
  P.bar();
  P.lastView = view;
}

/** The match's side is ready: its input, its resize, its render loop. @param {Page} P @param {Awaited<ReturnType<typeof setUp>>} g */
function start(P, g) {
  if (!g.renderer) return;
  const renderer = g.renderer, field = /** @type {HTMLCanvasElement} */ ($('field'));
  if (g.ui) P.hand = startOriginal(P, g, renderer, field);
  else startBars(P, g, renderer, field);
  // for end-to-end tests and measuring: where a point of the field is on the page; what the renderer and the UI hold
  Object.assign(/** @type {any} */ (globalThis).__battle, { pageOf: (/** @type {number} */ col, /** @type {number} */ row, /** @type {number} */ h) => {
    const p = renderer.screenOf(col, row, h), r = field.getBoundingClientRect();
    return [r.left + p[0], r.top + p[1]];
  }, stats: () => ({ ...renderer.stats(), uiNodes: g.ui ? g.ui.ui.screens.reduce((n, s) => n + s.all.length, 0) : 0 }) });
  const fit = () => { renderer.resize(); g.ui?.ui.resize(field.clientWidth, field.clientHeight); };
  addEventListener('resize', fit);
  fit();
  let at = performance.now();
  /** milliseconds a frame spends drawing the field and laying the UI out (averaged), for measuring */
  const cost = { field: 0, ui: 0 };
  const loop = (/** @type {number} */ now) => {
    const t0 = performance.now();
    renderer.render();
    const t1 = performance.now();
    g.ui?.ui.tick(Math.min(0.1, (now - at) / 1000));
    const t2 = performance.now();
    cost.field += (t1 - t0 - cost.field) * 0.05; cost.ui += (t2 - t1 - cost.ui) * 0.05;
    at = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  /** @type {any} */ (globalThis).__battle.cost = () => ({ field: +cost.field.toFixed(2), ui: +cost.ui.toFixed(2) });
}

/**
 * The original UI's taps: speed, pause or resume (同步-7, 同步-8), and the hand on the field (gestures.js).
 * @param {Page} P @param {Awaited<ReturnType<typeof setUp>>} g @param {any} renderer @param {HTMLCanvasElement} canvas
 */
function startOriginal(P, g, renderer, canvas) {
  const o = /** @type {NonNullable<typeof g.ui>} */ (g.ui), b = P.battle;
  o.hud.on('speed', () => b.speed(P.control?.fast[seat] !== 1));
  o.hud.on('pause', () => (P.control?.held ? b.resume() : b.pause()));
  o.hud.on('ask', () => b.command({ type: 'ask' }));
  o.hud.on('answer', (/** @type {string | undefined} */ v) => b.command({ type: 'answer', accept: v === 'yes' ? 1 : 0 }));
  o.hud.on('confirm', (/** @type {string | undefined} */ v) => b.pauseReply(v === 'yes'));
  const usable = (/** @type {string} */ id) => !!P.hudNow && cardViews(o.deck, P.hudNow).some((v) => v.id === id && v.usable);
  return new Hand({ canvas, renderer, hud: o.hud, battle: b, level: g.content.level, seat, content: g.content, icons: o.icons, iconBase: o.iconBase,
    view: () => P.lastView, usable, unitKey: (id) => P.unitKeys.get(id) });
}

/**
 * The page's own bars: a tile click deploys the deck's selection; the pointer's tile shows its marks.
 * @param {Page} P @param {Awaited<ReturnType<typeof setUp>>} g @param {any} renderer @param {HTMLCanvasElement} field
 */
function startBars(P, g, renderer, field) {
  field.addEventListener('click', (e) => {
    const tile = renderer.pick(e.clientX, e.clientY), sel = g.deck?.selected();
    if (tile && sel) { P.battle.command({ type: 'deploy', op: sel.op, row: tile.row, col: tile.col, dir: sel.dir }); g.deck?.clear(); }
  });
  field.addEventListener('pointermove', (e) => { P.pointer = renderer.pick(e.clientX, e.clientY); P.mark(); });
  field.addEventListener('pointerleave', () => { P.pointer = null; P.mark(); });
}

main().catch((e) => notice(`出错了：${e instanceof Error ? e.message : String(e)}`));
