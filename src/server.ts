import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import convert, { UnsupportedFileError } from './main.js';
import helmet from 'helmet';
import morgan from 'morgan';
import { Request } from 'express';

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
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === '.doc') {
        res
          .status(400)
          .send(
            'This tool only supports .docx files, not .doc files. Please save your document as a .docx file and try again.',
          );
        return;
      }
    }

    try {
      const md = await convert(req.file.path);
      res.status(200).send(md);
      return;
    } catch (error) {
      if (error instanceof UnsupportedFileError) {
        res.status(400).send(error.message);
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
