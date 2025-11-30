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

### Documentation folder

- `docs/SUCCESS_STORIES.md` – short stories that show how TxVault helped in real cases.  
- `docs/VALIDATION_REPORT.md` – high‑level notes on how key presets were tested and what results they produced.  
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

## How to read this repository

If you are new here and just want the basics:

1. Start with `README.md` for the big picture and screenshots.  
2. Skim `SUCCESS_STORIES.md` to see what kinds of problems TxVault solves.  
3. Look at `VALIDATION_REPORT.md` if you care about how the main presets were tested.  
4. Open the `TxVault/` folder if you want to see the extension code and structure.

If you are a developer, you can then:

- Load `TxVault/` as an unpacked extension in Chrome.  
- Use `CONTRIBUTING.md` for testing steps and basic guidance.  
- Follow the normal Git workflow against this cleaned, public‑ready layout.

