// The original lobby screens on the room page (docs/spec/page.md 页面-6): a prefab instance of the lobby UI pack as the
// page works with it — its nodes found by the pack's references (`@path` from the prefab's root) or by a tail, other
// prefabs opened inside its container nodes, its list nodes filled from their templates, its switches and buttons set
// to a state, a text box over its input field, its clips played. The engine's UI does each of these (界面-24…34); this
// keeps the page's references and closes what was opened inside a screen with it.
import { refNode, setText, copyRect, FULL_RT } from '@aue/ui';

/** @typedef {import('@aue/ui').UiNode} UiNode @typedef {import('@aue/ui').Screen} Screen */

/** Each tappable node's current tap. @type {WeakMap<UiNode, () => void>} */
const taps = new WeakMap();
/** The screens opened inside nodes of a screen, closed with it. @type {WeakMap<Screen, Set<Screen>>} */
const inside = new WeakMap();
/** The screen the page opened inside a container node, replaced on the next placing. @type {WeakMap<UiNode, Screen>} */
const placed = new WeakMap();

/** A prefab of the pack named by a reference ('screen:<key>'), or the key itself. @param {string} r */
export const screenKey = (r) => (r.startsWith('screen:') ? r.slice(7) : r);

/** A prefab instance: the UI, the screen it is on, its root node and its prefab's key. */
export class Part {
  /** @param {any} ui @param {Screen} scr @param {UiNode} root @param {string} key */
  constructor(ui, scr, root, key) {
    this.ui = ui; this.scr = scr; this.root = root; this.key = key;
  }

  /** A node by a pack reference ('@path', '@' the root) or by a tail of its path under the root; null when there is none. @param {string | null | undefined} r */
  node(r) {
    if (!r) return null;
    if (r === '@') return this.root;
    if (r.startsWith('@')) return refNode(this.root, r);
    return this.scr.one(r, this.root);
  }

  /** The page controller fields the pack has for a node of this prefab ('@' its root). @param {string} [at] @returns {Record<string, any>} */
  view(at = '@') {
    const list = /** @type {any} */ (this.scr.ctx.pack).views?.[this.key] ?? [];
    return Object.assign({}, ...list.filter((/** @type {any} */ v) => v.at === at).map((/** @type {any} */ v) => v.f));
  }

  /** @param {string} r @param {unknown} v */
  text(r, v) { const s = this.node(r); if (s) setText(s, v); }
  /** @param {string} r @param {unknown} on */
  show(r, on) { const s = this.node(r); if (s) s.active = !!on; }
  /** Shows each of the nodes a list of references names. @param {readonly string[] | undefined} refs @param {unknown} on */
  showAll(refs, on) { for (const r of refs ?? []) this.show(r, on); }
  /** A picture by URL (null: the prefab's own sprite). @param {string} r @param {string | null} url */
  picture(r, url) { const s = this.node(r); if (s) this.scr.picture('', url, s); }
  /** A sprite of the pack by key. @param {string} r @param {string | null} key */
  sprite(r, key) { const s = this.node(r); if (s) this.scr.sprite('', key, s); }
  /** A graphic's or text's colour (0–1). @param {string} r @param {number[]} c */
  color(r, c) { const s = this.node(r); if (s) this.scr.color('', c, s); }
  /** A node set to fill its parent (a picture slot drawn in the window its mask shows). @param {string} r */
  fillParent(r) { const s = this.node(r); if (s) s.rt = copyRect(FULL_RT); }

  /**
   * Makes a node tappable: a click on it while it is shown and its buttons work calls fn — the last fn given for the
   * node, so a view drawn again does not stack its taps; a pressed button tints its target (界面-24, 界面-25).
   * @param {string} r @param {() => void} fn
   */
  tap(r, fn) {
    const s = this.node(r);
    if (!s) return;
    if (!taps.has(s)) this.scr.tap('', () => taps.get(s)?.(), s);
    taps.set(s, fn);
  }

  /**
   * Plays a clip on a node (its animation's wrapper); resolves when it has played (at once for a clip the pack lacks).
   * Its events call back and its sound events play (界面-32).
   * @param {string} r @param {string} clip
   * @param {{ loop?: boolean, reverse?: boolean, delay?: number, rate?: number, from?: number, onStart?: () => void, onEnd?: () => void, onEvent?: (name: string) => void }} [o]
   */
  play(r, clip, o) {
    const s = this.node(r);
    if (!s || !Object.hasOwn(this.scr.ctx.pack.clips, clip)) return Promise.resolve();
    return this.scr.play('', clip, o, s).catch(() => undefined);
  }

  /** Plays a clip the pack's controller data names ({ animationWrapper, animationName }). @param {{ animationWrapper?: string, animationName?: string } | undefined} a */
  anim(a) { return a?.animationName ? this.play(a.animationWrapper ?? '@', a.animationName) : Promise.resolve(); }
}

/**
 * A newly made prefab instance as the page shows it: the invert-mode effects it ships switched on are hidden (the page
 * has no invert mode, ADR 0063), and a plain transform holding UI (a node with no rect of its own, e.g. the one over a
 * screen canvas) fills its parent instead of taking the default 100 × 100 rect — the engine's UI does that only for a
 * screen's root and for canvases (界面-28; INF-0009) — and a stencil-shaped writer is not drawn.
 * @param {UiNode} s
 */
function settle(s) {
  if (/^root_(fx_)?invert/.test(s.n.name)) s.active = false;
  if (!s.n.rt && s.parent) s.rt = copyRect(FULL_RT);
  // a stencil shape (a sprite made for writing the stencil) only writes it, like the engine's writers named mask
  // (界面-4): the card waves it masks are particles, not drawn yet, so it would show as a white block
  if (s.n.comps.mask === 'stencil' && /stencil/i.test(s.n.comps.img?.ref ?? '')) s.stHide = true;
  for (const k of s.kids) settle(k);
}

/** The page's lobby screen of a prefab, opened on the UI. @param {any} ui @param {string} key @param {number} [z] */
export function openPart(ui, key, z) {
  const scr = ui.open(key, z == null ? {} : { z });
  settle(scr.root);
  return new Part(ui, scr, scr.root, key);
}

/** Closes a screen and every screen opened inside it. @param {any} ui @param {Screen} scr */
function closeScreen(ui, scr) {
  for (const s of inside.get(scr) ?? []) closeScreen(ui, s);
  inside.delete(scr);
  if (!scr.dead) ui.close(scr);
}

/** Closes a lobby screen with what the page opened inside it. @param {Part} p */
export function closePart(p) { closeScreen(p.ui, p.scr); }

/**
 * A prefab opened inside a container node of a part (the pack's views name such prefab–container pairs; 界面-28),
 * replacing what the page opened there before. Null when the container or the prefab is not in the pack.
 * @param {Part} p @param {string} at the container @param {string} prefab 'screen:<key>' or the key
 */
export function place(p, at, prefab) {
  const node = p.node(at), key = screenKey(prefab);
  if (!node || !Object.hasOwn(p.scr.ctx.pack.screens, key)) return null;
  const old = placed.get(node);
  if (old) { closeScreen(p.ui, old); inside.get(p.scr)?.delete(old); }
  const scr = p.ui.open(key, { into: node });
  settle(scr.root);
  placed.set(node, scr);
  const set = inside.get(p.scr) ?? new Set();
  set.add(scr);
  inside.set(p.scr, set);
  return new Part(p.ui, scr, scr.root, key);
}

/** Closes what the page opened inside a container node of a part. @param {Part} p @param {string} at */
export function unplace(p, at) {
  const node = p.node(at), old = node ? placed.get(node) : null;
  if (!node || !old) return;
  closeScreen(p.ui, old);
  inside.get(p.scr)?.delete(old);
  placed.delete(node);
}

/**
 * A list node filled with n items from its template (the node's `list` component, or the prefab given: a container a
 * controller fills with a prefab it names), each given to fill (界面-26). Items are kept and refilled on the next
 * fill; the extra ones go. Returns the items.
 * @param {Part} p @param {string} at the list node @param {number} n @param {(item: Part, i: number) => void} [fill] @param {string} [template]
 */
export function fillList(p, at, n, fill, template) {
  const node = p.node(at), tpl = template ?? node?.n.comps.list?.template;
  if (!node || typeof tpl !== 'string') return [];
  const key = screenKey(tpl);
  /** @type {Part[]} */
  const items = [];
  p.scr.list('', n, (s) => { settle(s); items.push(new Part(p.ui, p.scr, s, key)); }, node, template);
  items.forEach((x, i) => fill?.(x, i));
  return items;
}

/**
 * A switch's state (界面-25): `on` shows its on part and hides its off part, else the other way round (fading when the
 * switch has a fade time). A node without a switch is shown or hidden itself.
 * @param {Part} p @param {string} at @param {boolean} on
 */
export function setSwitch(p, at, on) {
  const s = p.node(at);
  if (!s) return;
  if (s.n.comps.switch) p.scr.state('', on ? 1 : 0, s);
  else s.active = on;
}

/** A button's state (界面-25): 0 normal, 1 pressed, 2 disabled (its taps do nothing). @param {Part} p @param {string} at @param {0 | 1 | 2} i */
export function setButton(p, at, i) {
  const s = p.node(at);
  if (s) p.scr.state('', i, s);
}

/** The node with an input field at or under a node. @param {Part} p @param {UiNode} s @returns {UiNode | null} */
function fieldAt(p, s) {
  if (s.n.comps.input) return s;
  return p.scr.all.find((x) => x.n.comps.input && x.path.startsWith(`${s.path}/`)) ?? null;
}

/**
 * A text box over an input field at or under a node (界面-31): its text, placeholder and limit from the field unless
 * given; `onEnter` on Enter.
 * @param {Part} p @param {string} at
 * @param {{ value?: string, placeholder?: string, maxLength?: number, onChange?: (v: string) => void, onEnter?: (v: string) => void, label?: string }} o
 */
export function inputOn(p, at, o) {
  const s = p.node(at), field = s ? fieldAt(p, s) : null;
  if (!field) return null;
  const box = p.scr.input('', { value: o.value ?? '', placeholder: o.placeholder, maxLength: o.maxLength, onChange: (v) => o.onChange?.(v), onEnter: o.onEnter }, field);
  if (!box) return null;
  if (o.label) box.el.setAttribute('aria-label', o.label);
  box.el.addEventListener('click', (e) => e.stopPropagation());
  return { ...box, value: () => box.el.value };
}

/** The common bottom bar (the scrolling 「Now Streaming…」 strip). */
export const BOTTOM_BAR = 'common/bottom_bar_prefab';

/**
 * The common bottom bar placed at a node (页面-6): its title 「RHODES ISLAND:」 (set by the game at run time; the
 * activity's screenshots show it), its season logo hidden (filled at run time from art the packs do not have).
 * @param {Part} p @param {string} at @param {string} [prefab] @returns {Part | null}
 */
export function placeBottomBar(p, at, prefab = BOTTOM_BAR) {
  const bar = place(p, at, prefab);
  if (!bar) return null;
  const f = bar.view();
  bar.show(f.imgSeasonLogo ?? '@season_logo', false);
  bar.text('@title_layout_max/title_layout_min/text', 'RHODES ISLAND:');
  return bar;
}

/** The game's common top menu (back, home), which the activity's pages put in their top menu container. */
export const TOP_MENU = 'common/panel_common_topmenu';

/**
 * The common top menu placed at a node (页面-6): back always, home only when there is one (its back-only face
 * otherwise).
 * @param {Part} p @param {string} at @param {{ back: () => void, home?: () => void }} on @returns {Part | null}
 */
export function placeTopMenu(p, at, on) {
  const m = place(p, at, TOP_MENU);
  if (!m) return null;
  m.show('@panel_default', !!on.home);
  m.show('@panel_backonly', !on.home);
  m.show('@panel_default/panel_detail_menu', false);
  m.tap('@btn_topmenu_back/panel_hotspot', on.back);
  const home = on.home;
  if (home) m.tap('@panel_default/btn_topmenu_home/panel_hotspot', home);
  return m;
}
