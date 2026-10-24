const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, 'cf-security-skill');
const findingsValidator = require('./cf-security-skill/validate-findings.cjs');
const ledgerValidator = require('./cf-security-skill/validate-coverage-ledger.cjs');

const REPORT_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(SKILL_DIR, 'report-schema.json'), 'utf8')
);

const ATTACK_DOCS = {
  core: 'ATTACK-CLASSES.md',
  client: 'CLIENT-SIDE.md',
  web: 'WEB-PROTOCOL-AND-AUTH.md',
  ai: 'AI-AND-LLM.md',
  availability: 'RESOURCE-EXHAUSTION-AND-AVAILABILITY.md'
};

const MAX_DOC_CHARS = 12000;

function loadSkillDoc(name) {
  const filePath = path.join(SKILL_DIR, name);
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.length <= MAX_DOC_CHARS) return raw;
  return `${raw.slice(0, MAX_DOC_CHARS)}\n\n/* ... truncated for prompt size ... */`;
}

function validateFindings(findings) {
  if (!Array.isArray(findings)) {
    return { ok: false, errors: ['findings must be a JSON array'] };
  }
  let errors;
  try {
    errors = findingsValidator.validateDocument(findings, REPORT_SCHEMA);
  } catch (err) {
    return { ok: false, errors: [err.message || 'unexpected validation error'] };
  }
  return { ok: errors.length === 0, errors };
}

function validateCoverageLedger(ledger) {
  if (!Array.isArray(ledger)) {
    return { ok: false, errors: ['coverage ledger must be a JSON array'] };
  }
  let errors;
  try {
    errors = ledgerValidator.validateDocument(ledger);
  } catch (err) {
    return { ok: false, errors: [err.message || 'unexpected validation error'] };
  }
  return { ok: errors.length === 0, errors };
}

function pickTraceFile(finding) {
  const trace = Array.isArray(finding.trace) ? finding.trace : [];
  const sink = trace.find((t) => t && t.kind === 'sink');
  const entry = trace.find((t) => t && t.kind === 'entrypoint');
  const first = sink || entry || trace[0];
  if (!first || !first.file) return 'unknown';
  return first.line ? `${first.file}:${first.line}` : String(first.file);
}

function buildFix(finding) {
  if (finding.remediation) {
    const changes = Array.isArray(finding.remediation.code_changes)
      ? finding.remediation.code_changes
      : [];
    if (changes.length) {
      return changes
        .map((c) => `// ${c.file_name}\n${c.fixed_code || ''}`)
        .join('\n\n')
        .slice(0, 4000);
    }
    if (finding.remediation.strategy) return String(finding.remediation.strategy).slice(0, 4000);
  }
  if (finding.validation_plan) {
    const parts = [];
    if (finding.validation_plan.local) parts.push(`Local: ${finding.validation_plan.local}`);
    if (finding.validation_plan.deployment) parts.push(`Deploy: ${finding.validation_plan.deployment}`);
    if (parts.length) return parts.join('\n').slice(0, 4000);
  }
  return '';
}

function buildDescription(finding, lang) {
  const isEn = lang === 'en';
  const parts = [finding.description || ''];
  if (finding.root_cause) {
    parts.push(`${isEn ? 'Root cause' : 'Przyczyna'}: ${finding.root_cause}`);
  }
  if (finding.claimed_root_cause) {
    parts.push(`${isEn ? 'Claimed root cause' : 'Deklarowana przyczyna'}: ${finding.claimed_root_cause}`);
  }
  if (Array.isArray(finding.blockers) && finding.blockers.length) {
    parts.push(`${isEn ? 'Blockers' : 'Blokery'}: ${finding.blockers.join('; ')}`);
  }
  if (finding.severity && finding.severity.overall_severity) {
    parts.push(`${isEn ? 'Severity' : 'Dotkliwość'}: ${finding.severity.overall_severity}`);
  }
  return parts.filter(Boolean).join('\n\n').slice(0, 2000);
}

function mapFindingToIssue(finding) {
  const severity = finding.severity && finding.severity.overall_severity
    ? String(finding.severity.overall_severity).toLowerCase()
    : '';
  const isHardening = finding.verdict === 'confirmed'
    && (severity === 'low' || severity === 'informational');
  const needsVerify = finding.verdict === 'needs_validation';

  let category = 'critical';
  let cfBadge = 'cf';
  if (finding.verdict === 'confirmed' && isHardening) {
    category = 'quality';
    cfBadge = 'hardening';
  } else if (needsVerify) {
    category = 'critical';
    cfBadge = 'verify';
  } else if (finding.verdict === 'confirmed') {
    category = 'critical';
    cfBadge = 'cf';
  }

  return {
    category,
    issue: {
      file: pickTraceFile(finding),
      title: String(finding.title || 'Security finding').slice(0, 300),
      description: buildDescription(finding, 'pl'),
      fix: buildFix(finding),
      source: 'cf',
      cfBadge,
      verdict: finding.verdict,
      fingerprint: finding.fingerprint || '',
      severity: severity || undefined
    }
  };
}

function mapFindingsToReport(findings, lang = 'pl') {
  const report = {
    critical: [],
    framework: [],
    runtime: [],
    quality: []
  };
  let rejectedCount = 0;
  let confirmedCount = 0;
  let needsValidationCount = 0;

  const list = Array.isArray(findings) ? findings : [];
  for (const finding of list) {
    if (!finding || typeof finding !== 'object') continue;
    if (finding.verdict === 'rejected') {
      rejectedCount += 1;
      continue;
    }
    if (finding.verdict === 'confirmed') confirmedCount += 1;
    if (finding.verdict === 'needs_validation') needsValidationCount += 1;

    const mapped = mapFindingToIssue(finding);
    if (lang === 'en') {
      mapped.issue.description = buildDescription(finding, 'en');
    }
    report[mapped.category].push(mapped.issue);
  }

  return {
    report,
    meta: {
      total: list.length,
      confirmedCount,
      needsValidationCount,
      rejectedCount,
      mappedCritical: report.critical.length,
      mappedQuality: report.quality.length
    }
  };
}

function softMapFindings(findings, lang = 'pl') {
  const list = Array.isArray(findings) ? findings : [];
  const strict = validateFindings(list);
  const mapped = mapFindingsToReport(list, lang);
  return {
    ...mapped,
    validation: strict,
    soft: !strict.ok
  };
}

function selectAttackDocs(stackHints = {}) {
  const languages = (stackHints.languages || []).map((s) => String(s).toLowerCase());
  const frameworks = (stackHints.frameworks || []).map((s) => String(s).toLowerCase());
  const joined = [...languages, ...frameworks].join(' ');

  const selected = [ATTACK_DOCS.core];
  if (/html|css|javascript|typescript|react|vue|svelte|angular|next/.test(joined)) {
    selected.push(ATTACK_DOCS.client);
  }
  if (/node|express|http|php|python|java|go|\.net|nest|django|fastapi|laravel/.test(joined)) {
    selected.push(ATTACK_DOCS.web);
  }
  if (/ai|llm|openai|prompt|agent/.test(joined)) {
    selected.push(ATTACK_DOCS.ai);
  }
  selected.push(ATTACK_DOCS.availability);

  return [...new Set(selected)].slice(0, 3);
}

function buildSecurityPromptExtras(stackHints = {}, lang = 'pl') {
  const isEn = lang === 'en';
  const docs = selectAttackDocs(stackHints);
  const sections = docs.map((name) => {
    const body = loadSkillDoc(name);
    return `### Cloudflare attack class: ${name}\n\n${body}`;
  }).join('\n\n');

  const intro = isEn
    ? `SECURITY AUDIT MODE (Cloudflare security-audit-skill methodology, MIT).
Focus on real boundary failures. Defense-in-depth gaps without proven impact are low/informational hardening, not critical vulns.
Prefer returning a JSON ARRAY of findings compatible with Cloudflare findings.json when possible:
- verdict: "confirmed" | "needs_validation" | "rejected"
- required fields per verdict as in CF report-schema (title, description, trace[], evidence[], ...)
If full schema is too heavy, return the normal VibeCR report object with critical/framework/runtime/quality arrays instead.

Attack-class guidance:
`
    : `TRYB AUDYTU BEZPIECZEŃSTWA (metodyka Cloudflare security-audit-skill, MIT).
Skup się na realnych naruszeniach granic zaufania. Luki defense-in-depth bez udowodnionego wpływu to hardening (low/informational), nie krytyczne CVE.
Preferuj tablicę JSON findings zgodną z Cloudflare findings.json gdy to możliwe:
- verdict: "confirmed" | "needs_validation" | "rejected"
- wymagane pola wg report-schema CF (title, description, trace[], evidence[], ...)
Jeśli pełny schemat jest zbyt ciężki, zwróć zwykły obiekt raportu VibeCR (critical/framework/runtime/quality).

Klasy ataków:
`;

  return {
    docs,
    extras: `${intro}\n${sections}`.slice(0, 28000)
  };
}

module.exports = {
  SKILL_DIR,
  validateFindings,
  validateCoverageLedger,
  mapFindingsToReport,
  softMapFindings,
  buildSecurityPromptExtras,
  selectAttackDocs
};
