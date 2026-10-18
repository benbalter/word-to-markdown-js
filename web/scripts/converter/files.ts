import { uiString } from './strings.ts';

// Upper bound on the file we'll attempt to read into memory and convert
// client-side. Comfortably above any real Word document; guards against a
// mistaken drop of a huge file freezing the tab.
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// True for legacy .doc files. Checked on the main thread because the worker
// only sees the file's bytes, not its name. Mirrors validateFileExtension.
function isLegacyDocFile(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot !== -1 && lower.slice(dot) === '.doc';
}

// Why a file is refused before it's read, or null if it may be converted.
// Legacy .doc files get the friendlier localized "save as .docx" guidance up
// front, which also avoids loading the converter for a doomed file. A file
// too large to convert comfortably in the browser fails fast: reading a huge
// ArrayBuffer and running the pipeline can exhaust memory or hang the tab.
export function rejectionFor(file: {
  name: string;
  size: number;
}): string | null {
  if (isLegacyDocFile(file.name)) return uiString('docFileError');
  if (file.size > MAX_FILE_SIZE) return uiString('fileTooLarge');
  return null;
}
