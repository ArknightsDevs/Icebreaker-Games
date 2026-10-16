// The entry page's 3D scene (docs/spec/page.md 页面-6, engine 渲染-17): its models drawn behind the page by the engine's
// UI scene, following the page's clips (the camera moves to the room panel and back), the world-space ground mapped
// onto the floor where the camera sees it. Only when the assets have the scene's index; three.js comes with it (loaded
// then), so the room page stays light without it. Back to front: the sky's colour, the ground, the models, the page.
import { homography, matrix3d } from '@aue/ui';

/** What runs after each UI tick (the page's UI loop calls these). @type {Set<() => void>} */
export const AFTER_TICK = new Set();

/**
 * Starts the scene for an opened entry page, or null when the assets have none (the page then hides its 3D part).
 * @param {any} ui the lobby UI @param {any} scr the entry page's screen @param {string} base the URL of the UI pack's folder
 * @returns {Promise<{ stop: () => void } | null>}
 */
export async function startScene3d(ui, scr, base) {
  const res = await fetch(new URL('lobby3d/index.json', base)).catch(() => null);
  const back = scr.one('view_back'), ground = scr.one('canvas_entry_ground');
  if (!res?.ok || !back || !ground) return null;
  const [{ createUiScene }, index] = await Promise.all([import('@aue/render'), res.json()]);
  if (scr.dead) return null;
  const canvas = document.createElement('canvas');
  scr.wrap.prepend(ground.el); // out of its parents' boxes: placed by the camera alone
  ground.el.after(canvas);
  const sc = createUiScene({ canvas, root: back, scene: index, base: new URL('lobby3d/', base).href });
  const sky = sc.background ? `rgb(${sc.background.map((/** @type {number} */ v) => Math.round(v * 255)).join(',')})` : '';
  const was = ui.layer.style.background;
  ui.layer.style.background = sky;
  let size = '';
  const frame = () => {
    if (scr.dead) { stop(); return; }
    const k = ui.canvas.k, w = innerWidth, h = innerHeight;
    if (size !== `${w}x${h}x${k}`) {
      size = `${w}x${h}x${k}`;
      sc.resize(w, h, Math.min(2, devicePixelRatio));
      Object.assign(canvas.style, { position: 'absolute', left: '0px', top: '0px', width: `${w / k}px`, height: `${h / k}px`, pointerEvents: 'none' });
    }
    sc.render();
    const c = sc.corners(ground), gw = ground.el.offsetWidth || ground.n.rt.size[0], gh = ground.el.offsetHeight || ground.n.rt.size[1];
    ground.el.style.visibility = c ? '' : 'hidden';
    if (c) Object.assign(ground.el.style, { left: '0px', top: '0px', transformOrigin: '0 0',
      transform: matrix3d(homography([[0, 0], [gw, 0], [gw, gh], [0, gh]], c.map(([x, y]) => [x / k, y / k]))) });
  };
  const stop = () => { AFTER_TICK.delete(frame); sc.dispose(); canvas.remove(); ui.layer.style.background = was; };
  AFTER_TICK.add(frame);
  return { stop };
}
