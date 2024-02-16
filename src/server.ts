import express from 'express';
import multer from 'multer';
import os from 'os';
import convert from "./main.js"
import helmet from "helmet";
import morgan from "morgan";

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: os.tmpdir() });
app.use(morgan('combined'));
app.use(helmet());

app.post('/raw', upload.single('doc'), async (req, res) => {
  // ensure the "doc" param is present in the form req
  if (!req.file) {
    res.status(400).send('You must upload a document to convert.');
    return;
  }

  // error if they uploaded something other than a .docx file
  if (!req.file.originalname.endsWith('.docx')) {
    res.status(400).send('It looks like you tried to upload something other than a Word Document.');
    return;
  }

  const md = await convert(req.file.path);
  res.status(200).send(md);
  return;
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})