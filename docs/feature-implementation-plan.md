# Feature Implementation Plan

Drafted implementation blueprint for features suggested for Trust CRM.
Each entry lists scope, DB, backend, frontend, and effort. Items marked ✅ are implemented.

## ✅ 1. Global Search (command palette) — DONE
- Backend: `backend/src/routes/search.js` mounted at `/api/search`, searches contacts, transactions, receipts, compliance.
- Frontend: `frontend/src/components/GlobalSearch.jsx` in Header, Ctrl+K shortcut.

## 2. Donations & 80G tax certificates
- DB: `donations` table (donor_id, amount, date, campaign, purpose, payment_mode, transaction_id); extend `donation_receipts` with certificate_number, issued_at.
- Backend: `backend/src/routes/donations.js` (CRUD + `/certificate/:id` PDF via exports infra); reuse `reports` PDF helpers.
- Frontend: `frontend/src/pages/Donations.jsx` (list, create, issue certificate), add to Nav "Donations" under Compliance.
- Effort: M. Infra (PDF, receipts) already exists.

## 3. Events & registrations
- DB: `events` (title, description, start_at, end_at, location, capacity), `event_registrations` (event_id, contact_id, status, attended).
- Backend: `backend/src/routes/events.js` CRUD + register/attend endpoints; webhook already at `webhookWebsiteEvent.js`.
- Frontend: `frontend/src/pages/Events.jsx` calendar + registration list.
- Effort: M.

## 4. Contact tags/segments + bulk messaging
- DB: `contact_tags`, `contact_tag_map` (many-to-many); segment saved queries.
- Backend: tag CRUD on contacts route; bulk send endpoints reusing `/api/whatsapp/send` and `/api/mail/send`.
- Frontend: tag chips in Contacts, filter by tag, "Send to segment" action.
- Effort: M.

## 5. Compliance alerts & reminders
- Backend: cron job (extend `backend/src/cron`) scanning compliance_items due within 7 days; send via WhatsApp/mail; store in `notifications`.
- DB: `notifications` (user_id, type, title, body, read_at, link).
- Frontend: bell icon in Header with dropdown + `/notifications` page.
- Effort: M.

## 6. Budget vs actual reporting
- Backend: aggregate transactions by function/budget period in `reports.js`; add `/reports/budget-variance`.
- Frontend: chart/table on Reports page; alert when over budget.
- Effort: S.

## 7. Donation campaigns / fundraising goals
- DB: `campaigns` (name, goal_amount, start, end, description); link donations.campaign_id.
- Backend: CRUD + progress aggregate.
- Frontend: `frontend/src/pages/Campaigns.jsx` with progress bars; public share link.
- Effort: M.

## 8. Volunteer management
- DB: `volunteers` (contact_id, skills, availability), `volunteer_shifts`.
- Backend + Frontend page; reuse contacts.
- Effort: M.

## 9. Asset/inventory tracking
- DB: `assets` (name, category, value, location, purchase_date, depreciation).
- Backend + Frontend; depreciation integrates with chart of accounts.
- Effort: L.

## 10. Two-factor auth / session security
- Use Supabase MFA (TOTP) APIs; add enrollment UI in profile; enforce for admin.
- Effort: M (depends on Supabase MFA availability).

## 11. Dark mode
- Add theme context + Tailwind dark variants; persist in localStorage/profile.
- Effort: M (touches many components).

## 12. Audit diff view
- Store before/after JSON in `activity_log` (extend `logActivity`); render diff in ActivityLog page.
- Effort: S.

## Suggested order
1. Donations & 80G (high value, infra ready)
2. Compliance alerts (quick win, reuses cron)
3. Contact tags + bulk messaging (engagement)
4. Events (community engagement)
5. Budget variance (reporting)
6. Campaigns, volunteers, assets (growth)
7. 2FA, dark mode, audit diff (polish)
