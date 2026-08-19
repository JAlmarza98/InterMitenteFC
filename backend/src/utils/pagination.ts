import { z } from "zod";

// Optional and backward-compatible: omit both and a list endpoint returns
// everything, exactly as before. Passing `limit` opts a caller into paging.
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toSkipTake({ page, limit }: Pagination): { skip?: number; take?: number } {
  if (!limit) return {};
  const currentPage = page ?? 1;
  return { take: limit, skip: (currentPage - 1) * limit };
}
