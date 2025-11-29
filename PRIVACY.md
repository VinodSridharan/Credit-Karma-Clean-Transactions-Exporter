## TxVault Exporter – Privacy & Data Use

**Last Updated:** 2025‑11‑27  
**Status:** Draft – for review

---

## 1. What data this extension can see

When you use TxVault Exporter on the Credit Karma transactions page, the extension can read:

- **Transaction details shown in your browser**, such as:
  - Date, description, amount, category, transaction type (credit/debit), and status (posted/pending)
  - Account name and any labels/notes that appear in the transaction tiles
- **Page structure and scroll position**, used only to locate and extract the visible transaction rows.

TxVault **does not** access:

- Your Credit Karma login credentials (username, password, MFA codes), or
- Any other websites or browser tabs that are not part of the supported Credit Karma transactions pages.

---

## 2. How data is processed (local only, no telemetry, no servers)

All processing performed by TxVault Exporter happens **entirely inside your browser**:

- Transaction data is read from the **currently loaded page DOM**.
- Filtering, deduplication, and date‑range logic run in the **content script in your browser**.
- CSV files are generated **locally in memory** and then downloaded to your machine.

TxVault:

- **Does not send** your transaction data to any remote server controlled by the author or any third party.
- **Does not include** built‑in analytics, telemetry, tracking pixels, or ads.
- **Does not log** your transaction content to any external service.

Any network activity you see while using TxVault should be from the underlying Credit Karma site itself, not from the extension.

---

## 3. What is stored

TxVault stores only minimal configuration data:

- In `chrome.storage` (or the browser’s equivalent), it may keep:
  - **User preferences**, such as theme (dark/light), last used preset, and whether you have accepted the first‑run legal notice.
  - **Internal flags** needed to avoid re‑showing onboarding notices.

These stored items:

- Do **not** include your detailed transaction data.
- Can usually be cleared by removing the extension or clearing extension/storage data in your browser.

When you export:

- The extension generates one or more **CSV files** and triggers a standard browser download.
- Those CSV files are stored **wherever your browser saves downloads** (e.g., `Downloads` folder) and are under **your full control**.

Uninstalling the extension removes its ability to access your Credit Karma pages, but it does **not** delete any CSV files you have already exported; those remain wherever you saved or moved them.

TxVault does **not**:

- Maintain a central database of your transactions.
- Sync your data across devices.
- Automatically delete any exported files.

---

## 4. User responsibilities for protecting exported data

Exported CSVs may contain **sensitive financial information** similar to bank statements. You are responsible for:

- **Where you store the files** (e.g., local disk, cloud storage, backup drives).
- **Who can access them** (e.g., shared computers, shared folders, email forwarding).
- **How long you retain them**, and whether you securely delete them when no longer needed.

Best practices include:

- Storing exports only on **trusted, access‑controlled devices**.
- Avoiding sending CSVs unencrypted over email or chat.
- Deleting old exports you no longer need, especially from shared or cloud locations.
- Following any **legal, tax, or compliance rules** that apply to you or your business.

---

## 5. Open source and third‑party services

TxVault Exporter is an **open‑source** project licensed under the MIT License. You can review the full source code and license text here:

- Main repository: `https://github.com/VinodSridharan/TxVault-Exporter`  
- License: `https://github.com/VinodSridharan/TxVault-Exporter/blob/main/LICENSE`

The extension itself does not rely on any hosted backend or third‑party analytics. Any additional tools you may use to open or analyze CSV files (e.g., Excel, Google Sheets, Python scripts, cloud BI tools) have **their own** privacy practices and terms, which you should review separately.

---

## 6. Contact / feedback

If you have privacy questions or suggestions:

- Open an issue in the GitHub repository:  
  `https://github.com/VinodSridharan/TxVault-Exporter/issues`

Because this is an open‑source project maintained on a best‑effort basis, responses may not be immediate, but feedback is welcome.


