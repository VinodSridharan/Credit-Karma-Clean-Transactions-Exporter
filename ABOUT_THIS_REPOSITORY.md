# About this repository

This repository contains TxVault, a small Chrome extension that helps you export clean, well‑labeled transaction data from your Credit Karma account.  
It is organized to be easy to read for visitors, while keeping deeper internal notes separate.

---

## What this project does

- TxVault reads the same posted transactions you already see in your browser.  
- It turns those on‑screen rows into a tidy CSV file.  
- You can open that CSV in Excel, Power BI, or any analysis tool.  
- The focus is on accuracy, clear status messages, and audit‑friendly exports.

---

## How it works at a high level

- You pick a preset such as "Last Year" or "This Year" from the extension popup.  
- The extension scrolls the account page within safe limits.  
- It checks dates and counts as it goes, so it knows what it actually captured.  
- At the end, it shows a completion card with status and total rows.

The goal is to behave like a careful human reviewer, not an aggressive scraper.

---

## A closer look at this repository

This repo is split into a few main areas:

### Root folder

- `README.md` – main overview and quick start.  
- `PRIVACY.md` – privacy details.  
- `TERMS.md` – terms of use.  
- `CONTRIBUTING.md` – how to test the extension and give feedback.  
- `.gitignore` – which files are kept out of version control.

### Extension folders

- `TxVault/` – main extension code and UI screenshots.  
- `TxVault-Basic/` – a simpler comparison version of the extension.  

These folders hold the actual manifest, content scripts, popup UI, and the screenshots that appear in the main README.

### Project review

For a deeper narrative of how this project was designed, tested, and refined, see:

- [TxVault project review](./TxVault/Documentation/PROJECT_REVIEW.md)

This document is written for reviewers, hiring managers, and collaborators. It summarizes:

- The latest changes and why they were made.
- Key lessons learned during development and validation.
- Major themes such as reliability, data quality, browser constraints, and QC standards.

### Documentation folder

- `docs/SUCCESS_STORIES.md` – short stories that show how TxVault helped in real cases.  
- `docs/VALIDATION_REPORT.md` – high‑level notes on how key presets were tested and what results they produced.  
- `docs/ROOT_CAUSE_SONARCLOUD_ZERO_LOC.md` – analysis of SonarCloud integration issues and resolution steps.  
- `docs/internal/` – many deeper internal notes and process documents. This folder is private and ignored in the public view.

---

## What is public and what is private

To keep things simple for visitors:

**Public files show:**
- What TxVault is.  
- How to use it.  
- How well the key presets were validated.  

**Private/internal files (under `docs/internal/`) hold:**
- Detailed workflow and policy notes.  
- Experiments and trial runs.  
- Internal checklists and status reports.

This split keeps the GitHub view clean for reviewers and recruiters, while still preserving a full internal audit trail in the private docs.

---

## Code Quality and Security

### ESLint

This repository uses ESLint for local code quality and security checks:

- **Configuration:** `eslint.config.js` at repository root
- **Scope:** All JavaScript files in `TxVault/` and `TxVault-Basic/` directories
- **Run locally:**
  - `npm run lint` - Check for issues
  - `npm run lint:fix` - Auto-fix issues where possible
- **Requirement:** ESLint must pass (0 errors) before merging changes to `main`
- **Current rules:** Security-focused rules (`no-eval`, `no-implied-eval`, `eqeqeq`) and code quality rules

### SonarCloud Integration

This repository uses SonarCloud for automated code quality and security analysis:

- **Workflow:** `.github/workflows/sonarcloud.yml` runs analysis on every push to `main` and on pull requests
- **Configuration:** `sonar-project.properties` defines source directories (`TxVault/`, `TxVault-Basic/`) and exclusions
- **Status:** Workflow runs successfully, but SonarCloud dashboard currently shows 0 Lines of Code
- **Resolution:** Project recreated in SonarCloud, configuration simplified, and support ticket filed
- **Details:** See `docs/ROOT_CAUSE_SONARCLOUD_ZERO_LOC.md` for complete analysis

### Security Documentation

- **Security Notes:** See `SECURITY_NOTES.md` for permissions analysis, data handling, and security controls
- **Privacy:** See `PRIVACY.md` for data privacy details

---

## How to read this repository

If you are new here and just want the basics:

1. Start with `README.md` for the big picture and screenshots.  
2. Skim `SUCCESS_STORIES.md` to see what kinds of problems TxVault solves.  
3. Look at `VALIDATION_REPORT.md` if you care about how the main presets were tested.  
4. Open the `TxVault/` folder if you want to see the extension code and structure.

If you are a developer, you can then:

- Load `TxVault/` as an unpacked extension in Chrome.  
- Use `CONTRIBUTING.md` for testing steps and basic guidance.  
- Review `SECURITY_NOTES.md` for security and permissions information.  
- Follow the normal Git workflow against this cleaned, public‑ready layout.

---

## Lessons Learned and Process Improvements

### SonarCloud Integration Experience

During the integration of SonarCloud code quality analysis, several process improvements were identified:

**Key Learnings:**
- Start with minimal configuration (`sonar.sources=.`) before adding exclusions
- Make incremental changes and verify each step with workflow logs
- Know when to stop tweaking configs and escalate to vendor support
- Document all configuration attempts and evidence before contacting support

**Proposed Improvements:**
- Create quality-tool onboarding checklist template
- Develop standard SonarCloud configuration template for JavaScript projects
- Establish process for documenting and tracking support tickets
- Add automated verification to ensure analysis produces results

For detailed root cause analysis, see `docs/ROOT_CAUSE_SONARCLOUD_ZERO_LOC.md`.

## Standard Developer Workflow

This repository follows a structured, auditable development workflow designed to ensure code quality and security at every step. The workflow is repeatable and documented to support both individual contributors and team collaboration.

### Workflow Overview

The development process follows this sequence:

1. **Create or update a feature branch** from `main`
   - Use descriptive branch names (e.g., `feature/date-validation`, `bugfix/message-handler`)
   - Keep branches focused on a single change or feature

2. **Implement changes**
   - Write code following existing patterns and style
   - Update documentation if behavior or APIs change

3. **Run ESLint locally** - **Required before committing**
   - Run `npm run lint` to check for code quality and security issues
   - Fix errors manually or use `npm run lint:fix` for auto-fixable issues
   - **ESLint must pass with 0 errors before merging to `main`**

4. **Run manual tests**
   - Test changes with at least one preset (e.g., Last Month, Last Year)
   - Verify the extension loads and functions correctly in Chrome
   - Check that exported CSV files are valid and complete

5. **Commit with clear messages**
   - Use descriptive commit messages that explain what changed and why
   - Reference related issues when applicable (e.g., "Fixes #12")

6. **Open a Pull Request**
   - Target the `main` branch
   - Include a clear description of changes
   - Reference any related issues or discussions

7. **Let CI run and address findings**
   - GitHub Actions will run SonarCloud analysis (once the 0-LOC issue is resolved)
   - Review any security hotspots or code quality issues reported
   - Address critical findings before requesting review

8. **Code review and merge**
   - Address reviewer feedback
   - Ensure all checks pass before merging

### Quality Toolchain

The workflow uses a layered approach to catch issues at different stages:

- **ESLint (Local)** - Catches code quality and security issues before committing
  - Run: `npm run lint` or `npm run lint:fix`
  - **Requirement**: Must pass (0 errors) before merging

- **SonarLint (Editor)** - Real-time security and bug detection as you code
  - IDE extension provides immediate feedback
  - Aligns with SonarCloud rules for consistency

- **SonarCloud (CI/CD)** - Automated analysis on every push and PR
  - Runs via GitHub Actions workflow
  - Provides security hotspot detection and code quality metrics
  - **Note**: Currently experiencing a 0-LOC indexing issue (see `docs/ROOT_CAUSE_SONARCLOUD_ZERO_LOC.md`)

This layered approach ensures issues are caught early (ESLint), validated in real-time (SonarLint), and tracked at the branch level (SonarCloud).

### Branching Strategy

- **`main`** - Production-ready code, always deployable
- **Feature branches** - Named `feature/description` for new functionality
- **Bugfix branches** - Named `bugfix/description` for bug fixes
- All changes merge to `main` via Pull Request

### Required Checks Before Merge

- ✅ ESLint passes with 0 errors
- ✅ Manual testing completed (at least one preset verified)
- ✅ Documentation updated if behavior changed
- ✅ Commit messages are clear and descriptive
- ✅ PR description explains changes and rationale

For detailed testing procedures, see [CONTRIBUTING.md](./CONTRIBUTING.md).

