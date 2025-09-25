#!/usr/bin/env node

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const app = express();
const port = 8080;

// Serve static files from dist directory
app.use(express.static(path.join(projectRoot, 'dist')));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Test server running on http://localhost:${port}`);
});