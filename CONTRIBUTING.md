# Contributing to TxVault

Thank you for your interest in TxVault. This project is shared so others can learn from it, test it, and suggest improvements.

---

## Before you start

- Read the main [README](./README.md) for an overview and screenshots.
- Skim [ABOUT_THIS_REPOSITORY](./ABOUT_THIS_REPOSITORY.md) to see how the folders are organized.
- Make sure you can load the extension in Chrome as an unpacked extension.

---

## How to load the extension

1. Clone this repository.  
2. In Chrome, open **chrome://extensions**.  
3. Turn on **Developer mode**.  
4. Click **Load unpacked** and select the `TxVault/` folder.  

You should now see the TxVault icon in the toolbar.

---

## How to test

- Use a real Credit Karma account that you already own.  
- Start with safer presets like **Last Year** and **This Year**.  
- After each run, save the CSV and check:
  - First and last dates in the file.
  - Total number of rows.
  - The status on the completion card (for example, PRISTINE or with warnings).

If you see warnings or unexpected results, keep the console log and a copy of the CSV so you can describe the issue clearly.

---

## How to report an issue

When you open an issue, please include:

- Which preset you used (for example, "Last Year", "This Year").  
- Browser and OS (for example, Chrome on Windows 11).  
- A short description of what you expected vs what you saw.  
- Whether any browser privacy/ad‑block tools were active during the run.

Please do **not** share real account numbers, full names, or any sensitive personal data.

---

## Standard Developer Workflow

This project follows a structured development workflow to ensure code quality and security. For the complete workflow, see [ABOUT_THIS_REPOSITORY.md](./ABOUT_THIS_REPOSITORY.md#standard-developer-workflow).

**Quick Checklist:**
1. Create a feature branch from `main`
2. Implement your changes
3. **Run `npm run lint`** - Must pass with 0 errors
4. Test manually with at least one preset
5. Commit with clear messages
6. Open a Pull Request targeting `main`
7. Address any CI findings (SonarCloud analysis)

## Code and pull requests

Small pull requests are welcome, especially if they:

- Fix a clear bug in scrolling, date handling, or export.  
- Improve error messages or validation checks.  
- Tidy documentation without changing behavior.

Before opening a pull request:

1. **Run ESLint** - Execute `npm run lint` and ensure 0 errors (required)
2. **Test your changes** - Run against at least one preset (e.g., Last Month, Last Year)
3. **Update documentation** - If behavior or messages change, update relevant docs
4. **Keep changes focused** - Small, reviewable PRs are preferred

### Quality Requirements

- **ESLint**: Must pass with 0 errors before merging (run `npm run lint`)
- **Testing**: Manual verification with at least one preset required
- **Documentation**: Update docs if APIs or behavior change
- **Security**: All message handlers must validate sender origin and inputs (see `SECURITY_NOTES.md`)

---

## License and conduct

- This project follows the LICENSE file in the repository root.  
- Please be respectful and constructive in issues and pull requests.  
- If you have questions before making changes, open an issue to discuss first.
