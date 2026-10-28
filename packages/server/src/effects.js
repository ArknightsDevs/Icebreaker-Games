// The attack effects of one match (docs/spec/site.md 站点-5; the engine's 渲染-10): assets/…/fx/units.json?for=<keys>
// answers the asset pack's effect pack cut down to those units — their own effects, the shared ones and only the
// textures those name — instead of the whole pack of every unit. The pack is read once into the engine's index and read
// again when the file changes; the latest answers are kept by their keys. The index is read from the pack's bytes
// (effects-scan.js), not from the parsed pack: parsing it whole takes many times its size, which the process keeps.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { effectSubsetJson } from '@aue/render/fx-subset';
import { scanEffectPack } from './effects-scan.js';
import { etagOf } from './respond.js';

/** The effect pack's path in the asset directory. */
export const EFFECT_PACK = 'skeleton/fx/units.json';
/** A unit's content key as the query gives it. */
const KEY = /^[A-Za-z0-9_]{1,64}$/;
/** At most this many units in a query, and this many answers kept (a match's answer is about 1 MB). */
const MAX_KEYS = 256, MAX_ANSWERS = 16;

/**
 * The engine's index of the pack at `file`, read from its bytes.
 * @param {string} file @returns {Promise<import('@aue/render/fx-subset').EffectIndex>}
 */
export async function buildIndex(file) {
  return scanEffectPack(await readFile(file));
}

/**
 * The units a query asks for: `for` as comma-separated content keys (sorted, without repeats); null when there is no
 * `for`; a string when it is malformed (why).
 * @param {string | undefined} url the request URL
 * @returns {string[] | string | null}
 */
export function effectKeys(url) {
  const q = new URL(url ?? '/', 'http://q.invalid').searchParams.get('for');
  if (q === null) return null;
  const keys = [...new Set(q.split(',').filter((k) => k !== ''))].sort();
  if (keys.length > MAX_KEYS) return 'too many units';
  return keys.every((k) => KEY.test(k)) ? keys : 'bad unit key';
}

/**
 * The cut-down packs of an asset directory: `answer(keys)` is the pack of those units as JSON with its ETag, null
 * without an effect pack.
 * @param {string} dir the asset directory
 */
export function createEffectSubsets(dir) {
  const file = join(dir, EFFECT_PACK);
  /** @type {{ mtimeMs: number, index: Promise<import('@aue/render/fx-subset').EffectIndex> } | null} */
  let loaded = null;
  /** @type {Map<string, { body: Buffer, etag: string }>} */
  const answers = new Map();

  /** The pack's index, read again when the file's mtime changes; null without the file. */
  async function indexOf() {
    const st = await stat(file).catch(() => null);
    if (!st) return null;
    if (loaded?.mtimeMs !== st.mtimeMs) {
      answers.clear();
      loaded = { mtimeMs: st.mtimeMs, index: buildIndex(file) };
    }
    return loaded.index;
  }
  // Read at once, before any match: the scan holds the event loop for a moment (about a second on a small node).
  indexOf().catch(() => {});

  return {
    /** @param {string[]} keys @returns {Promise<{ body: Buffer, etag: string } | null>} */
    async answer(keys) {
      const index = await indexOf();
      if (!index) return null;
      const k = keys.join(','), hit = answers.get(k);
      if (hit) return hit;
      const body = Buffer.from(effectSubsetJson(index, keys)), out = { body, etag: etagOf(body) };
      answers.set(k, out);
      if (answers.size > MAX_ANSWERS) answers.delete(/** @type {string} */ (answers.keys().next().value));
      return out;
    },
  };
}
