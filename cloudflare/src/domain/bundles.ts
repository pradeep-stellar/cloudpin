import { splitTags, normalizeTagName } from './tags';

export type BundleFilters = {
  search: string;
  anyTags: string;
  allTags: string;
  excludedTags: string;
  filterUnread: 'yes' | 'no' | 'off';
  filterShared: 'yes' | 'no' | 'off';
};

export function buildBundleSearch(filters: BundleFilters): string {
  const parts: string[] = [];
  if (filters.search.trim() !== '') parts.push(filters.search.trim());
  for (const t of splitTags(filters.anyTags)) {
    parts.push(`#${normalizeTagName(t)}`);
  }
  for (const t of splitTags(filters.allTags)) {
    parts.push(`#${normalizeTagName(t)}`);
  }
  for (const t of splitTags(filters.excludedTags)) {
    parts.push(`-#${normalizeTagName(t)}`);
  }
  if (filters.filterUnread === 'yes') parts.push('!unread');
  if (filters.filterShared === 'yes') parts.push('#__shared__');
  return parts.join(' ');
}

export function bundleAsFormValues(filters: BundleFilters): {
  search: string;
  any_tags: string;
  all_tags: string;
  excluded_tags: string;
  filter_unread: string;
  filter_shared: string;
} {
  return {
    search: filters.search,
    any_tags: filters.anyTags,
    all_tags: filters.allTags,
    excluded_tags: filters.excludedTags,
    filter_unread: filters.filterUnread,
    filter_shared: filters.filterShared
  };
}
