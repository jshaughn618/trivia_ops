export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSION_SECRET: string;
  SESSION_TTL_HOURS: string;
};
