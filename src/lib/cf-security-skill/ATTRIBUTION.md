# Attribution

This directory vendors selected files from:

- **Project:** [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)
- **License:** MIT
- **Copyright:** Cloudflare, Inc. and contributors

Included for use inside VibeCR:

- `validate-findings.cjs`
- `validate-coverage-ledger.cjs`
- `report-schema.json`
- `ATTACK-CLASSES.md`
- `CLIENT-SIDE.md`
- `WEB-PROTOCOL-AND-AUTH.md`
- `AI-AND-LLM.md`
- `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`

VibeCR consumes `findings.json` produced by the Cloudflare skill (or a compatible Security AI pass). The full six-phase multi-agent harness remains outside VibeCR and is intended to run via a coding agent with the upstream skill installed.
