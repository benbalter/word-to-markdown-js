import { primaryAction } from './dom.ts';
import type { ConversionErrorKind } from './conversion-errors.ts';
import { uiString, type UIStringKey } from './strings.ts';

// The error and warning alerts' close button: an × icon, colored to match its
// alert.
function makeCloseButton(
  colorClasses: string,
  alert: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', uiString('dismiss'));
  button.className = `-m-1 shrink-0 p-1 leading-none transition-colors ${colorClasses}`;
  button.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  button.addEventListener('click', () => dismissAlert(alert));
  return button;
}

// Show an error alert. `fileName` names the file it's about, on its own line
// above the message, so a visitor who dropped several files in turn knows
// which one failed.
export function showError(message: string, fileName?: string): void {
  // Create or update error alert
  let errorElement = document.getElementById('error-alert');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.id = 'error-alert';
    errorElement.setAttribute('role', 'alert');
    errorElement.className =
      'relative mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-start text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200';

    const body = document.createElement('div');
    body.className = 'flex-1';

    // <bdi> so a right-to-left filename (or a Latin one on an RTL page)
    // doesn't reorder the punctuation around it.
    const fileLine = document.createElement('bdi');
    fileLine.id = 'error-file';
    fileLine.className = 'mb-0.5 block font-mono text-xs font-medium break-all';

    const messageSpan = document.createElement('span');
    messageSpan.id = 'error-message';
    messageSpan.className = 'block';

    body.append(fileLine, messageSpan);

    errorElement.appendChild(body);
    errorElement.appendChild(
      makeCloseButton(
        'text-red-700 hover:text-red-900 dark:text-red-200 dark:hover:text-red-50',
        errorElement,
      ),
    );
  }

  // Show the alert in whichever region is on screen: the input before a
  // conversion, the results after one (e.g. a failed "Download .zip"). An alert
  // left inside the hidden region would be invisible and never announced.
  const results = document.getElementById('results');
  const container =
    results && !results.classList.contains('hidden')
      ? results
      : document.getElementById('input');
  if (container && errorElement.parentElement !== container) {
    container.insertBefore(errorElement, container.firstChild);
  }

  const fileElement = document.getElementById('error-file');
  if (fileElement) {
    fileElement.textContent = fileName ?? '';
    fileElement.hidden = !fileName;
  }
  const messageElement = document.getElementById('error-message');
  if (messageElement) messageElement.textContent = message;
  errorElement.classList.remove('hidden');
}

// Remove an alert. If focus was inside it (its close button), move focus to
// the current primary control instead of letting it fall back to <body>.
function dismissAlert(alert: HTMLElement): void {
  const hadFocus = alert.contains(document.activeElement);
  alert.remove();
  if (!hadFocus) return;
  const results = document.getElementById('results');
  const target =
    results && !results.classList.contains('hidden')
      ? primaryAction()
      : document.getElementById('file');
  target?.focus();
}

export function showWarnings(
  warnings: string[],
  technical: string[] = [],
): void {
  // Remove any existing warning alerts
  document.getElementById('warning-alert')?.remove();

  const warningElement = document.createElement('div');
  warningElement.id = 'warning-alert';
  // A polite status, not an assertive alert: warnings arrive with the success
  // announcement and focus move, and an alert would cut those off.
  warningElement.setAttribute('role', 'status');
  warningElement.className =
    'relative mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-start text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200';

  const warningList = document.createElement('ul');
  warningList.className = 'list-disc space-y-1 ps-4';
  warnings.forEach((warning) => {
    const listItem = document.createElement('li');
    listItem.textContent = warning;
    warningList.appendChild(listItem);
  });

  const body = document.createElement('div');
  body.className = 'flex-1';
  body.appendChild(warningList);
  if (technical.length > 0) {
    const disclosure = document.createElement('details');
    disclosure.className = 'mt-2';
    const summary = document.createElement('summary');
    summary.className =
      'cursor-pointer text-xs font-medium underline decoration-amber-400 underline-offset-2';
    summary.textContent = uiString('warningTechnical');
    const technicalList = document.createElement('ul');
    technicalList.className =
      'mt-1.5 space-y-0.5 font-mono text-[0.72rem] break-words';
    technicalList.dir = 'ltr';
    technical.forEach((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      technicalList.appendChild(item);
    });
    disclosure.append(summary, technicalList);
    body.appendChild(disclosure);
  }

  warningElement.appendChild(body);
  warningElement.appendChild(
    makeCloseButton(
      'text-amber-800 hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-50',
      warningElement,
    ),
  );

  // Just above the document they're about: below a batch's list of files,
  // which comes first in the results.
  const head = document.getElementById('result-head');
  const resultsElement = document.getElementById('results');
  if (head) head.before(warningElement);
  else resultsElement?.prepend(warningElement);
}

// Conversion errors thrown in the worker arrive as { name, message } (class
// identity doesn't survive the boundary), so they're told apart by name. The
// kind decides both the message the visitor sees and the `error` dimension of
// the anonymous conversion counter, so the two always agree.
// `fileName`, when the error is about a file the visitor just gave us, decides
// whether it's a Word file at all.
export function conversionErrorKind(
  error: unknown,
  fileName?: string,
): ConversionErrorKind {
  const name = (error as { name?: string })?.name;
  const unreadable =
    name === 'InvalidFileError' || name === 'UnsupportedFileError';
  // Something that isn't a Word file at all (README.md, a PDF, a spreadsheet)
  // fails as unreadable or as an unsupported container. "Open it in Word and
  // save it again" would be wrong advice for it, so say what it is instead.
  if (fileName && !/\.docx?$/i.test(fileName) && unreadable) return 'not-docx';
  if (name === 'InvalidFileError') return 'invalid';
  if (name === 'UnsupportedFileError') return 'protected';
  if (name === 'DocumentTooLargeError') return 'too-large';
  if (name === 'ConversionTimeoutError') return 'timeout';
  if (name === 'ConverterLoadError') return 'load';
  return 'conversion';
}

// The library's messages are English, so the actionable kinds get localized
// strings; the rest (including ConversionError, a generic "try again") get the
// generic message.
const CONVERSION_ERROR_STRINGS = {
  'not-docx': 'notWordFileError',
  invalid: 'invalidFileError',
  protected: 'protectedFileError',
  timeout: 'errorGeneric',
  load: 'errorGeneric',
  conversion: 'errorGeneric',
  'too-large': 'documentTooLargeError',
} as const satisfies Record<ConversionErrorKind, UIStringKey>;

// The localized message for a conversion error.
export function conversionErrorMessage(
  error: unknown,
  fileName?: string,
): string {
  const key = CONVERSION_ERROR_STRINGS[conversionErrorKind(error, fileName)];
  if (key === 'errorGeneric') console.error(error);
  return uiString(key);
}

// Show a conversion error, naming the file it's about (when there is one).
export function showConversionError(error: unknown, fileName?: string): void {
  showError(conversionErrorMessage(error, fileName), fileName);
}
