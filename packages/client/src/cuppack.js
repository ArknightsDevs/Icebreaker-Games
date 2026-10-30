// 阵地足球锦标's UI pack (ui/cup.json, docs/spec/page.md 页面-11) on the lobby's UI: its keys are its own (screens
// 'cup/…', sprites 'sprite/cup/…'), so its screens, clips and views join the lobby pack's and its pages open on the same
// UI; its art and strings sit under the lobby pack's `cup`. Its sprites load when the event is first opened, not with
// the lobby's.

/**
 * Merges the cup pack into the lobby pack (a key the lobby pack has already stays the lobby's); false when there is
 * no cup pack. Its sprites are left out (cupSprites), so the lobby's loading stays as it was.
 * @param {any} lobby @param {any} cup
 */
export function mergeCup(lobby, cup) {
  if (!cup || typeof cup !== 'object' || !cup.screens || !cup.sprites) return false;
  for (const k of ['screens', 'clips', 'views']) {
    const into = (lobby[k] ??= {});
    for (const [key, v] of Object.entries(cup[k] ?? {})) if (!Object.hasOwn(into, key)) into[key] = v;
  }
  lobby.cup = { art: cup.art ?? {}, strings: cup.strings ?? {}, sprites: cup.sprites };
  return true;
}

/**
 * Loads the cup pack's sprites into the UI once (its pack and images); resolves when each has settled.
 * @param {any} ui @param {{ base: string, Image?: typeof Image }} o
 * @returns {Promise<void>}
 */
export function cupSprites(ui, o) {
  const pack = ui.ctx.pack, cup = pack.cup;
  if (!cup?.sprites) return Promise.resolve();
  cup.loading ??= Promise.all(Object.entries(cup.sprites).map(([k, s]) => new Promise((done) => {
    if (!Object.hasOwn(pack.sprites, k)) pack.sprites[k] = s;
    const im = new (o.Image ?? Image)();
    im.onload = () => { ui.ctx.imgs.set(k, im); done(undefined); };
    im.onerror = () => done(undefined);
    im.src = o.base + /** @type {{ uri: string }} */ (s).uri;
  }))).then(() => undefined);
  return cup.loading;
}
