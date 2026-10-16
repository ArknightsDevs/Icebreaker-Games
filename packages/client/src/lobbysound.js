// The lobby screens' sounds (docs/spec/page.md 页面-6): the pack's clip sound events and taps play the audio index's
// banks (ui.*) as the engine's 音频-1 says — a sound picked by weight, its pitch and volume within their ranges, after
// its delay — at the player's sound volume. A bank the assets lack is not played; nothing sounds before the player's
// first touch (the browser's rule). The room page does not load the battle renderer, so this is the page's own player.

/** @typedef {{ file: string, weight: number, delay: number, pitch: number[], volume: number[] }} Sound */
/** @typedef {{ sounds: Sound[], max: number, popOldest: boolean, loop: boolean }} Bank */

/**
 * One sound of a bank: by weight (all 0: alike), pitch and volume uniformly within their ranges.
 * @param {Bank} bank @param {() => number} random @returns {{ file: string, delay: number, pitch: number, volume: number } | null}
 */
export function pickOf(bank, random) {
  const list = bank.sounds ?? [];
  if (!list.length) return null;
  const total = list.reduce((t, s) => t + Math.max(0, s.weight), 0);
  let r = random() * (total > 0 ? total : list.length), i = 0;
  for (; i < list.length - 1; i++) {
    r -= total > 0 ? Math.max(0, list[i].weight) : 1;
    if (r < 0) break;
  }
  const s = list[i], between = (/** @type {number[]} */ [a, b]) => a + (b - a) * random();
  return { file: s.file, delay: s.delay, pitch: between(s.pitch), volume: between(s.volume) };
}

/**
 * The lobby's sound player: `play(bank)`; `volume(v)` the player's sound volume 0–1; `resume()` after a gesture.
 * @param {string} base the URL of the assets' audio directory @param {number} volume
 */
export function createLobbySound(base, volume) {
  /** @type {{ ctx: AudioContext, gain: GainNode, banks: Record<string, Bank> } | null} */
  let P = null, level = volume;
  /** @type {Map<string, Promise<AudioBuffer | null>>} */
  const buffers = new Map();
  const ready = fetch(new URL('index.json', base)).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((index) => {
    if (!index?.banks) return null;
    const ctx = new AudioContext(), gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(ctx.destination);
    P = { ctx, gain, banks: index.banks };
    return P;
  });
  /** @param {AudioContext} ctx @param {string} file */
  const buffer = (ctx, file) => {
    const url = new URL(file, base).href;
    if (!buffers.has(url)) buffers.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null)).catch(() => null));
    return /** @type {Promise<AudioBuffer | null>} */ (buffers.get(url));
  };
  return {
    /** @param {string} name */
    play: async (name) => {
      const p = await ready, bank = p?.banks[name];
      if (!p || !bank || p.ctx.state !== 'running') return;
      const s = pickOf(bank, Math.random), buf = s ? await buffer(p.ctx, s.file) : null;
      if (!s || !buf) return;
      const src = p.ctx.createBufferSource(), g = p.ctx.createGain();
      src.buffer = buf;
      src.playbackRate.value = s.pitch;
      g.gain.value = s.volume;
      src.connect(g).connect(p.gain);
      src.start(p.ctx.currentTime + s.delay);
    },
    /** @param {number} v */
    volume: (v) => { level = v; if (P) P.gain.gain.value = v; },
    resume: () => { void ready.then((p) => p?.ctx.resume()); },
  };
}
