import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Runs public/page-reveal.js in a small fake page and fires the browser's navigation events at it.
const source = readFileSync(new URL('../public/page-reveal.js', import.meta.url), 'utf8');

function page(href: string, opts: { from?: string; referrer?: string; reduce?: boolean } = {}) {
  const classes = new Set<string>();
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const docListeners: Record<string, ((e: any) => void)[]> = {};
  const on = (map: typeof listeners) => (type: string, fn: (e: any) => void) => { (map[type] ||= []).push(fn); };
  const window: any = {
    addEventListener: on(listeners),
    matchMedia: () => ({ matches: !!opts.reduce }),
    navigation: opts.from ? { activation: { from: { url: opts.from } } } : undefined,
  };
  const document: any = {
    referrer: opts.referrer || '',
    documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } },
    addEventListener: on(docListeners),
    removeEventListener: () => {},
  };
  vm.runInNewContext(source, { window, document, location: new URL(href), URL, setTimeout: () => 0 });
  const fire = (type: string, e: any) => (listeners[type] || []).forEach((fn) => fn(e));
  return { window, classes, fire };
}

function transition() {
  const t = { skipped: false, skipTransition() { t.skipped = true; } };
  return t;
}

test('decides which moves get the reveal', () => {
  const { window } = page('https://mooon.site/opac.html');
  const type = window.__moonPageReveal.revealType;
  assert.equal(type('https://mooon.site/opac.html?q=x', 'https://mooon.site/dashboard/'), 'opac-to-studio');
  assert.equal(type('https://mooon.site/opac.html', 'https://mooon.site/moon/?record=1'), 'opac-to-studio');
  assert.equal(type('https://mooon.site/records/', 'https://mooon.site/opac.html'), 'studio-to-opac');
  assert.equal(type('https://mooon.site/dashboard/', 'https://mooon.site/moon/'), '');
  assert.equal(type('https://mooon.site/opac.html', 'https://mooon.site/opac.html?work=2'), '');
  assert.equal(type('https://example.org/opac.html', 'https://mooon.site/dashboard/'), '');
  assert.equal(type('', 'https://mooon.site/dashboard/'), '');
});

test('OPAC to dashboard plays the card and the heading lift', () => {
  const p = page('https://mooon.site/dashboard/', { from: 'https://mooon.site/opac.html' });
  const vt = transition();
  p.fire('pagereveal', { viewTransition: vt });
  assert.equal(vt.skipped, false);
  assert.ok(p.classes.has('vt-opac-to-studio'));
  assert.ok(p.classes.has('vt-plain'));
  assert.ok(p.classes.has('moon-revealed'));
});

test('Back from the Studio to the OPAC plays the card in reverse', () => {
  const p = page('https://mooon.site/opac.html', { from: 'https://mooon.site/dashboard/' });
  const vt = transition();
  p.fire('pagereveal', { viewTransition: vt });
  assert.ok(p.classes.has('vt-studio-to-opac'));
  assert.ok(!p.classes.has('moon-revealed'));
});

test('falls back to the referrer when the Navigation API is missing', () => {
  const p = page('https://mooon.site/dashboard/', { referrer: 'https://mooon.site/opac.html' });
  p.fire('pagereveal', { viewTransition: transition() });
  assert.ok(p.classes.has('vt-opac-to-studio'));
});

test('every other navigation is skipped and left as it was', () => {
  const p = page('https://mooon.site/moon/', { from: 'https://mooon.site/dashboard/' });
  const vt = transition();
  p.fire('pagereveal', { viewTransition: vt });
  assert.equal(vt.skipped, true);
  assert.equal(p.classes.size, 0);
});

test('reduced motion keeps only the browser fade', () => {
  const p = page('https://mooon.site/dashboard/', { from: 'https://mooon.site/opac.html', reduce: true });
  const vt = transition();
  p.fire('pagereveal', { viewTransition: vt });
  assert.equal(vt.skipped, false);
  assert.ok(!p.classes.has('vt-opac-to-studio'));
  assert.ok(!p.classes.has('moon-revealed'));
});

test('the old page drops named parts before its picture, and clears them when restored', () => {
  const p = page('https://mooon.site/opac.html');
  p.fire('pageswap', { viewTransition: transition() });
  assert.ok(p.classes.has('vt-plain'));
  p.fire('pageshow', { persisted: true });
  assert.equal(p.classes.size, 0);
});
