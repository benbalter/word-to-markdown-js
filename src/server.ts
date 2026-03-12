import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import {
  convertWithWarnings,
  UnsupportedFileError,
  FileNotFoundError,
  InvalidFileError,
  FilePermissionError,
  ConversionError,
  validateFileExtension,
} from './main.js';
import helmet from 'helmet';
import morgan from 'morgan';
import { Request } from 'express';

// Escapes HTML meta-characters to prevent XSS in error messages
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validates that a file path is within the expected temporary directory
// to prevent path traversal attacks
function validateFilePath(filePath: string): void {
  const tmpDir = os.tmpdir();
  const resolvedPath = path.resolve(filePath);
  const resolvedTmpDir = path.resolve(tmpDir);

  // Ensure the resolved path starts with the temporary directory
  if (!resolvedPath.startsWith(resolvedTmpDir)) {
    throw new Error('Invalid file path: file must be in temporary directory');
  }

  // Additional check: ensure no parent directory references
  if (filePath.includes('..')) {
    throw new Error('Invalid file path: path traversal not allowed');
  }
}

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: os.tmpdir() });
app.use(morgan('combined'));

app.use(helmet());

app.post(
  '/raw',
  upload.single('doc'),
  async (req: Request & { file: multer.File }, res) => {
    if (
      !req.file ||
      typeof req.file !== 'object' ||
      !req.file.path ||
      !req.file.originalname
    ) {
      res.status(400).send('You must upload a document to convert.');
      return;
    }

    // Check if the original filename has .doc extension
    if (req.file.originalname) {
      try {
        validateFileExtension(req.file.originalname);
      } catch (error) {
        if (error instanceof UnsupportedFileError) {
          res.status(400).send(escapeHtml(error.message));
          return;
        }
        throw error;
      }
    }

    // Validate the file path to prevent path traversal attacks
    try {
      validateFilePath(req.file.path);
    } catch {
      res.status(400).send('Invalid file path');
      return;
    }

    try {
      const result = await convertWithWarnings(req.file.path);

      // If there are warnings, include them in a custom header
      // Use JSON encoding to properly handle special characters in warning messages
      if (result.warnings.length > 0) {
        res.setHeader('X-Conversion-Warnings', JSON.stringify(result.warnings));
      }

      res.status(200).type('text/plain').send(result.markdown);
      return;
    } catch (error) {
      // Handle all our custom errors with appropriate status codes
      // Note: UnsupportedFileError is already caught during filename validation above,
      // so it won't reach here, but we keep it for defensive programming
      if (
        error instanceof UnsupportedFileError ||
        error instanceof InvalidFileError
      ) {
        res.status(400).send(escapeHtml(error.message));
        return;
      }
      if (error instanceof FileNotFoundError) {
        res.status(404).send(escapeHtml(error.message));
        return;
      }
      if (error instanceof FilePermissionError) {
        res.status(403).send(escapeHtml(error.message));
        return;
      }
      if (error instanceof ConversionError) {
        res.status(500).send(escapeHtml(error.message));
        return;
      }
      throw error;
    }
  },
);

app.get('/_healthcheck', (_req, res) => {
  res.status(200).send('OK');
  return;
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
