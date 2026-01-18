import { z } from 'zod';

export const idSchema = z.string().min(1);

export const emailSchema = z.string().email();
export const passwordSchema = z.string().min(6);

export const locationCreateSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const locationUpdateSchema = locationCreateSchema.partial();

export const gameCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  default_settings_json: z.string().nullable().optional()
});

export const gameUpdateSchema = gameCreateSchema.partial();

const editionStatusSchema = z.enum(['draft', 'published', 'archived']);
const eventStatusSchema = z.enum(['planned', 'live', 'completed', 'canceled']);
const eventRoundStatusSchema = z.enum(['planned', 'live', 'locked']);
const userTypeSchema = z.enum(['admin', 'host', 'player']);

export const editionCreateSchema = z.object({
  game_id: idSchema,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: editionStatusSchema.default('draft'),
  tags_csv: z.string().nullable().optional()
});

export const editionUpdateSchema = z.object({
  game_id: idSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: editionStatusSchema.optional(),
  tags_csv: z.string().nullable().optional()
});

export const editionItemCreateSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  fun_fact: z.string().nullable().optional(),
  ordinal: z.number().int().min(0),
  media_type: z.enum(['image', 'audio']).nullable().optional(),
  media_key: z.string().nullable().optional(),
  media_caption: z.string().nullable().optional()
});

export const editionItemUpdateSchema = editionItemCreateSchema.partial();

export const eventCreateSchema = z.object({
  title: z.string().min(1),
  starts_at: z.string().min(1),
  location_id: idSchema.nullable().optional(),
  status: eventStatusSchema.default('planned'),
  notes: z.string().nullable().optional()
});

export const eventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  starts_at: z.string().min(1).optional(),
  location_id: idSchema.nullable().optional(),
  status: eventStatusSchema.optional(),
  notes: z.string().nullable().optional()
});

export const eventRoundCreateSchema = z.object({
  round_number: z.number().int().min(1),
  label: z.string().min(1),
  edition_id: idSchema,
  status: eventRoundStatusSchema.default('planned')
});

export const eventRoundUpdateSchema = z.object({
  round_number: z.number().int().min(1).optional(),
  label: z.string().min(1).optional(),
  edition_id: idSchema.optional(),
  status: eventRoundStatusSchema.optional()
});

export const teamCreateSchema = z.object({
  name: z.string().min(1),
  table_label: z.string().nullable().optional()
});

export const teamUpdateSchema = teamCreateSchema.partial();

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const mediaUploadSchema = z.object({
  kind: z.enum(['image', 'audio'])
});

export const userCreateSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: z.string().min(1).optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  user_type: userTypeSchema.default('host')
});

export const userUpdateSchema = z.object({
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  username: z.string().min(1).optional().nullable(),
  first_name: z.string().min(1).optional().nullable(),
  last_name: z.string().min(1).optional().nullable(),
  user_type: userTypeSchema.optional()
});

export type LocationCreate = z.infer<typeof locationCreateSchema>;
export type GameCreate = z.infer<typeof gameCreateSchema>;
export type EditionCreate = z.infer<typeof editionCreateSchema>;
export type EditionItemCreate = z.infer<typeof editionItemCreateSchema>;
export type EventCreate = z.infer<typeof eventCreateSchema>;
export type EventRoundCreate = z.infer<typeof eventRoundCreateSchema>;
export type TeamCreate = z.infer<typeof teamCreateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
