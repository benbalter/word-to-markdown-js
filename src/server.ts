import express from 'express';
import multer from 'multer';
import os from 'os';
import convert from './main.js';
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
    if (!(req.file instanceof multer.File)) {
      res.status(400).send('You must upload a document to convert.');
      return;
    }

    const md = await convert(req.file.path);

    res.status(200).send(md);
    return;
  },
);

app.get('/_healthcheck', (_req, res) => {
  res.status(200).send('OK');
  return;
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
