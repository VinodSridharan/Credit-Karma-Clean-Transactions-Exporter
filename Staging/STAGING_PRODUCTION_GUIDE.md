# Staging & Production Folders Guide

**Date**: November 18, 2025, 15:45:00  
**Status**: ✅ Folders Created and Ready

---

## 📋 Overview

Three key folders in the project:

1. **`CK_TX_Downloader_JavaScript/`** - Development/Testing Folder (for active development and Chrome testing)
2. **`Production/`** - Published/Shared Folder ⭐ (source of truth for GitHub publishing)
3. **`Staging/`** - Development documentation files (all project docs, not for sharing)

**Development Workflow**: Code changes developed in `CK_TX_Downloader_JavaScript` folder **must be synced to `Production` folder** before publishing. `Production` folder is what users download/clone from GitHub.

---

## 📦 CK_TX_Downloader_JavaScript Folder (Development/Testing)

**Purpose**: Active development and testing folder  
**Contents**: Development code, debug logs, test files

**Usage**:
- Load this folder in Chrome extensions for testing: `chrome://extensions/` → Load unpacked → Select `CK_TX_Downloader_JavaScript` folder
- Make all code changes here first
- Test thoroughly before syncing to Production

**Important**: After testing, sync updated files to `Production` folder before publishing.

---

## 📦 Staging Folder

**Purpose**: Development documentation files (not for sharing)  
**Contents**: All project documentation files

### Files in Staging (48 files total)

#### **Core Extension Files** (7)
- `manifest.json` - Extension manifest
- `content.js` - Main content script
- `popup.js` - Popup logic
- `popup.html` - Popup UI
- `popup.css` - Popup styles
- `background.js` - Background script
- `icon.png` - Extension icon

#### **Documentation Files** (20)
- `README.md` - Main user guide
- `CHANGELOG.md` - Version history
- `QUICK_START.md` - Quick reference
- `PROJECT_REVIEW.md` - Project overview
- `PROJECT_PLAN.md` - Project plan
- `AGENDA.md` - Step-by-step agenda
- `SUCCESS_STORIES.md` - Achievements
- `TESTING_RECORDS.md` - Test results
- `ROOT_CAUSE_ANALYSIS.md` - Issue tracking
- `STATUS_SUMMARY.md` - Status summary
- `EXTENSION_VERSIONS_GUIDE.md` - Version guide
- `MIGRATION_VERSION_COMPARISON.md` - Migration tracking
- `STEP_1.1_CODE_IMPLEMENTATION_LOG.md` - Code logs
- `STEP_1.1_VERIFICATION_GUIDE.md` - Verification guide
- `BOUNDARY_CUSTOM_DATE_TESTING_GUIDE.md` - Testing guide
- `QUICK_TEST_CHECKLIST.md` - Test checklist
- `FOLDER_CLEANUP_PLAN.md` - Cleanup plan
- `GIT_UPLOAD_STEPS.md` - GitHub publishing guide
- `GIT_VISIBLE_FILES.md` - Git files summary
- `.gitignore` - Git ignore rules

#### **Reference & Accuracy Documentation** (21)
- `REFERENCE_AND_ACCURACY/README.md`
- `REFERENCE_AND_ACCURACY/Comparison/` (15 files)
- `REFERENCE_AND_ACCURACY/Reference/` (5 files)

**Use For**: 
- ✅ Development documentation reference
- ✅ Full documentation suite
- ✅ Project planning and tracking

**Note**: Staging folder contains development docs. For GitHub publishing, only `Production` folder files are shared.

---

## 🚀 Production Folder (Published/Shared) ⭐

**Purpose**: Published/Shared Folder - Source of truth for GitHub publishing  
**Contents**: Essential extension files + screenshots + README

**Important**: This is the **source of truth** for published/shared code. Users who download/clone from GitHub get this folder version.

### Files in Production (11 files)

#### **Required Extension Files** (8 files)
1. ✅ `manifest.json` - Extension manifest (REQUIRED)
2. ✅ `content.js` - Main content script (REQUIRED)
3. ✅ `popup.js` - Popup logic (REQUIRED)
4. ✅ `popup.html` - Popup UI (REQUIRED)
5. ✅ `popup.css` - Popup styles (REQUIRED)
6. ✅ `background.js` - Background script (REQUIRED)
7. ✅ `icon.png` - Extension icon (REQUIRED)
8. ✅ `README.md` - Production readme

#### **Screenshots Folder** (3 files)
- ✅ `Screenshots/Extension UI.png` - Extension popup interface
- ✅ `Screenshots/Export Notification.png` - Export completion notification
- ✅ `Screenshots/Runtime Notifications.png` - Runtime status notifications

**Use For**: 
- ✅ GitHub publishing (this folder is what users download)
- ✅ Extension installation/load in Chrome
- ✅ Production deployment
- ✅ Minimal distribution package

**Development Workflow**:
1. **Develop & Test**: Make changes in `CK_TX_Downloader_JavaScript` folder
2. **Test**: Load `CK_TX_Downloader_JavaScript` folder in Chrome and test your changes
3. **Sync to Production**: Copy updated files from `CK_TX_Downloader_JavaScript` to `Production` folder
4. **Verify**: Ensure `Production` folder has the latest code
5. **Publish**: Commit and push `Production` folder to GitHub

**Files to Sync**:
- `content.js`
- `popup.js`
- `popup.html`
- `popup.css`
- `background.js`
- `manifest.json`
- `icon.png`
- `README.md` (if updated)
- `LICENSE` (if updated)

**What's NOT Included**:
- ❌ Development documentation files (those are in Staging)
- ❌ Reference materials (those are in Staging)
- ❌ Test scripts
- ❌ Project planning documents (those are in Staging)

---

## 📊 Comparison

| Feature | CK_TX_Downloader_JavaScript | Production Folder | Staging Folder |
|---------|---------------------------|-------------------|----------------|
| **Purpose** | Development/Testing | Published/Shared ⭐ | Dev Documentation |
| **Files** | Extension files + docs | 11 files (core + README + Screenshots) | All project docs |
| **Documentation** | ✅ Dev docs | ✅ README only | ✅ All docs |
| **Extension Files** | ✅ Latest code | ✅ Synced from JS folder | ✅ Copied files |
| **Screenshots** | ❌ Not included | ✅ 3 files | ❌ Not included |
| **Reference Docs** | ✅ Included | ❌ Not included | ✅ Included |
| **Size** | Large (dev + docs) | Small (essential only) | Medium (docs only) |
| **Use For** | Chrome testing | GitHub publishing | Dev reference |
| **Visibility** | Local only | Public (GitHub) | Local only |

---

## 🎯 Usage Guide

### For Development & Testing:
→ Use **`CK_TX_Downloader_JavaScript/`** folder
- Load this folder in Chrome extensions for testing
- Make all code changes here first
- Test thoroughly

### For GitHub Publishing:
→ Use **`Production/`** folder ⭐
- This folder is what gets published to GitHub
- This folder is what users download/clone
- Must be synced from `CK_TX_Downloader_JavaScript` before publishing
- Contains only essential files (11 files: 7 core + 1 README + 1 LICENSE + 3 screenshots)

### For Development Documentation:
→ Use **`Staging/`** folder
- All project documentation files
- Development reference materials
- Not for sharing (local only)

### For Extension Installation:
→ Use **`Production/`** folder
- Users download/clone this folder from GitHub
- Contains all essential extension files
- Load directly in Chrome
- Minimum package size

---

## ✅ Verification Checklist

### CK_TX_Downloader_JavaScript Folder (Development):
- ✅ Latest code for testing
- ✅ All extension files present
- ✅ Development documentation included
- ✅ Ready for Chrome loading and testing

### Production Folder (Published):
- ✅ `manifest.json` present (Version 3.0.1)
- ✅ `content.js` present (with transaction type deduplication)
- ✅ `popup.js` present (all 5 presets)
- ✅ `popup.html` present (all 5 preset buttons)
- ✅ `popup.css` present
- ✅ `background.js` present
- ✅ `icon.png` present
- ✅ `README.md` present (user-focused, no dev references)
- ✅ `LICENSE` present
- ✅ `Screenshots/` folder present (3 files)
- ✅ Ready for GitHub publishing
- ✅ Ready for Chrome loading

### Staging Folder (Documentation):
- ✅ All documentation files present
- ✅ Reference materials included
- ✅ Development tracking documents
- ✅ Not for sharing (local only)

---

## 📝 Important Notes

- **CK_TX_Downloader_JavaScript folder** is for development/testing - load in Chrome for testing
- **Production folder** is the source of truth for GitHub publishing - this is what users get
- **Staging folder** contains development documentation - not for sharing (local only)
- **Critical**: Any code changes in `CK_TX_Downloader_JavaScript` must be synced to `Production` before publishing
- **Production folder** works exactly like `CK_TX_Downloader_JavaScript` - same code, same functionality
- Users who download/clone from GitHub get the `Production` folder version
- Both `Production` and `CK_TX_Downloader_JavaScript` folders can be loaded in Chrome extensions and will work identically

---

**Last Updated**: 2025-11-18 19:22:41  
**CK_TX_Downloader_JavaScript**: Development/Testing folder (latest code)  
**Production Files**: 11 files (7 core + 1 README + 1 LICENSE + 3 screenshots)  
**Staging Files**: Development documentation (local only, not for sharing)  
**Status**: ✅ Production Ready - Version 3.0.1 Published to GitHub

