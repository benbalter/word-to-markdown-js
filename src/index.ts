import convert, {
  UnsupportedFileError,
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
      const md = await convert(reader.result);

      const outputElement = document.getElementById('output');
      outputElement.innerText = md;

      const html = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSanitize)
        .use(rehypeStringify)
        .process(md);

      const renderedElement = document.getElementById('rendered');
      renderedElement.innerHTML = String(html);

      const filenameElement = document.getElementById('filename');
      filenameElement.innerText = file.name;

      const inputElement = document.getElementById('input');
      inputElement.classList.add('d-none');

      const resultsElement = document.getElementById('results');
      resultsElement.classList.remove('d-none');
    } catch (error) {
      if (error instanceof UnsupportedFileError) {
        showError(error.message);
        return;
      }
      // For other errors, show a generic message
      showError('An error occurred while converting the document.');
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
