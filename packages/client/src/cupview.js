// 阵地足球锦标 on the room page (docs/spec/room.md 房间-15), the page's own panel as the box editor is: the stages by zone
// (晋级赛, 淘汰赛, 特训赛), each open once the stages it follows are cleared; the chosen stage's teams and description;
// the training effect — one at most, each unlocked by clearing its 特训赛 stage —; the lineup of up to 12 from the box and
// the special operators lent in every match, and one support unit besides — any operator, fully trained —, each with
// the skill and module it takes (none on the training stage, whose operators are the level's own); 开始比赛 starts the
// stage alone. The progress is this browser's (cupsave.js).
import { CUP_NAME, CUP_ZONES, CUP_STAGES, CUP_LINEUP, CUP_NPCS, cupOpen, cupNpcEntries } from '@icebreaker/mode-regular';
import { h } from './dom.js';
import { plain } from './roomtext.js';
import { trainingText, fullEntry } from './training.js';

/** @typedef {import('./save.js').Save} Save @typedef {import('./save.js').BoxEntry} BoxEntry @typedef {import('./cupsave.js').CupSave} CupSave */
/** @typedef {import('@icebreaker/mode-regular').CupStage} CupStage @typedef {import('@icebreaker/mode-regular').CupPick} CupPick */
/** A training effect of a stage's level (engine 锦标-7). @typedef {{ id: string, name: string, text: string, unlockedBy: string }} Relic */
/**
 * @typedef {object} CupViewOptions
 * @property {Record<string, { name: string, rarity: number }>} roster every operator's name and rarity
 * @property {(id: string) => Promise<import('./training.js').Training>} training an operator's training data (the special
 *   operators' skills, the support unit's full training)
 * @property {() => Save} getSave @property {() => CupSave} getCup @property {(c: CupSave) => void} setCup
 * @property {(level: string) => readonly Relic[]} relics the training effects of a level
 * @property {(level: string, lineup: CupPick[], relic: string, assist: CupPick | null) => void} start
 * @property {(text: string) => void} toast
 */
/** @typedef {{ host: HTMLElement, o: CupViewOptions, chosen: string, npcs: BoxEntry[], full: Map<string, BoxEntry>, loading: Set<string> }} Cup */

/** @param {Cup} C @param {string} id */
const nameOf = (C, id) => C.o.roster[id]?.name ?? id;

/** An operator's box entry: the special operator's, else the box's. @param {Cup} C @param {string} id */
const entryOf = (C, id) => C.npcs.find((e) => e.id === id) ?? C.o.getSave().box.find((e) => e.id === id) ?? null;

/** The stage chosen: the one last chosen, else the first open one not cleared, else the first. @param {Cup} C @returns {CupStage} */
function chosenStage(C) {
  const c = C.o.getCup();
  return CUP_STAGES.find((s) => s.stage === C.chosen) ?? CUP_STAGES.find((s) => cupOpen(s, c.cleared) && !c.cleared.includes(s.stage)) ?? CUP_STAGES[0];
}

/** A stage's button: its code and name, cleared or locked. @param {Cup} C @param {CupStage} s @param {CupSave} c @param {CupStage} at */
function stageButton(C, s, c, at) {
  const done = c.cleared.includes(s.stage), open = cupOpen(s, c.cleared);
  return h('button', { 'aria-pressed': String(s.stage === at.stage), 'data-stage': s.stage, class: done ? 'cleared' : open ? '' : 'locked', onclick: () => { C.chosen = s.stage; render(C); } },
    `${s.code} ${s.name}`, done ? ' ✓' : open ? '' : ' 🔒');
}

/** The training effects (房间-15): none or one, each open once its stage is cleared. @param {Cup} C @param {CupStage} s @param {CupSave} c */
function relicPicker(C, s, c) {
  const relics = C.o.relics(s.level), codeOf = (/** @type {string} */ id) => CUP_STAGES.find((x) => x.stage === id)?.code ?? id;
  if (relics.length === 0) return null;
  const pick = (/** @type {string} */ id) => C.o.setCup({ ...C.o.getCup(), relic: id });
  const chosen = relics.find((r) => r.id === c.relic && c.cleared.includes(r.unlockedBy)) ?? null;
  return h('div', { class: 'relics' },
    h('div', { class: 'row', role: 'group', 'aria-label': '训练效果' },
      h('button', { 'aria-pressed': String(chosen === null), onclick: () => pick('') }, '不使用'),
      relics.map((r) => h('button', { 'aria-pressed': String(chosen?.id === r.id), 'data-relic': r.id, disabled: !c.cleared.includes(r.unlockedBy), onclick: () => pick(r.id) },
        r.name, c.cleared.includes(r.unlockedBy) ? '' : `（通关 ${codeOf(r.unlockedBy)} 解锁）`))),
    h('p', { class: 'muted' }, chosen ? `${chosen.name}：${chosen.text}` : '训练效果同一时间只能生效一个。'));
}

/** A skill or module slot's select. @param {number} value @param {[number, string][]} options @param {(v: number) => void} on @param {string} label */
const slotSelect = (value, options, on, label) => h('select', { 'aria-label': label, onchange: (/** @type {Event} */ e) => on(Number(/** @type {HTMLSelectElement} */ (e.target).value)) },
  options.map(([v, text]) => h('option', { value: String(v), selected: v === value }, text)));

/** @typedef {{ set: (x: Partial<import('./cupsave.js').CupChoice>) => void, out: () => void, tag: string | null }} RowOn */

/** How a lineup operator's row changes the lineup. @param {Cup} C @param {import('./cupsave.js').CupChoice} p @returns {RowOn} */
const lineupOn = (C, p) => ({
  set: (x) => { const c = C.o.getCup(); C.o.setCup({ ...c, picks: c.picks.map((q) => (q.id === p.id ? { ...q, ...x } : q)) }); },
  out: () => { const c = C.o.getCup(); C.o.setCup({ ...c, picks: c.picks.filter((q) => q.id !== p.id) }); },
  tag: CUP_NPCS.includes(p.id) ? ' 特派' : null,
});

/**
 * An operator's row: its training, skill, module and the way out — a lineup operator's or the support unit's.
 * @param {Cup} C @param {import('./cupsave.js').CupChoice} p @param {BoxEntry} e @param {RowOn} on
 */
function pickRow(C, p, e, on) {
  const set = on.set;
  const skills = /** @type {[number, string][]} */ ([[-1, '不带技能'], ...e.skills.map((_, i) => /** @type {[number, string]} */ ([i, `技能${i + 1}`]))]);
  const modules = /** @type {[number, string][]} */ ([[-1, '不带模组'], ...e.modules.flatMap((st, i) => (st > 0 ? [/** @type {[number, string]} */ ([i, `模组${i + 1}（${st}级）`])] : []))]);
  return h('tr', { 'data-id': p.id },
    h('td', {}, nameOf(C, p.id), on.tag ? h('small', {}, on.tag) : null),
    h('td', {}, trainingText(e)),
    h('td', {}, slotSelect(p.skill, skills, (v) => set({ skill: v }), `${nameOf(C, p.id)} 的技能`)),
    h('td', {}, modules.length > 1 ? slotSelect(p.module, modules, (v) => set({ module: v }), `${nameOf(C, p.id)} 的模组`) : '—'),
    h('td', {}, h('button', { onclick: on.out }, '移出')));
}

/** An operator into the lineup with its last skill, if there is room (not the support unit). @param {Cup} C @param {string} id */
function add(C, id) {
  const c = C.o.getCup(), e = entryOf(C, id);
  if (!e || c.picks.some((p) => p.id === id) || c.assist?.id === id) return;
  if (c.picks.length >= CUP_LINEUP) { C.o.toast(`上场干员最多 ${CUP_LINEUP} 名`); return; }
  C.o.setCup({ ...c, picks: [...c.picks, { id, skill: e.skills.length - 1, module: -1 }] });
}

/** The lineup filled up to 12 from the 常规队, high-priority list first. @param {Cup} C */
function fillFromSquad(C) {
  const s = C.o.getSave();
  for (const id of [...s.squad.high, ...s.squad.low]) if (C.o.getCup().picks.length < CUP_LINEUP) add(C, id);
}

/** The lineup (房间-15): the operators chosen, the special operators and the box to add from. @param {Cup} C @param {CupSave} c */
function lineup(C, c) {
  const picks = c.picks.flatMap((p) => { const e = entryOf(C, p.id); return e ? [{ p, e }] : []; });
  const box = C.o.getSave().box.filter((e) => !c.picks.some((p) => p.id === e.id) && !CUP_NPCS.includes(e.id) && c.assist?.id !== e.id);
  const sel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'box 里的干员' }, h('option', { value: '' }, box.length ? '选择 box 里的干员' : 'box 里没有别的干员'),
    box.map((e) => h('option', { value: e.id }, `${nameOf(C, e.id)} ${trainingText(e)}`))));
  return h('div', { class: 'lineup' },
    h('h3', {}, `上场干员 ${picks.length}/${CUP_LINEUP}`),
    picks.length ? h('table', { class: 'box' }, h('tbody', {}, picks.map(({ p, e }) => pickRow(C, p, e, lineupOn(C, p))))) : h('p', { class: 'muted' }, '还没有上场干员。'),
    h('div', { class: 'row', role: 'group', 'aria-label': '特派干员' }, h('span', { class: 'muted' }, '特派干员：'),
      C.npcs.map((e) => h('button', { disabled: c.picks.some((p) => p.id === e.id) || c.assist?.id === e.id, 'data-npc': e.id, onclick: () => add(C, e.id) }, nameOf(C, e.id)))),
    h('div', { class: 'row' }, sel, h('button', { onclick: () => { if (sel.value) add(C, sel.value); } }, '加入'),
      h('button', { onclick: () => fillFromSquad(C) }, '按常规队填满'), h('button', { onclick: () => C.o.setCup({ ...C.o.getCup(), picks: [] }) }, '清空')));
}

/** An operator's full training (as one new to the box), loaded once; the panel is drawn again when it is in. @param {Cup} C @param {string} id */
function loadFull(C, id) {
  if (C.full.has(id) || C.loading.has(id)) return Promise.resolve();
  C.loading.add(id);
  return C.o.training(id).then((t) => { C.full.set(id, fullEntry(id, t)); render(C); }, (e) => C.o.toast(`读不到 ${nameOf(C, id)} 的数据：${e.message}`))
    .finally(() => C.loading.delete(id));
}

/** An operator chosen as the support unit with its last skill, once its full training is in. @param {Cup} C @param {string} id */
function chooseAssist(C, id) {
  if (!id) return;
  const take = () => { const e = C.full.get(id); if (e) C.o.setCup({ ...C.o.getCup(), assist: { id, skill: e.skills.length - 1, module: -1 } }); };
  if (C.full.has(id)) take();
  else void loadFull(C, id).then(take);
}

/** By rarity, highest first, then by name. @param {Cup} C */
const byRarity = (C) => (/** @type {string} */ a, /** @type {string} */ b) => (C.o.roster[b]?.rarity ?? 0) - (C.o.roster[a]?.rarity ?? 0) || nameOf(C, a).localeCompare(nameOf(C, b), 'zh');

/** How the support unit's row changes it. @param {Cup} C @returns {RowOn} */
const assistOn = (C) => ({
  set: (x) => { const k = C.o.getCup(); if (k.assist) C.o.setCup({ ...k, assist: { ...k.assist, ...x } }); },
  out: () => C.o.setCup({ ...C.o.getCup(), assist: null }),
  tag: ' 助战',
});

/**
 * The support unit (房间-15: 「至多1名助战单位」): any operator not in the lineup, fully trained, with the skill and module it
 * takes; none until one is chosen. @param {Cup} C @param {CupSave} c
 */
function assistPart(C, c) {
  const a = c.assist, e = a ? C.full.get(a.id) ?? null : null;
  if (a && !e) void loadFull(C, a.id);
  const ids = Object.keys(C.o.roster).filter((id) => !c.picks.some((p) => p.id === id) && id !== a?.id).sort(byRarity(C));
  const sel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '助战干员' }, h('option', { value: '' }, a ? '换一名助战干员' : '选择助战干员'),
    ids.map((id) => h('option', { value: id }, `${'★'.repeat(C.o.roster[id]?.rarity ?? 0)} ${nameOf(C, id)}`))));
  return h('div', { class: 'assist' },
    h('h3', {}, `助战 ${a ? 1 : 0}/1`),
    a && e ? h('table', { class: 'box' }, h('tbody', {}, pickRow(C, a, e, assistOn(C)))) : h('p', { class: 'muted' }, a ? '正在读取助战干员的数据……' : '可以另选 1 名任意干员助战，按满练度上场。'),
    h('div', { class: 'row' }, sel, h('button', { onclick: () => chooseAssist(C, sel.value) }, '选为助战')));
}

/** The chosen stage: teams, description, whether it is open, its training effects, its lineup, the start. @param {Cup} C @param {CupStage} s @param {CupSave} c */
function stageDetail(C, s, c) {
  const open = cupOpen(s, c.cleared), codes = s.after.map((x) => CUP_STAGES.find((y) => y.stage === x)?.code ?? x);
  const relic = C.o.relics(s.level).find((r) => r.id === c.relic && c.cleared.includes(r.unlockedBy))?.id ?? '';
  const go = () => {
    const picks = s.predefined ? [] : C.o.getCup().picks.flatMap((p) => { const e = entryOf(C, p.id); return e ? [{ e, skill: p.skill, module: p.module }] : []; });
    if (!s.predefined && picks.length === 0) { C.o.toast('先选上场干员'); return; }
    const a = C.o.getCup().assist, e = a && !s.predefined ? C.full.get(a.id) : null;
    C.o.start(s.level, picks, relic, a && e ? { e, skill: a.skill, module: a.module } : null);
  };
  return h('div', { class: 'cup-stage' },
    h('h3', {}, `${s.code} ${s.name}`, c.cleared.includes(s.stage) ? h('small', { class: 'ok' }, ' 已通关') : null),
    h('p', {}, `${s.ours.name} 对阵 ${s.theirs.name}`),
    h('p', { class: 'muted' }, plain(s.detail)),
    open ? null : h('p', { class: 'bad' }, `完成 ${codes.join('、')} 后开放`),
    relicPicker(C, s, c),
    ...(s.predefined ? [h('p', { class: 'muted' }, '这一关的干员都由关卡安排，不带自己的干员。')] : [lineup(C, c), assistPart(C, c)]),
    h('div', { class: 'row' }, h('button', { class: 'primary', disabled: !open, onclick: go }, '开始比赛')));
}

/** @param {Cup} C */
function render(C) {
  const c = C.o.getCup(), at = chosenStage(C);
  C.host.replaceChildren(
    h('h2', {}, CUP_NAME),
    h('p', { class: 'muted' }, `单人参赛：最多 ${CUP_LINEUP} 名干员和 1 名助战，卫戍协议的 ${C.npcs.length} 名特派干员每场都能上场；通关特训赛解锁训练效果。进度只保存在这个浏览器里。`),
    ...CUP_ZONES.map((z) => h('div', { class: 'zone' }, h('h3', {}, z.name),
      h('div', { class: 'row stages' }, CUP_STAGES.filter((s) => s.zone === z.id).map((s) => stageButton(C, s, c, at))))),
    stageDetail(C, at, c));
}

/**
 * The 阵地足球锦标 panel on a host element; the special operators' entries load first (their skills).
 * @param {HTMLElement} host @param {CupViewOptions} o
 */
export function createCupView(host, o) {
  /** @type {Cup} */
  const C = { host, o, chosen: '', npcs: [], full: new Map(), loading: new Set() };
  const counts = new Map();
  const ready = Promise.all(CUP_NPCS.map(async (id) => counts.set(id, (await o.training(id)).skills.length)))
    .then(() => { C.npcs = cupNpcEntries((id) => counts.get(id) ?? 0); render(C); })
    .catch((e) => o.toast(`读不到特派干员的数据：${e.message}`));
  return { render: () => render(C), ready, state: () => ({ chosen: chosenStage(C).stage }) };
}
