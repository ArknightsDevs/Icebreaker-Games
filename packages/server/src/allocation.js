// Operator allocation (docs/spec/room.md 房间-4, 房间-5): which seat keeps an operator both squads hold, the turns of
// picking the contested high-priority ones, and the operators each seat may field — its high-priority ones, half its
// low-priority pool drawn at random, 2–6 more with at least 2 temporary recruits. Pure: the random numbers come in.

/** @typedef {import('@icebreaker/mode-regular').Squad} Squad @typedef {import('@icebreaker/mode-regular').BoxEntry} BoxEntry */
/**
 * The picking of contested high-priority operators: those left, the seat that picks now, where the turns stand in the
 * first-second-second-first round, and whether this turn was handed over (then it cannot be handed back).
 * @typedef {{ left: string[], first: number, at: number, by: number, yielded: boolean, won: [string[], string[]] }} Picking
 */
/**
 * What coordination leaves each seat: the high-priority operators it keeps for sure, its low-priority pool, and the
 * picking of the contested ones (none when there are none).
 * @typedef {{ kept: [string[], string[]], pools: [string[], string[]], picking: Picking | null }} Coordination
 */

/** A list shuffled in place by Fisher–Yates with the given random numbers. @template T @param {T[]} list @param {() => number} random */
export function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const ids = (/** @type {BoxEntry[]} */ list) => list.map((e) => e.id);

/** The seat whose turn is at `at` of the first-second-second-first round. @param {number} first @param {number} at */
const roundSeat = (first, at) => ([0, 3].includes(at % 4) ? first : 1 - first);

/**
 * Coordination of two squads (房间-4): one seat's high against the other's low goes to the high side, the low side's
 * pool loses it; both low: dealt to one side at random; both high: picked in turns, the first picker at random.
 * @param {[Squad, Squad]} squads @param {() => number} random @returns {Coordination}
 */
export function coordinate(squads, random) {
  const high = squads.map((s) => ids(s.high)), low = squads.map((s) => ids(s.low));
  const contested = high[0].filter((id) => high[1].includes(id));
  /** @type {[string[], string[]]} */
  const kept = [high[0].filter((id) => !contested.includes(id)), high[1].filter((id) => !contested.includes(id))];
  /** @type {[string[], string[]]} */
  const pools = [low[0].filter((id) => !high[1].includes(id)), low[1].filter((id) => !high[0].includes(id))];
  for (const id of pools[0].filter((x) => pools[1].includes(x))) {
    const loser = random() < 0.5 ? 0 : 1;
    pools[loser] = pools[loser].filter((x) => x !== id);
  }
  if (contested.length === 0) return { kept, pools, picking: null };
  const first = random() < 0.5 ? 0 : 1;
  return { kept, pools, picking: { left: contested, first, at: 0, by: first, yielded: false, won: [[], []] } };
}

/**
 * A pick of a contested operator by the seat whose turn it is; null when it may not. @param {Picking} p @param {number} seat
 * @param {string} id @returns {Picking | null}
 */
export function pick(p, seat, id) {
  if (seat !== p.by || !p.left.includes(id)) return null;
  /** @type {[string[], string[]]} */
  const won = [[...p.won[0]], [...p.won[1]]];
  won[seat].push(id);
  return { ...p, left: p.left.filter((x) => x !== id), at: p.at + 1, by: roundSeat(p.first, p.at + 1), yielded: false, won };
}

/**
 * The seat whose turn it is hands this turn to the other (房间-4): only with at least 2 left, and not a turn it was
 * handed; null when it may not. @param {Picking} p @param {number} seat @returns {Picking | null}
 */
export function handOver(p, seat) {
  if (seat !== p.by || p.yielded || p.left.length < 2) return null;
  return { ...p, by: 1 - p.by, yielded: true };
}

/**
 * What a seat may field (房间-5): from its pool, half (rounded down) drawn at random; then 2–6 more from the temporary
 * recruits and the rest of its pool, at least 2 of them recruits.
 * @param {string[]} pool @param {string[]} recruits @param {() => number} random @returns {{ drawn: string[], extra: string[] }}
 */
export function offer(pool, recruits, random) {
  const order = shuffle([...pool], random), drawn = order.slice(0, Math.floor(pool.length / 2)), rest = order.slice(drawn.length);
  const temps = shuffle([...recruits], random), n = 2 + Math.floor(random() * 5);
  const sure = temps.slice(0, Math.min(2, temps.length)), more = shuffle([...temps.slice(sure.length), ...rest], random);
  return { drawn, extra: [...sure, ...more.slice(0, Math.max(0, n - sure.length))] };
}
