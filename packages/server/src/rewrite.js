// Bare import specifiers to URLs. Module Workers ignore import maps, so the server rewrites the source it serves; the
// lexer (es-module-lexer) reads real syntax, so comments and strings that mention "import" are never touched.
import { init, parse } from 'es-module-lexer';

await init;

/** A bare specifier is a package name: not relative, not absolute, not a URL. @param {string} spec */
export function isBare(spec) {
  return !spec.startsWith('.') && !spec.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(spec);
}

/**
 * A site path relative to the module at another site path (站点-1: the site may sit under any path, so what the
 * server writes into a module never starts from the root): "./x.js", "../../y/z.js".
 * @param {string} from the importing module's path, from the root ("/m/@aue/sim/src/a.js")
 * @param {string} to the imported path, from the root
 */
export function relativeUrl(from, to) {
  const a = from.split('/').slice(0, -1), b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  return (up === 0 ? './' : '../'.repeat(up)) + b.slice(i).join('/');
}

/**
 * @param {string} source
 * @param {(spec: string) => string | null} resolveUrl the URL for a bare specifier, or null when it cannot be resolved
 * @returns {string} the source with every literal bare specifier replaced
 */
export function rewriteImports(source, resolveUrl) {
  const [imports] = parse(source);
  let out = source;
  // From the end so the earlier offsets stay valid.
  for (const imp of [...imports].reverse()) {
    const spec = imp.specifier;
    const dynamic = imp.type === 'dynamic';
    if (typeof spec !== 'string' || (dynamic && imp.glob) || !isBare(spec)) continue;
    const url = resolveUrl(spec);
    if (url === null) throw new Error(`cannot resolve the bare specifier "${spec}"`);
    // A dynamic import's range includes the quotes; a static one's does not.
    const text = dynamic ? JSON.stringify(url) : url;
    out = out.slice(0, imp.start) + text + out.slice(imp.end);
  }
  return out;
}
