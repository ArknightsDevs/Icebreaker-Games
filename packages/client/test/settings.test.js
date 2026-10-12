// The player's picture settings (docs/spec/page.md 页面-1): their choices and defaults, saving on the device, the
// frame-rate cap's gate and the FPS readout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, sanitize, readSettings, writeSettings, frameGate, fpsMeter } from '../src/settings.js';

/** A storage over a map; `broken` makes it throw. @param {boolean} [broken] */
function storage(broken = false) {
  const m = new Map();
  return {
    m,
    getItem: (/** @type {string} */ k) => { if (broken) throw new Error('denied'); return m.get(k) ?? null; },
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { if (broken) throw new Error('denied'); m.set(k, v); },
  };
}

test('[页面-1] no limits by default; a choice that is not one of the options takes the default', () => {
  assert.deepEqual(DEFAULTS, { fpsCap: 0, scale: 1, attackEffects: true, showFps: false });
  assert.deepEqual(sanitize({ fpsCap: 60, scale: 0.5, attackEffects: false, showFps: true }), { fpsCap: 60, scale: 0.5, attackEffects: false, showFps: true });
  assert.deepEqual(sanitize({ fpsCap: 59, scale: 2, attackEffects: 'no', extra: 1 }), DEFAULTS);
  assert.deepEqual(sanitize(null), DEFAULTS);
});

test('[页面-1] saved on the device; nothing saved, a broken record or a storage that refuses gives the defaults', () => {
  const s = storage();
  assert.deepEqual(readSettings(s), DEFAULTS);
  writeSettings(s, { ...DEFAULTS, fpsCap: 30 });
  assert.equal(readSettings(s).fpsCap, 30);
  s.m.set([...s.m.keys()][0], '{not json');
  assert.deepEqual(readSettings(s), DEFAULTS);
  const no = storage(true);
  writeSettings(no, { ...DEFAULTS, fpsCap: 30 });
  assert.deepEqual([readSettings(no), readSettings(null)], [DEFAULTS, DEFAULTS]);
});

/** The frames a gate draws of a display's refreshes over a second. @param {number} hz @param {number} cap */
function drawn(hz, cap) {
  const gate = frameGate(() => cap);
  let n = 0;
  for (let i = 0; i < hz; i++) if (gate((i * 1000) / hz)) n++;
  return n;
}

test('[页面-1] the cap: every refresh without one; with one, about the cap — a refresh up to 1.5 ms early counts', () => {
  assert.deepEqual([drawn(144, 0), drawn(60, 0)], [144, 60]);
  assert.deepEqual([drawn(144, 60), drawn(144, 30), drawn(120, 60), drawn(60, 60), drawn(60, 30)], [60, 30, 60, 60, 30]);
  assert.equal(drawn(60, 144), 60, 'a cap above the display: the display');
  const gate = frameGate(() => 30);
  assert.deepEqual([gate(0), gate(10), gate(32), gate(500), gate(520), gate(533.4)], [true, false, true, true, false, true], 'after a long gap the slots start again');
});

test('[页面-1] the readout: the frames drawn in the last second', () => {
  const m = fpsMeter();
  let last = 0;
  for (let i = 0; i < 90; i++) last = m(i * (1000 / 60));
  assert.equal(last, 60);
});
