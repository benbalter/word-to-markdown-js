// Converting several files at once: the list of results, and how they're
// named in the combined .zip. One file at a time keeps the single-document
// view unchanged; this is only shown for two or more.
import { uiString } from './strings.ts';

// The most files converted from one drop, pick, or paste. Each converts in
// turn in the same worker, so this bounds how long a batch runs and how many
// results the page holds (each up to 20 MB of Markdown).
export const MAX_BATCH_FILES = 20;

export interface BatchEntry {
  // The file's name, as given.
  name: string;
  // A name for its downloads, without the extension, unique in the batch.
  base: string;
  // Set when it converted.
  markdown?: string;
  warnings?: { lines: string[]; technical: string[] };
  // The .docx's bytes, kept only when the Markdown has images, so the
  // combined .zip can re-convert it with the images as files.
  buffer?: ArrayBuffer | null;
  // Why it didn't convert, localized.
  error?: string;
}

// A download name for each file: its name without the extension, made unique
// (ignoring case, as macOS and Windows file systems do) by numbering repeats,
// so two report.docx files don't overwrite each other in the .zip.
export function uniqueBaseNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const stem = name.replace(/\.(?:docx?|md)$/i, '') || 'document';
    let base = stem;
    for (let n = 2; taken.has(base.toLowerCase()); n++) base = `${stem}-${n}`;
    taken.add(base.toLowerCase());
    return base;
  });
}

// Where each file goes in the combined .zip: its Markdown at the top level,
// and its images (if any) in a folder of its own beside it, so two documents'
// image1.png can't collide and every link resolves from the Markdown. The
// folder name ends up in the Markdown's image links, so it keeps only
// characters that work unescaped there (no spaces or parentheses).
export function zipLayout(
  bases: string[],
): { markdown: string; imageDir: string }[] {
  const used = new Set<string>();
  return bases.map((base) => {
    const slug =
      base.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') ||
      'document';
    let imageDir = `${slug}-images`;
    for (let n = 2; used.has(imageDir.toLowerCase()); n++) {
      imageDir = `${slug}-${n}-images`;
    }
    used.add(imageDir.toLowerCase());
    return { markdown: `${base}.md`, imageDir };
  });
}

// Fill the list: a button per converted file, which shows it in the panels
// below, and a row per failed one saying why. Every file stays on the list,
// so one bad file doesn't hide what happened to the rest.
export function renderBatchList(
  list: HTMLElement,
  entries: BatchEntry[],
  onSelect: (entry: BatchEntry) => void,
): void {
  list.replaceChildren(
    ...entries.map((entry, index) => {
      const item = document.createElement('li');
      // <bdi> so a right-to-left filename (or a Latin one on an RTL page)
      // doesn't reorder the punctuation around it.
      const name = document.createElement('bdi');
      name.className = 'min-w-0 flex-1 font-mono text-sm break-all';
      name.textContent = entry.name;

      if (entry.markdown === undefined) {
        item.className = 'px-4 py-2.5 text-start';
        name.className += ' block text-navy-soft dark:text-mist';
        const reason = document.createElement('p');
        reason.className = 'mt-0.5 text-sm text-red-800 dark:text-red-200';
        reason.textContent = entry.error ?? uiString('errorGeneric');
        item.append(name, reason);
        return item;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(index);
      button.setAttribute('aria-pressed', 'false');
      button.className =
        'flex w-full items-center gap-3 px-4 py-2.5 text-start text-navy transition-colors hover:bg-chartreuse/10 aria-pressed:bg-chartreuse/10 aria-pressed:font-medium aria-pressed:text-chartreuse-deep dark:text-snow dark:aria-pressed:text-chartreuse';
      button.append(name);
      if (entry.warnings && entry.warnings.lines.length > 0) {
        const tag = document.createElement('span');
        tag.className =
          'shrink-0 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200';
        tag.textContent = uiString('batchHasWarnings');
        button.append(tag);
      }
      button.addEventListener('click', () => onSelect(entry));
      item.append(button);
      return item;
    }),
  );
}

// Mark which file the panels are showing.
export function markSelected(list: HTMLElement, index: number): void {
  for (const button of list.querySelectorAll<HTMLElement>(
    'button[data-index]',
  )) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.index === String(index)),
    );
  }
}

// Switch the results between one document and a batch. In a batch, the
// combined .zip is the next action (the filled accent); Copy and Download .md
// act on the file picked in the list; and the single document's .zip, and its
// note about images, step aside, since the combined .zip has every file's
// images. With nothing converted, only the list and Convert another remain.
export function setBatchMode(on: boolean, anyConverted = true): void {
  document.getElementById('batch')?.classList.toggle('hidden', !on);
  document
    .getElementById('download-all-button')
    ?.classList.toggle('hidden', !on || !anyConverted);
  for (const id of [
    'result-heading',
    'result-panels',
    'copy-button',
    'download-button',
  ]) {
    document
      .getElementById(id)
      ?.classList.toggle('hidden', on && !anyConverted);
  }
  if (!on) return;
  const copy = document.getElementById('copy-button');
  copy?.classList.remove('btn-accent');
  copy?.classList.add('btn-secondary');
  const zip = document.getElementById('download-zip-button');
  if (zip) zip.style.display = 'none';
  document.getElementById('images-note')?.classList.add('hidden');
}
