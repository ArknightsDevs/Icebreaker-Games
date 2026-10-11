// The M0.5 skeleton page: the battle worker, the three.js field, the HUD and the deploy bar. The seat comes from
// ?seat=0|1; the session key stays in sessionStorage so a reload rejoins the same seat. Assets come from the host's
// /assets/skeleton/ (a local directory, AUE_ASSETS_DIR); without them the page says so and draws nothing.
import { startBattle } from '@aue/worker';
import { createBattleRenderer, loadTextures } from '@aue/render';
import { skeletonContent } from '@aue/content';
import { createDeck } from './deck.js';

/** The act1multi_01 camera view vector (ArknightsGameResource map.json); the data pipeline will provide it (M5). */
const VIEW = [0, -6.1, -9.76];
const ASSETS = new URL('/assets/skeleton/', location.href);

const seat = Math.max(0, Math.min(1, Number(new URLSearchParams(location.search).get('seat') ?? 0) || 0));
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

/** @param {import('@aue/schema').View} view @param {string} net */
function drawHud(view, net) {
  $('hud').innerHTML = '';
  view.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = i === seat ? 'player me' : 'player';
    d.textContent = `${i === seat ? '我方' : '队友'} · 生命 ${p.life} · 费用 ${p.cost}`;
    $('hud').append(d);
  });
  const n = document.createElement('div');
  n.className = 'net';
  n.textContent = `第 ${view.frame} 帧 · ${net}`;
  $('hud').append(n);
}

/**
 * The field: the renderer when the host has the assets, otherwise nothing drawn (and a notice) — the battle runs either
 * way, so the HUD and the end-to-end tests work without assets.
 * @returns {Promise<{ renderer: ReturnType<typeof createBattleRenderer> | null, avatars: Record<string, string> }>}
 */
async function field() {
  const res = await fetch(new URL('manifest.json', ASSETS)).catch(() => null);
  if (!res?.ok) { notice('没有找到本地素材（主机需要设置 AUE_ASSETS_DIR）。没有贴图的东西不显示，所以战场不绘制，对局照常进行。'); return { renderer: null, avatars: {} }; }
  const manifest = await res.json(), textures = await loadTextures(manifest, ASSETS.href);
  const canvas = /** @type {HTMLCanvasElement} */ ($('field'));
  const renderer = createBattleRenderer({ canvas, level: skeletonContent.level, textures, view: VIEW });
  /** @type {Record<string, string>} */
  const avatars = {};
  for (const id of Object.keys(skeletonContent.operators)) avatars[id] = new URL(manifest.files[`avatar:${id}`].file, ASSETS).href;
  return { renderer, avatars };
}

async function main() {
  const { renderer, avatars } = await field();
  const ops = Object.entries(skeletonContent.operators).filter(([id]) => avatars[id]).map(([id, o]) => ({ id, name: o.name, avatar: avatars[id] }));
  const deck = createDeck($('deck'), ops);
  let net = '连接中';
  const battle = startBattle({
    workerUrl: new URL('/m/@aue/worker/src/worker.js', location.href),
    wsUrl: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/battle?seat=${seat}`,
    seat, key,
    onFrame: (view, _events, keys) => { renderer?.update(view, keys); drawHud(view, net); },
    onNet: (s) => { net = s.state === 'open' ? '已连接' : s.state === 'closed' ? '重连中' : `消息有误：${s.reason}`; },
  });
  if (renderer) {
    $('field').addEventListener('click', (e) => {
      const tile = renderer.pick(e.clientX, e.clientY), sel = deck.selected();
      if (tile && sel) battle.command({ type: 'deploy', op: sel.op, row: tile.row, col: tile.col, dir: sel.dir });
    });
    addEventListener('resize', () => renderer.resize());
    const loop = () => { renderer.render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  // for end-to-end tests and the console
  Object.assign(globalThis, { __battle: { seat, debug: battle.debug, command: battle.command } });
}

main().catch((e) => notice(`出错了：${e instanceof Error ? e.message : String(e)}`));
