import { z } from 'zod';
import { cuid, text } from '@/shared/validation/common';

/** Az író saját szerkesztése — ugyanaz a hossz-szabály, mint az új hozzászólásnál. */
export const commentEditSchema = z.object({ body: text(2, 2000, 'A hozzászólás') });

export const commentCreateSchema = z
  .object({
    body: text(2, 2000, 'A hozzászólás'),
    parentId: cuid.nullable().optional(),
    projectId: cuid.nullable().optional(),
    episodeId: cuid.nullable().optional(),
    newsPostId: cuid.nullable().optional(),
  })
  .refine(
    (data) => [data.projectId, data.episodeId, data.newsPostId].filter(Boolean).length === 1,
    { message: 'Pontosan egy célt kell megadni.', path: ['projectId'] },
  );
