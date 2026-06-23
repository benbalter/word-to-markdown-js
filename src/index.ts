import ClipboardJS from 'clipboard';

// The Word→Markdown converter and the Markdown→HTML renderer pull in heavy
// dependencies (mammoth, turndown, jszip, unified/remark/rehype, prettier,
// markdownlint — ~400KB gzipped). They are dynamically imported on first use so
// the landing page paints without that payload; the chunk loads only once a
// file is actually provided.

// Render Markdown to sanitized HTML for the preview pane.
async function renderMarkdown(markdown: string): Promise<string> {
  const [
    { unified },
    { default: remarkParse },
    { default: remarkGfm },
    { default: remarkRehype },
    { default: rehypeSanitize },
    { default: rehypeStringify },
  ] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ]);

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}

// Speculatively warm the heavy converter + Markdown-renderer chunks (~340KB
// gzipped) so the first conversion resolves from cache instead of waiting on a
// download. Runs at most once, only on user intent or browser idle — never on
// initial paint, so it never competes with critical resources.
let converterWarmed = false;
function prefetchConverter(): void {
  if (converterWarmed) return;
  converterWarmed = true;
  const ignore = (): void => {};
  // Same specifiers as processFile()/renderMarkdown(), so these resolve to the
  // exact chunks the real conversion reuses.
  import('./main.js').catch(ignore);
  import('unified').catch(ignore);
  import('remark-parse').catch(ignore);
  import('remark-gfm').catch(ignore);
  import('remark-rehype').catch(ignore);
  import('rehype-sanitize').catch(ignore);
  import('rehype-stringify').catch(ignore);
}

// Convert a single file. Shared by the file-input change handler and the
// drag-and-drop handler so both entry points behave identically.
async function processFile(file: File | undefined): Promise<void> {
  if (!file) return;

  const {
    convertWithWarnings,
    UnsupportedFileError,
    InvalidFileError,
    ConversionError,
    validateFileExtension,
  } = await import('./main.js');

  // Check file extension before processing
  try {
    validateFileExtension(file.name);
  } catch (error) {
    if (error instanceof UnsupportedFileError) {
      showError(error.message);
      return;
    }
    throw error;
  }

  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = async (): Promise<void> => {
    try {
      const result = await convertWithWarnings(reader.result);

      // Display warnings if any
      if (result.warnings.length > 0) {
        showWarnings(result.warnings);
      }

      const outputElement = document.getElementById('output');
      outputElement.innerText = result.markdown;

      const renderedElement = document.getElementById('rendered');
      renderedElement.innerHTML = await renderMarkdown(result.markdown);

      const filenameElement = document.getElementById('filename');
      filenameElement.innerText = file.name;

      const inputElement = document.getElementById('input');
      inputElement.classList.add('hidden');

      const resultsElement = document.getElementById('results');
      resultsElement.classList.remove('hidden');
    } catch (error) {
      // Handle all our custom errors with specific messages
      if (
        error instanceof UnsupportedFileError ||
        error instanceof InvalidFileError ||
        error instanceof ConversionError
      ) {
        showError(error.message);
        return;
      }
      // For unexpected errors, show a generic message
      showError(
        'An unexpected error occurred while converting the document. Please try again.',
      );
      console.error(error);
    }
  };
}

function showError(message: string): void {
  // Create or update error alert
  let errorElement = document.getElementById('error-alert');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.id = 'error-alert';
    errorElement.setAttribute('role', 'alert');
    errorElement.className =
      'relative mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-left text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200';

    const messageSpan = document.createElement('span');
    messageSpan.id = 'error-message';
    messageSpan.className = 'flex-1';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Dismiss');
    closeButton.className =
      'shrink-0 leading-none text-red-500/70 transition-colors hover:text-red-700 dark:hover:text-red-100';
    closeButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeButton.addEventListener('click', () => errorElement.remove());

    errorElement.appendChild(messageSpan);
    errorElement.appendChild(closeButton);

    const inputElement = document.getElementById('input');
    if (inputElement) {
      inputElement.insertBefore(errorElement, inputElement.firstChild);
    }
  }

  const messageElement = document.getElementById('error-message');
  messageElement.textContent = message;
  errorElement.classList.remove('hidden');
}

function showWarnings(warnings: string[]): void {
  // Remove any existing warning alerts
  const existingWarnings = document.getElementById('warning-alert');
  if (existingWarnings) {
    existingWarnings.remove();
  }

  const warningElement = document.createElement('div');
  warningElement.id = 'warning-alert';
  warningElement.setAttribute('role', 'alert');
  warningElement.setAttribute('aria-live', 'polite');
  warningElement.className =
    'relative mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200';

  const warningList = document.createElement('ul');
  warningList.className = 'flex-1 list-disc space-y-1 pl-4';
  warnings.forEach((warning) => {
    const listItem = document.createElement('li');
    listItem.textContent = warning;
    warningList.appendChild(listItem);
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Dismiss');
  closeButton.className =
    'shrink-0 leading-none text-amber-600/70 transition-colors hover:text-amber-800 dark:hover:text-amber-100';
  closeButton.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener('click', () => warningElement.remove());

  warningElement.appendChild(warningList);
  warningElement.appendChild(closeButton);

  const resultsElement = document.getElementById('results');
  if (resultsElement) {
    resultsElement.insertBefore(warningElement, resultsElement.firstChild);
  }
}

function initDragAndDrop(dropzone: HTMLElement): void {
  // Prevent the browser's default "open the dropped file" behaviour for drops
  // anywhere outside the dropzone — otherwise a near-miss (or any drop after the
  // input is hidden) navigates away and discards the page.
  const cancel = (event: DragEvent): void => event.preventDefault();
  window.addEventListener('dragover', cancel);
  window.addEventListener('drop', cancel);

  const activate = (event: DragEvent): void => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  };

  dropzone.addEventListener('dragenter', activate);
  dropzone.addEventListener('dragover', activate);

  dropzone.addEventListener('dragleave', (event: DragEvent) => {
    // Ignore dragleave events bubbling from child elements.
    if (!dropzone.contains(event.relatedTarget as Node)) {
      dropzone.classList.remove('is-dragover');
    }
  });

  dropzone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    void processFile(event.dataTransfer?.files?.[0]);
  });
}

// Download the converted Markdown as a .md file named after the source document.
function downloadMarkdown(): void {
  const markdown = document.getElementById('output')?.innerText ?? '';
  if (!markdown) return;
  const sourceName =
    document.getElementById('filename')?.innerText ?? 'document';
  const baseName = sourceName.replace(/\.docx$/i, '') || 'document';
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById('file') as HTMLInputElement;
  inputElement.addEventListener(
    'change',
    function (this: HTMLInputElement): void {
      void processFile(this.files?.[0]);
    },
    false,
  );

  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    initDragAndDrop(dropzone);
    // Warm the converter on intent — hovering, focusing, or dragging onto the
    // dropzone all signal an imminent conversion.
    for (const evt of ['pointerenter', 'focusin', 'dragenter']) {
      dropzone.addEventListener(evt, prefetchConverter, {
        once: true,
        passive: true,
      });
    }
  }

  // ...and during idle time even without interaction, unless the visitor is on
  // a metered/slow connection (don't spend their data speculatively).
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  const lowData =
    connection?.saveData === true ||
    /(^|-)2g$/.test(connection?.effectiveType ?? '');
  if (!lowData) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(prefetchConverter, { timeout: 4000 });
    } else {
      window.setTimeout(prefetchConverter, 2000);
    }
  }

  const copyButton = document.getElementById('copy-button');
  if (copyButton !== null) {
    new ClipboardJS('#copy-button');
  }

  const downloadButton = document.getElementById('download-button');
  if (downloadButton !== null) {
    downloadButton.addEventListener('click', downloadMarkdown);
  }

  // Theme changes are handled automatically by CSS using prefers-color-scheme.
});
