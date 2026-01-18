# AGENTS.md

## Overview
- App runs on Cloudflare Pages Functions, D1, and R2.
- Frontend is React + Vite + Tailwind.

## Conventions
- Shared types: shared/types.ts
- Validators: shared/validators.ts
- API routes: functions/api/** (REST-style)
- Auth: signed cookie + sessions table; middleware gates all routes.

## Data & Migrations
- Schema in migrations/*.sql
- Always add a migration for schema changes.
- D1 bindings in wrangler.toml.

## Storage
- R2 uploads go under user-specific key prefixes.
- Enforce MIME sniffing + size limits.

## UI
- Pages under src/pages
- Reusable components under src/components
- Keep styling consistent with index.css

## Deployment
- Build output: dist
- Cloudflare Pages env vars for secrets
