import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { ForbiddenError } from '@/shared/lib/errors';
import { verifyPassword } from '@/features/auth/password';
import { destroyCurrentSession } from '@/shared/auth/session';
import { deleteOwnAccount } from '@/features/users/account-data';
import type { MutationContext } from '@/shared/api/mutation-context';

/**
 * Amit a felhasználó a saját fiókjával tehet.
 *
 * Az adatexport és a törlés mechanikája az `account-data.ts`-ben van; itt az áll,
 * hogy mikor szabad megtenni, és mi kerül a naplóba. A kettő szándékosan külön:
 * a „mit jelent törölni egy fiókot" kérdés adatvédelmi döntés, a „ki törölheti"
 * pedig hozzáférési.
 */

export interface ProfileUpdate {
  displayName: string;
  bio?: string | null | undefined;
  avatarUrl?: string | null | undefined;
}

/**
 * A saját profil frissítése.
 *
 * Szándékosan szűk: megjelenített név, bemutatkozás, avatár. Az e-mail, a
 * felhasználónév, a szerepkör és az állapot mind saját folyamaton át változik,
 * mert mindegyiknek van mellékhatása (újra-megerősítés, egyediség,
 * jogosultság-ellenőrzés), amit egy általános „profil mentése" rossz helyen
 * érvényesítene.
 */
export async function updateOwnProfile(update: ProfileUpdate, context: MutationContext) {
  const updated = await db.user.update({
    where: { id: context.actor.id },
    data: {
      displayName: update.displayName,
      bio: update.bio,
      avatarUrl: update.avatarUrl,
    },
    select: { id: true, displayName: true, bio: true, avatarUrl: true },
  });

  await context.audit({
    action: 'UPDATE',
    entityType: 'User',
    entityId: context.actor.id,
    summary: 'Profil frissítve',
    before: { displayName: context.actor.displayName },
    after: { displayName: update.displayName },
  });

  return updated;
}

/**
 * Értesítési és megjelenítési beállítások.
 *
 * JSON oszlopban tárolva, nem oszloponként: ezek felhasználónkénti felületi
 * döntések relációs jelentés nélkül, a termékkel együtt változik az alakjuk, és
 * soha semmi nem kérdez rájuk vagy összesít belőlük.
 */
export async function updateOwnPreferences(
  userId: string,
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
) {
  const merged = { ...(current ?? {}), ...patch } as Prisma.InputJsonValue;

  await db.user.update({ where: { id: userId }, data: { preferences: merged } });

  return { preferences: merged };
}

/**
 * Önkiszolgáló fióktörlés.
 *
 * A jelszót akkor is elkérjük, ha a kérés már érvényes munkamenetet hoz. Egy
 * munkamenet lehet egy nyitva felejtett böngésző; ez az egyetlen visszavonhatatlan
 * művelet az oldalon, tehát olyat kérdez, amit csak a tulajdonos tud.
 *
 * A naplóbejegyzés a törlés **előtt** készül, mert utána nincs kire hivatkozni —
 * és mivel az `actorId` `SetNull`, a sor a törlés után is megmarad, olvasható
 * összefoglalóval.
 */
export async function eraseOwnAccount(password: string, context: MutationContext) {
  const record = await db.user.findUniqueOrThrow({
    where: { id: context.actor.id },
    select: { passwordHash: true, email: true },
  });

  if (!(await verifyPassword(password, record.passwordHash))) {
    throw new ForbiddenError('A jelszó nem egyezik.');
  }

  await context.audit({
    action: 'DELETE',
    entityType: 'User',
    entityId: context.actor.id,
    summary: `Fiók törölve a tulajdonos kérésére: ${record.email}`,
  });

  const { comments } = await deleteOwnAccount(context.actor.id);

  // A munkamenet-sorok már nincsenek; ez a rájuk mutató sütiket törli, hogy a
  // böngésző ne a következő kérésben mutasson be egy már nem létező fiókhoz
  // tartozó azonosítót.
  await destroyCurrentSession();

  return { deleted: true, anonymisedComments: comments };
}
