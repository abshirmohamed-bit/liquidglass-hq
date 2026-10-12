import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
const schema = readFileSync('drizzle/migrations/0000_agency_foundation.sql', 'utf8');
describe('Agency schema rules', () => {
  it('defaults setup fees to 30000', () => {
    expect(schema).toMatch(/setup_fee numeric NOT NULL DEFAULT 30000/);
  });
  it('defaults client status to ACTIVE', () => {
    expect(schema).toMatch(/status text NOT NULL DEFAULT 'ACTIVE'/);
  });
  it('limits thumbnail ratings to 1 through 5', () => {
    expect(schema).toMatch(/rating integer CHECK\(rating BETWEEN 1 AND 5\)/);
  });
});