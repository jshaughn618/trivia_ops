export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSION_SECRET: string;
  SESSION_TTL_HOURS: string;
  PARTICIPANT_DISPLAY_SECRET?: string;
  PARTICIPANT_DISPLAY_LINK_TTL_MINUTES?: string;
  OPENAI_API_KEY: string;
  AI_DEFAULT_MODEL?: string;
  AI_GRADING_MODEL?: string;
  AI_GRADE_LOW_CONFIDENCE_THRESHOLD?: string;
  LOGIN_RATE_MAX?: string;
  LOGIN_RATE_WINDOW_SECONDS?: string;
  LOGIN_RATE_BLOCK_SECONDS?: string;
  PUBLIC_EVENT_RATE_MAX?: string;
  PUBLIC_EVENT_RATE_WINDOW_SECONDS?: string;
  PUBLIC_EVENT_RATE_BLOCK_SECONDS?: string;
  PUBLIC_JOIN_RATE_MAX?: string;
  PUBLIC_JOIN_RATE_WINDOW_SECONDS?: string;
  PUBLIC_JOIN_RATE_BLOCK_SECONDS?: string;
  PUBLIC_RESPONSE_RATE_MAX?: string;
  PUBLIC_RESPONSE_RATE_WINDOW_SECONDS?: string;
  PUBLIC_RESPONSE_RATE_BLOCK_SECONDS?: string;
  PUBLIC_AUDIO_STOP_RATE_MAX?: string;
  PUBLIC_AUDIO_STOP_RATE_WINDOW_SECONDS?: string;
  PUBLIC_AUDIO_STOP_RATE_BLOCK_SECONDS?: string;
  PUBLIC_STREAM_RATE_MAX?: string;
  PUBLIC_STREAM_RATE_WINDOW_SECONDS?: string;
  PUBLIC_STREAM_RATE_BLOCK_SECONDS?: string;
  PUBLIC_TEAM_NAME_RATE_MAX?: string;
  PUBLIC_TEAM_NAME_RATE_WINDOW_SECONDS?: string;
  PUBLIC_TEAM_NAME_RATE_BLOCK_SECONDS?: string;
  ZEPTO_API_KEY?: string;
  ZEPTO_FROM?: string;
  ZEPTO_FROM_NAME?: string;
  ZEPTO_API_URL?: string;
  APP_BASE_URL?: string;
  COOKIE_DOMAIN?: string;
  DEBUG?: string;
};

export type UserRole = 'admin' | 'host' | 'player';

export type AuthenticatedUser = {
  id: string;
  email: string;
  created_at: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  user_type: UserRole;
};

export type RequestContextData = {
  user?: AuthenticatedUser;
  requestId?: string;
};

export type AppHandler<Params extends string = any> = PagesFunction<Env, Params, RequestContextData>;
export type AppContext<Params extends string = any> = Parameters<AppHandler<Params>>[0];
export type EnvWithRequestId = Env & { __requestId?: string };
