const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { asyncHandler, httpError } = require('../lib/asyncHandler');

const router = express.Router();

router.get('/browse', asyncHandler(async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'pl';
  let dirPath = req.query.path && String(req.query.path).trim();
  if (!dirPath) {
    if (process.platform === 'win32') {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const drives = letters
        .map((l) => l + ':\\')
        .filter((d) => fs.existsSync(d));
      return res.json({ path: '', parent: null, dirs: drives });
    }
    dirPath = '/';
  }

  if (!fs.existsSync(dirPath)) {
    throw httpError(400, lang === 'en' ? 'The given path is not a folder.' : 'Podana ścieżka nie jest folderem.');
  }
  let st;
  try {
    st = await fsp.lstat(dirPath);
  } catch (err) {
    throw httpError(500, lang === 'en'
      ? `Cannot read folder: ${err.message}`
      : `Nie można odczytać folderu: ${err.message}`);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw httpError(400, lang === 'en' ? 'The given path is not a folder.' : 'Podana ścieżka nie jest folderem.');
  }
  dirPath = path.resolve(dirPath);

  let entries;
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    throw httpError(500, lang === 'en'
      ? `Cannot read folder: ${err.message}`
      : `Nie można odczytać folderu: ${err.message}`);
  }
  const dirs = [];
  for (const e of entries) {
    if (e.name.startsWith('$') || e.name.startsWith('.')) continue;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) dirs.push(e.name);
  }
  dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const parent = path.dirname(dirPath) === dirPath ? null : path.dirname(dirPath);
  res.json({ path: dirPath, parent, dirs });
}));

module.exports = router;
