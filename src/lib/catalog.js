// Local catalog system — a portable, 100% client-side session store.
//
// A camera RAW folder can't be re-linked automatically across browser sessions
// (the browser never exposes the real filesystem path), so a catalog stores the
// culling *decisions* keyed by filename + size. Re-import the same folder and
// the catalog reapplies every star, flag, and colour label instantly. Think of
// it as a lightweight, human-readable .lrcat you own and can back up anywhere.

export const CATALOG_VERSION = 1;
export const CATALOG_EXT = 'cgcat';

export function buildCatalog(images, meta = {}) {
  return {
    app: 'Culling Grid by Storitellah',
    kind: 'culling-grid-catalog',
    version: CATALOG_VERSION,
    savedAt: new Date().toISOString(),
    name: meta.name || 'Untitled Session',
    count: images.length,
    items: images.map((img) => ({
      name: img.name,
      size: img.size ?? null,
      rating: img.rating || 0,
      flagged: !!img.flagged,
      rejected: !!img.rejected,
      label: img.label || null,
    })),
  };
}

export function serializeCatalog(images, meta) {
  return JSON.stringify(buildCatalog(images, meta), null, 2);
}

// Returns a Map keyed by filename → decision record, tolerant of unknown files.
export function indexCatalog(catalog) {
  const map = new Map();
  const items = catalog?.items || [];
  for (const it of items) {
    if (it && it.name) map.set(it.name, it);
  }
  return map;
}

// Apply a parsed catalog onto the current image list; returns a new array and a
// count of how many frames matched.
export function applyCatalog(images, catalog) {
  const map = indexCatalog(catalog);
  let matched = 0;
  const next = images.map((img) => {
    const rec = map.get(img.name);
    if (!rec) return img;
    matched += 1;
    return {
      ...img,
      rating: rec.rating || 0,
      flagged: !!rec.flagged,
      rejected: !!rec.rejected,
      label: rec.label || null,
    };
  });
  return { images: next, matched };
}

export function parseCatalog(text) {
  const data = JSON.parse(text);
  if (data?.kind !== 'culling-grid-catalog') {
    throw new Error('Not a Culling Grid catalog file.');
  }
  return data;
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCatalog(images, meta) {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`culling-grid_${stamp}.${CATALOG_EXT}`, serializeCatalog(images, meta));
}
