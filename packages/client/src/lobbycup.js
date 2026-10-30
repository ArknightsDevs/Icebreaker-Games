// 阵地足球锦标's own pages on the lobby screens (docs/spec/page.md 页面-11, room.md 房间-15), drawn from the cup UI pack
// merged into the lobby pack (cuppack.js): the event's entry page — its key visual, its three zones (晋级赛, 淘汰赛,
// 特训赛) open, or locked with the text of what opens them, NEW! on a zone with a stage open and not cleared, the
// 锦标奖杯's level —, a zone's map with the chosen stage's detail (lobbycupmap.js) and the squad page
// (lobbycupsquad.js). Each page's top menu goes back a page; home leaves the event for the lobby's entry page.
import { openPart, closePart, placeTopMenu } from './lobbykit.js';
import { CUP_SCREENS, zonesOf, zoneStages, stageState, trophyOf } from './cupmap.js';
import { cupKv } from '@icebreaker/mode-regular';
import { createCupMap } from './lobbycupmap.js';
import { createCupSquad } from './lobbycupsquad.js';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('@icebreaker/mode-regular').CupStage} CupStage */
/** @typedef {import('@icebreaker/mode-regular').CupPick} CupPick @typedef {import('@icebreaker/mode-regular').BoxEntry} BoxEntry */
/** A training effect of a stage's level (engine 锦标-7). @typedef {{ id: string, name: string, text: string, unlockedBy: string }} Relic */
/**
 * What the cup's pages work with: the progress and its keeping, a stage's match, the training effects, a toast,
 * leaving the event; for the squad page the roster, the box, training data, the cards' pictures, the lobby pack's art
 * and putting operators new to the box into it at their full training.
 * @typedef {object} CupCtx
 * @property {() => import('./cupsave.js').CupSave} get
 * @property {(c: import('./cupsave.js').CupSave) => void} set
 * @property {(level: string, lineup: CupPick[], relic: string, assist: CupPick | null) => void} start
 * @property {(level: string) => readonly Relic[]} relics
 * @property {(text: string) => void} toast
 * @property {() => void} leave
 * @property {import('./lobbyselect.js').SelectOptions['roster']} roster
 * @property {(id: string) => BoxEntry | null} entry the box's entry
 * @property {(id: string) => Promise<import('@aue/content').Training>} training
 * @property {import('./lobbycards.js').CardArt} cards
 * @property {any} art the lobby pack's art
 * @property {any} cupArt the cup pack's art (team icons, key visuals, the training effects' icons)
 * @property {(ids: string[]) => Promise<void>} toBox
 * @property {() => string} player the player's name (the result's strip)
 * @property {(bank: string) => void} sound plays a sound bank of the audio index (the pages' sounds)
 */

const ENTRY = '@panel_entry';
/** A zone's panel on the entry page. @param {number} i */
const ZONE = (i) => `${ENTRY}/panel_right/panel_zone_${i + 1}`;
const TROPHY = `${ENTRY}/btn_milestone`;
/** What the entry page says while the trophy's rewards are not here. */
const TROPHY_TEXT = (/** @type {number} */ level, /** @type {number} */ points) => `锦标奖杯 ${level} 级，累计锦标积分券 ${points}`;

/**
 * The entry page's zones: each open (its picture), or locked (its picture and the text of what opens it), NEW! while
 * it has a stage open and not cleared; a tap on an open one opens its map. @param {Part} p @param {CupCtx} X @param {(zone: number) => void} open
 */
function drawZones(p, X, open) {
  const cleared = X.get().cleared;
  for (const z of zonesOf(cleared)) {
    const at = ZONE(z.i);
    p.show(`${at}/panel_normal`, z.open);
    p.show(`${at}/panel_closed`, false);
    p.show(`${at}/panel_locked`, !z.open);
    p.text(`${at}/panel_locked/text_tip`, z.unlock);
    p.show(`${at}/text_tip`, false);
    p.show(`${at}/img_new`, zoneStages(z.id).some((s) => stageState(s, cleared) === 'open'));
    p.tap(`${at}/hot_spot`, () => (z.open ? open(z.i) : X.toast(z.unlock)));
  }
}

/** The 锦标奖杯 button: its level (or the last level's mark) and how far the next one is. @param {Part} p @param {CupCtx} X */
function drawTrophy(p, X) {
  const points = X.get().points, t = trophyOf(points);
  p.show(`${TROPHY}/panel_normal`, !t.max);
  p.show(`${TROPHY}/panel_max`, t.max);
  p.text(`${TROPHY}/panel_normal/text_lv`, 'LV.');
  p.text(`${TROPHY}/panel_normal/text_level`, String(t.level));
  p.text(`${TROPHY}/panel_max/text_lv`, 'LV.');
  p.text(`${TROPHY}/panel_max/text_max`, 'MAX');
  const fill = p.node(`${TROPHY}/img_fill`);
  if (fill) p.scr.fill('', t.fill, fill);
  p.show(`${TROPHY}/panel_new`, false);
  p.show(`${TROPHY}/panel_trackpoint`, false);
  p.tap(`${TROPHY}/hot_spot`, () => X.toast(TROPHY_TEXT(t.level, points)));
}

/**
 * The event's pages over the lobby (页面-11): the entry page, and over it a zone's map or the squad page.
 * @param {any} ui @param {CupCtx} X
 */
export function createCup(ui, X) {
  const p = openPart(ui, CUP_SCREENS.entry, 5);
  /** @type {{ map: ReturnType<typeof createCupMap> | null, squad: ReturnType<typeof createCupSquad> | null }} */
  const V = { map: null, squad: null };
  placeTopMenu(p, `${ENTRY}/panel_top_menu`, { back: X.leave, home: X.leave });
  // the event has no period here: its time and medal panel stays hidden
  p.show(`${ENTRY}/panel_time`, false);
  const kv = X.cupArt?.kv?.[`${cupKv(X.get().cleared)}_0`];
  if (kv) p.sprite(`${ENTRY}/panel_bg/group_scale/img_big`, kv);
  const closeSquad = () => { V.squad?.close(); V.squad = null; V.map?.update(); };
  const closeMap = () => { closeSquad(); V.map?.close(); V.map = null; draw(); };
  /** @param {CupStage} s */
  const openSquad = (s) => { if (!V.squad) V.squad = createCupSquad(ui, X, s, { back: closeSquad, home: X.leave }); };
  /** @param {number} zone */
  const openMap = (zone) => { if (!V.map) V.map = createCupMap(ui, X, zone, { back: closeMap, home: X.leave, squad: openSquad }); };
  function draw() { drawZones(p, X, openMap); drawTrophy(p, X); }
  draw();
  void p.play(ENTRY, 'act1football_entry_anim');
  return {
    part: p,
    update: () => { if (!V.map && !V.squad) draw(); },
    /** The page's back: the select page or the squad page first, then the map; false when on the entry page. */
    back: () => {
      if (V.squad) { if (!V.squad.back()) closeSquad(); return true; }
      if (V.map) { if (!V.map.back()) closeMap(); return true; }
      return false;
    },
    /** Opens a zone's map at once (after a match, the zone of its stage). @param {number} zone */
    openZone: (zone) => openMap(zone),
    close: () => { V.squad?.close(); V.map?.close(); closePart(p); },
    /** What the pages show, for tests. */
    state: () => ({ page: V.squad ? 'squad' : V.map ? 'map' : 'entry', map: V.map?.state() ?? null, squad: V.squad?.state() ?? null }),
  };
}
