export type DrfPage<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export function drfPage<T>(
  items: T[],
  total: number,
  baseUrl: string,
  page: number,
  pageSize: number
): DrfPage<T> {
  const url = new URL(baseUrl);
  const make = (p: number) => {
    url.searchParams.set('page', String(p));
    return url.toString();
  };
  const hasNext = page * pageSize < total;
  const hasPrev = page > 1;
  return {
    count: total,
    next: hasNext ? make(page + 1) : null,
    previous: hasPrev ? make(page - 1) : null,
    results: items
  };
}
