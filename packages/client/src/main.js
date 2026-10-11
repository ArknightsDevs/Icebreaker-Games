// The battle page: the battle worker, the three.js field, the HUD, the controls, the skill bar and the deploy bar. The
// seat comes from ?seat=<n>; the session key stays in sessionStorage so a reload rejoins the same seat. The match
// settings come with the server's welcome (engine spec 同步-9): the field and the decks are built once its content is
// ready. Assets come from the host's /assets/skeleton/ (a local directory, AUE_ASSETS_DIR); without them the page says
// so and draws nothing — the battle runs either way.
import { startBattle } from '@aue/worker';
import { createBattleRenderer, loadTextures } from '@aue/render';
import { matchContent } from '@aue/content';
import { createDeck } from './deck.js';
import { createSkillBar, skillRows } from './skills.js';
import { createControls, costAskerAfter } from './controls.js';
import { matchText } from './stage.js';

/** The act1multi_01 camera view vector (ArknightsGameResource map.json); the data pipeline will provide it (M5). */
const VIEW = [0, -6.1, -9.76];
const ASSETS = new URL('/assets/skeleton/', location.href);

const seat = Math.max(0, Math.min(7, Number(new URLSearchParams(location.search).get('seat') ?? 0) || 0));
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
 * The page's side of a match once its content is ready: the field, the deck (own operators with an avatar only — a
 * thing without a texture is not shown) and the content for the skill bar and the HUD.
 * @param {import('@aue/schema').Match} match @param {Awaited<ReturnType<typeof assets>>} art
 */
async function setUp(match, art) {
  const content = await matchContent(match);
  const renderer = art ? createBattleRenderer({ canvas: /** @type {HTMLCanvasElement} */ ($('field')), level: content.level, textures: art.textures, view: VIEW }) : null;
  const avatar = (/** @type {string} */ id) => art?.manifest.files[`avatar:${id}`] ? new URL(art.manifest.files[`avatar:${id}`].file, ASSETS).href : null;
  const ops = (content.decks?.[seat] ?? []).map((k) => ({ id: k, name: content.operators[k].name, avatar: avatar(content.operators[k].char ?? k) }))
    .filter((o) => o.avatar !== null).map((o) => ({ ...o, avatar: /** @type {string} */ (o.avatar) }));
  return { content, renderer, deck: createDeck($('deck'), ops) };
}

async function main() {
  const art = await assets();
  /** @type {Awaited<ReturnType<typeof setUp>> | null} */
  let game = null;
  let net = '连接中', costAsker = -1, players = 1;
  /** @type {import('./controls.js').Control | null} */
  let control = null;
  /** The content key of each unit id seen so far: a frame only names the ids that are new. @type {Map<number, string>} */
  const unitKeys = new Map();
  const skills = createSkillBar($('skills'), (id) => battle.command({ type: 'skill', unit: id }));
  /** @type {Record<string, () => void>} */
  const acts = {
    'speed-on': () => battle.speed(true), 'speed-off': () => battle.speed(false), pause: () => battle.pause(), resume: () => battle.resume(),
    'pause-yes': () => battle.pauseReply(true), 'pause-no': () => battle.pauseReply(false), ask: () => battle.command({ type: 'ask' }),
    'cost-yes': () => battle.command({ type: 'answer', accept: 1 }), 'cost-no': () => battle.command({ type: 'answer', accept: 0 }),
  };
  const controls = createControls($('controls'), (a) => acts[a]?.());
  const bar = () => controls({ control, costAsker, seat, mate: players === 2 ? 1 - seat : -1 });
  const battle = startBattle({
    workerUrl: new URL('/m/@aue/worker/src/worker.js', location.href),
    wsUrl: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/battle?seat=${seat}`,
    seat, key,
    onFrame: (view, events, keys, status) => {
      for (const [id, k] of Object.entries(keys)) unitKeys.set(Number(id), k);
      players = view.players.length;
      const stages = /** @type {any} */ (game?.content.level)?.stages ?? [];
      costAsker = costAskerAfter(costAsker, events);
      game?.renderer?.update(view, Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, k.split('#')[0]])));
      drawHud(view, net, matchText(status, stages, view.frame));
      if (game) skills.update(skillRows(view, unitKeys, seat, game.content.operators));
      bar();
    },
    onNet: (s) => {
      net = s.state === 'open' || s.state === 'match' ? '已连接' : s.state === 'closed' ? '重连中' : `消息有误：${s.reason}`;
      if (s.state === 'match' && s.match && !game) setUp(s.match, art).then((g) => { game = g; start(g); }, (e) => notice(`出错了：${e instanceof Error ? e.message : String(e)}`));
    },
    onControl: (c) => { control = c; bar(); },
  });

  /** @param {Awaited<ReturnType<typeof setUp>>} g */
  function start(g) {
    if (!g.renderer) return;
    const renderer = g.renderer;
    $('field').addEventListener('click', (e) => {
      const tile = renderer.pick(e.clientX, e.clientY), sel = g.deck.selected();
      if (tile && sel) battle.command({ type: 'deploy', op: sel.op, row: tile.row, col: tile.col, dir: sel.dir });
    });
    addEventListener('resize', () => renderer.resize());
    const loop = () => { renderer.render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  // for end-to-end tests and the console
  Object.assign(globalThis, { __battle: { seat, debug: battle.debug, command: battle.command, ready: () => game !== null } });
}

main().catch((e) => notice(`出错了：${e instanceof Error ? e.message : String(e)}`));
