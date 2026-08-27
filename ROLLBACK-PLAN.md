# Rollback Plan — Trust CRM Feature Implementation

## Current Stable State
- **Latest working commit:** `68922d3`
- **Branch:** `main`
- **Repo:** `Saipremakuteeram-orgin/trust-crm`

## Rollback Command
If any feature causes issues, revert to the last stable state with:
```powershell
cd C:\Users\Sathya\Downloads\Project\trust-crm
git revert --no-commit HEAD..68922d3
git checkout -- .
git clean -fd
git reset --hard 68922d3
git push --force
```

## Rollback Checkpoints
Each feature implementation will be committed separately. You can rollback to any checkpoint:
- `68922d3` — Auto-rollup sub-category budgets (last known stable)
- Future commits will be listed here as they are implemented

## Safe Implementation Order
Features will be implemented one at a time, each in its own commit. If a feature breaks anything, revert only that commit:
```powershell
git revert <commit-hash>
git push
```

## Feature Priority List (can be eliminated at any time)

| # | Feature | Priority | Eliminate? |
|---|---------|----------|------------|
| 1 | Chart of Accounts + Double Entry Journal | Highest | Yes / No |
| 2 | General Ledger + Trial Balance | High | Yes / No |
| 3 | Financial Statements (BS, P&L, Cash Flow) | High | Yes / No |
| 4 | Trustees/Beneficiaries Registry | Medium | Yes / No |
| 5 | Compliance Calendar + Reports | Medium | Yes / No |
| 6 | Donation Receipts with Certificates | Medium | Yes / No |
| 7 | Bank Reconciliation | Low | Yes / No |

## How to Eliminate a Feature
Simply tell me which feature number to skip. I will not implement it and will move to the next one.
