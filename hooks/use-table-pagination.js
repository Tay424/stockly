import { useMemo, useState } from "react";

export const DEFAULT_TABLE_PAGE_SIZE = 10;

export function useTablePagination(items, pageSize = DEFAULT_TABLE_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return { page: currentPage, paginated, setPage, totalItems, totalPages, pageSize };
}
