# Security Notes - TxVault Chrome Extensions

**Last Updated:** 2025-12-01  
**Document Owner:** Security & Quality Assurance

---

## Overview

This document describes the security posture, permissions, data handling, and quality controls for the TxVault Chrome extensions in this repository.

---

## Extension Functionality

### TxVault (Main Extension)
Located in `TxVault/`, this is the primary Chrome extension that:
- Extracts transaction data from Credit Karma account pages
- Provides date range presets (Last Month, Last Year, etc.)
- Generates CSV files for local download
- Displays progress indicators and completion status

### TxVault-Basic
Located in `TxVault-Basic/`, this is a simplified version used for comparison and testing.

---

## Permissions Analysis

### TxVault/manifest.json Permissions

| Permission | Purpose | Justification |
|------------|---------|---------------|
| `activeTab` | Access to currently active tab | Required to read transaction data from Credit Karma pages when user activates the extension |
| `scripting` | Inject content scripts | Required to inject `content.js` into Credit Karma pages for DOM access |
| `tabs` | Query and manage browser tabs | Used to open/navigate to Credit Karma transactions page and check if page is already open |
| `storage` | Local storage access | Used to persist user preferences and extraction state (local only, never synced) |

**Content Script Matches:**
- `*://www.creditkarma.com/*`
- `*://creditkarma.com/*`

**Content Security Policy:**
- `script-src 'self'` - Only allows scripts from extension itself
- `object-src 'self'` - Prevents loading of external objects

### TxVault-Basic/manifest.json Permissions

| Permission | Purpose | Justification |
|------------|---------|---------------|
| `activeTab` | Access to currently active tab | Required to read transaction data from Credit Karma pages |
| `scripting` | Inject content scripts | Required to inject `content.js` into Credit Karma pages |

**Content Script Matches:**
- `*://www.creditkarma.com/*`

**Note:** TxVault-Basic uses fewer permissions (no `tabs` or `storage`) as it's a simplified version.

---

## Data Handling

### What Data is Read

The extension reads only transaction data that is **already visible** to the user on the Credit Karma website:
- Transaction dates
- Transaction descriptions
- Transaction amounts
- Transaction types (credit/debit)
- Account information visible on the page

### What Data is Stored Locally

- **User preferences:** Date range selections, extraction settings (stored in `chrome.storage.local`)
- **Extraction state:** Current progress during extraction (temporary, cleared after completion)
- **No transaction data is stored persistently** - transactions are only held in memory during extraction

### What Data is NOT Sent Anywhere

- ✅ **No network requests** - The extension does not make any HTTP/HTTPS requests
- ✅ **No external APIs** - No data is sent to third-party services
- ✅ **No cloud storage** - All data remains on the user's local machine
- ✅ **No analytics** - No usage tracking or telemetry
- ✅ **No credentials** - The extension never accesses or stores Credit Karma login credentials

### Data Flow

```
Credit Karma Page (DOM)
    ↓ (read only)
Extension Content Script (in-memory processing)
    ↓ (generate CSV)
Browser Download API (local file system)
```

**All processing happens locally in the browser. No data leaves the user's device.**

---

## Security and Quality Controls

### Code Quality Tools

#### SonarCloud Integration
- **Status:** Configured, analysis running via GitHub Actions
- **Workflow:** `.github/workflows/sonarcloud.yml` runs on every push to `main` and on pull requests
- **Configuration:** `sonar-project.properties` defines source directories and exclusions
- **Current Issue:** SonarCloud dashboard shows 0 Lines of Code despite successful workflow runs
  - Root cause analysis documented in `docs/ROOT_CAUSE_SONARCLOUD_ZERO_LOC.md`
  - Project recreated and configuration simplified
  - Support ticket filed with SonarCloud
- **Expected Coverage:** All JavaScript files in `TxVault/` and `TxVault-Basic/` directories

#### ESLint
- **Status:** ✅ Configured and active
- **Configuration:** `eslint.config.js` at repository root
- **Scope:** All JavaScript files in `TxVault/` and `TxVault-Basic/` directories
- **Current Rules:**
  - Security-focused: `no-eval`, `no-implied-eval`, `eqeqeq` (strict equality)
  - Code quality: `no-unused-vars`, `no-var`, `prefer-const`, formatting rules
- **Usage:**
  - Run locally: `npm run lint` (check for issues)
  - Auto-fix: `npm run lint:fix` (fix auto-fixable issues)
- **Requirement:** ESLint must pass (0 errors) before merging changes to `main`
- **Workflow Integration:** Part of the standard developer workflow (see `ABOUT_THIS_REPOSITORY.md#standard-developer-workflow`)

### Code Security Practices

#### Content Security Policy
- ✅ Strict CSP configured in manifest.json
- ✅ Only allows scripts from extension itself (`script-src 'self'`)
- ✅ Prevents external object loading (`object-src 'self'`)

#### Input Validation
- ✅ Date range inputs validated before processing
- ✅ Transaction data parsed with error handling
- ✅ Boundary checks prevent out-of-range extraction

#### No Dangerous Patterns Detected
- ✅ No `eval()` usage
- ✅ No `innerHTML` manipulation (uses DOM APIs)
- ✅ No external script loading
- ✅ No dynamic code execution

---

## Security Hardening Tasks

### Short-Term (High Priority)

- [ ] **Review innerHTML usage** - Audit all DOM manipulation to ensure no XSS vulnerabilities
  - **Status:** Initial scan shows no `innerHTML` usage, verify with comprehensive code review
  - **Owner:** Development team

- [x] **Add ESLint configuration** - ✅ Implemented ESLint with security-focused rules
  - **Status:** ESLint configured with `no-eval`, `no-implied-eval`, `eqeqeq` rules
  - **Future:** Consider adding `eslint-plugin-security` and `eslint-plugin-no-unsanitized` plugins
  - **Owner:** Development team

- [ ] **Error handling audit** - Review all error handling to ensure no sensitive data leaks in console/logs
  - **Focus areas:** Content script error handlers, popup error messages
  - **Owner:** Development team

- [ ] **Dependency check** - Verify no external dependencies (currently zero dependencies)
  - **Status:** Confirmed - pure vanilla JavaScript, no npm packages
  - **Action:** Document this as a security strength

- [ ] **Permission minimization review** - Verify all permissions are necessary
  - **Current:** `activeTab`, `scripting`, `tabs`, `storage` (TxVault) / `activeTab`, `scripting` (TxVault-Basic)
  - **Action:** Document justification for each permission (see Permissions Analysis above)

### Medium-Term

- [ ] **Add automated security scanning** - Integrate security-focused static analysis tools
  - **Options:** Snyk, npm audit (if dependencies added), GitHub Dependabot
  - **Owner:** DevOps/Development team

- [ ] **Security testing** - Add security-focused test cases
  - **Focus:** Input validation, boundary conditions, error handling
  - **Owner:** QA/Development team

- [ ] **Privacy policy update** - Ensure PRIVACY.md accurately reflects current data handling
  - **Status:** PRIVACY.md exists, verify it matches current implementation
  - **Owner:** Documentation team

### Long-Term

- [ ] **Security audit** - Consider third-party security review for production readiness
  - **Timeline:** Before major version release
  - **Owner:** Project maintainer

- [ ] **Threat modeling** - Document potential attack vectors and mitigations
  - **Focus:** Extension-specific threats (malicious websites, compromised updates)
  - **Owner:** Security team

---

## Known Limitations

### Current Limitations
- No automated security scanning beyond SonarCloud (when operational) and ESLint
- SonarCloud dashboard shows 0 LOC (support ticket in progress)
- Manual security review process

### Mitigations
- Zero external dependencies reduces attack surface
- Strict Content Security Policy prevents code injection
- Local-only data processing eliminates network attack vectors

---

## Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do not** open a public GitHub issue
2. Contact the repository maintainer directly
3. Provide details of the vulnerability and steps to reproduce

---

## References

- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/)
- [Content Security Policy Documentation](https://developer.chrome.com/docs/extensions/mv3/content_security_policy/)
- [Manifest V3 Permissions](https://developer.chrome.com/docs/extensions/mv3/declare_permissions/)

---

**Document Status:** Initial version - Security review pending  
**Next Review:** After SonarCloud integration is fully operational

