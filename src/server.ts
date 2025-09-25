import express from 'express';
import multer from 'multer';
import os from 'os';
import convert, {
  UnsupportedFileError,
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

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: os.tmpdir() });
app.use(morgan('combined'));

app.use(helmet());

app.post(
  '/raw',
  upload.single('doc'),
  async (req: Request & { file: multer.File }, res) => {
    if (!req.file) {
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

    try {
      const md = await convert(req.file.path);
      res.status(200).send(md);
      return;
    } catch (error) {
      if (error instanceof UnsupportedFileError) {
        res.status(400).send(escapeHtml(error.message));
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
