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

## UI Design Direction (Readability Pass)
- Preserve the current "ops" feel: dark surfaces, tactical vibe, yellow accent.
- Prioritize readability: sentence case for body copy, fewer all-caps headings, looser letter-spacing only for short labels.
- Typography: pair a distinctive display face for headings with a highly readable sans for body. Avoid Inter/Roboto/Arial. Keep to two families.
- Color: use 3-4 surface levels, raise text contrast, reserve yellow for primary actions/active state, avoid yellow for long paragraphs.
- Layout: increase vertical rhythm, standardize paddings and gaps, reduce border noise in favor of spacing and subtle elevation.
- Components: consistent radii and control heights; primary buttons filled, secondary outlined; make focus rings obvious.
- Motion: one intentional page-load reveal and light hover transitions.
- Accessibility: meet WCAG AA contrast for text and interactive states.

## Deployment
- Build output: dist
- Cloudflare Pages env vars for secrets

## Commiting and Applying DB Migrations
- When a set of work is completed, ask if the user would like you to apply db migrations (local and remote) and commit and push.
