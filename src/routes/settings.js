const express = require('express');
const {
  loadLocalReviewSettings,
  saveLocalReviewSettings,
  normalizeLocalReviewSettings
} = require('../lib/reviewSettingsStore');
const { asyncHandler, httpError } = require('../lib/asyncHandler');

const router = express.Router();

router.get('/review-settings', asyncHandler(async (req, res) => {
  const data = loadLocalReviewSettings();
  res.json({ exists: !!data, settings: data });
}));

router.put('/review-settings', asyncHandler(async (req, res) => {
  try {
    const saved = saveLocalReviewSettings(req.body || {});
    res.json({ ok: true, settings: saved });
  } catch (err) {
    throw httpError(500, err.message || 'Save failed');
  }
}));

router.post('/review-settings/import', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const incoming = Array.isArray(body)
    ? null
    : (body.settings && typeof body.settings === 'object'
      ? body.settings
      : body);
  if (!incoming || typeof incoming !== 'object') {
    throw httpError(400, 'Invalid review settings payload');
  }
  try {
    const saved = saveLocalReviewSettings(normalizeLocalReviewSettings(incoming));
    res.json({ ok: true, settings: saved });
  } catch (err) {
    throw httpError(500, err.message || 'Import failed');
  }
}));

module.exports = router;
