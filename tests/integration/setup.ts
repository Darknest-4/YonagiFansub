import { afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { truncateAll } from './database';

/**
 * A clean database before every test.
 *
 * `beforeEach`, not `beforeAll`: a test that depends on rows another test
 * created is a test that passes in one order and fails in another, and the
 * second failure always arrives months later on somebody else's branch.
 *
 * Truncation rather than a transaction-per-test, because the code under test
 * opens its own transactions (`recordProgress` does), and a nested rollback
 * would not behave the way production does — which is the only reason to run
 * these against a real database at all.
 */
beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$disconnect();
});
