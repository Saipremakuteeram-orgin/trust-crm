# Graph Report - trust-crm  (2026-10-16)

## Corpus Check
- 197 files · ~151,831 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 2, .csv 1)

## Summary
- 1459 nodes · 2969 edges · 118 communities (94 shown, 24 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 101 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Desktop App Shell
- Shared UI Primitives
- Backend Data Access
- Auth and RBAC
- Mobile Navigation
- Financial Reports UI
- App Routing and Pages
- Security and File Safety
- Notifications and Mail
- WhatsApp Session Manager
- Scheduled Report Engine
- Backup Operations UI
- Backend Package Metadata
- Server and Cron Startup
- Backend Dependencies
- Functions and Budgets UI
- Recurring Transactions
- Frontend Package Metadata
- Backup Health Service
- Webhook Logging and Auth
- Frontend Dependencies
- Transactions UI
- Google Drive Service
- Report Generation
- Login and Auth UI
- Navigation and Mobile Inbox
- Transaction API
- WhatsApp Browser Runtime
- Mail API
- WhatsApp Crypto Storage
- File Storage Service
- File Send API
- Reports API
- Recurring Transactions UI
- Contacts API
- Bank Reconciliation UI
- Compliance UI
- Mail UI
- WhatsApp Proxy
- Beneficiaries UI
- Contacts UI
- WhatsApp API
- Drive Manager UI
- Security Audit Findings
- Python Analytics
- Journal Entries UI
- Function Categories
- Anti-spam Deliverability
- Activity Log UI
- Dashboard UI
- Contact Groups UI
- Migration Runner
- Backup API
- Frontend Tooling
- Accounting Feature Plan
- Credential Rotation
- Chart of Accounts UI
- Donation Receipts UI
- Product Requirements
- Mobile Contacts
- Design Tokens
- Spreadsheet UI
- User Administration
- Trust Brand Concepts
- Deployment Runtime
- Navigation Persistence
- Budget Rules
- Mobile UX Plan
- Oxlint Configuration
- Brand Care Concepts
- WhatsApp Chat UI
- File Send UI
- Trustees UI
- PDF Branding
- Logo Motifs
- Database Smoke Test
- Email Deliverability Design
- HTML Entrypoint
- Frontend Scripts
- Vite React Tooling
- Chat Sidebar
- Mobile Drive
- Vite Build Config
- Rollback Strategy
- Navigation Order Plan
- Budget UI Removal
- Mobile Quick Log
- Python Runtime Requirements
- Favicon Design
- Hero Illustration
- Quick Log Components
- General Ledger UI
- Trial Balance UI
- Project Architecture Docs
- WhatsApp QR Flow
- Logo Identity
- React Logo Asset
- WhatsApp File Picker
- Numeric Pad
- Vercel Deployment
- Ledger Balance Concepts
- Database Setup and RLS
- PDF Logo Fix
- Function Subcategories
- Function Budget View
- Unsubscribe Workflow
- Automated Notifications
- Database Roles
- Biometric Unlock
- Suppression Filtering
- Bluesky Icon
- Discord Icon
- Documentation Icon
- GitHub Icon
- Social Icon
- X Icon
- Vite Logo

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 78 edges
2. `useToast()` - 72 edges
3. `react` - 61 edges
4. `lucide-react` - 51 edges
5. `AppLayout()` - 51 edges
6. `api` - 41 edges
7. `logActivity()` - 37 edges
8. `framer-motion` - 36 edges
9. `MobileShell()` - 35 edges
10. `useEscToClose()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `startDailyBackupCron()` --calls--> `runDailyBackup()`  [EXTRACTED]
  backend/src/cron/dailyBackup.js → backend/src/services/backup.js
- `generateAndSendMonthlyReport()` --calls--> `logActivity()`  [EXTRACTED]
  backend/src/cron/monthlyReport.js → backend/src/lib/logger.js
- `generateAndSendMonthlyReport()` --calls--> `purposeFor()`  [EXTRACTED]
  backend/src/cron/monthlyReport.js → backend/src/lib/reportBranding.js
- `generateAndSendMonthlyReport()` --calls--> `reportHeaderHtml()`  [EXTRACTED]
  backend/src/cron/monthlyReport.js → backend/src/lib/reportBranding.js
- `generateAndSendMonthlyReport()` --calls--> `fmt()`  [EXTRACTED]
  backend/src/cron/monthlyReport.js → backend/src/services/notify.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Navigation Reorder Persistence Flow** — _kilo_plans_1787641011409_nav_reorder_feature_nav_component, _kilo_plans_1787641011409_nav_reorder_feature_nav_order_get_endpoint, _kilo_plans_1787641011409_nav_reorder_feature_nav_order_put_endpoint, _kilo_plans_1787641011409_nav_reorder_feature_profile_nav_order_jsonb [EXTRACTED 1.00]
- **Anti-spam Send and Suppression Flow** — docs_superpowers_plans_2026_08_04_anti_spam_deliverability_send_email_pipeline, docs_superpowers_plans_2026_08_04_anti_spam_deliverability_unsubscribe_service, docs_superpowers_plans_2026_08_04_anti_spam_deliverability_list_unsubscribe_headers, docs_superpowers_plans_2026_08_04_anti_spam_deliverability_public_unsubscribe_routes [EXTRACTED 1.00]
- **Mobile Quick Log Architecture** — _kilo_plans_1788405110052_mobile_ui_ux_plan_mobile_shell, _kilo_plans_1788405110052_mobile_ui_ux_plan_mobile_bottom_tab_navigation, _kilo_plans_1788405110052_mobile_ui_ux_plan_quick_log_three_step_flow, _kilo_plans_1788405110052_mobile_ui_ux_plan_numeric_pad [EXTRACTED 1.00]
- **Reusable social and UI icon sprite** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]
- **Logo identity and symbolism** — backend_assets_logo_footer_sri_sai_dharma_samskarana_prema_kutiram, backend_assets_logo_footer_circular_seal, backend_assets_logo_footer_open_book_motif, backend_assets_logo_footer_rising_sun_motif [EXTRACTED 1.00]
- **Service-Centered Community Emblem** — frontend_public_logo_sri_sai_dharma_samrakshana_prema_kuteeram, frontend_public_logo_selfless_service_selfless_love, frontend_public_logo_inclusive_community_care, frontend_public_logo_shelter_and_protection, frontend_public_logo_spiritual_devotion, frontend_public_logo_nurturing_growth [INFERRED 0.85]
- **Layered Platform Composition** — frontend_src_assets_hero_upper_outline_layer, frontend_src_assets_hero_lower_purple_layer, frontend_src_assets_hero_depth_guides [EXTRACTED 1.00]
- **Emblem of service, love, and inclusive care** — logo_sri_sai_dharma_samrakshana_prema_kuteeram, logo_selfless_service, logo_selfless_love, logo_inclusive_community, logo_protective_care [INFERRED 0.85]

## Communities (118 total, 24 thin omitted)

### Community 0 - "Desktop App Shell"
Cohesion: 0.10
Nodes (37): AppLayout(), colors, icons, ToastContext, fmt(), TransactionListModal(), reportIcons, useEscToClose() (+29 more)

### Community 1 - "Shared UI Primitives"
Cohesion: 0.08
Nodes (36): ToastProvider(), useToast(), BalanceHero(), fmt(), Card(), EmptyState(), FeedCard(), fmt() (+28 more)

### Community 2 - "Backend Data Access"
Cohesion: 0.05
Nodes (46): { createClient }, supabaseAdmin, cache, getCached(), invalidate(), express, { getCached, invalidate }, { requireAuth } (+38 more)

### Community 3 - "Auth and RBAC"
Cohesion: 0.06
Nodes (43): getProfileCacheKey(), invalidateProfileCache(), profileCache, requireAuth(), requireRole(), supabaseAdmin, express, { getCached, invalidate } (+35 more)

### Community 4 - "Mobile Navigation"
Cohesion: 0.07
Nodes (37): BottomTabBar(), TABS, DeepLinkCard(), LogButton(), DENSE, getDeepLinkHref(), MobileNotAvailable(), MoreGrid() (+29 more)

### Community 5 - "Financial Reports UI"
Cohesion: 0.07
Nodes (31): BalanceSheetTab(), cardVariants, CashFlowTab(), COLORS, CustomTooltip(), DAY_NAMES, EMPTY_FORM, fmt() (+23 more)

### Community 6 - "App Routing and Pages"
Cohesion: 0.10
Nodes (33): Accounts, ActivityLog, AdminProtected(), App(), BackupLogs, BankReconciliation, Beneficiaries, Compliance (+25 more)

### Community 7 - "Security and File Safety"
Cohesion: 0.07
Nodes (27): isSafePath(), path, safeContentDisposition(), sanitizeFileName(), sanitizeHtml(), ALLOWED_MIMES, express, { isSafePath, safeErrorMessage } (+19 more)

### Community 8 - "Notifications and Mail"
Cohesion: 0.10
Nodes (28): cron, generateAndSendMonthlyReport(), { logActivity }, { reportHeaderHtml, purposeFor, TRUST_NAME }, { sendEmail, sendTelegram, fmt }, startMonthlyReportCron(), supabaseAdmin, axios (+20 more)

### Community 10 - "Scheduled Report Engine"
Cohesion: 0.13
Nodes (25): buildSummaryHtml(), buildSummaryText(), computeDateRange(), computeNextRun(), executeReport(), fetchFilteredTransactions(), { logActivity }, processDueReports() (+17 more)

### Community 11 - "Backup Operations UI"
Cohesion: 0.11
Nodes (23): actionConfig, BackupLogs(), handleBackupNow(), handleRefresh(), handleRestoreFile(), loadLogs(), categoryFields, contactFields (+15 more)

### Community 12 - "Backend Package Metadata"
Cohesion: 0.08
Nodes (24): devDependencies, nodemon, axios, exceljs, @supabase/supabase-js, main, _moduleAliases, name (+16 more)

### Community 13 - "Server and Cron Startup"
Cohesion: 0.08
Nodes (22): cron, { runDailyBackup }, startDailyBackupCron(), app, compression, cors, CORS_ORIGINS, express (+14 more)

### Community 14 - "Backend Dependencies"
Cohesion: 0.09
Nodes (23): dependencies, axios, compression, cors, dotenv, exceljs, express, express-rate-limit (+15 more)

### Community 15 - "Functions and Budgets UI"
Cohesion: 0.12
Nodes (13): fmt(), FunctionCard(), Functions(), getAvailableCategoriesForAdd(), handleDeleteItem(), handleDeleteSubCat(), handleRefresh(), handleSaveItem() (+5 more)

### Community 16 - "Recurring Transactions"
Cohesion: 0.12
Nodes (20): computeNextRun(), generateTransaction(), { logActivity }, processDueRecurring(), { safeErrorMessage }, { sendEmail, sendTelegram, fmt }, startRecurringTransactionsCron(), supabaseAdmin (+12 more)

### Community 17 - "Frontend Package Metadata"
Cohesion: 0.09
Nodes (21): axios, exceljs, @supabase/supabase-js, name, private, type, version, autoprefixer (+13 more)

### Community 18 - "Backup Health Service"
Cohesion: 0.17
Nodes (19): checkAndReinstate(), cron, { runDailyBackup, getBackupStatusToday, getIstDate }, startBackupHealthCheckCron(), axios, buildBackupWorkbook(), createLog(), DATA_TABLES (+11 more)

### Community 19 - "Webhook Logging and Auth"
Cohesion: 0.11
Nodes (14): logActivity(), supabaseAdmin, express, { logActivity }, router, supabaseAdmin, express, { logActivity } (+6 more)

### Community 20 - "Frontend Dependencies"
Cohesion: 0.10
Nodes (21): dependencies, axios, exceljs, framer-motion, lucide-react, pdfjs-dist, react, react-dom (+13 more)

### Community 21 - "Transactions UI"
Cohesion: 0.14
Nodes (14): fmt(), Transactions(), handleDelete(), handleFunctionChange(), handleReceiptRemove(), handleReceiptUpload(), handleRefresh(), handleRestoreUpload() (+6 more)

### Community 22 - "Google Drive Service"
Cohesion: 0.24
Nodes (18): copyFile(), createFolder(), getCommonFolderId(), getDrive(), getDriveApi(), getFileInfo(), getOrCreateRootFolder(), getOrCreateSubfolder() (+10 more)

### Community 23 - "Report Generation"
Cohesion: 0.17
Nodes (17): addExcelHeader(), ASSET_LOGO, drawPdfHeader(), fs, path, purposeFor(), PURPOSES, ROOT_LOGO (+9 more)

### Community 24 - "Login and Auth UI"
Cohesion: 0.18
Nodes (7): Header(), PasswordInput(), AuthContext, supabase, roleColors, MobileLogin(), Login()

### Community 25 - "Navigation and Mobile Inbox"
Cohesion: 0.17
Nodes (11): allItems, isVisible(), Nav(), useAuth(), InboxList(), MobileInbox(), fmt(), MobileRecurring() (+3 more)

### Community 26 - "Transaction API"
Cohesion: 0.12
Nodes (13): express, { logActivity }, multer, { notifyContactsOfTransaction }, RECEIPT_UPLOAD, { requireAuth, requireRole }, router, supabaseAdmin (+5 more)

### Community 27 - "WhatsApp Browser Runtime"
Cohesion: 0.13
Nodes (12): { Client, MessageMedia }, findChromeExecutable(), fs, { logActivity }, path, puppeteerArgs, RESOLVED_CHROME, { safeErrorMessage } (+4 more)

### Community 28 - "Mail API"
Cohesion: 0.12
Nodes (14): crypto, express, fs, LOG_DIR, { logActivity }, multer, path, { requireAuth, requireRole } (+6 more)

### Community 29 - "WhatsApp Crypto Storage"
Cohesion: 0.19
Nodes (12): crypto, decryptData(), deleteEncryptedSession(), ENC_KEY, encryptData(), ensureDir(), fs, getSessionPath() (+4 more)

### Community 30 - "File Storage Service"
Cohesion: 0.16
Nodes (8): saveAndNotify(), axios, downloadFile(), ensureBucket(), sendFileToTelegram(), supabaseAdmin, uploadFile(), form-data

### Community 31 - "File Send API"
Cohesion: 0.13
Nodes (13): express, fs, LOG_DIR, { logActivity }, multer, path, { requireAuth, requireRole }, router (+5 more)

### Community 32 - "Reports API"
Cohesion: 0.14
Nodes (11): { buildWorkbook }, { drawPdfHeader }, ExcelJS, express, { logActivity }, PDFDocument, { requireAuth, requireRole }, resolveRange() (+3 more)

### Community 33 - "Recurring Transactions UI"
Cohesion: 0.16
Nodes (6): DAY_NAMES, emptyForm, fmt(), formatNextRun(), frequencyLabel(), RecurringTransactions()

### Community 34 - "Contacts API"
Cohesion: 0.14
Nodes (10): CONTACT_FIELDS, CSV_UPLOAD, ExcelJS, express, { logActivity }, multer, { requireAuth, requireRole }, router (+2 more)

### Community 35 - "Bank Reconciliation UI"
Cohesion: 0.21
Nodes (10): BankReconciliation(), handleDeleteItem(), handleDeleteStatement(), handleMatchItem(), handleSaveItem(), handleSaveStatement(), handleUnmatchItem(), load() (+2 more)

### Community 36 - "Compliance UI"
Cohesion: 0.20
Nodes (8): Compliance(), handleDelete(), handleDeleteReturn(), handleSaveReturn(), handleSubmit(), load(), loadReturns(), toggleExpand()

### Community 37 - "Mail UI"
Cohesion: 0.18
Nodes (8): formatDate(), Mail(), addChip(), handleSend(), handleToKeyDown(), loadInbox(), loadLogs(), updateInboxMessage()

### Community 38 - "WhatsApp Proxy"
Cohesion: 0.22
Nodes (10): attachWebSocket(), buildForwardHeaders(), getSession(), HOP_BY_HOP, http, http2, mergeSetCookie(), proxyHandler() (+2 more)

### Community 39 - "Beneficiaries UI"
Cohesion: 0.22
Nodes (9): Beneficiaries(), handleDelete(), handleDeleteDisbursement(), handleSaveDisbursement(), handleSubmit(), load(), loadDisbursements(), toggleExpand() (+1 more)

### Community 40 - "Contacts UI"
Cohesion: 0.21
Nodes (6): Contacts(), handleBulkConfirm(), handleDelete(), handleRefresh(), handleSubmit(), load()

### Community 41 - "WhatsApp API"
Cohesion: 0.17
Nodes (11): express, { generateTransactionReport }, { logActivity }, { manager }, multer, { requireAuth, requireRole }, router, { safeErrorMessage } (+3 more)

### Community 42 - "Drive Manager UI"
Cohesion: 0.17
Nodes (4): DriveManager(), formatDate(), formatSize(), isFolder()

### Community 43 - "Security Audit Findings"
Cohesion: 0.20
Nodes (12): Layered Auth RBAC and RLS, 5000-row Backup Truncation, Competing Migration Systems, Reflect-any-HTTPS CORS, Hardcoded WhatsApp Fallback Key, Incomplete Financial Backup, Missing Automated Test Suite, Public Webhook Secret Exposure (+4 more)

### Community 44 - "Python Analytics"
Cohesion: 0.29
Nodes (5): compute_summary(), fetch_categories(), fetch_transactions(), get_client(), main()

### Community 45 - "Journal Entries UI"
Cohesion: 0.24
Nodes (6): fmt(), JournalEntries(), handleDelete(), handlePost(), handleSave(), load()

### Community 46 - "Function Categories"
Cohesion: 0.20
Nodes (9): Global Categories Endpoint, Role-aware Sub-category Editing, Sub-category Budget CRUD, Sub-category Modal, Category Creation Endpoint, Custom Sub-category Option Plan, Inline Custom Category Creation, __new__ Category Sentinel (+1 more)

### Community 47 - "Anti-spam Deliverability"
Cohesion: 0.20
Nodes (10): Anti-spam Deliverability Implementation Plan, List-Unsubscribe Headers, mail_unsubscribes Table, Public Unsubscribe Routes, Reply-To Handling, Resend Delivery, sendEmail Pipeline, SMTP Fallback (+2 more)

### Community 48 - "Activity Log UI"
Cohesion: 0.27
Nodes (9): actionColors, actionLabels, ActivityLog(), handleRefresh(), load(), entityColors, entityIcons, formatDetails() (+1 more)

### Community 49 - "Dashboard UI"
Cohesion: 0.27
Nodes (8): CustomTooltip(), Dashboard(), handleRefresh(), loadSummary(), saveBalance(), fmt(), fmtShort(), StatCard()

### Community 50 - "Contact Groups UI"
Cohesion: 0.24
Nodes (4): Groups(), handleDelete(), handleSubmit(), load()

### Community 51 - "Migration Runner"
Cohesion: 0.31
Nodes (8): fs, getAppliedMigrations(), MIGRATIONS_DIR, path, recordMigration(), removeMigrationRecord(), runMigrations(), supabaseAdmin

### Community 52 - "Backup API"
Cohesion: 0.22
Nodes (8): express, { logActivity }, { requireAuth, requireRole }, router, { runDailyBackup, getBackupLogs }, { safeErrorMessage }, supabaseAdmin, getBackupLogs()

### Community 53 - "Frontend Tooling"
Cohesion: 0.22
Nodes (9): devDependencies, autoprefixer, oxlint, postcss, tailwindcss, @types/react, @types/react-dom, vite (+1 more)

### Community 54 - "Accounting Feature Plan"
Cohesion: 0.25
Nodes (8): Bank Reconciliation, Chart of Accounts, Compliance Calendar, Donation Receipts, Double-entry Journal, General Ledger and Financial Reports, Trust CRM Implementation Plan, Trustees and Beneficiaries Registry

### Community 55 - "Credential Rotation"
Cohesion: 0.22
Nodes (9): Git History Purge, GitHub PAT Rotation, Google Service Account Key Rotation, Messaging Credential Rotation, Post-rotation Verification, Security Rotation Runbook, Supabase Service Role Key Rotation, Webhook Secret Rotation (+1 more)

### Community 56 - "Chart of Accounts UI"
Cohesion: 0.46
Nodes (8): Accounts(), getTypeStyle(), handleDelete(), handleSave(), load(), openAdd(), openEdit(), renderAccount()

### Community 57 - "Donation Receipts UI"
Cohesion: 0.36
Nodes (6): fmt(), Receipts(), handleDelete(), handlePrint(), handleSubmit(), load()

### Community 58 - "Product Requirements"
Cohesion: 0.25
Nodes (8): Trust CRM Build Specification, Contacts Entity, Definition of Done, Dual-mode Financial Ledger, Monthly Report Cron, Transaction Entity, Transaction Notifications, Vercel Render Supabase Deployment

### Community 59 - "Mobile Contacts"
Cohesion: 0.48
Nodes (5): ContactCard(), MobilePeople(), handleDelete(), handleSubmit(), load()

### Community 60 - "Design Tokens"
Cohesion: 0.29
Nodes (6): bg, motion, radius, shadow, space, tabBarHeight

### Community 61 - "Spreadsheet UI"
Cohesion: 0.38
Nodes (7): Spreadsheet(), downloadExcel(), getSheetData(), init(), saveToDrive(), @univerjs/preset-sheets-core, @univerjs/presets

### Community 62 - "User Administration"
Cohesion: 0.48
Nodes (6): Users(), addUser(), changeRole(), deleteUser(), load(), syncUsers()

### Community 63 - "Trust Brand Concepts"
Cohesion: 0.33
Nodes (7): Inclusive Community, Protective Care, Selfless Love, Selfless Service, Spiritual Light, Sri Sai Dharma Samrakshana Prema Kuteeram, Tree and Shelter

### Community 64 - "Deployment Runtime"
Cohesion: 0.29
Nodes (7): CORS Origin Allowlist, Node Runtime, Notification Runtime Environment, Puppeteer Chrome Installation, Render Backend Service, Supabase Runtime Environment, WhatsApp Encryption Runtime Environment

### Community 65 - "Navigation Persistence"
Cohesion: 0.33
Nodes (4): Merged Visible Navigation Order, Nav Component, GET Nav Order Endpoint, PUT Nav Order Endpoint

### Community 66 - "Budget Rules"
Cohesion: 0.33
Nodes (5): Active Function Link Validation, Budget Restrictions Removal, Function CRUD, Remove Budget Restrictions Implementation Plan, Source Balance Summary

### Community 67 - "Mobile UX Plan"
Cohesion: 0.33
Nodes (5): Camera-first Receipt Capture, Open on Desktop Deep Link, Existing API Endpoints, Mobile UI/UX Plan, Offline Feed Cache

### Community 68 - "Oxlint Configuration"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 69 - "Brand Care Concepts"
Cohesion: 0.47
Nodes (5): Inclusive Community Care, Nurturing Growth, Shelter and Protection, Spiritual Devotion, Sri Sai Dharma Samrakshana Prema Kuteeram

### Community 70 - "WhatsApp Chat UI"
Cohesion: 0.53
Nodes (5): ChatWindow(), handleKeyDown(), handleSend(), formatTime(), MessageBubble()

### Community 71 - "File Send UI"
Cohesion: 0.40
Nodes (4): FileSend(), handleSend(), loadLogs(), formatDate()

### Community 72 - "Trustees UI"
Cohesion: 0.47
Nodes (4): Trustees(), handleDelete(), handleSubmit(), load()

### Community 73 - "PDF Branding"
Cohesion: 0.40
Nodes (5): drawPdfHeader, PDF Export Endpoint, PDF Generate Endpoint, Repeated Page Branding, Trust Logo

### Community 74 - "Logo Motifs"
Cohesion: 0.40
Nodes (5): Circular seal, Sri Sai Dharma Samskarana Prema Kutiram logo, Open-book motif, Rising-sun motif, Sri Sai Dharma Samskarana Prema Kutiram

### Community 76 - "Email Deliverability Design"
Cohesion: 0.40
Nodes (4): Anti-spam Deliverability Design Specification, Plain-text Email Part, Reply-To Delivery, Spam Folder Problem

### Community 77 - "HTML Entrypoint"
Cohesion: 0.40
Nodes (5): Inter Google Fonts, Logo Favicon, React main.jsx Entrypoint, Responsive Viewport, Trust CRM HTML Entrypoint

### Community 78 - "Frontend Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 79 - "Vite React Tooling"
Cohesion: 0.40
Nodes (5): Frontend Vite README, Oxlint, Vite React Plugin, Vite React SWC Plugin, React Vite Frontend

### Community 80 - "Chat Sidebar"
Cohesion: 0.70
Nodes (4): ChatSidebar(), handleSelectChat(), handleSelectContact(), normalizePhone()

### Community 81 - "Mobile Drive"
Cohesion: 0.70
Nodes (5): isFolder(), MobileDrive(), load(), open(), upload()

### Community 82 - "Vite Build Config"
Cohesion: 0.40
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 83 - "Rollback Strategy"
Cohesion: 0.40
Nodes (5): Feature Checkpoint Commits, Force-push Reset Rollback, Independent Feature Reverts, Trust CRM Rollback Plan, Stable Commit 68922d3

### Community 84 - "Navigation Order Plan"
Cohesion: 0.50
Nodes (4): Nav Reorder Feature Implementation Plan, Per-user Navigation Persistence, profiles.nav_order JSONB, Reset to Default Navigation Order

### Community 85 - "Budget UI Removal"
Cohesion: 0.50
Nodes (4): Budget UI Removal, Dashboard Page, Functions Page, Transactions Page

### Community 86 - "Mobile Quick Log"
Cohesion: 0.50
Nodes (4): Mobile Bottom Tab Navigation, MobileShell, Custom Numeric Pad, Three-step Quick Log Flow

### Community 87 - "Python Runtime Requirements"
Cohesion: 0.50
Nodes (4): Backend Python Requirements, pandas, plotly, supabase Python Client

### Community 88 - "Favicon Design"
Cohesion: 0.50
Nodes (4): Cyan Accent Highlights, Lightning Bolt Favicon, Lilac Glow Highlights, Purple Bolt Base

### Community 89 - "Hero Illustration"
Cohesion: 1.00
Nodes (4): Vertical Dashed Depth Guides, Layered Platform Hero Graphic, Lower Purple Textured Rounded-Square Layer, Upper Outlined Rounded-Square Layer

### Community 93 - "Project Architecture Docs"
Cohesion: 0.50
Nodes (4): Python Analytics Module, Trust CRM README, Trust CRM Product, Vercel Render Supabase Architecture

### Community 94 - "WhatsApp QR Flow"
Cohesion: 0.67
Nodes (3): WhatsApp Disconnect and QR Polling Fix, Session Manager Disconnect, WhatsApp Page QR Polling

### Community 95 - "Logo Identity"
Cohesion: 0.67
Nodes (3): Sri Sai Dharma Samsthana logo, Prema Kuteeram, Sri Sai Dharma Samsthana

### Community 96 - "React Logo Asset"
Cohesion: 0.67
Nodes (3): Three-Orbit Orbital Symbol, React, React Logo

### Community 100 - "Ledger Balance Concepts"
Cohesion: 0.67
Nodes (3): Cash in Hand Balance, Digital Balance, Unified Transaction Ledger

### Community 101 - "Database Setup and RLS"
Cohesion: 0.67
Nodes (3): Quick-start Database Migration, Supabase Row Level Security, Three-tier Role-based Access Control

## Knowledge Gaps
- **147 isolated node(s):** `@supabase/supabase-js`, `axios`, `dotenv`, `exceljs`, `express-validator` (+142 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 765 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Desktop App Shell` to `Shared UI Primitives`, `Numeric Pad`, `Recurring Transactions UI`, `Mobile Navigation`, `Financial Reports UI`, `App Routing and Pages`, `WhatsApp Chat UI`, `Camera Capture`, `Backup Operations UI`, `Chat Sidebar`, `Frontend Package Metadata`, `Activity Log UI`, `Login and Auth UI`, `Navigation and Mobile Inbox`, `Quick Log Components`, `Mobile Contacts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `@supabase/supabase-js`, `axios`, `dotenv` to the rest of the system?**
  _147 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Desktop App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.0989648033126294 - nodes in this community are weakly interconnected._
- **Why does `useAuth()` connect `Navigation and Mobile Inbox` to `Desktop App Shell`, `Shared UI Primitives`, `Mobile Navigation`, `App Routing and Pages`, `Backup Operations UI`, `Functions and Budgets UI`, `Transactions UI`, `Login and Auth UI`, `Recurring Transactions UI`, `Bank Reconciliation UI`, `Compliance UI`, `Mail UI`, `Beneficiaries UI`, `Contacts UI`, `Drive Manager UI`, `Journal Entries UI`, `Activity Log UI`, `Dashboard UI`, `Contact Groups UI`, `Chart of Accounts UI`, `Donation Receipts UI`, `Mobile Contacts`, `Spreadsheet UI`, `User Administration`, `File Send UI`, `Trustees UI`, `Mobile Drive`, `Quick Log Components`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Should `Shared UI Primitives` be split into smaller, more focused modules?**
  _Cohesion score 0.08077260755048288 - nodes in this community are weakly interconnected._
- **Why does `WhatsAppSessionManager` connect `WhatsApp Session Manager` to `WhatsApp Browser Runtime`, `WhatsApp Crypto Storage`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `Backend Data Access` be split into smaller, more focused modules?**
  _Cohesion score 0.04658197217180883 - nodes in this community are weakly interconnected._