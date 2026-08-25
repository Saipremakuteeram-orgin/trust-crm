# Nav Reorder Feature — Implementation Plan

## Goal
Let Admin and Accountant users drag-to-reorder the left sidebar navigation into any order they
prefer. The chosen order is saved **per user on the server** and restored on every login/device.
Viewers see the (default or their last-saved) order but **cannot** reorder.

## Decisions (confirmed with user)
- **Scope:** One flat draggable list of *all visible* nav items (no separate managers). The user can
  place any link anywhere.
- **Persistence:** Backend per-user (`profiles.nav_order` JSONB) via a service-role endpoint.
  RLS already blocks non-admins from updating `profiles`, and accountant must be allowed to reorder,
  so saving must use `supabaseAdmin` (service role) with explicit role gating at the route.

## Current behavior (context)
- `frontend/src/components/Nav.jsx` renders three groups: `links` (all roles), `roleLinks`
  (admin/accountant), `adminLinks` (admin only) as separate `.map` blocks.
- `backend/src/middlewares/auth.js` exports `requireAuth` and `requireRole(...roles)`.
- `profiles` table has only `id, full_name, role, created_at` (schema.sql:12). No `nav_order`.
- Frontend has **no** DnD library → use native HTML5 drag-and-drop (no new dependency).

## Implementation

### 1. DB migration — `backend/supabase/nav-order-migration.sql` (new)
```sql
alter table public.profiles add column if not exists nav_order jsonb;
comment on column public.profiles.nav_order is 'User-ordered array of nav route paths';
```
User must run this on Supabase (and on local DB if used). No RLS change needed (write goes through
service role).

### 2. Backend endpoint — `backend/src/routes/profile.js` (new)
- `GET /api/profile/nav-order` → `requireAuth`. Returns `{ success:true, order: profile.nav_order || [] }`.
- `PUT /api/profile/nav-order` → `requireAuth` + `requireRole('admin','accountant')` (viewer → 403).
  Body `{ order: string[] }`. Validate `Array.isArray(order)` and every element is a non-empty string
  (reject otherwise with 400). Update via `supabaseAdmin.from('profiles').update({ nav_order: order }).eq('id', req.user.id)`. Return the saved order.
- Export router.

### 3. Mount route — `backend/src/server.js`
Add `app.use('/api/profile', require('./routes/profile'));` alongside the other `app.use('/api/...')`
lines (near the reports mount).

### 4. Frontend — `frontend/src/components/Nav.jsx` (rewrite render + logic)
- Build the **combined visible list** (in default order) by concatenating `links`,
  `roleLinks.filter(l => l.roles.includes(role))`, and (`isAdmin ? adminLinks : []`). Keep each item's
  `to` as the stable key.
- Load saved order: on mount, `api.get('/profile/nav-order')` → `savedOrder`. Compute the rendered
  list = `savedOrder` filtered to currently-visible items, then append any visible items missing from
  `savedOrder` (in default order). This keeps correctness when role changes or new links are added.
- **Editing gating:** `const canReorder = role === 'admin' || role === 'accountant'`.
- **Edit toggle:** show a "Reorder" / "Done" button (and a "Reset to default" button while editing)
  only when `canReorder`. State: `editing` (bool), `order` (current array of paths).
- **Drag-and-drop (native):** each row = a flex container holding a grip handle (`GripVertical` from
  `lucide-react`) + the `NavLink`. Make **only the grip handle `draggable`** and put `onDragStart`
  (store dragged index) on it; put `onDragOver`/`onDrop` on the row to perform the swap. This prevents
  the link itself from becoming the drag source so navigation clicks still work.
  - On drop: reorder `order`, set state, and `PUT /api/profile/nav-order` with the new array.
- **Viewer:** render merged order, no handles, no buttons, no DnD.
- Keep the existing active-route styling; just drive it from the single ordered list.
- Reuse the existing axios instance (`import { api } from "../lib/api"` — confirm path; used by
  Reports.jsx etc.).

### 5. Reset to default
"Reset to default" → `PUT /api/profile/nav-order` with `{ order: [] }` (or `null`) → render falls back to
default order.

## Files
- **New:** `backend/supabase/nav-order-migration.sql`, `backend/src/routes/profile.js`
- **Edit:** `backend/src/server.js`, `frontend/src/components/Nav.jsx`
- **No change:** `AuthContext.jsx` (nav order fetched directly in Nav via API).

## Edge cases / failure modes
- New link added later (not in saved order) → appended at end in default order.
- Role downgrade (admin→accountant) → admin-only paths filtered out of render; saved array keeps them
  harmlessly.
- Network save fails → keep optimistic local order; surface a small error (console + optional toast).
  Reload still reads last successful server state.
- Invalid payload → 400; viewer attempt → 403.

## Validation
1. Run migration SQL on Supabase; verify `nav_order` column exists.
2. Backend: `node -e "require('module-alias/register'); require('@/routes/profile')"` loads; curl
   `PUT /api/profile/nav-order` with admin token → 200; with viewer token → 403; with bad body → 400.
3. Frontend: `cd frontend && npm run lint` (oxlint) passes; `npm run build` succeeds.
4. Manual: login as Admin → "Reorder" appears → drag items → reload → order persists. Login as Viewer
   → no "Reorder" button, order fixed. "Reset to default" restores default order.
