export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSION_SECRET: string;
  SESSION_TTL_HOURS: string;
  OPENAI_API_KEY: string;
  AI_DEFAULT_MODEL?: string;
  ZEPTO_API_KEY?: string;
  ZEPTO_FROM?: string;
  ZEPTO_FROM_NAME?: string;
  ZEPTO_API_URL?: string;
  APP_BASE_URL?: string;
  DEBUG?: string;
};
