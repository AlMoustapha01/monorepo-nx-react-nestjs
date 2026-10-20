import { z } from 'zod';

export const cursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});
export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export const cursorPageSchema = <TItem extends z.ZodType>(item: TItem) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
export type CursorPage<TItem> = { items: TItem[]; nextCursor: string | null };
