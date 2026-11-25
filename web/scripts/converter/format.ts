// The result's output format: Markdown, or Confluence wiki markup while the
// "Confluence wiki markup" box (#confluence-toggle) is checked. The wiki
// markup is made from the converted Markdown (src/confluence.ts), so checking
// the box re-renders the result without converting the document again. The
// serializer loads only once the box is checked, and shares its remark parser
// with the preview renderer.
import { setLabel } from './dom.ts';
import { session } from './session.ts';

type Serializer = (markdown: string) => string;

// Remembers the choice between visits. Nothing about the document is stored.
const STORAGE_KEY = 'w2m-output-format';

let loading: Promise<Serializer> | null = null;
// Set once loaded, so a result in Confluence mode can render synchronously.
let serializer: Serializer | null = null;

function loadSerializer(): Promise<Serializer> {
  loading ??= import('../../../src/confluence.ts').then(
    ({ toConfluenceWiki }) => (serializer = toConfluenceWiki),
    (error: unknown) => {
      // Let a later attempt retry a failed download.
      loading = null;
      throw error;
    },
  );
  return loading;
}

function toggle(): HTMLInputElement | null {
  const element = document.getElementById('confluence-toggle');
  return element instanceof HTMLInputElement ? element : null;
}

function confluenceMode(): boolean {
  return toggle()?.checked === true;
}

// Start downloading the serializer when a conversion starts in Confluence
// mode, so it's ready by the result.
export function prefetchFormat(): void {
  if (confluenceMode()) loadSerializer().catch(() => {});
}

// What a download of the current format is called and typed as.
export function outputFile(): { extension: string; type: string } {
  return confluenceMode()
    ? { extension: 'txt', type: 'text/plain;charset=utf-8' }
    : { extension: 'md', type: 'text/markdown;charset=utf-8' };
}

// A document's Markdown in the current format, for the .zip downloads.
export async function formatOutput(markdown: string): Promise<string> {
  return confluenceMode() ? (await loadSerializer())(markdown) : markdown;
}

function setOutput(text: string): void {
  session.lastOutput = text;
  const output = document.getElementById('output');
  if (output) output.textContent = text;
}

// Put session.lastMarkdown in the output panel in the current format, and make
// it the copy and download source (session.lastOutput). Synchronous unless
// the serializer is still downloading.
export function showOutput(): void {
  const markdown = session.lastMarkdown;
  if (!confluenceMode()) {
    setOutput(markdown);
    return;
  }
  if (serializer) {
    setOutput(serializer(markdown));
    return;
  }
  // Nothing to copy until the wiki markup is ready, rather than Markdown
  // under a "Copy wiki markup" label.
  setOutput('');
  loadSerializer().then(
    (serialize) => {
      // A newer document, or a format change, already replaced this one.
      if (session.lastMarkdown !== markdown || !confluenceMode()) return;
      setOutput(serialize(markdown));
    },
    (error: unknown) => {
      // Offline, or a deploy replaced the chunk: fall back to Markdown, with
      // the box unchecked so the labels say so.
      console.error('Could not load the Confluence converter:', error);
      const box = toggle();
      if (box) box.checked = false;
      applyFormat();
      if (session.lastMarkdown === markdown) setOutput(markdown);
    },
  );
}

// Match the labels, hint, and images note to the box.
function applyFormat(): void {
  const box = toggle();
  if (!box) return;
  const format = box.checked ? 'confluence' : 'markdown';
  const label = (name: string): string =>
    box.getAttribute(`data-${name}-${format}`) ?? '';
  setLabel('copy-label', label('copy'));
  setLabel('download-label', label('download'));
  const panel = document.getElementById('output-label');
  if (panel) panel.textContent = label('panel');
  const note = document.getElementById('images-note');
  if (note) note.textContent = note.getAttribute(`data-${format}`) ?? '';
  document
    .getElementById('confluence-hint')
    ?.classList.toggle('hidden', !box.checked);
}

export function initFormatToggle(): void {
  const box = toggle();
  if (!box) return;
  // Storage can be unavailable (privacy settings), which just means the
  // choice isn't remembered.
  try {
    box.checked = localStorage.getItem(STORAGE_KEY) === 'confluence';
  } catch {
    // Not remembered.
  }
  applyFormat();
  box.addEventListener('change', () => {
    try {
      if (box.checked) localStorage.setItem(STORAGE_KEY, 'confluence');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not remembered.
    }
    applyFormat();
    if (session.lastMarkdown) showOutput();
  });
}
