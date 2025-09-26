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
// Note: This is a test server only - rate limiting intentionally omitted for E2E testing
app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Test server running on http://localhost:${port}`);
});
