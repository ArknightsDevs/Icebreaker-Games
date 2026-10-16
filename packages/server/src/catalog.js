// What the lobby tells a page about team play (docs/spec/room.md): each project with its level's code and name (engine
// 关卡-4), class, the tasks of its two stages (关卡-5), its description and the activity's missions for it (shown at 项目确认); the
// temporary recruits as box entries.
import { LEVELS, loadTraining } from '@aue/content';
import { ACTIVITY, DETAILS, MISSIONS, PROJECTS, recruitEntries } from '@icebreaker/mode-regular';

/** @typedef {import('@icebreaker/mode-regular').Project & { code: string, name: string, stages: { title: string, basic: string, advanced?: string, seconds: number }[], missions: readonly string[], detail: string }} ProjectView */

/** The MVP's projects as the lobby shows them. @returns {ProjectView[]} */
export function projectViews() {
  return PROJECTS.map((p) => {
    const lv = LEVELS[p.level].level;
    return { ...p, code: lv.code, name: lv.name, stages: lv.stages.map((/** @type {any} */ s) => ({ ...s.task, seconds: s.time })), missions: MISSIONS[p.level] ?? [], detail: DETAILS[p.level] ?? '' };
  });
}

/** The temporary recruits as box entries, each skill they have at the recruit's level. */
export async function recruits() {
  const counts = new Map();
  for (const r of ACTIVITY.recruits) counts.set(r.id, (await loadTraining(r.id)).skills.length);
  return recruitEntries((id) => counts.get(id) ?? 0);
}
