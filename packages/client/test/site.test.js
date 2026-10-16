// The site under any path (docs/spec/site.md 站点-1): the page's URLs come from its own address, and no page source
// or page file names a path from the root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { assetsUrl, siteUrl, socketUrl } from '../src/site.js';

test('[站点-1] site URLs and socket URLs follow the page, under a prefix or at the root', () => {
  for (const prefix of ['', '/icebreaker']) {
    const page = `https://x.test${prefix}/play?match=ab&seat=1`;
    assert.equal(siteUrl('assets/skeleton/', page).href, `https://x.test${prefix}/assets/skeleton/`);
    assert.equal(siteUrl('room', page).href, `https://x.test${prefix}/room`);
    assert.equal(socketUrl('battle?seat=1', page), `wss://x.test${prefix}/battle?seat=1`);
    assert.equal(socketUrl('lobby', `http://192.168.1.2:8700${prefix}/`), `ws://192.168.1.2:8700${prefix}/lobby`);
  }
});

test('[站点-3] the asset base is the one the page names, else assets/skeleton/', () => {
  const page = 'https://x.test/icebreaker/play?seat=0';
  const doc = (/** @type {string | null} */ content) => ({ querySelector: () => (content === null ? null : { getAttribute: () => content }) });
  assert.equal(assetsUrl(doc('assets/~0123456789ab/skeleton/'), page).href, 'https://x.test/icebreaker/assets/~0123456789ab/skeleton/');
  assert.equal(assetsUrl(doc(null), page).href, 'https://x.test/icebreaker/assets/skeleton/');
  assert.equal(assetsUrl(undefined, page).href, 'https://x.test/icebreaker/assets/skeleton/');
});

test('[站点-1] no page source, page or style sheet names a path from the root', () => {
  const rooted = /new URL\('\/|location\.host\b|href = '\/|href: `\/|`\/(play|room|lobby|battle)\b|(href|src)="\/(?!\/)|url\(["']?\/(?!\/)/;
  for (const sub of ['../src/', '../public/']) {
    const dir = new URL(sub, import.meta.url);
    for (const f of readdirSync(dir).filter((x) => /\.(js|html|css)$/.test(x))) {
      const hit = rooted.exec(readFileSync(new URL(f, dir), 'utf8'));
      assert.equal(hit, null, `${sub}${f} has ${hit?.[0]}`);
    }
  }
});
