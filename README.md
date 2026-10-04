# Trivia Ops

## Architecture Summary
- Hosting: Cloudflare Pages with Functions.
- Frontend: React + Vite + Tailwind (`src/pages`, `src/components`, styling in `src/index.css`).
- Backend: REST-style API routes in `functions/api/**`.
- Data: Cloudflare D1 with schema/migrations in `migrations/*.sql`.
- Storage: Cloudflare R2 for media uploads (audio/image).
- Auth: Signed cookie + sessions table, enforced by middleware on all routes.
- Shared: Types in `shared/types.ts`, validators in `shared/validators.ts`.

## Development
- Install deps: `pnpm install`
- Run dev server: `pnpm run dev`

## Database Migrations (D1)
- Apply locally: `npx wrangler d1 migrations apply trivia_ops --local`
- Apply to Cloudflare (remote): `npx wrangler d1 migrations apply trivia_ops --remote`

## Release Checklist
- Apply D1 migrations (local + remote as appropriate).
- Verify production/preview bindings for D1 + R2.
- Confirm required env vars are set in Pages (SESSION_SECRET, OPENAI_API_KEY, APP_BASE_URL, ZEPTO_*).
- Smoke test login, public join, and event run flow.

## AI Tool Prompts (Examples)

### Bulk import
```
Q: Which planet is known as the Red Planet?
A: Mars

Q: Who painted the Mona Lisa?
A: Leonardo da Vinci
```

### Single answer
```
Single-answer trivia about volcanoes. count: 10
```

### Multiple choice
```
Easy general knowledge questions about 90s music. count: 10
```

### Music bulk upload (parse instructions)
Standard:
```
Titles look like "Ordinal - Artist - Song". Use two answers:
Use ordinal for question number.
Answer 1 = Song, Answer 2 = Artist. Leave factoid empty.
```

Mashup:
```
Filenames look like "{ordinal} - {artist_1} & {artist_2} - {song}". Use two answers:
Answer 1 = artist_1, Answer 2 = artist_2. Put the song title in the factoid.
Flag anything ambiguous for review.
```

Covers:
```
Titles look like "Ordinal - Song - Cover Artist - Original Artist". Use Ordinal as question number, Song as answer 1, Cover Artist as answer 2,
Original Artist as answer 3
```

### Music catalog JSON download

On the Music Dashboard, **Download catalog JSON** exports the complete non-deleted
music catalog, independent of dashboard filters or event usage. Draft, published,
and archived editions are included. The authenticated admin endpoint is
`GET /api/music-catalog`.

The pretty-printed JSON has `schema_version`, `exported_at`, and nested
`games → editions → songs → answer_parts`. Edition codes use the game code and
zero-padded edition number (for example `ATM005`). Each answer part contains its
label, answer, and points; unknown legacy points are `null`. Original prompts,
answers, factoids, and captions are retained because older song titles can live
in those fields. Empty games and editions remain visible. Audio, completion
status, and event history are not included. Records never added to the database
cannot appear in this export.

Run catalog tests with `npm run test:music-catalog`.
