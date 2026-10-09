# Vendored evidence retrieval modules

Source: https://github.com/coldiceh/ocg-ruling-assistant

Pinned commit: `83372752dc517b93f22ad4d85e46082f235cc16d`.

The following files are copied unchanged from upstream `backend/`:

- `rulebookPassageRetriever.mjs`
- `evidenceQuestionTypeClassifier.mjs`
- `liveOfficialQaProvider.mjs`

The upstream MIT license is retained in `LICENSE`. Surrounding Duel Compass integration is in `../ruling-evidence.mjs` and `../ruling-sources.mjs`; it does not embed or invoke upstream model-answer generation.

Evidence data comes from the commit-pinned upstream `data/` snapshot. Original record links, snapshot date and commit provenance are retained in the local manifest. Upstream's software license does not establish a general license grant over third-party card artwork, text or rulings. Name identity bridges carry factual-reference scope notice in `FACTUAL-REFERENCES.txt`; only necessary name/CID/Japanese-identity facts are imported. No images or complete third-party nickname databases are imported by this extension.
