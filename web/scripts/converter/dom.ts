// Small DOM helpers shared by the converter UI's modules.

// Put a message in the polite live region for screen readers.
export function announce(message: string): void {
  const status = document.getElementById('sr-status');
  if (status) status.textContent = message;
}

// Restart a one-shot CSS animation keyed to a class (the result highlights in
// global.css): drop the class, force a reflow so the browser forgets the
// finished run, then add it back. A second conversion or Copy replays it.
export function replayClass(element: Element | null, className: string): void {
  if (!(element instanceof HTMLElement)) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// Each result button's own label text, captured the first time it flashes,
// and the timer that restores it.
const labelDefaults = new WeakMap<HTMLElement, string>();
const restoreTimers = new WeakMap<HTMLElement, number>();

// Flip a result button's label to a transient confirmation ("Copied!",
// "Downloaded"), announce it, then restore the label after two seconds. A
// rapid re-click restarts the timer rather than capturing "Copied!" as the
// label to restore.
export function flashConfirmed(
  buttonId: string,
  labelId: string,
  text: string,
): void {
  const label = document.getElementById(labelId);
  if (!label) return;
  if (!labelDefaults.has(label)) {
    labelDefaults.set(label, label.textContent ?? '');
  }
  label.textContent = text;
  announce(text);
  const button = document.getElementById(buttonId);
  button?.classList.add('is-confirmed');
  window.clearTimeout(restoreTimers.get(label));
  restoreTimers.set(
    label,
    window.setTimeout(() => {
      label.textContent = labelDefaults.get(label) ?? '';
      button?.classList.remove('is-confirmed');
    }, 2000),
  );
}

// Match an inline (base64) image in Markdown image syntax, not a bare
// "data:image" that could be document text.
const INLINE_IMAGE = /!\[[^\]]*\]\(data:image\//;

export function hasInlineImages(markdown: string): boolean {
  return INLINE_IMAGE.test(markdown);
}

// When a document has images, the Markdown carries them as long base64
// strings, so the .zip (Markdown plus an images/ folder) is the better next
// step: it takes the filled accent and the leading spot from Copy, and a note
// says why. Without images, Copy leads and the .zip button is hidden.
export function setImageMode(hasImages: boolean): void {
  const copyButton = document.getElementById('copy-button');
  const zipButton = document.getElementById('download-zip-button');
  if (!copyButton || !zipButton) return;
  zipButton.style.display = hasImages ? 'inline-flex' : 'none';
  copyButton.classList.toggle('btn-accent', !hasImages);
  copyButton.classList.toggle('btn-secondary', hasImages);
  zipButton.classList.toggle('btn-accent', hasImages);
  zipButton.classList.toggle('btn-secondary', !hasImages);
  if (hasImages) copyButton.before(zipButton);
  else document.getElementById('download-button')?.after(zipButton);
  document
    .getElementById('images-note')
    ?.classList.toggle('hidden', !hasImages);
}

// The result action that carries the accent (see setImageMode and
// setBatchMode), where focus lands after a conversion. A batch in which
// nothing converted has no accent; Convert another is all that's left.
export function primaryAction(): HTMLElement | null {
  // The first accent that's rendered: the batch's "Download all" sits in a
  // hidden block for a single document, and the single .zip button is shown
  // by an inline display rather than by dropping its `hidden` class.
  const accent = Array.from(
    document.querySelectorAll<HTMLElement>('#results .btn-accent'),
  ).find((button) => button.getClientRects().length > 0);
  return accent ?? document.getElementById('convert-another');
}
