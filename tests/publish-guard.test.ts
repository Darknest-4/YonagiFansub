import { describe, expect, it } from 'vitest';
import { assertPublishAllowed, mutationContext } from '@/server/admin/context';
import { ForbiddenError } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Publish authorisation.
 *
 * `project:publish`, `release:publish` and `news:publish` are the entire
 * difference between the `staff` and `editor` roles. The guard they hang on is
 * easy to get subtly wrong in a way no page would reveal — a staff member would
 * simply be able to publish — so the transition table is asserted directly.
 */

function actor(permissions: string[]): SessionUser {
  return {
    id: 'u1',
    email: 'a@b.hu',
    username: 'a',
    displayName: 'A',
    avatarUrl: null,
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    roleKey: 'staff',
    roleName: 'Staff',
    roleRank: 40,
    roleColor: null,
    permissions,
    preferences: {},
  };
}

function contextFor(permissions: string[]) {
  return mutationContext(actor(permissions), {
    ipHash: null,
    userAgent: null,
    requestId: 'test',
  });
}

const WRITER = contextFor(['project:write']);
const PUBLISHER = contextFor(['project:write', 'project:publish']);
const OWNER = contextFor(['*']);

const allow = (context: ReturnType<typeof contextFor>, next: string, current?: string | null) =>
  expect(() => assertPublishAllowed(context, 'project:publish', next, current)).not.toThrow();

const deny = (context: ReturnType<typeof contextFor>, next: string, current?: string | null) =>
  expect(() => assertPublishAllowed(context, 'project:publish', next, current)).toThrow(
    ForbiddenError,
  );

describe('assertPublishAllowed — without the publish permission', () => {
  it('allows creating and editing anything that is not published', () => {
    allow(WRITER, 'DRAFT');
    allow(WRITER, 'ARCHIVED');
    allow(WRITER, 'DRAFT', 'ARCHIVED');
    allow(WRITER, 'ARCHIVED', 'DRAFT');
  });

  it('allows editing a published entity without changing its status', () => {
    // Fixing a typo on a live page is a write, not a publishing decision.
    allow(WRITER, 'PUBLISHED', 'PUBLISHED');
  });

  it('refuses to publish — on create and on update', () => {
    deny(WRITER, 'PUBLISHED');
    deny(WRITER, 'PUBLISHED', 'DRAFT');
    deny(WRITER, 'PUBLISHED', 'ARCHIVED');
  });

  it('refuses to unpublish, which is a publishing decision too', () => {
    deny(WRITER, 'DRAFT', 'PUBLISHED');
    deny(WRITER, 'ARCHIVED', 'PUBLISHED');
  });

  it('explains which direction was refused', () => {
    expect(() => assertPublishAllowed(WRITER, 'project:publish', 'PUBLISHED', 'DRAFT')).toThrow(
      /publikáláshoz/,
    );
    expect(() => assertPublishAllowed(WRITER, 'project:publish', 'DRAFT', 'PUBLISHED')).toThrow(
      /visszavonásához/,
    );
  });
});

describe('assertPublishAllowed — with the permission', () => {
  it('allows every transition', () => {
    for (const [next, current] of [
      ['PUBLISHED', undefined],
      ['PUBLISHED', 'DRAFT'],
      ['DRAFT', 'PUBLISHED'],
      ['ARCHIVED', 'PUBLISHED'],
    ] as const) {
      allow(PUBLISHER, next, current);
      allow(OWNER, next, current);
    }
  });
});

describe('assertPublishAllowed — permission scoping', () => {
  it('does not accept a different resource’s publish permission', () => {
    const newsOnly = contextFor(['project:write', 'news:publish']);
    deny(newsOnly, 'PUBLISHED', 'DRAFT');
  });
});
