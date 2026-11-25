// Image content type → file extension, shared by image extraction (src/main.ts)
// and the Confluence serializer (src/confluence.ts), which names inline images
// the way extraction would so its links match a .zip's files.

// Common image content types → file extension. Word most often embeds PNG and
// JPEG; the rest cover formats Mammoth may surface. EMF/WMF are extracted as
// bytes for completeness but browsers can't render them (Mammoth won't transcode).
const CONTENT_TYPE_EXTENSIONS: { [contentType: string]: string } = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-emf': 'emf',
  'image/x-wmf': 'wmf',
};

// Pick a file extension for an extracted image. Falls back to the content
// type's subtype when it's a clean alphanumeric token, else `bin`. Exported for
// unit testing since only a PNG fixture exists.
/** @internal */
export function extensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  const known = CONTENT_TYPE_EXTENSIONS[normalized];
  if (known) return known;
  const subtype = normalized.split('/')[1] ?? '';
  return /^[a-z0-9]+$/.test(subtype) ? subtype : 'bin';
}
