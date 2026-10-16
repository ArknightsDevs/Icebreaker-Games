// The original lobby screens on the room page (docs/spec/page.md 页面-6): a prefab instance of the lobby UI pack as the
// page works with it — its nodes found by the pack's references (`@path` from the prefab's root) or by a tail, its
// screens placed into container nodes, its list nodes filled from their templates, its two-state switches set, an
// input box over its input node, its clips played. Where the engine's UI does one of these itself the page lets it.
import { refNode, setText, copyRect, FULL_RT } from '@aue/ui';

/** @typedef {import('@aue/ui').UiNode} UiNode @typedef {import('@aue/ui').Screen} Screen */

/** Each tappable node's current tap. @type {WeakMap<UiNode, () => void>} */
const taps = new WeakMap();

/** A prefab of the pack named by a reference ('screen:<key>'), or the key itself. @param {string} r */
export const screenKey = (r) => (r.startsWith('screen:') ? r.slice(7) : r);

/** A prefab instance: the screen it is on, its root node and its prefab's key. */
export class Part {
  /** @param {Screen} scr @param {UiNode} root @param {string} key */
  constructor(scr, root, key) {
    this.scr = scr; this.root = root; this.key = key;
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
  picture(r, url) { const s = this.node(r); if (s) { s.picture = url; s.paintKey = ''; } }
  /** A sprite of the pack by key. @param {string} r @param {string | null} key */
  sprite(r, key) { const s = this.node(r); if (s) { s.sprite = key; s.paintKey = ''; } }
  /** A graphic's or text's colour (0–1). @param {string} r @param {number[]} c */
  color(r, c) { const s = this.node(r); if (s?.color) s.color = [...c]; }

  /**
   * Makes a node tappable: a click on it while shown calls fn (the last fn given for the node, so a view drawn again
   * does not stack its taps); a pressed button tints its target.
   * @param {string} r @param {() => void} fn
   */
  tap(r, fn) {
    const s = this.node(r);
    if (!s) return;
    if (!taps.has(s)) {
      s.el.classList.add('aue-hot');
      s.el.addEventListener('click', (e) => { e.stopPropagation(); if (s.shown) taps.get(s)?.(); });
      this.scr.press(s);
    }
    taps.set(s, fn);
  }

  /**
   * Plays a clip on a node (its animation's wrapper); resolves when it has played (at once for a clip the pack lacks).
   * @param {string} r @param {string} clip @param {{ loop?: boolean, reverse?: boolean, delay?: number, rate?: number }} [o]
   */
  play(r, clip, o) {
    const s = this.node(r);
    if (!s || !Object.hasOwn(this.scr.ctx.pack.clips, clip)) return Promise.resolve();
    return this.scr.anim.play(s, clip, o).catch(() => undefined);
  }

  /** Plays a clip the pack's controller data names ({ animationWrapper, animationName }). @param {{ animationWrapper?: string, animationName?: string } | undefined} a */
  anim(a) { return a?.animationName ? this.play(a.animationWrapper ?? '@', a.animationName) : Promise.resolve(); }
}

/**
 * Nodes that fill their parent as Unity lays them out (页面-6): a screen-space canvas (its serialized rect is all zero,
 * the canvas drives it) and a plain transform holding UI (no rect of its own). The engine's UI may do this itself;
 * a node already sized is left as it is.
 * @param {UiNode} s
 */
export function fillScreens(s) {
  const rt = s.n.rt, screenCanvas = !!s.n.comps.canvas && (!rt || rt.scale[0] === 0);
  if (screenCanvas || (!rt && s.parent)) s.rt = copyRect(FULL_RT);
  for (const k of s.kids) fillScreens(k);
}

/** The page's lobby screen of a prefab, opened on the UI. @param {any} ui @param {string} key @param {number} [z] */
export function openPart(ui, key, z) {
  const scr = ui.open(key, z == null ? {} : { z });
  fillScreens(scr.root);
  return new Part(scr, scr.root, key);
}

/** The instances a container node got from the page, to replace them on the next fill. @type {WeakMap<UiNode, UiNode[]>} */
const placed = new WeakMap();

/** Removes what the page put into a container. @param {Part} p @param {UiNode} at */
function clear(p, at) {
  for (const s of placed.get(at) ?? []) p.scr.remove(s);
  placed.set(at, []);
}

/**
 * A prefab placed into a container node of a part (the pack's views name such prefab–container pairs), replacing what
 * the page put there before. Null when the container or the prefab is not in the pack.
 * @param {Part} p @param {string} at the container @param {string} prefab 'screen:<key>' or the key
 */
export function place(p, at, prefab) {
  const node = p.node(at), key = screenKey(prefab);
  if (!node || !Object.hasOwn(p.scr.ctx.pack.screens, key)) return null;
  clear(p, node);
  const s = p.scr.instantiate(node, key);
  fillScreens(s);
  placed.set(node, [s]);
  return new Part(p.scr, s, key);
}

/**
 * A list node filled with n items from its template (the node's `list` component, or the prefab given: a container a
 * controller fills with a prefab it names), each given to fill; the items the page put there before go. Returns the
 * items.
 * @param {Part} p @param {string} at the list node @param {number} n @param {(item: Part, i: number) => void} [fill] @param {string} [template]
 */
export function fillList(p, at, n, fill, template) {
  const node = p.node(at), tpl = template ?? node?.n.comps.list?.template;
  if (!node || typeof tpl !== 'string') return [];
  clear(p, node);
  /** @type {Part[]} */
  const items = [];
  for (let i = 0; i < n; i++) {
    const key = screenKey(tpl);
    if (!Object.hasOwn(p.scr.ctx.pack.screens, key)) break;
    const s = p.scr.instantiate(node, key);
    fillScreens(s);
    items.push(new Part(p.scr, s, key));
  }
  placed.set(node, items.map((x) => x.root));
  items.forEach((x, i) => fill?.(x, i));
  return items;
}

/**
 * A two-state switch (the node's `switch` component): `on` shows its on node and hides its off node, else the other
 * way round. A node without the component is shown or hidden itself.
 * @param {Part} p @param {string} at @param {boolean} on
 */
export function setSwitch(p, at, on) {
  const s = p.node(at), sw = s?.n.comps.switch;
  if (!s) return;
  if (!sw) { s.active = on; return; }
  const a = refNode(s, sw.on), b = refNode(s, sw.off);
  if (a) a.active = on;
  if (b) b.active = !on;
}

/**
 * An input node's text and placeholder nodes and what the box takes from them: the limit, the placeholder's text, the
 * text's size. @param {UiNode} s
 */
function inputParts(s) {
  const c = s.n.comps.input ?? {}, text = refNode(s, c.text), hint = refNode(s, c.placeholder), face = (text ?? hint)?.n.comps.text;
  return { text, hint, c: { limit: c.limit ?? 0, hint: hint?.n.comps.text?.text || '', size: face?.size ?? 0 } };
}

/**
 * An HTML input with what the page gives, else the input component's limit and its placeholder's text and size.
 * @param {Document} doc @param {{ value?: string, placeholder?: string, maxLength?: number, label?: string }} o
 * @param {{ limit: number, hint: string, size: number }} c
 */
function inputBox(doc, o, c) {
  const box = doc.createElement('input'), limit = o.maxLength ?? c.limit;
  box.className = 'aue-input';
  box.value = o.value ?? '';
  box.placeholder = o.placeholder ?? c.hint;
  if (o.label) box.setAttribute('aria-label', o.label);
  if (limit > 0) box.maxLength = limit;
  if (c.size) box.style.fontSize = `${c.size}px`;
  return box;
}

/**
 * An input box over a node with an `input` component (an HTML input laid on the node, in the node's text face): its
 * text, placeholder and limit from the component unless given; `onEnter` on Enter. The prefab's own text nodes stay
 * hidden while the box is there.
 * @param {Part} p @param {string} at
 * @param {{ value?: string, placeholder?: string, maxLength?: number, onChange?: (v: string) => void, onEnter?: (v: string) => void, label?: string }} o
 */
export function inputOn(p, at, o) {
  const s = p.node(at);
  if (!s) return null;
  const { text, hint, c } = inputParts(s), box = inputBox(s.el.ownerDocument, o, c);
  for (const t of [text, hint]) if (t) t.active = false;
  box.addEventListener('input', () => o.onChange?.(box.value));
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') o.onEnter?.(box.value); });
  box.addEventListener('click', (e) => e.stopPropagation());
  // the box sits where the prefab's text is; the input node over it lets the pointer through to it
  (text?.parent ?? s).el.appendChild(box);
  return { el: box, set: (/** @type {string} */ v) => { box.value = v; }, focus: () => box.focus(), value: () => box.value };
}

/** CSS for the page's input boxes over the UI. */
export const LOBBY_KIT_CSS = `.aue-input{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;border:0;outline:0;background:transparent;
color:#3a3a3a;padding:0 12px;font-family:var(--aue-ui-cjk);pointer-events:auto}`;
