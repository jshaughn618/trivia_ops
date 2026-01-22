# Trivia Ops

## Development
- Install deps: `npm install`
- Run dev server: `npm run dev`

## Database Migrations (D1)
- Apply locally: `npx wrangler d1 migrations apply trivia_ops --local`
- Apply to Cloudflare (remote): `npx wrangler d1 migrations apply trivia_ops --remote`
