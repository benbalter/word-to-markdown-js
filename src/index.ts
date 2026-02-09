import {
  convertWithWarnings,
  UnsupportedFileError,
  InvalidFileError,
  ConversionError,
  validateFileExtension,
} from './main.js';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import ClipboardJS from 'clipboard';
import './dark-mode.css';

async function handleFile(): Promise<void> {
  const reader = new FileReader();
  const file = this.files[0];

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

      const html = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSanitize)
        .use(rehypeStringify)
        .process(result.markdown);

      const renderedElement = document.getElementById('rendered');
      renderedElement.innerHTML = String(html);

      const filenameElement = document.getElementById('filename');
      filenameElement.innerText = file.name;

      const inputElement = document.getElementById('input');
      inputElement.classList.add('d-none');

      const resultsElement = document.getElementById('results');
      resultsElement.classList.remove('d-none');
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
    errorElement.className = 'alert alert-danger alert-dismissible fade show';
    errorElement.innerHTML = `
      <span id="error-message"></span>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    const inputElement = document.getElementById('input');
    if (inputElement) {
      inputElement.insertBefore(errorElement, inputElement.firstChild);
    }
  }

  const messageElement = document.getElementById('error-message');
  messageElement.textContent = message;

  // Show the error element
  errorElement.classList.remove('d-none');
}

function showWarnings(warnings: string[]): void {
  // Remove any existing warning alerts
  const existingWarnings = document.getElementById('warning-alert');
  if (existingWarnings) {
    existingWarnings.remove();
  }

  // Create warning alert with proper ARIA attributes for accessibility
  const warningElement = document.createElement('div');
  warningElement.id = 'warning-alert';
  warningElement.className = 'alert alert-warning alert-dismissible fade show';
  warningElement.setAttribute('role', 'alert');
  warningElement.setAttribute('aria-live', 'polite');

  // Create a list of warnings for better semantic structure
  const warningList = document.createElement('ul');
  warningList.className = 'mb-0';
  warnings.forEach((warning) => {
    const listItem = document.createElement('li');
    listItem.textContent = warning;
    warningList.appendChild(listItem);
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn-close';
  closeButton.setAttribute('data-bs-dismiss', 'alert');
  closeButton.setAttribute('aria-label', 'Close');

  warningElement.appendChild(warningList);
  warningElement.appendChild(closeButton);

  const resultsElement = document.getElementById('results');
  if (resultsElement) {
    resultsElement.insertBefore(warningElement, resultsElement.firstChild);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById('file');
  inputElement.addEventListener('change', handleFile, false);

  const copyButton = document.getElementById('copy-button');
  if (copyButton !== null) {
    new ClipboardJS('#copy-button');
  }

  // Theme changes are handled automatically by CSS using prefers-color-scheme media query.
  // If manual theme switching is needed in the future, add a MediaQuery listener here.
});
