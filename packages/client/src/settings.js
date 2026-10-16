// The player's picture settings (docs/spec/page.md 页面-1; engine ADR 0059): a frame-rate cap, the 清晰度, attack effects,
// an FPS readout, and the music and sound volumes (页面-4) — saved on this device, applied at once. Nothing here touches the battle: it runs 30 frames a second
// whatever the picture does (the engine's 时间-1).

/** @typedef {{ fpsCap: number, scale: number, attackEffects: boolean, showFps: boolean, music: number, sfx: number }} Settings */

/** The frame-rate caps; 0 follows the display (no cap of ours). */
export const FPS_CAPS = Object.freeze([0, 144, 120, 60, 30]);
/** The 清晰度 choices: the canvas's pixel ratio over the device's (the engine's 渲染-15). */
export const SCALES = Object.freeze([1, 0.75, 0.5]);
/** The volume choices of the music and the sounds (页面-4). */
export const VOLUMES = Object.freeze([1, 0.5, 0]);
/** No limits of ours by default. @type {Readonly<Settings>} */
export const DEFAULTS = Object.freeze({ fpsCap: 0, scale: 1, attackEffects: true, showFps: false, music: 1, sfx: 1 });

const KEY = 'ice.settings.v1';

/** Settings from anything: each field kept when it is one of its choices, else its default. @param {unknown} v @returns {Settings} */
export function sanitize(v) {
  const o = v && typeof v === 'object' ? /** @type {Record<string, unknown>} */ (v) : {};
  return {
    fpsCap: FPS_CAPS.includes(/** @type {number} */ (o.fpsCap)) ? /** @type {number} */ (o.fpsCap) : DEFAULTS.fpsCap,
    scale: SCALES.includes(/** @type {number} */ (o.scale)) ? /** @type {number} */ (o.scale) : DEFAULTS.scale,
    attackEffects: typeof o.attackEffects === 'boolean' ? o.attackEffects : DEFAULTS.attackEffects,
    showFps: typeof o.showFps === 'boolean' ? o.showFps : DEFAULTS.showFps,
    music: VOLUMES.includes(/** @type {number} */ (o.music)) ? /** @type {number} */ (o.music) : DEFAULTS.music,
    sfx: VOLUMES.includes(/** @type {number} */ (o.sfx)) ? /** @type {number} */ (o.sfx) : DEFAULTS.sfx,
  };
}

/** The saved settings, or the defaults (no storage, nothing saved, or broken). @param {Pick<Storage, 'getItem'> | null | undefined} storage */
export function readSettings(storage) {
  try {
    const raw = storage?.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS };
  }
}

/** Saves the settings; a storage that refuses is ignored. @param {Pick<Storage, 'setItem'> | null | undefined} storage @param {Settings} s */
export function writeSettings(storage, s) {
  try { storage?.setItem(KEY, JSON.stringify(sanitize(s))); } catch { /* not saved: the choice still holds for this page */ }
}

/**
 * Which display frames to draw under a cap (页面-1): every one without a cap; with one, a frame when an interval has
 * passed since the last drawn one's slot — up to 1.5 ms early counts, since display frames come with jitter — and after
 * a long gap (over two intervals) the slots start again from that frame.
 * @param {() => number} cap the cap now (0: none) @returns {(now: number) => boolean}
 */
export function frameGate(cap) {
  let last = -Infinity;
  return (now) => {
    const c = cap();
    if (!(c > 0)) { last = now; return true; }
    const interval = 1000 / c, since = now - last;
    if (since < interval - 1.5) return false;
    last = since > 2 * interval ? now : last + interval;
    return true;
  };
}

/** Frames drawn in the last second, for the readout. @returns {(now: number) => number} */
export function fpsMeter() {
  /** @type {number[]} */
  const times = [];
  return (now) => {
    times.push(now);
    while (times.length > 0 && times[0] <= now - 1000) times.shift();
    return times.length;
  };
}

/** The panel's rows: each setting's label and its choices with their labels. */
const ROWS = Object.freeze([
  { field: 'fpsCap', label: '帧率上限', choices: FPS_CAPS.map((v) => [v, v === 0 ? '跟随屏幕' : String(v)]) },
  { field: 'scale', label: '清晰度', choices: SCALES.map((v) => [v, `${v * 100}%`]) },
  { field: 'attackEffects', label: '攻击特效', choices: [[true, '开'], [false, '关']] },
  { field: 'showFps', label: '显示帧率', choices: [[false, '关'], [true, '开']] },
  { field: 'music', label: '音乐', choices: VOLUMES.map((v) => [v, v === 0 ? '关' : `${v * 100}%`]) },
  { field: 'sfx', label: '音效', choices: VOLUMES.map((v) => [v, v === 0 ? '关' : `${v * 100}%`]) },
]);

/**
 * The settings button and its panel (页面-1): a choice applies at once and is saved.
 * @param {HTMLElement} root @param {Settings} initial @param {(s: Settings) => void} onChange
 */
export function createSettingsPanel(root, initial, onChange) {
  let s = { ...initial };
  const toggle = document.createElement('button'), panel = document.createElement('div');
  toggle.textContent = '画面';
  toggle.setAttribute('aria-expanded', 'false');
  panel.className = 'panel';
  panel.hidden = true;
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  const draw = () => {
    panel.replaceChildren(...ROWS.map((r) => {
      const row = document.createElement('div'), name = document.createElement('span');
      row.className = 'row';
      name.textContent = r.label;
      row.append(name, ...r.choices.map(([v, text]) => {
        const b = document.createElement('button');
        b.textContent = String(text);
        b.setAttribute('aria-pressed', String(/** @type {any} */ (s)[r.field] === v));
        b.addEventListener('click', () => { s = sanitize({ ...s, [r.field]: v }); draw(); onChange(s); });
        return b;
      }));
      return row;
    }));
  };
  draw();
  root.replaceChildren(toggle, panel);
}
