// The effect pack's index read from its bytes (docs/spec/site.md 站点-5): the pack is not parsed whole. A scan over its
// JSON text finds where each effect and texture is written, keeps those pieces of text as they are and the textures
// each effect names; only the small tables (by, common, named, clamp) are parsed. Parsing the whole pack takes over
// ten times its size and the process does not give it back; the scan holds the file and the pieces, about three times.

const QUOTE = 0x22, BACKSLASH = 0x5c, COLON = 0x3a, COMMA = 0x2c;
const OPEN_OBJECT = 0x7b, CLOSE_OBJECT = 0x7d, OPEN_ARRAY = 0x5b, CLOSE_ARRAY = 0x5d;
/** Bytes that end a number, true, false or null. */
const ENDS_WORD = new Set([COMMA, CLOSE_OBJECT, CLOSE_ARRAY, 0x20, 0x0a, 0x0d, 0x09]);

/** @typedef {(s: number, e: number) => void} OnString a string value from byte `s` (its quote) to `e` (after it) */
/** @typedef {(key: string, start: number, end: number) => void} OnMember a member's key and where its value is */

/** @param {Buffer} b @param {number} i @returns {number} the first byte at or after `i` that is not white space */
function skipSpace(b, i) {
  while (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09) i++;
  return i;
}

/** @param {Buffer} b @param {number} i @param {number} c @returns {number} the byte after `c`, which must be at `i` */
function expect(b, i, c) {
  if (b[i] !== c) throw new SyntaxError(`effect pack: expected ${String.fromCharCode(c)} at byte ${i}`);
  return i + 1;
}

/** @param {Buffer} b @param {number} i @returns {number} the byte after the string whose quote is at `i` */
function stringEnd(b, i) {
  expect(b, i, QUOTE);
  for (let j = b.indexOf(QUOTE, i + 1); j !== -1; j = b.indexOf(QUOTE, j + 1)) {
    let k = j - 1;
    while (b[k] === BACKSLASH) k--;
    if ((j - 1 - k) % 2 === 0) return j + 1;
  }
  throw new SyntaxError(`effect pack: the string at byte ${i} does not end`);
}

/** @param {Buffer} b @param {number} s @param {number} e a string from its quote to after it @returns {string} its text */
function stringAt(b, s, e) {
  const raw = b.toString('utf8', s + 1, e - 1);
  return raw.includes('\\') ? JSON.parse(b.toString('utf8', s, e)) : raw;
}

/**
 * Walks the object that starts at `i`. @param {Buffer} b @param {number} i
 * @param {OnMember | null} onMember each member, keys only at this depth @param {OnString | null} onString the strings
 * that are values, at any depth @returns {number} the byte after the object
 */
function objectEnd(b, i, onMember, onString) {
  let j = skipSpace(b, expect(b, i, OPEN_OBJECT));
  if (b[j] === CLOSE_OBJECT) return j + 1;
  for (;;) {
    const ke = stringEnd(b, j), start = skipSpace(b, expect(b, skipSpace(b, ke), COLON)), end = valueEnd(b, start, onString);
    onMember?.(stringAt(b, j, ke), start, end);
    j = skipSpace(b, end);
    if (b[j] === CLOSE_OBJECT) return j + 1;
    j = skipSpace(b, expect(b, j, COMMA));
  }
}

/** @param {Buffer} b @param {number} i @param {OnString | null} onString @returns {number} the byte after the array at `i` */
function arrayEnd(b, i, onString) {
  let j = skipSpace(b, expect(b, i, OPEN_ARRAY));
  if (b[j] === CLOSE_ARRAY) return j + 1;
  for (;;) {
    j = skipSpace(b, valueEnd(b, j, onString));
    if (b[j] === CLOSE_ARRAY) return j + 1;
    j = skipSpace(b, expect(b, j, COMMA));
  }
}

/** @param {Buffer} b @param {number} i @param {OnString | null} onString @returns {number} the byte after the value at `i` */
function valueEnd(b, i, onString) {
  if (b[i] === QUOTE) {
    const e = stringEnd(b, i);
    onString?.(i, e);
    return e;
  }
  if (b[i] === OPEN_OBJECT) return objectEnd(b, i, null, onString);
  if (b[i] === OPEN_ARRAY) return arrayEnd(b, i, onString);
  let j = i;
  while (j < b.length && !ENDS_WORD.has(b[j])) j++;
  if (j === i) throw new SyntaxError(`effect pack: no value at byte ${i}`);
  return j;
}

/**
 * The engine's index of an effect pack (`fx/units.json`) from its bytes: the same answers as the engine's
 * `effectIndex` of the parsed pack, each effect and texture as the pack writes it.
 * @param {Buffer} b @returns {import('@aue/render/fx-subset').EffectIndex}
 */
export function scanEffectPack(b) {
  /** @type {Map<string, [number, number]>} */
  const top = new Map();
  objectEnd(b, skipSpace(b, 0), (key, start, end) => top.set(key, [start, end]), null);
  const text = (/** @type {number} */ s, /** @type {number} */ e) => b.toString('utf8', s, e);
  const table = (/** @type {string} */ k, /** @type {unknown} */ none) => { const r = top.get(k); return r ? JSON.parse(text(...r)) : none; };
  /** @type {Map<string, string>} */
  const tex = new Map();
  const texAt = top.get('tex');
  if (texAt) objectEnd(b, texAt[0], (key, s, e) => tex.set(key, text(s, e)), null);
  // A texture's name is short: a longer string (at most six bytes a character, escaped) is not one.
  const longest = 2 + 6 * Math.max(0, ...[...tex.keys()].map((k) => k.length));
  /** @type {Map<string, { json: string, tex: string[] }>} */
  const fx = new Map();
  /** @type {Set<string>} */
  let names = new Set();
  const fxAt = top.get('fx');
  if (fxAt) {
    objectEnd(b, fxAt[0], (key, s, e) => { fx.set(key, { json: text(s, e), tex: [...names] }); names = new Set(); }, (s, e) => {
      if (e - s > longest) return;
      const v = stringAt(b, s, e);
      if (tex.has(v)) names.add(v);
    });
  }
  return { by: table('by', {}), common: table('common', {}), named: table('named', {}), clamp: table('clamp', []), fx, tex };
}
