# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**context-os** is an "external working memory OS" — a full-stack Next.js task management system where AI proposes and humans confirm. The core philosophy: **AI suggests, App validates, humans decide**. Nodes are the single domain entity; their state (15 statuses) determines their role.

## Commands

```bash
npm run dev          # Dev server (localhost:3000)
npm run dev:open     # Dev with 0.0.0.0 binding (for WSL access)
npm run build        # Production build
npm run lint         # ESLint check
npm test             # Run all Vitest tests once
npm run test:watch   # Vitest in watch mode
```

To run a single test file:
```bash
npx vitest run src/lib/phase5Diff/validator.test.ts
```

## Architecture

### Layer Separation (docs/10_Architecture.md)

```
User → LLM (ChatGPT/MCP) → Application Server (Next.js API Routes) → Supabase (PostgreSQL+RLS)
```

**Critical principle**: The Application Server is the *sole* place where business rules execute and state transitions are validated. The LLM only *proposes*; the API *confirms*.

### State Machine (`src/lib/stateMachine.ts`)

The single source of truth for 15 node statuses (CAPTURED → CLARIFYING → READY → IN_PROGRESS → DELEGATED → WAITING_EXTERNAL → SCHEDULED → BLOCKED → NEEDS_DECISION → NEEDS_REVIEW → COOLING → DORMANT → REACTIVATED → DONE → CANCELLED). All API routes that change status must go through this module's transition validation.

### Tree Data Structure (`src/lib/dashboardTree.ts`)

Builds hierarchical `TreeNode` objects from flat DB rows. Parent-child links come from `node_children` table (explicit, takes priority) with `parent_id` as fallback. Cycle detection enforces MAX_DEPTH=5.

### Diff Pipeline (`src/lib/phase5Diff/`)

For AI-proposed structural changes (relations, groupings, decomposition):
1. `validator.ts` — business rule checks
2. `transform.ts` — converts organizer proposals to DB operations
3. Applied via `/api/diffs/*` routes

### Authentication & RLS

- Supabase SSR with cookie-based sessions (`src/lib/supabase/server.ts` for API routes, `src/lib/supabase/client.ts` for browser)
- Row-Level Security enforces `user_id` isolation at the DB level
- Route protection: logic in `src/proxy.ts` (redirects `/dashboard` to `/login` when unauthenticated). Next middleware that invokes it may not be wired; see docs/140 §10 and docs/134 for current state.
- API routes use service role key for admin operations; most use `getSupabaseAndUser()` to enforce auth

### Key Database Tables

| Table | Purpose |
|---|---|
| `nodes` | Core entity — title, context, status, due_date, user_id |
| `node_children` | Explicit parent-child links (priority over `parent_id`) |
| `node_links` | Cross-references between nodes |
| `relations` | Semantic typed relationships |
| `groups` | Named groupings with node_ids[] |
| `recurring_rules` | Scheduled task generation (daily/weekly/monthly, JST) |
| `node_status_history` | Audit trail of status changes |
| `confirmation_events` | User interaction events |

### Recurring Tasks

`src/lib/recurringRun.ts` handles scheduled task generation. Triggered by Vercel Cron at 21:00 UTC daily (`/api/recurring/run`). All time calculations use JST.

### Theme System

Dark/light mode via CSS custom properties in `src/app/theme-tokens.css`. Theme resolution logic in `src/lib/theme.ts`. Layout runs an inline init script to avoid flash.

## Code Organization

- `src/app/api/` — API routes (Next.js App Router)
- `src/components/` — Client-side React components (7 files; `ProposalPanel.tsx` is the largest at ~97KB)
- `src/lib/` — Core business logic (state machine, tree, diff pipeline, recurring, theme)
- `src/lib/supabase/` — Supabase client factories (server vs. browser)
- `supabase/migrations/` — SQL migrations (applied manually via Supabase dashboard or CLI)
- `docs/` — Phase-based design docs and E2E results

## Documentation Conventions

New markdown files in `docs/` must follow the naming convention from `docs/00_naming_convention.md`:
```
{sequential_number}_{english_snake_case}.md
```
Use half-width alphanumeric and underscores only (no hyphens, spaces, or full-width characters).

## Testing

Test files live alongside source: `src/**/*.test.ts`. There are 5 test files covering `dashboardTree`, `phase5Diff` (validator + transform), `proposalQuality/validator`, and `api/tree/move/validate`. The vitest config uses Node environment and the `@/*` path alias resolving to `src/`.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key (browser)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-only)
- `OPENAI_API_KEY` — For proposal quality pipeline and organizer/observer/advisor agents
- Observer token (check `src/app/api/observer/` for the expected header)
