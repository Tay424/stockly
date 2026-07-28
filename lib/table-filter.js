export function filterByQuery(rows, query, getSearchText) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => getSearchText(row).toLowerCase().includes(q));
}

export const filterTriggerClassName =
  "h-10 min-w-[10rem] gap-2 rounded-lg border border-border bg-secondary px-3 shadow-none hover:bg-secondary data-popup-open:bg-secondary focus-visible:ring-2 focus-visible:ring-ring";
