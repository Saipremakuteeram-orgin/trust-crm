# Plan: Add custom category option in sub-category modal

## Problem
In the Functions detail view, the Add Sub-category modal only lets users pick from existing global categories. If a needed category doesn't exist yet, the user must leave the modal, create it elsewhere, then come back. We want a shortcut to create a new category inline.

## Current state
- `frontend/src/pages/Functions.jsx` renders a `<select>` for category choice in the sub-category modal.
- `backend/src/routes/categories.js` exposes `POST /api/categories` (admin only) to create a category by name.
- The sub-category form state uses `subCatForm.category_id` as the selected value.

## Proposed change

### Frontend (`Functions.jsx`)
1. Add a sentinel option `__new__` at the bottom of the category dropdown: `<option value="__new__">+ Add new category...</option>`.
2. Add state `const [newCategoryName, setNewCategoryName] = useState("");` near other sub-category state.
3. When `subCatForm.category_id === "__new__"`, render a text input below the select for the new category name.
4. In `handleSaveSubCat`, before sending the function-category payload:
   - If `subCatForm.category_id === "__new__"`:
     - Validate `newCategoryName.trim()`.
     - Call `POST /api/categories` with `{ name: newCategoryName.trim() }`.
     - On success, replace `subCatForm.category_id` with the returned category `id`.
     - On failure, show toast and abort.
   - Proceed with the existing `POST/PATCH /functions/${fn.id}/categories` call using the resolved `category_id`.
5. Reset `newCategoryName` when the modal closes or when switching back to an existing category.

### UX details
- The new-category input should appear only when `__new__` is selected.
- Keep the same disabled/edit behavior: the dropdown is already disabled during edit, so the custom option is only available when adding.
- If the user switches back to an existing category after typing a name, clear `newCategoryName`.

## Validation
1. Open function detail → Add Sub-category.
2. Select "+ Add new category..." → text input appears.
3. Type a name, enter budgets, save.
4. New category is created and linked; table shows the new row.
5. If category creation fails (e.g., permission), toast shows error and save is aborted.
6. Verify the new category also appears in the global categories list.

## Risks / Edge Cases
- `POST /api/categories` requires admin role. If the current user is an accountant, creation will fail with 403. Show a clear toast.
- Duplicate category names: backend may reject or allow depending on constraints. Frontend shows backend error.
- Race condition: if two users create the same category simultaneously, backend handles uniqueness.

## Out of scope
- No deduplication prompt before creating.
- No change to the edit flow (category remains locked during edit).
