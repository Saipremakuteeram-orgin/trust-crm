# Mobile-Optimized UI/UX Layer for Trust CRM

## Goal
Ship a separate, phone-first UI/UX for the existing Trust CRM, sharing the same backend, auth, and API client. Desktop app stays untouched. Mobile users get a fast, thumb-friendly experience; dense desktop pages get a focused summary view with a clear handoff to desktop.

## Architectural decisions (resolved)
- **Relationship:** Same repo, separate route layer under `/m/*`. No backend changes.
- **Routing:** New `MobileApp.jsx` mounted in `App.jsx` with `useMatch("/m/*")` to render the mobile tree for any URL starting with `/m`.
- **Auth:** Reuse `useAuth` / `api` / `supabase` from `src/lib/*`. Mobile login is `/m/login`; protected routes share the same Supabase session.
- **Layout:** `MobileShell` = `SafeArea` top + `MobileHeader` (title, back, profile) + page content + `BottomTabBar` (fixed). Detected via `(window.matchMedia('(max-width: 768px)').matches || /Mobi|Android/i.test(navigator.userAgent))`; non-phones that hit `/m` are auto-redirected to the matching desktop route.
- **Navigation pattern:** Bottom tab bar (Dashboard, Transactions, Contacts, Reports, More). `More` opens an action sheet grouped by category (Accounting, Trust, Communication, Admin, Tools).
- **Home (mobile Dashboard):** Action-first cards.
  - Top: swipeable KPI strip (4 tiles: Balance, Income, Expense, Net Change). Tap opens `TransactionListModal` (reuse).
  - Middle: horizontal "Quick actions" row (New transaction, Add contact, Send file, WhatsApp, Spreadsheet, New receipt).
  - Bottom: one compact sparkline (income vs expense, last 6 months) + one category pie, then a 5-row "Recent activity" feed.
- **Dense desktop pages on mobile:** Read-only summary + deep link.
  - `TrialBalance`, `GeneralLedger` (per-account), `Spreadsheet`, `Reports` get a `MobileDensePlaceholder` component that calls the same read endpoint, shows 5-10 most relevant rows in a mobile card list, shows key totals, and renders a "Open full view on desktop" card with a copyable URL and QR code (optional, SVG, no dep).
  - Mutations (edit cells, run reports, generate PDFs) are hidden, not broken.

## File layout (all new)
```
frontend/src/
  mobile/
    MobileApp.jsx                       # /m/* route tree
    MobileShell.jsx                     # header + content + bottom tabs
    MobileHeader.jsx                    # title, back, profile menu
    BottomTabBar.jsx                    # 5 tabs + More sheet
    MoreSheet.jsx                       # grouped secondary nav
    hooks/
      useIsMobile.js                    # SSR-safe viewport check
      useApi.js                         # thin wrapper over api w/ mobile loading states
    components/
      KPITile.jsx
      KPISwiper.jsx                     # horizontal swipe via scroll-snap
      QuickAction.jsx
      QuickActionRow.jsx
      Sparkline.jsx                     # lightweight inline SVG
      CategoryDonut.jsx                 # compact pie
      RecentActivityList.jsx
      SectionHeader.jsx
      EmptyState.jsx
      MobileDensePlaceholder.jsx        # dense-page summary + deep-link
      MobileCard.jsx                    # base card
      MobileListItem.jsx                # tappable list row
      SwipeableRow.jsx                  # left/right swipe actions
      PullToRefresh.jsx                 # touch-based refresh
    pages/
      MobileLogin.jsx                   # reuses Login logic
      MobileDashboard.jsx
      MobileTransactions.jsx            # list + filters + bottom-sheet form
      MobileTransactionDetail.jsx
      MobileContacts.jsx                # list + search + bottom-sheet
      MobileContactDetail.jsx
      MobileRecurring.jsx               # list only, edit deep-links desktop
      MobileAccounts.jsx                # tree view, edit deep-links desktop
      MobileJournal.jsx                 # list, new entry in bottom sheet
      MobileReceipts.jsx                # list + camera/upload
      MobileFunctions.jsx               # list + cards
      MobileGroups.jsx
      MobileReportSummary.jsx           # uses MobileDensePlaceholder
      MobileTrialBalanceSummary.jsx
      MobileLedgerSummary.jsx           # per account
      MobileSpreadsheetSummary.jsx
      MobileComplianceSummary.jsx
      MobileTrustees.jsx
      MobileBeneficiaries.jsx
      MobileWhatsApp.jsx                # full WhatsApp UI, mobile-first
      MobileFileSend.jsx                # file picker + send
      MobileMail.jsx                    # compose + inbox
      MobileDrive.jsx                   # browse + upload
      MobileUsers.jsx                   # admin only
      MobileActivityLog.jsx
      MobileBackupLogs.jsx
    lib/
      mobileNav.js                      # tab + more-sheet config w/ roles
  index.css (additive)                  # mobile utilities, see Styles
```

## Routing rules
- `/m/login` -> `MobileLogin` (unauthed)
- `/m` and `/m/` -> redirect to `/m/dashboard` if authed, else `/m/login`
- `/m/dashboard` -> `MobileDashboard`
- `/m/transactions`, `/m/transactions/:id`
- `/m/contacts`, `/m/contacts/:id`
- `/m/recurring`, `/m/accounts`, `/m/journal`, `/m/receipts`, `/m/functions`, `/m/groups`
- `/m/reports`, `/m/trial-balance`, `/m/ledger/:accountId`, `/m/spreadsheet`, `/m/compliance`
- `/m/trustees`, `/m/beneficiaries`
- `/m/whatsapp`, `/m/file-send`, `/m/mail`, `/m/drive`
- `/m/users` (admin), `/m/activity`, `/m/backup`
- Unknown `/m/*` -> `/m/dashboard`
- If a non-mobile UA lands on `/m/*`, redirect to matching desktop route (e.g. `/m/transactions` -> `/transactions`).

## Component contracts (concise)
- `MobileShell` props: `{ title, showBack, rightAction, children, scrollable=true }`. Renders safe-area, header, scroll container, bottom tab bar.
- `BottomTabBar` reads role from `useAuth`, filters tabs, opens `MoreSheet` for the 5th tab.
- `KPITile` props: `{ label, value, sub, tone, onClick }`. 120x110 min, 44px touch target.
- `MobileDensePlaceholder` props: `{ title, desktopPath, fetcher, renderSummary, renderRows }`. Shows summary, then a banner card with "Open full view" link, plus a "Copy desktop link" button. No mutation affordances.
- `PullToRefresh` wraps a scroll region; uses `touchstart`/`touchmove`/`touchend` and a 60px threshold to call `onRefresh`. No library.
- `SwipeableRow` props: `{ leftActions, rightActions, children }`. Uses pointer events; default 80px action width.
- `EmptyState` props: `{ icon, title, message, action }`. Used everywhere data may be empty.

## Data flow / API usage
- All mobile pages use the existing `api` axios instance and `useAuth`. No new endpoints.
- `MobileDashboard` reuses `/dashboard/summary` and `/analytics` (same payload the desktop uses); if `analytics` fails, render a single skeleton sparkline and continue.
- Mutations (create/update/delete) are POSTed through the same endpoints used on desktop; responses feed the same `useToast` component (mounted once in `MobileShell`).
- File uploads (`MobileReceipts`, `MobileFileSend`, `MobileDrive`) use `FormData` via the existing `api` instance; mobile pages add an explicit loading bar on the trigger button.

## States to design for
- Loading (skeleton cards, shimmer, never the full page spinner alone)
- Empty (per-page `EmptyState`)
- Error (toast + retry; no silent failures)
- Offline (banner at top: "You are offline. Cached data shown.")
- Session expired (catch 401 from `api` interceptor, redirect to `/m/login` with `?next=`).

## Styles (additive to `index.css`)
Add a `mobile` theme layer, not a rewrite:
- `.m-safe-top` / `.m-safe-bottom` -> `env(safe-area-inset-*)` padding
- `.m-tap` -> `min-height: 44px; min-width: 44px`
- `.m-card` -> `bg-white rounded-2xl border border-stone-200/80 p-4 shadow-sm`
- `.m-list` -> `divide-y divide-stone-100`
- `.m-sheet` -> `rounded-t-3xl` with slide-up keyframe (reuse existing `slideUp`)
- `.m-snap-x` -> `scroll-snap-type: x mandatory; > * { scroll-snap-align: start }`
- `.m-no-select` -> `user-select: none; -webkit-user-select: none`
- All animations gated to `prefers-reduced-motion: reduce`.

## Accessibility
- Every interactive element is a real `<button>` or `<a>` (not a `<div onClick>`).
- Tab order mirrors visual order; focus ring uses `focus-visible:ring-2 ring-saffron-500`.
- Color contrast minimum AA; saffron-on-white is borderline so use saffron-700 for body text.
- Bottom tab bar is a `<nav>` with `aria-label="Primary"`; active tab uses `aria-current="page"`.

## Out of scope (explicit)
- No backend changes.
- No new endpoints.
- No PWA install / service worker / offline cache (defer to a follow-up plan).
- No new dependencies. Everything implemented with React, existing framer-motion, recharts, lucide-react, and the existing CSS utilities.
- No redesign of the desktop app.

## Risks
- Role visibility matrix in `Nav.jsx` must be mirrored in `mobile/lib/mobileNav.js`; if a route is added later, both files need updates. Mitigation: export `allItems` from `Nav.jsx` and reuse it inside `mobileNav.js` (single source of truth).
- Bottom tab + "More" sheet duplication: only one source of truth via `mobileNav.js`.
- `MobileDashboard` charts must not regress desktop analytics if the payload shape changes; wrap access in `?.` and add a `analyticsError` path that matches the desktop implementation.
- Supabase session sharing: `supabase.auth.getSession` is global, so a desktop-tab and mobile-tab on the same browser share sessions. Acceptable; do not change.

## Validation
- `npm run build` (frontend) succeeds.
- Manual: log in at `/m/login`, confirm bottom tabs, swipe KPIs, open `More` sheet, open Transactions list, create a transaction, open Reports summary card, tap "Open full view" and confirm it routes to `/reports` while auth persists.
- Lighthouse mobile run on `/m/dashboard` for Performance and Accessibility (target >90).
- Resize test: open desktop at 360px viewport hitting `/dashboard` -> still works (unchanged). Open `/m/dashboard` at 1440px -> still renders mobile shell (intentional for design QA).
- Reduce-motion test: all animations disabled.
- Offline test: toggle DevTools "Offline", confirm banner appears and reads work from cached axios responses where available.

## Implementation task order
1. Add `mobile/` skeleton: `useIsMobile`, `MobileApp`, `MobileShell`, `BottomTabBar`, `MoreSheet`, `mobileNav` sourced from `Nav.jsx`.
2. Wire `/m/*` into `App.jsx` with the auto-redirect for non-mobile UAs.
3. Implement `MobileLogin` reusing `Login`'s form.
4. Implement `MobileDashboard` (KPI strip, quick actions, sparkline, donut, recent activity).
5. Implement list+detail+create flows: `MobileTransactions`, `MobileContacts`, `MobileJournal`, `MobileReceipts`, `MobileGroups`, `MobileRecurring`, `MobileFunctions`, `MobileAccounts`.
6. Implement trust/compliance: `MobileTrustees`, `MobileBeneficiaries`, `MobileComplianceSummary`.
7. Implement `MobileDensePlaceholder` and wire it into `MobileReportSummary`, `MobileTrialBalanceSummary`, `MobileLedgerSummary`, `MobileSpreadsheetSummary`.
8. Implement `MobileWhatsApp`, `MobileFileSend`, `MobileMail`, `MobileDrive`.
9. Admin/tools: `MobileUsers`, `MobileActivityLog`, `MobileBackupLogs`.
10. Add `index.css` mobile utilities and verify reduced-motion behavior.
11. Build, smoke test, run Lighthouse on `/m/dashboard`.
