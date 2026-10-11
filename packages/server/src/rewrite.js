// Bare import specifiers to URLs. Module Workers ignore import maps, so the server rewrites the source it serves; the
// lexer (es-module-lexer) reads real syntax, so comments and strings that mention "import" are never touched.
import { init, parse } from 'es-module-lexer';

await init;

/** A bare specifier is a package name: not relative, not absolute, not a URL. @param {string} spec */
export function isBare(spec) {
  return !spec.startsWith('.') && !spec.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(spec);
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
