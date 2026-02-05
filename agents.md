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

## UI Design Direction (Readability + Linear-Inspired Cues)
- Preserve the current "ops" identity. Take cues from Linear's polish and restraint, but do not copy layouts or branded details.
- Core feel: near-black canvas, subtle atmospheric gradients, soft glow falloff, minimal visual noise.
- Surface system: 3-4 dark surface tiers with low-contrast 1px borders, gentle elevation, and occasional inner highlight for premium depth.
- Typography: use one expressive display family for major headings and one highly readable sans for UI/body text. Avoid Inter/Roboto/Arial. Keep to two families.
- Case and hierarchy: Title Case for section headers and card titles; sentence case for body copy, helper text, statuses, and control labels.
- Contrast discipline: bright text on dark surfaces, muted secondary text that stays AA-compliant, yellow reserved for primary actions/active states only.
- Layout rhythm: generous vertical spacing, clean content bands, and consistent container widths; rely on spacing over heavy dividers.
- Navigation/headers: slim, high-clarity top bars and section headers with subtle separators, not thick borders.
- Components: unified radii and control heights; filled primary buttons, restrained secondary buttons, crisp hover/focus states.
- Motion: intentional load-in reveal (fade/slide) and light hover transitions; avoid constant motion and decorative animation.
- Imagery/backgrounds: use abstract gradients, grid textures, or soft vignette layers rather than flat fills.
- Accessibility: meet WCAG AA contrast for text and interactive states, with clearly visible keyboard focus rings.

## Deployment
- Build output: dist
- Cloudflare Pages env vars for secrets

## Commiting and Applying DB Migrations
- When a set of work is completed, ask if the user would like you to apply db migrations (local and remote) and commit and push.
