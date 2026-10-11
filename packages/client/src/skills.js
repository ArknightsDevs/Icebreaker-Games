// The skill bar: one row per own operator that has a skill — its name, an SP bar, the SP or the running time,
// and for a MANUAL skill a button that starts it. The rows come from a pure function of the view; the DOM part updates
// in place, so the per-frame call is cheap.
import { KIND, SKILL_STATE } from '@aue/schema';

/** Simulation frames per second (the engine's 时间-1). */
const FPS = 30;

/** @typedef {{ id: number, name: string, sp: number, cost: number, state: number, left: number, manual: boolean, canStart: boolean }} SkillRow */

/**
 * The rows to show: this seat's operators on the field that have a skill, in view order. `keys` is the remembered
 * unit id → content key map; a unit whose key is not known yet gets a generic name.
 * @param {import('@aue/schema').View} view @param {ReadonlyMap<number, string>} keys @param {number} seat
 * @param {Record<string, { name: string, skill?: { type: string } }>} operators
 * @returns {SkillRow[]}
 */
export function skillRows(view, keys, seat, operators) {
  /** @type {SkillRow[]} */
  const rows = [];
  for (const u of view.units) {
    if (u.kind !== KIND.OPERATOR || u.owner !== seat || u.sp < 0) continue;
    const op = operators[keys.get(u.id) ?? ''];
    const manual = op?.skill?.type === 'MANUAL';
    rows.push({ id: u.id, name: op?.name ?? '干员', sp: u.sp, cost: u.spCost, state: u.skill, left: u.skillLeft, manual, canStart: manual && u.skill === SKILL_STATE.READY });
  }
  return rows;
}

/** The text of a row: the SP, or the running state with the seconds left. @param {SkillRow} r */
export function rowText(r) {
  if (r.state !== SKILL_STATE.RUNNING) return `技力 ${Math.floor(r.sp)} / ${r.cost}`;
  return r.left >= 0 ? `运行中 ${(r.left / FPS).toFixed(1)} 秒` : '运行中';
}

/** The bar's fill in percent: the SP share, or full while running. @param {SkillRow} r */
export function rowFill(r) {
  if (r.state === SKILL_STATE.RUNNING) return 100;
  return r.cost > 0 ? Math.max(0, Math.min(100, (r.sp / r.cost) * 100)) : 0;
}

/** @typedef {{ el: HTMLElement, name: HTMLElement, fill: HTMLElement, text: HTMLElement, button: HTMLButtonElement | null, shown: string }} Slot */

/**
 * @param {HTMLElement} root @param {(id: number) => void} onStart
 * @returns {{ update(rows: SkillRow[]): void }}
 */
export function createSkillBar(root, onStart) {
  /** @type {Map<number, Slot>} */
  const slots = new Map();

  /** @param {SkillRow} r @returns {Slot} */
  const build = (r) => {
    const el = document.createElement('div'), name = document.createElement('span'), bar = document.createElement('div'), fill = document.createElement('div'), text = document.createElement('span');
    el.className = 'skill';
    el.dataset['unit'] = String(r.id);
    name.className = 'name';
    name.textContent = r.name;
    bar.className = 'bar';
    fill.className = 'fill';
    text.className = 'text';
    bar.append(fill);
    el.append(name, bar, text);
    /** @type {HTMLButtonElement | null} */
    let button = null;
    if (r.manual) {
      button = document.createElement('button');
      button.textContent = '发动技能';
      button.addEventListener('click', () => onStart(r.id));
      el.append(button);
    }
    return { el, name, fill, text, button, shown: '' };
  };

  return {
    update(rows) {
      const ids = new Set(rows.map((r) => r.id));
      for (const [id, s] of slots) if (!ids.has(id)) { s.el.remove(); slots.delete(id); }
      for (const r of rows) {
        let s = slots.get(r.id);
        if (!s) { s = build(r); slots.set(r.id, s); root.append(s.el); }
        const running = r.state === SKILL_STATE.RUNNING, text = rowText(r), fill = `${rowFill(r).toFixed(1)}%`;
        const shown = `${text}|${fill}|${running}|${r.state}|${r.canStart}`;
        if (s.shown === shown) continue;
        s.shown = shown;
        s.text.textContent = text;
        s.fill.style.width = fill;
        s.el.classList.toggle('running', running);
        s.el.classList.toggle('ready', r.state === SKILL_STATE.READY);
        if (s.button) s.button.disabled = !r.canStart;
      }
    },
  };
}
