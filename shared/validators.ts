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
  game_type_id: idSchema,
  description: z.string().nullable().optional(),
  subtype: z.string().nullable().optional(),
  default_settings_json: z.string().nullable().optional()
});

export const gameUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  game_type_id: idSchema.optional(),
  description: z.string().nullable().optional(),
  subtype: z.string().nullable().optional(),
  default_settings_json: z.string().nullable().optional()
});

const editionStatusSchema = z.enum(['draft', 'published', 'archived']);
const eventStatusSchema = z.enum(['planned', 'live', 'completed', 'canceled']);
const eventRoundStatusSchema = z.enum(['planned', 'live', 'locked', 'completed']);
const eventTypeSchema = z.enum(['Pub Trivia', 'Music Trivia']);
const userTypeSchema = z.enum(['admin', 'host', 'player']);

export const editionCreateSchema = z.object({
  game_id: idSchema,
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: editionStatusSchema.default('draft'),
  tags_csv: z.string().nullable().optional(),
  theme: z.string().nullable().optional(),
  timer_seconds: z.number().int().min(5).max(600).optional()
});

export const editionUpdateSchema = z.object({
  game_id: idSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: editionStatusSchema.optional(),
  tags_csv: z.string().nullable().optional(),
  theme: z.string().nullable().optional(),
  timer_seconds: z.number().int().min(5).max(600).optional()
});

const editionItemBaseSchema = z.object({
  prompt: z.string(),
  question_type: z.enum(['text', 'multiple_choice']).optional(),
  choices_json: z.array(z.string().min(1)).optional(),
  answer: z.string().min(1).optional(),
  answer_a: z.string().min(1).nullable().optional(),
  answer_b: z.string().min(1).nullable().optional(),
  answer_a_label: z.string().min(1).nullable().optional(),
  answer_b_label: z.string().min(1).nullable().optional(),
  fun_fact: z.string().nullable().optional(),
  ordinal: z.number().int().min(0),
  media_type: z.enum(['image', 'audio']).nullable().optional(),
  media_key: z.string().nullable().optional(),
  audio_answer_key: z.string().nullable().optional(),
  media_caption: z.string().nullable().optional()
});

export const editionItemCreateSchema = editionItemBaseSchema
  .refine((data) => {
    if (data.media_type === 'audio') return true;
    return data.prompt.trim().length > 0;
  }, {
    message: 'Question is required',
    path: ['prompt']
  })
  .refine((data) => {
    if (data.media_type === 'image') {
      return Boolean(data.answer);
    }
    return Boolean(data.answer) || (Boolean(data.answer_a) && Boolean(data.answer_b));
  }, {
    message: 'Provide an answer or both answer_a and answer_b',
    path: ['answer']
  })
  .refine((data) => {
    if (data.question_type !== 'multiple_choice') return true;
    return Array.isArray(data.choices_json) && data.choices_json.length >= 2 && Boolean(data.answer);
  }, {
    message: 'Multiple choice items need at least two choices and a correct answer.',
    path: ['choices_json']
  });

export const editionItemUpdateSchema = editionItemBaseSchema
  .partial()
  .refine(
    (data) =>
      data.answer !== undefined ||
      data.answer_a !== undefined ||
      data.answer_b !== undefined ||
      data.question_type !== undefined ||
      data.choices_json !== undefined ||
      data.prompt !== undefined ||
      data.fun_fact !== undefined ||
      data.ordinal !== undefined ||
      data.media_type !== undefined ||
      data.media_key !== undefined ||
      data.audio_answer_key !== undefined ||
      data.media_caption !== undefined,
    {
      message: 'No fields provided',
      path: ['answer']
    }
  );

export const eventCreateSchema = z.object({
  title: z.string().min(1),
  starts_at: z.string().min(1),
  location_id: idSchema.nullable().optional(),
  host_user_id: idSchema.nullable().optional(),
  status: eventStatusSchema.default('planned'),
  event_type: eventTypeSchema.default('Pub Trivia'),
  notes: z.string().nullable().optional()
});

export const eventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  starts_at: z.string().min(1).optional(),
  location_id: idSchema.nullable().optional(),
  host_user_id: idSchema.nullable().optional(),
  status: eventStatusSchema.optional(),
  event_type: eventTypeSchema.optional(),
  notes: z.string().nullable().optional(),
  scoresheet_key: z.string().nullable().optional(),
  scoresheet_name: z.string().nullable().optional(),
  answersheet_key: z.string().nullable().optional(),
  answersheet_name: z.string().nullable().optional()
});

export const eventRoundCreateSchema = z.object({
  round_number: z.number().int().min(1),
  label: z.string().min(1),
  scoresheet_title: z.string().min(1).optional(),
  edition_id: idSchema,
  status: eventRoundStatusSchema.default('planned')
});

export const eventRoundUpdateSchema = z.object({
  round_number: z.number().int().min(1).optional(),
  label: z.string().min(1).optional(),
  scoresheet_title: z.string().min(1).optional(),
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

export const aiGenerateSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  max_output_tokens: z.number().int().min(1).max(2000).optional()
});

export const imageAnswerSchema = z.object({
  media_key: z.string().min(1),
  prompt: z.string().min(1).optional()
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

export const publicJoinSchema = z.object({
  team_id: idSchema.optional(),
  team_name: z.string().min(1).optional()
});

export const roundScoreSchema = z.object({
  team_id: idSchema,
  score: z.number().int()
});

export const roundScoresUpdateSchema = z.object({
  scores: z.array(roundScoreSchema).min(1)
});

export const liveStateUpdateSchema = z.object({
  active_round_id: idSchema.nullable().optional(),
  current_item_ordinal: z.number().int().min(1).nullable().optional(),
  reveal_answer: z.boolean().optional(),
  reveal_fun_fact: z.boolean().optional(),
  waiting_message: z.string().optional().nullable(),
  waiting_show_leaderboard: z.boolean().optional(),
  waiting_show_next_round: z.boolean().optional(),
  timer_started_at: z.string().nullable().optional(),
  timer_duration_seconds: z.number().int().min(5).max(600).nullable().optional()
});

export type LocationCreate = z.infer<typeof locationCreateSchema>;
export type GameCreate = z.infer<typeof gameCreateSchema>;
export type EditionCreate = z.infer<typeof editionCreateSchema>;
export type EditionItemCreate = z.infer<typeof editionItemCreateSchema>;
export type EventCreate = z.infer<typeof eventCreateSchema>;
export type EventRoundCreate = z.infer<typeof eventRoundCreateSchema>;
export type TeamCreate = z.infer<typeof teamCreateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
