// The activity's squad page (docs/spec/page.md 页面-6, room.md 房间-3): the save's 常规队 — a column of its high-priority
// operators, one of its low-priority ones — with the 常规队 tab, the play style's button and the two 快捷编队 buttons,
// which open the page's own box editor (the original's operator picker is not in the pack). The style button opens
// the style select state: the five styles, the chosen one's gains, costs and carried unit, 确认修改 to keep it.
import { openPart, place, fillList } from './lobbykit.js';
import { fillCard } from './lobbycards.js';
import { PAGES } from './lobbymap.js';
import { STYLES } from '@icebreaker/mode-regular';
import { plain } from './roomtext.js';

/** @typedef {import('./lobbykit.js').Part} Part */
/**
 * @typedef {object} SquadActions
 * @property {() => import('@icebreaker/mode-regular').Squad} squad the save's 常规队
 * @property {() => string} style the save's style
 * @property {(id: string) => void} setStyle
 * @property {() => void} editBox opens the page's box editor
 * @property {(id: string) => string} nameOf
 * @property {(id: string) => { rarity: number, profession: string } | null} rosterOf
 * @property {import('./lobbycards.js').CardArt} cards
 * @property {(style: string, variant: '' | '_tiny' | '_show') => string | null} styleIcon
 */

const DEF = '@state_engine/default_state';

/** The squad page. @param {any} ui @param {SquadActions} A */
export function createSquad(ui, A) {
  const p = openPart(ui, PAGES.squad), f = p.view(DEF);
  p.show(`${DEF}/btn_guidebook`, false);
  p.tap(`${DEF}/btn_high_pri_edit/click_area`, A.editBox);
  p.tap(`${DEF}/btn_low_pri_edit/click_area`, A.editBox);
  /** @type {{ close: () => void } | null} */
  let styles = null;
  const closeStyles = () => { styles?.close(); styles = null; draw(); };
  p.tap(`${DEF}/left_part/btn_change_effect/click_area`, () => { if (!styles) styles = createStyles(p, A); });
  fillList(p, f.tabList, 1, (t) => {
    const tf = t.view();
    t.text(tf.textName, '常规队');
    t.show(tf.selectPartGO, true); t.show(tf.unselectPartGO, false); t.show(tf.lockIconGO, false); t.show(tf.trackPointGO, false); t.show(tf.charLackHintGO, false);
  });
  function draw() {
    const q = A.squad(), style = STYLES.find((s) => s.id === A.style());
    p.picture(f.imgEffectIcon, style ? A.styleIcon(style.id, '_tiny') : null);
    fillList(p, f.charList, 2, (col, i) => {
      const cf = col.view(), list = i === 0 ? q.high : q.low;
      col.show(cf.highPriIconGO, i === 0);
      col.show(cf.lowPriIconGO, i === 1);
      fillList(col, cf.charList, list.length, (holder, k) => {
        const hf = holder.view(), e = list[k], r = A.rosterOf(e.id);
        const card = hf.charCardRoot && hf.charCardPrefab ? place(holder, hf.charCardRoot, hf.charCardPrefab) : null;
        if (card) fillCard(card, { id: e.id, entry: e, name: A.nameOf(e.id), rarity: r?.rarity ?? 1, profession: r?.profession ?? '', from: i === 0 ? 'kept' : 'drawn' }, A.cards);
        holder.tap('@click_area', A.editBox);
      });
    }, f.classColPrefab);
  }
  draw();
  return {
    part: p, update: draw,
    /** The page's back: closes the style select first; false when there is nothing to close. */
    back: () => { if (!styles) return false; closeStyles(); return true; },
    close: () => { styles?.close(); ui.close(p.scr); },
  };
}

/**
 * The style select state over the squad page (房间-3): each style's card (its name, colour, icon; the save's marked
 * 已应用, the one looked at selected), the one looked at's info, 确认修改 to keep it (已应用 when it is the save's).
 * @param {Part} page @param {SquadActions} A
 */
function createStyles(page, A) {
  const s = place(page, '@state_engine/effect_select_state_root', 'squad/sqaud_effect_select_state');
  if (!s) return { close: () => undefined };
  const st0 = /** @type {Part} */ (s), f = st0.view();
  let looked = A.style();
  st0.show('@group_title/right_info', false);
  st0.text(f.textHint, '选择比赛风格');
  function draw() {
    const chosen = A.style();
    fillList(st0, f.effectItemList, STYLES.length, (item, i) => {
      const st = STYLES[i], g = item.view();
      item.show(g.emptyPartGO, false); item.show(g.normalPartGO, true);
      item.text(g.textName, st.name);
      item.picture(g.imgEffectIcon, A.styleIcon(st.id, '_show'));
      item.color(g.imgThemeIcon, hex(st.color));
      item.show(g.equipPartGO, st.id === chosen);
      item.show(g.selectPartGO, st.id === looked);
      for (const r of [g.selfLabelPartGO, g.partnerLabelPartGO, g.lackKeyLockPartGO, g.unlockablePartGO]) item.show(r, false);
      item.tap('@container/normal/hotspot', () => { looked = st.id; draw(); });
    });
    const info = f.effectInfoViewContainer && f.effectInfoViewPrefab ? place(st0, f.effectInfoViewContainer, f.effectInfoViewPrefab) : null, st = STYLES.find((x) => x.id === looked);
    if (info && st) styleInfo(info, st, A);
    st0.show(f.btnInteractGO, looked !== chosen);
    st0.show(f.btnAlreadyEquipGO, looked === chosen);
    st0.show(f.btnKeyLackGO, false);
  }
  st0.tap('@group_button/btn_root/btn_interact/anim_root/hotspot', () => { A.setStyle(looked); draw(); });
  draw();
  return { close: () => st0.scr.remove(st0.root) };
}

/** A style's info card: its name, colour, gains, costs and carried unit. @param {Part} info @param {import('@icebreaker/mode-regular').Style} st @param {SquadActions} A */
function styleInfo(info, st, A) {
  const f = info.view();
  info.color(f.imgEffectTheme, hex(st.color));
  info.text(f.textEffectName, st.name);
  info.text(f.textBuffDesc, plain(st.buff));
  info.text(f.textDebuffDesc, plain(st.debuff));
  info.text(f.textTokenName, st.device.name);
  info.text(f.textTokenDesc, plain(st.device.desc));
  info.picture('@title/img_playingstyle', A.styleIcon(st.id, '_tiny'));
}

/** A '#rrggbb' colour as 0–1 channels with full alpha. @param {string} c */
export const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).concat(1);
