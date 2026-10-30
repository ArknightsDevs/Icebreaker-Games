// The room page's music (docs/spec/page.md 页面-5): the activity's menu music, the audio index's music bank
// sys.ON_MULTIV3_LOADED — its intro, then its loop from the intro's end, at the bank's volume times the player's music
// volume; while 阵地足球锦标's own pages show (页面-11), its menu music sys.ON_ACTIVITY_LOADED.act1football instead, the
// two crossfading over the bank's crossfade seconds. A browser lets a page sound only after the player touched it, so it
// starts on the first touch or key; it fades out over the bank's crossfade when the page leaves for a battle. Without
// a bank the page keeps the music it has (none: silent).
import { audioContext } from './sound.js';

/** The bank the room page plays. */
export const ROOM_MUSIC = 'sys.ON_MULTIV3_LOADED';
/** The bank 阵地足球锦标's pages play (页面-11). */
export const CUP_MUSIC = 'sys.ON_ACTIVITY_LOADED.act1football';

/** @typedef {{ intro: string | null, loop: string, volume: number, crossfade: number }} MusicBank */

/** A music bank of an audio index, or null. @param {any} index @param {string} name @returns {MusicBank | null} */
export function musicOf(index, name) {
  const m = index?.music?.[name];
  return m && typeof m.loop === 'string' ? m : null;
}

/** The room music bank of an audio index, or null. @param {any} index @returns {MusicBank | null} */
export const roomMusicOf = (index) => musicOf(index, ROOM_MUSIC);

/** A file's decoded audio, or null. @param {AudioContext} ctx @param {string} url */
const decoded = (ctx, url) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null)).catch(() => null);

/** @typedef {{ name: string, bank: MusicBank, gain: GainNode, sources: AudioBufferSourceNode[] }} Track */

/**
 * The room page's music player. `start` plays it (once); `use` changes the bank it plays (crossfading once started);
 * `volume` sets the player's music volume, 0–1; `leave` fades it out and resolves when it is quiet (at once when nothing
 * plays).
 * @param {string} base the URL of the assets' audio directory @param {number} volume the player's music volume
 */
export function createRoomMusic(base, volume) {
  /** @type {{ ctx: AudioContext, master: GainNode, index: any } | null} */
  let P = null, started = false, want = ROOM_MUSIC, level = volume;
  /** @type {Track | null} */
  let now = null;
  const ready = fetch(new URL('index.json', base)).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((index) => {
    const ctx = index?.music ? audioContext() : null;
    if (!ctx) return null;
    const master = ctx.createGain();
    master.gain.value = level;
    master.connect(ctx.destination);
    P = { ctx, master, index };
    return P;
  });
  /** Fades a track out over its bank's crossfade and stops it. @param {AudioContext} ctx @param {Track} t */
  const fadeOut = (ctx, t) => {
    const at = ctx.currentTime;
    t.gain.gain.setValueAtTime(t.gain.gain.value, at);
    t.gain.gain.linearRampToValueAtTime(0, at + t.bank.crossfade);
    for (const s of t.sources) s.stop(at + t.bank.crossfade + 0.05);
  };
  /** Plays a bank — its intro, then its loop —, fading in over its crossfade when another played before. @param {string} name */
  const play = async (name) => {
    const p = await ready, bank = p ? musicOf(p.index, name) : null;
    if (!p || !bank || now?.name === name) return;
    await p.ctx.resume();
    const [intro, loop] = await Promise.all([bank.intro ? decoded(p.ctx, new URL(bank.intro, base).href) : null, decoded(p.ctx, new URL(bank.loop, base).href)]);
    if (!loop || want !== name) return;
    const gain = p.ctx.createGain(), at = p.ctx.currentTime + 0.05, was = now;
    gain.connect(p.master);
    gain.gain.setValueAtTime(was ? 0 : bank.volume, at);
    if (was) { gain.gain.linearRampToValueAtTime(bank.volume, at + bank.crossfade); fadeOut(p.ctx, was); }
    /** @type {AudioBufferSourceNode[]} */
    const sources = [];
    if (intro) { const a = p.ctx.createBufferSource(); a.buffer = intro; a.connect(gain); a.start(at); sources.push(a); }
    const b = p.ctx.createBufferSource();
    b.buffer = loop;
    b.loop = true;
    b.connect(gain);
    b.start(at + (intro ? intro.duration : 0));
    sources.push(b);
    now = { name, bank, gain, sources };
  };
  return {
    start: () => { if (!started) { started = true; void play(want); } },
    /** The bank to play (a bank the assets lack keeps the one playing). @param {string} name */
    use: (name) => {
      if (want === name) return;
      want = name;
      if (started) void ready.then((p) => { if (p && !musicOf(p.index, name)) want = now?.name ?? want; else void play(name); });
    },
    /** @param {number} v */
    volume: (v) => { level = v; if (P) P.master.gain.value = v; },
    /** The bank playing, or null (for tests). */
    playing: () => now?.name ?? null,
    /** @returns {Promise<void>} */
    leave: () => {
      if (!P || !now || P.ctx.state !== 'running') return Promise.resolve();
      const t = now;
      fadeOut(P.ctx, t);
      return new Promise((done) => { setTimeout(done, t.bank.crossfade * 1000); });
    },
  };
}
