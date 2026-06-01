import { z } from 'zod';

export const BookmarkCreate = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(512).default(''),
  description: z.string().max(8192).default(''),
  notes: z.string().max(65536).default(''),
  tag_names: z.array(z.string().min(1).max(64)).max(64).default([]),
  is_archived: z.boolean().optional().default(false),
  unread: z.boolean().optional().default(false),
  shared: z.boolean().optional().default(false)
});
export type BookmarkCreate = z.infer<typeof BookmarkCreate>;

export const BookmarkUpdate = z.object({
  url: z.string().url().max(2048).optional(),
  title: z.string().max(512).optional(),
  description: z.string().max(8192).optional(),
  notes: z.string().max(65536).optional(),
  tag_names: z.array(z.string().min(1).max(64)).max(64).optional(),
  is_archived: z.boolean().optional(),
  unread: z.boolean().optional(),
  shared: z.boolean().optional()
});
export type BookmarkUpdate = z.infer<typeof BookmarkUpdate>;

export const BookmarkListQuery = z.object({
  q: z.string().max(1024).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(200).optional().default(30),
  archived: z.union([z.literal('true'), z.literal('false'), z.literal('only')]).optional()
});
export type BookmarkListQuery = z.infer<typeof BookmarkListQuery>;

export const TagCreate = z.object({
  name: z.string().min(1).max(64)
});
export type TagCreate = z.infer<typeof TagCreate>;
