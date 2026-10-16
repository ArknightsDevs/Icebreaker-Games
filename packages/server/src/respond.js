// Response helpers shared by the module and static handlers: strong ETag, 304, HEAD, and the fixed headers.
import { createHash } from 'node:crypto';

/** @param {Buffer | string} body @returns {string} a strong ETag */
export function etagOf(body) {
  return `"${createHash('sha256').update(body).digest('hex')}"`;
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {string} message */
export function sendText(res, status, message) {
  const body = Buffer.from(`${message}\n`);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** @param {import('node:http').ServerResponse} res @param {import('./paths.js').Rejection} r */
export function sendRejection(res, r) {
  sendText(res, r.status, r.message);
}

/**
 * GET and HEAD only; answers 405 otherwise.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true when the method is allowed
 */
export function allowReadOnly(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  res.setHeader('Allow', 'GET, HEAD');
  sendText(res, 405, 'method not allowed');
  return false;
}

/** @param {string | undefined} header @param {string} etag */
function matches(header, etag) {
  if (header === undefined) return false;
  return header.split(',').some((t) => {
    const tag = t.trim().replace(/^W\//, '');
    return tag === '*' || tag === etag;
  });
}

/**
 * 200 with the body (no body for HEAD), or 304 when If-None-Match has the ETag.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ body: Buffer, type: string, etag?: string, cache?: string }} o `cache`: the Cache-Control (default no-cache)
 */
export function sendBody(req, res, o) {
  const etag = o.etag ?? etagOf(o.body);
  /** @type {import('node:http').OutgoingHttpHeaders} */
  const headers = { ETag: etag, 'Cache-Control': o.cache ?? 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  if (matches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  headers['Content-Type'] = o.type;
  headers['Content-Length'] = o.body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : o.body);
}
