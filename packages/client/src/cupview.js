// 阵地足球锦标 on the room page (docs/spec/room.md 房间-15), the page's own panel as the box editor is: the stages by zone
// (晋级赛, 淘汰赛, 特训赛), each open once the stages it follows are cleared; the chosen stage's teams and description;
// the training effect — one at most, each unlocked by clearing its 特训赛 stage —; the lineup of up to 12 from the box and
// the special operators lent in every match, each with the skill and module it takes (none on the training stage,
// whose operators are the level's own); 开始比赛 starts the stage alone. The progress is this browser's (cupsave.js).
import { CUP_NAME, CUP_ZONES, CUP_STAGES, CUP_LINEUP, CUP_NPCS, cupOpen, cupNpcEntries } from '@icebreaker/mode-regular';
import { h } from './dom.js';
import { plain } from './roomtext.js';
import { trainingText } from './training.js';

/** @typedef {import('./save.js').Save} Save @typedef {import('./save.js').BoxEntry} BoxEntry @typedef {import('./cupsave.js').CupSave} CupSave */
/** @typedef {import('@icebreaker/mode-regular').CupStage} CupStage @typedef {import('@icebreaker/mode-regular').CupPick} CupPick */
/** A training effect of a stage's level (engine 锦标-7). @typedef {{ id: string, name: string, text: string, unlockedBy: string }} Relic */
/**
 * @typedef {object} CupViewOptions
 * @property {Record<string, { name: string, rarity: number }>} roster every operator's name and rarity
 * @property {(id: string) => Promise<{ skills: unknown[] }>} training an operator's training data (for the special operators' skills)
 * @property {() => Save} getSave @property {() => CupSave} getCup @property {(c: CupSave) => void} setCup
 * @property {(level: string) => readonly Relic[]} relics the training effects of a level
 * @property {(level: string, lineup: CupPick[], relic: string) => void} start
 * @property {(text: string) => void} toast
 */
/** @typedef {{ host: HTMLElement, o: CupViewOptions, chosen: string, npcs: BoxEntry[] }} Cup */

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

/** A lineup operator's row: its training, skill, module and the way out. @param {Cup} C @param {import('./cupsave.js').CupChoice} p @param {BoxEntry} e */
function pickRow(C, p, e) {
  const set = (/** @type {Partial<import('./cupsave.js').CupChoice>} */ x) => {
    const c = C.o.getCup();
    C.o.setCup({ ...c, picks: c.picks.map((q) => (q.id === p.id ? { ...q, ...x } : q)) });
  };
  const skills = /** @type {[number, string][]} */ ([[-1, '不带技能'], ...e.skills.map((_, i) => /** @type {[number, string]} */ ([i, `技能${i + 1}`]))]);
  const modules = /** @type {[number, string][]} */ ([[-1, '不带模组'], ...e.modules.flatMap((st, i) => (st > 0 ? [/** @type {[number, string]} */ ([i, `模组${i + 1}（${st}级）`])] : []))]);
  return h('tr', { 'data-id': p.id },
    h('td', {}, nameOf(C, p.id), CUP_NPCS.includes(p.id) ? h('small', {}, ' 特派') : null),
    h('td', {}, trainingText(e)),
    h('td', {}, slotSelect(p.skill, skills, (v) => set({ skill: v }), `${nameOf(C, p.id)} 的技能`)),
    h('td', {}, modules.length > 1 ? slotSelect(p.module, modules, (v) => set({ module: v }), `${nameOf(C, p.id)} 的模组`) : '—'),
    h('td', {}, h('button', { onclick: () => { const c = C.o.getCup(); C.o.setCup({ ...c, picks: c.picks.filter((q) => q.id !== p.id) }); } }, '移出')));
}

/** An operator into the lineup with its last skill, if there is room. @param {Cup} C @param {string} id */
function add(C, id) {
  const c = C.o.getCup(), e = entryOf(C, id);
  if (!e || c.picks.some((p) => p.id === id)) return;
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
  const box = C.o.getSave().box.filter((e) => !c.picks.some((p) => p.id === e.id) && !CUP_NPCS.includes(e.id));
  const sel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'box 里的干员' }, h('option', { value: '' }, box.length ? '选择 box 里的干员' : 'box 里没有别的干员'),
    box.map((e) => h('option', { value: e.id }, `${nameOf(C, e.id)} ${trainingText(e)}`))));
  return h('div', { class: 'lineup' },
    h('h3', {}, `上场干员 ${picks.length}/${CUP_LINEUP}`),
    picks.length ? h('table', { class: 'box' }, h('tbody', {}, picks.map(({ p, e }) => pickRow(C, p, e)))) : h('p', { class: 'muted' }, '还没有上场干员。'),
    h('div', { class: 'row', role: 'group', 'aria-label': '特派干员' }, h('span', { class: 'muted' }, '特派干员：'),
      C.npcs.map((e) => h('button', { disabled: c.picks.some((p) => p.id === e.id), 'data-npc': e.id, onclick: () => add(C, e.id) }, nameOf(C, e.id)))),
    h('div', { class: 'row' }, sel, h('button', { onclick: () => { if (sel.value) add(C, sel.value); } }, '加入'),
      h('button', { onclick: () => fillFromSquad(C) }, '按常规队填满'), h('button', { onclick: () => C.o.setCup({ ...C.o.getCup(), picks: [] }) }, '清空')));
}

/** The chosen stage: teams, description, whether it is open, its training effects, its lineup, the start. @param {Cup} C @param {CupStage} s @param {CupSave} c */
function stageDetail(C, s, c) {
  const open = cupOpen(s, c.cleared), codes = s.after.map((x) => CUP_STAGES.find((y) => y.stage === x)?.code ?? x);
  const relic = C.o.relics(s.level).find((r) => r.id === c.relic && c.cleared.includes(r.unlockedBy))?.id ?? '';
  const go = () => {
    const picks = s.predefined ? [] : C.o.getCup().picks.flatMap((p) => { const e = entryOf(C, p.id); return e ? [{ e, skill: p.skill, module: p.module }] : []; });
    if (!s.predefined && picks.length === 0) { C.o.toast('先选上场干员'); return; }
    C.o.start(s.level, picks, relic);
  };
  return h('div', { class: 'cup-stage' },
    h('h3', {}, `${s.code} ${s.name}`, c.cleared.includes(s.stage) ? h('small', { class: 'ok' }, ' 已通关') : null),
    h('p', {}, `${s.ours.name} 对阵 ${s.theirs.name}`),
    h('p', { class: 'muted' }, plain(s.detail)),
    open ? null : h('p', { class: 'bad' }, `完成 ${codes.join('、')} 后开放`),
    relicPicker(C, s, c),
    s.predefined ? h('p', { class: 'muted' }, '这一关的干员都由关卡安排，不带自己的干员。') : lineup(C, c),
    h('div', { class: 'row' }, h('button', { class: 'primary', disabled: !open, onclick: go }, '开始比赛')));
}

/** @param {Cup} C */
function render(C) {
  const c = C.o.getCup(), at = chosenStage(C);
  C.host.replaceChildren(
    h('h2', {}, CUP_NAME),
    h('p', { class: 'muted' }, `单人参赛：最多 ${CUP_LINEUP} 名干员，卫戍协议的 ${C.npcs.length} 名特派干员每场都能上场；通关特训赛解锁训练效果。进度只保存在这个浏览器里。`),
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
  const C = { host, o, chosen: '', npcs: [] };
  const counts = new Map();
  const ready = Promise.all(CUP_NPCS.map(async (id) => counts.set(id, (await o.training(id)).skills.length)))
    .then(() => { C.npcs = cupNpcEntries((id) => counts.get(id) ?? 0); render(C); })
    .catch((e) => o.toast(`读不到特派干员的数据：${e.message}`));
  return { render: () => render(C), ready, state: () => ({ chosen: chosenStage(C).stage }) };
}
