"use client";

import { Button } from "@/components/ui/button";

export function TablePagination({ onPageChange, page, pageSize, totalItems, totalPages }) {
  if (totalItems === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {totalPages > 1 ? (
          <>
            Showing {from}–{to} of {totalItems}
          </>
        ) : (
          <>
            {totalItems} {totalItems === 1 ? "row" : "rows"}
          </>
        )}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <span className="min-w-[5.5rem] text-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
