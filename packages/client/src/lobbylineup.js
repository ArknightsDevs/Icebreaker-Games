// 组建上场阵容 and 准备就绪 on the squad check panel (docs/spec/page.md 页面-6, room.md 房间-5, 房间-6): first the
// operators drawn for this player (随机分配了以下干员), then three views — choosing the lineup from the options (6–10),
// each one's skill and module, and both lineups with 准备就绪 / 取消准备. The lineup goes to the room when the player
// leaves the skill view; 上一步 goes back a view.
import { place, fillList, setSwitch } from './lobbykit.js';
import { holderCard, fillCard } from './lobbycards.js';
import { LINEUP_VIEWS, lineupOptions } from './lobbymap.js';
import { lineupCount } from './roomtext.js';
import { cardOf } from './lobbypick.js';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('./lobbystage.js').StepCtx} StepCtx @typedef {import('./roomtext.js').Pick} Pick */

/** @param {Part} p @param {StepCtx} X */
export function createLineup(p, X) {
  const f = p.view();
  /** @type {{ sub: string, part: Part | null, key: string }} */
  let cur = { sub: '', part: null, key: '' };
  let alloc = false;
  void p.anim(f.entryAnim);
  return {
    /** @param {any} S @param {any} L */
    update(S, L) {
      const v = S.view, o = v.options?.[v.you];
      if (!o) return;
      if (!alloc) { alloc = true; void allocated(p, f, S, o, X); }
      if (cur.sub !== L.sub) {
        cur = { sub: L.sub, part: place(p, f.procViewContainer, /** @type {Record<string, string>} */ (LINEUP_VIEWS)[L.sub]), key: '' };
        const view = cur.part?.view();
        if (cur.part && view) { cur.part.showAll([view.invertTips], false); void cur.part.anim(view.entryAnim); }
      }
      if (!cur.part) return;
      const key = JSON.stringify([S.draft, v.lineups, v.ready, X.version()]);
      if (key === cur.key) return;
      cur.key = key;
      if (L.sub === 'sel') select(cur.part, S, o, X);
      else if (L.sub === 'skill') skills(cur.part, S, X);
      else check(cur.part, S, X);
    },
  };
}

/** The operators drawn for this player, shown a moment as the step begins. @param {Part} p @param {Record<string, any>} f @param {any} S @param {any} o @param {StepCtx} X */
async function allocated(p, f, S, o, X) {
  const ids = [...o.drawn, ...o.extra], af = p.view(f.sysAllocView), recruits = new Set(S.lobby?.recruits?.map((/** @type {any} */ e) => e.id) ?? []);
  if (!ids.length || !f.sysAllocView) { p.show(f.sysAllocView, false); return; }
  p.show(f.sysAllocView, true);
  const opts = lineupOptions({ kept: [], drawn: o.drawn, extra: o.extra }, recruits);
  fillList(p, af.cardListContent, opts.length, (item, i) => holderCard(item, place, cardOf(X, S, S.view.you, opts[i].id, opts[i].tag), X.cards));
  await p.anim(af.entryAnim);
  await new Promise((done) => { setTimeout(done, 1800); });
  p.show(f.sysAllocView, false);
}

/** Whether a skill view shows the modules (its 技能 / 模组 tab). @type {WeakMap<Part, boolean>} */
const tabs = new WeakMap();

/** The lineup being set, never null. @param {any} S @returns {Pick[]} */
const draftOf = (S) => S.draft ?? [];

/**
 * Choosing the lineup: the chosen ones as small cards (a tap takes one out), every option below (a tap puts it in or
 * takes it out), the count's hint, 下一步 while the count is right.
 * @param {Part} v @param {any} S @param {any} o @param {StepCtx} X
 */
function select(v, S, o, X) {
  const f = v.view(), draft = draftOf(S), recruits = new Set(S.lobby?.recruits?.map((/** @type {any} */ e) => e.id) ?? []);
  const opts = lineupOptions(o, recruits), tagOf = new Map(opts.map((x) => [x.id, x.tag])), why = lineupCount(draft);
  /** @param {string} id */
  const toggle = (id) => {
    const at = draft.findIndex((x) => x.id === id), e = X.entryOf(S.view.you, id);
    X.setDraft(at >= 0 ? draft.filter((x) => x.id !== id) : draft.length >= 10 ? draft
      : [...draft, { id, skill: e ? e.skills.length - 1 : -1, module: e ? e.modules.findIndex((m) => m > 0) : -1 }]);
  };
  fillList(v, f.squad, draft.length, (item, i) => {
    const id = draft[i].id;
    holderCard(item, place, cardOf(X, S, S.view.you, id, tagOf.get(id) ?? 'extra'), X.cards);
    item.tap('@panel_card/click_hotspot', () => toggle(id));
  });
  fillList(v, f.reserveList, opts.length, (item, i) => {
    const { id, tag } = opts[i], card = holderCard(item, place, cardOf(X, S, S.view.you, id, tag), X.cards);
    if (card) card.root.alpha = draft.some((x) => x.id === id) ? 0.4 : 1;
    item.tap('@container', () => toggle(id));
  });
  v.text(f.minCntTips, why ? '编队至少6人' : `已选择 ${draft.length} 名`);
  setSwitch(v, f.btnNext, !why);
  v.tap('@btn_next/normal/hot_spot', () => { if (!lineupCount(draftOf(S))) X.sub('skill'); });
}

/**
 * Each chosen operator's skill and module: its large card, its skills (a tap chooses one) and its unlocked modules (a
 * tap chooses or drops one); 下一步 sends the lineup to the room.
 * @param {Part} v @param {any} S @param {StepCtx} X
 */
function skills(v, S, X) {
  const f = v.view(), draft = draftOf(S), modules = tabs.get(v) ?? false;
  v.tap('@tab_show_switch/hotspot', () => { tabs.set(v, !modules); void v.anim(f.tabSwitchAnim); skills(v, S, X); });
  /** @param {number} i @param {Partial<Pick>} change */
  const set = (i, change) => X.setDraft(draft.map((x, k) => (k === i ? { ...x, ...change } : x)));
  fillList(v, f.charCardContent, draft.length, (item, i) => {
    const d = draft[i], e = X.entryOf(S.view.you, d.id), vf = item.view(), r = X.rosterOf(d.id);
    const card = vf.container && vf.cardPrefab ? place(item, vf.container, vf.cardPrefab) : null;
    // the skill view's card prefab is the large card itself, not a holder
    if (card) fillCard(card, { id: d.id, entry: e, name: X.nameOf(d.id), rarity: r?.rarity ?? 1, profession: r?.profession ?? '', skill: d.skill, module: d.module, skillId: X.skillId(d.id, d.skill) }, X.cards);
    fillList(item, vf.contentSkill, e?.skills.length ?? 0, (s, k) => {
      const sf = s.view(), lv = e?.skills[k] ?? 0;
      s.show(sf.emptyPartGo, false); s.show(sf.lockPartGo, false); s.show(sf.normalPartGo, true);
      s.show(sf.selectBgGo, d.skill === k);
      s.picture(sf.imgSkill, X.cards.skill(X.skillId(d.id, k) ?? ''));
      s.text(sf.textSkillLv, lv > 7 ? '' : String(lv));
      s.show(sf.imgSpecializeLv, lv > 7);
      if (lv > 7 && sf.skillLevelImages) s.sprite(sf.imgSpecializeLv, sf.skillLevelImages[lv - 7] ?? null);
      s.tap('@normal_part/click_area', () => set(i, { skill: k }));
    });
    const mods = (e?.modules ?? []).map((st, k) => ({ st, k })).filter((m) => m.st > 0);
    item.show(vf.objSkillPanel, !modules);
    item.show(vf.objModulePanel, modules && mods.length > 0);
    fillList(item, vf.contentModule, mods.length, (m, j) => {
      const mf = m.view(), { st, k } = mods[j];
      m.show(mf.emptyPartGo, false); m.show(mf.lockPartGo, false); m.show(mf.normalPartGo, true);
      m.show(mf.selectBgGo, d.module === k);
      m.text(mf.textEquipName, `模组${k + 1}`);
      m.text(mf.textLv, String(st));
      m.tap('@normal_part/click_area', () => set(i, { module: d.module === k ? -1 : k }));
    });
  });
  v.tap('@btn_next/hot_spot', () => { X.send({ t: 'lineup', lineup: draftOf(S) }); X.sub('check'); });
}

/**
 * Both lineups: this player's and the mate's as large cards (the mate's once it has set one; meanwhile its waiting
 * hint), 准备就绪 / 取消准备.
 * @param {Part} v @param {any} S @param {StepCtx} X
 */
function check(v, S, X) {
  const f = v.view(), me = S.view.you, mate = 1 - me, mine = S.view.lineups[me] ?? draftOf(S).map((x) => x.id), theirs = S.view.lineups[mate];
  fillList(v, f.mySquad, mine.length, (item, i) => { setSwitch(item, '@', true); holderCard(item, place, cardOf(X, S, me, mine[i], 'extra'), X.cards); });
  fillList(v, f.partnerSquad, theirs?.length ?? 0, (item, i) => { setSwitch(item, '@', true); holderCard(item, place, cardOf(X, S, mate, theirs[i], 'extra'), X.cards); });
  v.show(f.waitingTips, !theirs);
  const ready = !!S.view.ready[me];
  setSwitch(v, f.btnPrepare, !ready);
  v.tap('@btn_check/normal/hot_spot', () => X.send({ t: 'ready', on: true }));
  v.tap('@btn_check/cancel/hot_spot', () => X.send({ t: 'ready', on: false }));
}
