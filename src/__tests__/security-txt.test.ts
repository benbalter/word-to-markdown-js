import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// public/.well-known/security.txt (RFC 9116) must carry an Expires date, and a
// lapsed one tells researchers the contact info is stale. Workers Builds runs
// `npm test` before deploying, so an expired file fails the build instead of
// shipping quietly. Bump Expires to at most a year out when this fails.

const securityTxt = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../public/.well-known/security.txt',
  ),
  'utf8',
);

const field = (name: string): string[] =>
  [...securityTxt.matchAll(new RegExp(`^${name}: (.+)$`, 'gm'))].map(
    (m) => m[1],
  );

describe('security.txt', () => {
  it('has at least one Contact', () => {
    expect(field('Contact').length).toBeGreaterThan(0);
  });

  it('has exactly one Expires, in the future and at most a year out', () => {
    const expires = field('Expires');
    expect(expires).toHaveLength(1);
    const date = new Date(expires[0]);
    expect(Number.isNaN(date.getTime())).toBe(false);
    const daysLeft = (date.getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(0);
    expect(daysLeft).toBeLessThanOrEqual(366);
  });

  it('is canonical at word2md.com', () => {
    expect(field('Canonical')).toEqual([
      'https://word2md.com/.well-known/security.txt',
    ]);
  });
});
