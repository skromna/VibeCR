const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Endpoint: przeglądanie drzewa folderów
router.get('/browse', (req, res) => {
  let dirPath = req.query.path && String(req.query.path).trim();
  if (!dirPath) {
    // Start: dyski na Windows / root na Linuxie
    if (process.platform === 'win32') {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const drives = letters
        .map((l) => l + ':\\')
        .filter((d) => fs.existsSync(d));
      return res.json({ path: '', parent: null, dirs: drives });
    }
    dirPath = '/';
  }

  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return res.status(400).json({ error: 'Podana ścieżka nie jest folderem.' });
    }
    dirPath = path.resolve(dirPath);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('$') && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const parent = path.dirname(dirPath) === dirPath ? null : path.dirname(dirPath);
    res.json({ path: dirPath, parent, dirs });
  } catch (err) {
    res.status(500).json({ error: `Nie można odczytać folderu: ${err.message}` });
  }
});

module.exports = router;
