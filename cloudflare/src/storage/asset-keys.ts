export type R2KeyBuilder = {
  favicon: (domain: string, ext: string) => string;
  preview: (ownerId: number, bookmarkId: number, hash: string, ext: string) => string;
  asset: (
    ownerId: number,
    bookmarkId: number,
    assetId: number,
    safeName: string,
    ext: string
  ) => string;
  snapshot: (
    ownerId: number,
    bookmarkId: number,
    assetId: number,
    format: 'html' | 'pdf'
  ) => string;
  import: (ownerId: number, importId: string) => string;
  export: (ownerId: number, exportId: string) => string;
};

function safeName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80) || 'file'
  );
}

function ext(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'bin';
}

function shortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const r2Keys: R2KeyBuilder = {
  favicon(domain, e) {
    return `favicons/${shortHash(domain)}.${ext(e)}`;
  },
  preview(ownerId, bookmarkId, hash, e) {
    return `previews/${ownerId}/${bookmarkId}/${shortHash(hash)}.${ext(e)}`;
  },
  asset(ownerId, bookmarkId, assetId, name, e) {
    return `assets/${ownerId}/${bookmarkId}/${assetId}/${safeName(name)}.${ext(e)}`;
  },
  snapshot(ownerId, bookmarkId, assetId, format) {
    return `snapshots/${ownerId}/${bookmarkId}/${assetId}/snapshot.${format}.gz`;
  },
  import(ownerId, importId) {
    return `imports/${ownerId}/${importId}/source.html`;
  },
  export(ownerId, exportId) {
    return `exports/${ownerId}/${exportId}/bookmarks.html`;
  }
};
