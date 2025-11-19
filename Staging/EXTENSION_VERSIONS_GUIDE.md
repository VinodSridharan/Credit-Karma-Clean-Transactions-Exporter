# Extension Versions Guide

**Date**: November 18, 2025, 15:36:18  
**Status**: ✅ Current Production Version Identified

---

## 🎯 Quick Answer: Which Folder Should You Use?

### ✅ **FOR PRODUCTION USE (Recommended)**
**Folder**: `October-133-Version-Polished/`  
**Version**: **3.0** - Production Ready  
**Status**: ✅ Latest stable version with 5 verified working presets

---

## 📊 Version List

### 🟢 **PRODUCTION VERSION**

#### **October-133-Version-Polished** ⭐ **CURRENT - RECOMMENDED**

**Location**: `CreditKarmaExtractor-main\October-133-Version-Polished\`  
**Version**: **3.0**  
**Date**: November 18, 2025, 15:24:25  
**Status**: ✅ **Production Ready**

**Verified Presets** (5 total):
- ✅ **This Month** - PRISTINE (52 transactions, 2m 58s)
- ✅ **Last Month** - PRISTINE (133 transactions, 2m 35s)
- ✅ **Last Year** - Working (738 transactions, ~15-25m)
- ✅ **Last 2 Years** - PRISTINE (2,286 transactions, 18m 3s)
- ✅ **Last 3 Years** - PRISTINE (2,865 transactions, 22m 51s)

**Key Features**:
- ✅ Multi-format date parsing (MM/DD/YYYY, "Nov 14, 2025", "November 14, 2025")
- ✅ Enhanced deduplication (amount in composite key)
- ✅ CSV export in MM/DD/YYYY format
- ✅ Strict boundary capture (start AND end dates)
- ✅ Progress display with real-time updates
- ✅ Maximum working range: **3 years** (verified)

**Testing Results**:
- ✅ This Month: PRISTINE (52 transactions, Nov 2025)
- ✅ Last Month: PRISTINE (133 transactions, Oct 2025)
- ✅ Last Year: Working (738 transactions, 2024)
- ✅ Last 2 Years: PRISTINE (2,286 transactions)
- ✅ Last 3 Years: PRISTINE (2,865 transactions)

**Files Included**:
- Core extension files: `manifest.json`, `content.js`, `popup.js`, `popup.html`, `background.js`, `popup.css`, `icon.png`
- Complete documentation suite

**Installation**:
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `October-133-Version-Polished` folder

**Use For**:
- ✅ **Primary production use**
- ✅ Daily transaction extraction
- ✅ All verified preset ranges
- ✅ Custom date ranges (up to 3 years)

---

### 📦 **BACKUP/ARCHIVE VERSIONS**

#### **VAULT-Rollback-Pre-DOM-Fix-2025-11-18** 🔄 **ROLLBACK VERSION**

**Location**: `October-133-Version-Polished\VAULT-Rollback-Pre-DOM-Fix-2025-11-18\`  
**Version**: Rollback version  
**Date**: November 18, 2025  
**Status**: ✅ **Rollback Point**

**Purpose**: Rollback point before DOM troubleshooting  
**Contents**: `content.js` only (rollback before DOM changes)

**Use For**: Rolling back to pre-DOM-fix version if needed

---

### 🔧 **DEVELOPMENT VERSIONS**

#### **CK_TX_Downloader_JavaScript** 🔧 **ACTIVE DEVELOPMENT**

**Location**: `CreditKarmaExtractor-main\CK_TX_Downloader_JavaScript\`  
**Version**: ~3.0+  
**Status**: 🔧 **Active Development**

**Purpose**: Current working folder for active development  
**Use For**: Development, testing new features, making changes  
**DO NOT USE**: For production (use `October-133-Version-Polished` instead)

---

#### **CK_Tx_Downloader_TypeScript** 🔧 **TYPESCRIPT VERSION**

**Location**: `CreditKarmaExtractor-main\CK_Tx_Downloader_TypeScript\`  
**Version**: ~3.1+ (TypeScript)  
**Status**: 🔄 **TypeScript Version - In Testing**

**Purpose**: TypeScript version for development  
**Use For**: TypeScript development, testing  
**DO NOT USE**: For production (use `October-133-Version-Polished` instead)

---

## 📊 Version Comparison Matrix

| Folder | Version | Status | Date | Recommended For | DO NOT Use For |
|--------|---------|--------|------|----------------|----------------|
| **October-133-Version-Polished** | 3.0 | ✅ Production | Nov 18, 2025 | ⭐ **Primary production use** | Development |
| **CK_TX_Downloader_JavaScript** | ~3.0+ | 🔧 Active Dev | Current | Development | Production |
| **CK_Tx_Downloader_TypeScript** | ~3.1+ | 🔄 Testing | Current | TypeScript dev | Production |
| **VAULT-Rollback-Pre-DOM-Fix-2025-11-18** | Rollback | ✅ Rollback | Nov 18, 2025 | Rollback only | Production |

---

## 🎯 Quick Decision Guide

### **I need to extract transactions NOW:**
→ Use **`October-133-Version-Polished/`** (Version 3.0)

### **I want to develop or modify the extension:**
→ Use **`CK_TX_Downloader_JavaScript/`** (Active Development)

### **I want to use TypeScript version:**
→ Use **`CK_Tx_Downloader_TypeScript/`** (TypeScript Version)

### **I need to roll back to before DOM fixes:**
→ Use **`VAULT-Rollback-Pre-DOM-Fix-2025-11-18/`** (Rollback Version)

---

## 📋 Version History

| Version | Date | Key Features | Status |
|---------|------|--------------|--------|
| **3.0** | Nov 18, 2025 | Streamlined to 5 verified presets, maximum range 3 years | ✅ Production |
| **3.3** | Nov 18, 2025 | (Replaced by v3.0) | 📦 Superseded |
| **3.2** | Nov 17, 2025 | Multi-format date parsing, enhanced deduplication | 📦 Previous |
| **3.0** | Nov 14, 2025 | Boundary capture fixes, large range handling | 📦 Previous |

---

## ⚠️ Important Notes

### **DO NOT MODIFY**:
- ❌ `VAULT-*` folders (backup/rollback purposes only)

### **OK TO MODIFY**:
- ✅ `October-133-Version-Polished` (but keep a backup first)
- ✅ `CK_TX_Downloader_JavaScript` (active development)
- ✅ `CK_Tx_Downloader_TypeScript` (active development)

### **Installation Notes**:
- Always load the **entire folder** in Chrome (not individual files)
- Use Chrome's Developer mode → Load unpacked
- Select the folder containing `manifest.json`

---

**Last Updated**: 2025-11-18 15:36:18  
**Recommended Production Folder**: `October-133-Version-Polished/`  
**Current Version**: 3.0 - Production Ready
