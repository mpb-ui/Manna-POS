import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicFile = name => new URL(`../public/${name}`, import.meta.url);

test('screen UI declares bundled Inter fonts and a shared fallback stack', async () => {
  const [styles, index, history, invoice] = await Promise.all(
    ['styles.css', 'index.html', 'order-history.css', 'invoice-detail.css'].map(name => readFile(publicFile(name), 'utf8')),
  );
  const faces = [...styles.matchAll(/@font-face\s*\{([^}]+)}/g)].map(match => match[1]);
  const variants = [
    ['Regular', 400, 'normal'], ['Medium', 500, 'normal'], ['SemiBold', 600, 'normal'],
    ['Bold', 700, 'normal'], ['ExtraBold', 800, 'normal'],
    ['Italic', 400, 'italic'], ['SemiBoldItalic', 600, 'italic'],
  ];
  for (const [variant, weight, style] of variants) {
    const path = `fonts/inter/Inter-${variant}.woff2`;
    const face = faces.find(rule => rule.includes(`url("/${path}")`));
    assert.ok(face, `${variant} must use the bundled file`);
    assert.match(face, /font-family:\s*"Inter"\s*;/);
    assert.match(face, new RegExp(`font-weight:\\s*${weight}\\s*;`));
    assert.match(face, new RegExp(`font-style:\\s*${style}\\s*;`));
    const font = await readFile(publicFile(path));
    assert.equal(font.toString('ascii', 0, 4), 'wOF2');
    assert.equal(font.readUInt32BE(8), font.length);
  }
  const preload = index.match(/<link\b[^>]*\brel="preload"[^>]*\bhref="\/fonts\/inter\/Inter-Regular\.woff2"[^>]*>/)?.[0];
  assert.ok(preload, 'the default Inter face is preloaded');
  assert.match(preload, /\bas="font"/);
  assert.match(preload, /\bcrossorigin\b/);
  assert.match(styles, /--font-ui:\s*"Inter"\s*,\s*"Segoe UI"/);
  assert.match(styles, /body\{[^}]*font-family:var\(--font-ui\)/);
  assert.match(history, /\.order-history\{[^}]*font-family:var\(--font-ui\)/);
  assert.match(invoice, /\.invoice-detail\{[^}]*font-family:var\(--font-ui\)/);
});
