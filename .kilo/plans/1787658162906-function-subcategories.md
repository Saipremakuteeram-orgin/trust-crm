# Plan: Add Sub-Category Expense Management to Functions

## Problem

When a function is created, there is no way to define sub-categories and their budgets inside that function. The backend already has all the infrastructure (`function_categories` table, budget views, CRUD routes), but the Functions page frontend (`frontend/src/pages/Functions.jsx`) has no UI to manage sub-categories.

## Current State

### Backend (already exists)
- **Table**: `function_categories` with `function_id`, `category_id`, `budget_amount`, `budget_cash`, `budget_digital`
- **View**: `v_function_category_budget` returns `category_name`, budget fields, computed `spent_*`, `remaining_*`
- **Routes** (in `backend/src/routes/functions.js`):
  - `GET /functions/:id` → returns `{ ..., categories: [...], transactions: [...] }`
  - `POST /functions/:id/categories` → upsert category budget
  - `PATCH /functions/:id/categories/:catId` → update budget
  - `DELETE /functions/:id/categories/:catId` → remove category
- **Categories endpoint**: `GET /api/categories` returns all global categories (id, name)

### Frontend (missing)
- `Functions.jsx` detail view shows overview cards and transactions table
- No UI to view, add, edit, or delete function sub-categories
- No loading of available global categories for linking

## Goal

When a user opens a function detail view (`/functions/:id`), they can:
1. See a **Sub-categories** section showing each linked category with its budget, actual spend, and remaining balance
2. **Add** a new sub-category by picking an unlinked global category and entering budgets
3. **Edit** budget amounts for an existing sub-category
4. **Delete** a sub-category from the function

## Implementation Plan

### Files to modify
- `frontend/src/pages/Functions.jsx` — only frontend changes needed

### State additions in Functions.jsx

Add the following state variables near the existing state declarations:

```js
const [availableCategories, setAvailableCategories] = useState([]);
const [subCatModalOpen, setSubCatModalOpen] = useState(false);
const [editingSubCat, setEditingSubCat] = useState(null);
const [subCatForm, setSubCatForm] = useState({
  category_id: '',
  budget_amount: '',
  budget_cash: '',
  budget_digital: '',
});
const [savingSubCat, setSavingSubCat] = useState(false);
```

### Load available categories

In the `load()` function, also fetch global categories so the modal can offer a dropdown of unlinked categories:

```js
function load() {
  api.get("/functions").then((res") => setFunctions(res.data.result)).catch(() => setFunctions([]));
  if (id) {
    api.get(`/functions/${id}`).then((res) => setDetail(res.data.result)).catch(() => setDetail(null));
    api.get("/categories").then((res) => setAvailableCategories(res.data.result || [])).catch(() => setAvailableCategories([]));
  }
}
```

Update the useEffect dependency to include `id` (already present).

### Sub-categories section in detail view

Inside the `{fn && (...)}` block in the detail view, after the overview cards and before the transactions section, add:

```jsx
{/* Sub-categories */}
<div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-sm font-semibold text-stone-700">Sub-categories</h2>
    {canEdit && (
      <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openAddSubCat}
        className="flex items-center gap-1.5 bg-saffron-500 hover:bg-saffron-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
        <Plus size={14} /> Add Sub-category
      </motion.button>
    )}
  </div>

  {(!fn.categories || fn.categories.length === 0) ? (
    <p className="text-sm text-stone-400">No sub-categories defined yet.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-stone-400 uppercase tracking-wider">
          <tr className="border-b border-stone-100">
            <th className="py-2 pr-3 font-semibold">Category</th>
            <th className="py-2 pr-3 font-semibold text-right">Budget</th>
            <th className="py-2 pr-3 font-semibold text-right">Spent</th>
            <th className="py-2 pr-3 font-semibold text-right">Remaining</th>
            {canEdit && <th className="py-2 pl-3 font-semibold text-center w-24">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {fn.categories.map((cat) => {
            const budget = Number(cat.budget_amount) || 0;
            const spent = Number(cat.spent_total) || 0;
            const remaining = Number(cat.remaining_total) || 0;
            const isOver = remaining < 0;
            return (
              <tr key={cat.id} className="border-b border-stone-50">
                <td className="py-3 pr-3 font-medium text-stone-800">{cat.category_name}</td>
                <td className="py-3 pr-3 text-right text-stone-600">{fmt(budget)}</td>
                <td className="py-3 pr-3 text-right text-rose-600">{fmt(spent)}</td>
                <td className={`py-3 pr-3 text-right font-semibold ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(remaining)}</td>
                {canEdit && (
                  <td className="py-3 pl-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEditSubCat(cat)} className="p-1.5 rounded-lg hover:bg-royal-50 text-stone-400 hover:text-royal-600 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteSubCat(cat)} className="p-1.5 rounded-lg hover:bg-rose-50 text-stone-400 hover:text-rose-600 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</div>
```

### Sub-category modal handlers

Add these handler functions before the `return` in the component:

```js
function getAvailableCategoriesForAdd() {
  if (!fn?.categories) return availableCategories;
  const linkedIds = new Set(fn.categories.map(c => c.category_id));
  return availableCategories.filter(c => !linkedIds.has(c.id));
}

function openAddSubCat() {
  const avail = getAvailableCategoriesForAdd();
  if (avail.length === 0) {
    addToast('All categories are already linked to this function', 'error');
    return;
  }
  setEditingSubCat(null);
  setSubCatForm({
    category_id: avail[0].id,
    budget_amount: '',
    budget_cash: '',
    budget_digital: '',
  });
  setSubCatModalOpen(true);
}

function openEditSubCat(cat) {
  setEditingSubCat(cat);
  setSubCatForm({
    category_id: cat.category_id,
    budget_amount: String(cat.budget_amount || ''),
    budget_cash: String(cat.budget_cash || ''),
    budget_digital: String(cat.budget_digital || ''),
  });
  setSubCatModalOpen(true);
}

async function handleSaveSubCat(e) {
  e.preventDefault();
  if (!subCatForm.category_id) { addToast('Category is required', 'error'); return; }
  setSavingSubCat(true);
  try {
    const payload = {
      category_id: subCatForm.category_id,
      budget_amount: Number(subCatForm.budget_amount) || 0,
      budget_cash: Number(subCatForm.budget_cash) || 0,
      budget_digital: Number(subCatForm.budget_digital) || 0,
    };
    if (editingSubCat) {
      await api.patch(`/functions/${fn.id}/categories/${editingSubCat.id}`, payload);
      addToast('Sub-category updated', 'success');
    } else {
      await api.post(`/functions/${fn.id}/categories`, payload);
      addToast('Sub-category added', 'success');
    }
    setSubCatModalOpen(false);
    load();
  } catch (err) {
    addToast(err.response?.data?.message || 'Failed to save sub-category', 'error');
  }
  setSavingSubCat(false);
}

async function handleDeleteSubCat(cat) {
  if (!window.confirm(`Remove "${cat.category_name}" from this function?`)) return;
  try {
    await api.delete(`/functions/${fn.id}/categories/${cat.id}`);
    addToast('Sub-category removed', 'success');
    load();
  } catch (err) {
    addToast(err.response?.data?.message || 'Failed to remove sub-category', 'error');
  }
}
```

### Sub-category modal JSX

Add this at the end of the component, just before the closing `</AppLayout>` tag (inside the detail view branch or as a global modal):

```jsx
{/* Sub-category Modal */}
<AnimatePresence>
  {subCatModalOpen && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/20">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-stone-900">{editingSubCat ? 'Edit Sub-category' : 'Add Sub-category'}</h2>
          <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
            onClick={() => setSubCatModalOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"><X size={18} /></motion.button>
        </div>
        <form onSubmit={handleSaveSubCat} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Category</label>
            <select value={subCatForm.category_id} onChange={(e) => setSubCatForm({ ...subCatForm, category_id: e.target.value })}
              disabled={!!editingSubCat}
              className="w-full border-2 border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:border-saffron-400 transition-colors disabled:bg-stone-100 disabled:text-stone-500">
              {editingSubCat ? (
                <option value={subCatForm.category_id}>{fn?.categories?.find(c => c.category_id === subCatForm.category_id)?.category_name || 'Selected'}</option>
              ) : (
                getAvailableCategoriesForAdd().map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Budget Total</label>
              <input type="number" step="0.01" min="0" placeholder="0" value={subCatForm.budget_amount}
                onChange={(e) => setSubCatForm({ ...subCatForm, budget_amount: e.target.value })}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Cash Budget</label>
              <input type="number" step="0.01" min="0" placeholder="0" value={subCatForm.budget_cash}
                onChange={(e) => setSubCatForm({ ...subCatForm, budget_cash: e.target.value })}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Digital Budget</label>
              <input type="number" step="0.01" min="0" placeholder="0" value={subCatForm.budget_digital}
                onChange={(e) => setSubCatForm({ ...subCatForm, budget_digital: e.target.value })}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-saffron-400 transition-colors" />
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={savingSubCat}
            className="w-full bg-gradient-to-r from-saffron-500 to-saffron-600 hover:from-saffron-400 hover:to-saffron-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-saffron-500/25 transition-all disabled:opacity-50">
            {savingSubCat ? 'Saving...' : editingSubCat ? 'Update Sub-category' : 'Add Sub-category'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### Notes

- The `useEscToClose` hook is already imported and used for the main modal; reuse it for `subCatModalOpen` or rely on the backdrop click (current pattern uses only the hook for the main modal, so we should be consistent)
- The `canEdit` check restricts add/edit/delete to admin and accountant roles, matching existing patterns
- When all global categories are already linked to the function, the Add button shows a toast instead of opening an empty modal
- Budget validation is minimal (non-negative numbers); the backend also validates

## Validation

1. Open a function detail view → Sub-categories section should appear below overview cards
2. Click "Add Sub-category" → modal opens with dropdown of available categories
3. Add a category with budgets → table updates with new row
4. Edit budgets → values update and persist
5. Delete a sub-category → row removed
6. Create a new transaction linked to this function with a sub-category → spent values update in the sub-category table
7. Verify remaining_total goes negative when overspent (rose-600 color)

## Risks / Edge Cases

- If `v_function_category_budget` view is missing from the database, the detail endpoint gracefully returns empty categories array (existing fallback)
- If all categories are already linked, Add button shows toast — no empty modal
- Category dropdown is disabled during edit to prevent changing the linked category (would require delete + re-add instead)
- Transaction counts per sub-category are computed server-side by the view; no client-side aggregation needed

## Out of Scope

- No changes to `categories` table hierarchy (categories remain flat and global)
- No changes to transaction creation flow (already supports `function_category_id`)
- No backend route changes needed
