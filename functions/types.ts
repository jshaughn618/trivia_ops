export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSION_SECRET: string;
  SESSION_TTL_HOURS: string;
  OPENAI_API_KEY: string;
  AI_DEFAULT_MODEL?: string;
  DEBUG?: string;
};
