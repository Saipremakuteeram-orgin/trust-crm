# Mobile Redesign for Trust CRM (v2)

## Goal
Replace the existing `/m/*` mobile layer with a clean, phone-first design. The new layer is not a stripped-down port of the desktop pages — it has its own information architecture, its own visual language, and its own capture flow optimized for one-handed use. Desktop app is untouched.

## Resolved decisions
- **Auth:** email + password (Supabase). After successful login, prompt to enable biometric (Face ID / fingerprint). After that, the app unlocks via biometric once per 30 days; otherwise the email+password screen reappears.
- **Primary jobs supported:** all four — capture, status check, contact lookup, function review. Home is action-first but also shows balance + recent activity.
- **Capture speed:** one-tap Log. The center of the bottom tab bar is a raised Log button. Tapping it opens a 3-step inline quick-log form (Type, Amount, Details) with a custom in-app numeric pad and pre-filled values from the last transaction.
- **Navigation:** bottom tab bar — Home, Money, People, Inbox, More. Center is a raised Log button (not a real tab).
- **Home composition:** action-first. Greeting + balance → huge Log CTA + 2 secondary actions → 5 most-recent transactions → "This month" row with income/expense/net.
- **Lists:** sticky filter chips at the top (Today / This week / This month / Custom) + virtualized feed of cards. Tap a card to expand inline (no full-page detail). Long-press for quick actions.
- **Detail/edit:** inline. No full-page detail routes for routine items. Long-press or pencil icon switches the row into edit mode.
- **Form:** 3-step inline. Step 1: Type (credit/debit big toggle). Step 2: Amount (custom numeric pad, auto-focused). Step 3: Party/Category/Mode/Function/Voucher/Receipt/Notes in one scrollable area. Sticky bottom Save button.
- **Numeric pad:** custom 3x4 in-app pad, larger targets, no predictive text interference.
- **Receipts:** camera-first. In step 3, a "Camera" button opens the device camera, snaps a photo, auto-attaches. Upload happens in the background after Save.
- **Modules:**
  - WhatsApp: keep iframe, dedicated screen with back button.
  - Mail / File Send / Drive: send-only on mobile. Pick recipients, attach a file, send. No inbox browsing, no drive browsing.
  - Spreadsheet, Trial Balance, Reports, Bank Reconciliation: hard-decline with a "Open on desktop" deep-link card. No fake preview.
- **Role handling:** role-aware empty states. No in-app role switcher. Viewer sees read-only home with a "Request access" placeholder.
- **Pre-fill:** remember last party, category, mode, function. Stored in `localStorage` under a versioned key.
- **Offline:** cache home KPIs and last 100 transactions in `localStorage` on every successful load. Offline banner if `navigator.onLine === false`. Writes are disabled when offline (no queue to keep scope small). On reconnect, the banner clears and the next load re-fetches.
- **Backend:** use existing endpoints. No new routes.
- **Cutover:** atomic. Remove the old `/m` pages and components, install the new design in the same files/dirs, one commit, one push.
- **Look & feel:** calm, generous whitespace, `rounded-3xl` cards, soft shadows, subtle gradient accents on KPI tiles, indigo/violet background tones, saffron as accent only.

## File layout (final state)
```
frontend/src/mobile/
  MobileApp.jsx                    # route tree, all /m/* paths
  MobileShell.jsx                  # header + content + bottom tab bar
  MobileHeader.jsx                 # safe-area top bar
  BottomTabBar.jsx                 # Home / Money / People / [Log] / Inbox / More
  CenterLogButton.jsx              # raised Log action that opens quick-log sheet
  design/
    tokens.js                      # spacing, radius, shadow, motion tokens
  hooks/
    useBiometric.js                # WebAuthn-style biometric (where supported) fallback to localStorage
    useOnlineStatus.js             # navigator.onLine + window events
    usePreFill.js                  # last-used form values
    useCachedFeed.js               # in-memory + localStorage feed cache
  components/
    Card.jsx                       # rounded-3xl soft-shadow container
    Chip.jsx                       # pill button (used for filter chips)
    KpiRow.jsx                     # small KPI row (3 numbers)
    BalanceHero.jsx                # big balance tile
    LogButton.jsx                  # giant primary action
    SecondaryActions.jsx           # Add contact, New receipt
    SectionTitle.jsx
    EmptyState.jsx                 # role-aware empty state
    OfflineBanner.jsx
    FilterChips.jsx                # horizontal filter chip strip
    FeedCard.jsx                   # transaction card (expandable inline)
    ContactCard.jsx
    FunctionCard.jsx
    NumericPad.jsx                 # custom 3x4 amount entry
    QuickLogSheet.jsx              # bottom-sheet quick-log (3-step)
    CameraButton.jsx               # input capture=environment, posts to /transactions/:id/receipt
    ProfileMenu.jsx                # avatar dropdown (kept from v1, refined)
    InboxList.jsx                  # notifications + activity + approvals feed
    MoreGrid.jsx                   # grouped sections (admin/accountant scope)
    DeepLinkCard.jsx               # "Open on desktop" CTA
  pages/
    MobileLogin.jsx
    MobileHome.jsx                 # the new action-first home
    MobileMoney.jsx                # transactions: filter chips + virtualized feed
    MobilePeople.jsx               # contacts: search + alphabetical sections
    MobileInbox.jsx                # notifications + activity + approvals
    MobileMore.jsx                 # grouped secondary sections
    MobileFunctions.jsx            # list
    MobileFunctionDetail.jsx       # inline summary + recent transactions
    MobileRecurring.jsx
    MobileWhatsApp.jsx             # iframe inside a screen
    MobileMail.jsx                 # send-only
    MobileFileSend.jsx             # send-only
    MobileDrive.jsx                # send-only (upload a file at root)
    MobileUsers.jsx                # admin only, mobile-friendly list
    MobileBackupLogs.jsx           # admin only, mobile-friendly
    MobileNotAvailable.jsx         # deep-link placeholder for Spreadsheet / Trial Balance / Reports / Bank Reconciliation
```

## Routing (final)
- `/m/login` — MobileLogin
- `/m/` and `/m` — redirect to `/m/home` (or `/m/login` if no session)
- `/m/home` — MobileHome
- `/m/money` — MobileMoney
- `/m/people` — MobilePeople
- `/m/inbox` — MobileInbox
- `/m/more` — MobileMore
- `/m/functions` — MobileFunctions
- `/m/functions/:id` — MobileFunctionDetail
- `/m/recurring` — MobileRecurring
- `/m/whatsapp` — MobileWhatsApp
- `/m/mail` — MobileMail
- `/m/file-send` — MobileFileSend
- `/m/drive` — MobileDrive
- `/m/users` — MobileUsers (admin)
- `/m/backup` — MobileBackupLogs (admin)
- `/m/spreadsheet`, `/m/trial-balance`, `/m/ledger`, `/m/ledger/:id`, `/m/reports`, `/m/bank-reconciliation`, `/m/compliance` — MobileNotAvailable (with deep link)
- Unknown `/m/*` → `/m/home`

## Component contracts (concise)
- `MobileShell` — renders `MobileHeader` (title from route, no logo in chrome) + `<main>` + `BottomTabBar`. Owns the `OfflineBanner` and the `QuickLogSheet` mount. `QuickLogSheet` is mounted once at the shell and triggered by a global `openLog()` from `useQuickLog()`.
- `BottomTabBar` — 6 slots, 5 labels. The center slot is a `CenterLogButton` (raised, saffron). Tabs: Home, Money, People, Inbox, More. `aria-current` on the active item.
- `NumericPad` — controlled component with value + onChange. Buttons: 1-9, 0, ., ⌫. Long-press ⌫ clears. Has a Done button to dismiss the pad.
- `QuickLogSheet` — 3 visible steps in one scrollable area; sticky header shows the current step and a progress dot row; sticky bottom Save. Uses `NumericPad` for the amount field.
- `FeedCard` — props: `txn`, `onLongPress`, `expanded` (controlled), `onToggleExpand`, `onEdit`, `onDelete`. Expanded state shows full detail + Edit pencil inline.
- `ContactCard` — props: `contact`, `onTap` (call/message/email), `onLongPress` (edit/delete).
- `EmptyState` — props: `icon`, `title`, `message`, `role` (admin/accountant/viewer). Renders a different CTA based on role and the empty context.
- `OfflineBanner` — listens to `useOnlineStatus`. Renders a top-anchored ribbon when offline.

## Data flow
- Auth: existing Supabase flow. New `useBiometric` checks `localStorage.biometricEnabled` and, when true, attempts `navigator.credentials.get` with a publicKey credential created at enrollment. On success, reuses the existing Supabase session from `localStorage`. On failure (no support / denied), fall back to password.
- API: existing `api` axios client. No new endpoints. The home reads `/dashboard/summary`, `/analytics`, `/dashboard/recurring-commitment`, `/transactions?limit=20` in parallel.
- Pre-fill: `usePreFill()` writes last-used `{ type, party, category_id, mode, function_id }` to `localStorage.trustCrmPreFill` after every successful save.
- Cache: `useCachedFeed()` stores `homePayload` and `txnsLast20` in `localStorage.trustCrmFeedCache` with a timestamp. On load, hydrate from cache instantly, then refetch in the background and re-render when the response arrives.
- Offline: writes are disabled when offline. The Save button is replaced with an "Offline" pill that explains why.
- Camera: `CameraButton` uses `<input type="file" accept="image/*" capture="environment">`. On select, posts the file as `multipart/form-data` to the existing `/transactions/:id/receipt` endpoint after the transaction is saved. If the user snaps a photo before saving, hold the file in component state and upload after save.

## Visual tokens (`design/tokens.js`)
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48
- Radius: `xl=16`, `2xl=20`, `3xl=28`, `full`
- Shadow: `soft = 0 8px 24px -8px rgba(67,56,202,0.10)`, `lift = 0 16px 40px -12px rgba(67,56,202,0.18)`
- Motion: 180ms ease-out for hovers, 280ms spring for sheets, 120ms for taps
- Colors: keep existing saffron/royal/emerald/rose from `index.css`. Background `#f8fafc` (stone-50) by default. Surface `#ffffff`. Subtle gradient `from-royal-50/40 to-saffron-50/30` for the balance hero.

## Accessibility
- 44x44px minimum tap targets everywhere.
- `aria-current` on active tabs and the active filter chip.
- `aria-label` on icon-only buttons; visible labels on the bottom tab bar.
- Reduced-motion: already handled globally in `index.css`.
- Numeric Pad has both visual and `aria-live` updates for screen readers.

## Out of scope (explicit)
- No backend changes. No new endpoints.
- No PWA / install / service worker.
- No new third-party dependencies. Custom numeric pad is plain React + Tailwind.
- No changes to the desktop app.
- No new analytics or telemetry.

## Risks
- WebAuthn biometric is not supported in all browsers (Safari iOS requires HTTPS, some Android browsers don't ship it). Fallback to a "remember me" toggle + password is mandatory.
- Camera capture from `<input capture="environment">` opens the native camera on most devices but presents a file picker on a few. Acceptable.
- Removing the old mobile layer breaks the `/m/*` URLs for users on the current build until the new build is deployed. Since `/m` is gated by `getIsMobile()` and the desktop redirect exists, the blast radius is small.
- Pre-fill from the last transaction may surprise users who expect a clean form. Mitigate with a "Reset" link in the form.
- Offline writes are disabled (not queued) to keep scope honest. Document this in the empty-state copy and the offline banner.

## Validation
- `npm run build` succeeds. Each mobile page is its own code-split chunk.
- Smoke (manual): log in → home renders → tap center Log → quick-log a transaction → success toast + new card appears at the top of Money. Re-open the app → biometric prompts. Toggle airplane mode → offline banner appears; Save button disables.
- Density: home weighs < 12 KB gzip, Money < 10 KB gzip, quick-log sheet < 6 KB gzip.
- Reduced-motion: open DevTools "Emulate prefers-reduced-motion: reduce" → no animated transitions, sheets appear instantly.
- Desktop redirect: load `/m/home` on a 1440px window → redirects to `/dashboard`.

## Implementation task order
1. Delete old `/m` pages and components (keep `MobileApp.jsx`, `MobileShell.jsx`, `MobileHeader.jsx`, `BottomTabBar.jsx`, `ProfileMenu.jsx` to be rewritten, drop the rest).
2. Add `design/tokens.js`, `hooks/useBiometric.js`, `hooks/useOnlineStatus.js`, `hooks/usePreFill.js`, `hooks/useCachedFeed.js`, plus a `useQuickLog()` global trigger.
3. Add base components: `Card`, `Chip`, `KpiRow`, `BalanceHero`, `LogButton`, `SecondaryActions`, `SectionTitle`, `EmptyState`, `OfflineBanner`, `FilterChips`, `DeepLinkCard`, `NumericPad`, `QuickLogSheet`, `CameraButton`.
4. Rewrite `MobileHeader` for the new design (no logo in chrome, refined back button, profile menu on the right).
5. Rewrite `BottomTabBar` with 5 real tabs + center raised Log button.
6. Rewrite `MobileShell` to mount `QuickLogSheet` once and wire `OfflineBanner`.
7. Build `MobileLogin` (with biometric enrollment prompt on first success).
8. Build `MobileHome`.
9. Build `MobileMoney` (filter chips + virtualized feed + inline expand + inline edit).
10. Build `MobilePeople`.
11. Build `MobileInbox` (combines notifications, activity log, approvals into one feed; admin/accountant only).
12. Build `MobileMore` (grouped sections; deep-link items render `MobileNotAvailable`).
13. Build `MobileFunctions`, `MobileFunctionDetail`, `MobileRecurring`.
14. Build `MobileWhatsApp` (iframe + back), `MobileMail` (send-only), `MobileFileSend` (send-only), `MobileDrive` (upload at root).
15. Build `MobileUsers` (admin) and `MobileBackupLogs` (admin) as mobile-friendly lists.
16. Build `MobileNotAvailable` and wire it to the 6 deep-link-only routes.
17. Add CSS tokens to `index.css` under a new mobile section (or rely on Tailwind utilities referencing the existing palette).
18. `npm run build`, fix any issues, smoke test.
