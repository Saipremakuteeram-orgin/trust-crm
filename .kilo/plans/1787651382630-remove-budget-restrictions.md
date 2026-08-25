# Remove Budget Restrictions — Implementation Plan

## Goal
Remove budget validation, enforcement, and UI from the Functions feature. Users can still create functions and link transactions to them, but budget fields become optional free-text with no restrictions or warnings.

## Assumption
The user wants complete removal of budget restrictions (no validation, no overspend warnings, no enforced limits). Database `budget_*` columns are retained but treated as optional descriptive fields.

## Changes

### 1. Backend — `backend/src/routes/functions.js`
- Delete `validateBudget` function (lines 12-25).
- In `POST /` (create): remove `validateBudget` call; still accept `budget_total`, `budget_cash`, `budget_digital` in payload but store them as-is without validation (no NaN check, no max cap, no sum rule).
- In `PATCH /:id` (update): remove `validateBudget` call and `hasBudget` branch; accept any numeric values or null/0 for budget fields.
- In `POST /:id/categories` and `PATCH /:id/categories/:catId`: remove non-negative / NaN checks for budget fields.
- In `GET /summary/source-balance`: remove `total_allocated_cash`, `total_allocated_digital`, `cash_unallocated`, `digital_unallocated` calculations; return only income, expenses, and available balances. Or remove the endpoint entirely if unused.
- Keep function CRUD, status changes, and category budget CRUD working.

### 2. Backend — `backend/src/routes/transactions.js`
- Simplify `validateFunctionLink` (lines 22-49): keep only the checks that the linked function exists and is `active`. Remove the `budget_total` overspend check entirely (lines 34-37).
- Result: transactions can be linked to any active function with no budget restriction.

### 3. Frontend — `frontend/src/pages/Functions.jsx`
- Remove all budget UI elements:
  - Budget fields from create/edit modal (`budget_total`, `budget_cash`, `budget_digital` inputs).
  - Budget summary cards in detail view ("Total Budget", "Total Spent", "Remaining", "Over by X").
  - Category budget table (Budget, Spent, Remaining, Progress columns).
  - "Add Category Budget" button and modal.
  - "OVER BUDGET" badge and progress bars.
- Keep: function name, description, status selector, transaction list, edit/delete actions.

### 4. Frontend — `frontend/src/pages/Transactions.jsx`
- Remove overspend warning block (lines 625-643) that shows amber "over budget" alert.
- Simplify function selector `<option>` text: show only function name, not "Over by X" or "X left".
- Keep: function linkage dropdown, sub-category selector, all other transaction fields.

### 5. Frontend — `frontend/src/pages/Dashboard.jsx`
- Remove the "Function Budgets" section entirely (lines ~215-262 including the cards grid).
- Keep: cash flow, digital flow, and all other dashboard widgets.

### 6. Database — optional cleanup
- If the user wants full removal: drop `budget_total`, `budget_cash`, `budget_digital` from `functions` and `function_categories`, and drop `v_function_budget_summary` and `v_function_category_budget` views.
- If retaining columns: no migration needed; code changes are enough.

## Validation
1. `npm run lint` in `frontend/` passes (or only shows pre-existing unrelated warnings).
2. `npm run build` in `frontend/` succeeds.
3. Backend `node -e "require('module-alias/register'); require('@/routes/functions')"` and `require('@/routes/transactions')"` load without error.
4. Manual: create function with no budget fields → save succeeds. Link transaction to function → saves without overspend warning. Dashboard no longer shows budget cards.

## Rollback
All changes are additive removals. Revert the four file edits to restore budget behavior.
