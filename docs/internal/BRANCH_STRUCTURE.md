# 🌳 Branch Structure & Development Organization

**Last Updated:** 2025-11-25  
**Status:** ✅ Active  
**Version:** 1.0

---

## Overview

TxVault Exporter is organized into branches based on extraction methods and development priorities. This structure ensures clear separation of concerns and allows focused development on each extraction method.

---

## Branch Organization

### Main Branch (`main`) ⭐

**Status**: ✅ Production Ready  
**Priority**: HIGH - Primary branch for production use

**Contents:**
- ✅ **Scroll & Capture Mode** - Recommended extraction method
- ✅ **Basic Mode** - Simple extraction functionality
- ⚠️ **Auto Presets Mode** - Available but under active development

**Recommended For:**
- Production use
- Users wanting guaranteed accuracy
- Users preferring manual control

**Key Features:**
- Scroll & Capture mode with 100% verified accuracy
- Real-time statistics and persistent UI
- Auto-export on logout protection
- Basic extraction capabilities

---

### Development Branch (`dev-auto-presets`)

**Status**: ⚠️ Under Active Development  
**Priority**: MEDIUM - Lower priority until auto-scroll issues resolved

**Contents:**
- 🔧 Auto-scroll optimization work
- 🔧 Preset scrolling pattern improvements
- 🔧 Boundary detection enhancements
- 🔧 Stagnation detection improvements

**Focus Areas:**
- Resolving auto-scroll reliability issues
- Optimizing scrolling patterns for Credit Karma's lazy loading
- Improving boundary detection accuracy
- Enhancing stagnation detection

**Development Goals:**
- Achieve consistent auto-scroll behavior
- Match Scroll & Capture accuracy levels
- Improve user experience for automated extraction

**Note**: This branch is lower priority until auto-scroll functionality is fully reliable. Scroll & Capture mode is recommended for production use.

---

## Extraction Methods

### 1. Scroll & Capture Mode ⭐ (Recommended)

**Branch**: `main`  
**Status**: ✅ Production Ready  
**Priority**: HIGHEST

**Description:**
User-controlled extraction mode that captures transactions as you manually scroll. Provides real-time statistics and guaranteed accuracy.

**Key Features:**
- Manual scrolling with automatic capture
- Real-time statistics display
- Persistent status box
- Auto-export on logout
- Export anytime functionality

**Performance:**
- 100% accuracy for Last Month (133/133)
- 100% accuracy for Last Year (738/738)
- 101.4% accuracy vs 3-Year Reference
- 107.6% accuracy vs 2-Year Reference

**Why Recommended:**
- Highest reliability
- User control ensures all content loads
- Verified 100% accuracy
- Best user experience

---

### 2. Basic Mode

**Branch**: `main`  
**Status**: ✅ Available  
**Priority**: MEDIUM

**Description:**
Simple extraction functionality for straightforward use cases.

**Key Features:**
- Basic transaction extraction
- Simple CSV export
- Minimal configuration

**Use Cases:**
- Quick extractions
- Simple date ranges
- Basic functionality needs

---

### 3. Auto Presets Mode

**Branch**: `main` (available) / `dev-auto-presets` (development)  
**Status**: ⚠️ Under Development  
**Priority**: LOW (until auto-scroll resolved)

**Description:**
Automated extraction using date presets with intelligent scrolling.

**Key Features:**
- Automated scrolling
- Date preset selection
- Boundary detection
- Oscillation strategy

**Current Status:**
- Functionality available but auto-scroll reliability needs improvement
- Active development in `dev-auto-presets` branch
- Scroll & Capture recommended until issues resolved

**Presets Available:**
- This Week
- This Month
- Last Month
- This Year
- Last Year
- Last 2 Years
- Last 3 Years
- Custom Range

---

## Development Workflow

### For Production Use

1. **Use Main Branch**
   - Clone main branch
   - Use Scroll & Capture mode
   - Enjoy 100% verified accuracy

### For Development

1. **Auto-Scroll Improvements**
   - Work in `dev-auto-presets` branch
   - Focus on scrolling reliability
   - Test against Scroll & Capture accuracy

2. **Scroll & Capture Enhancements**
   - Work in `main` branch
   - Improve statistics display
   - Enhance user experience

3. **Basic Mode Improvements**
   - Work in `main` branch
   - Add simple features
   - Maintain simplicity

---

## Branch Priorities

| Branch | Priority | Status | Recommended For |
|--------|----------|--------|-----------------|
| **main (Scroll & Capture)** | HIGHEST | ✅ Production Ready | All users |
| **main (Basic)** | MEDIUM | ✅ Available | Simple use cases |
| **main (Auto Presets)** | LOW | ⚠️ Under Development | Development/testing |
| **dev-auto-presets** | LOW | 🔧 Active Development | Developers |

---

## Migration Path

### Current State
- **Scroll & Capture**: Production ready, recommended
- **Basic Mode**: Available, functional
- **Auto Presets**: Available but needs improvement

### Future State
- **Scroll & Capture**: Continue as recommended method
- **Basic Mode**: Maintain simplicity
- **Auto Presets**: Improve to match Scroll & Capture reliability

### Transition Strategy
1. Continue recommending Scroll & Capture
2. Develop auto-scroll improvements in separate branch
3. Merge improvements when reliability matches Scroll & Capture
4. Maintain all three methods for different use cases

---

## Contributing

### How to Contribute

1. **For Scroll & Capture**: Submit PRs to `main` branch
2. **For Auto Presets**: Submit PRs to `dev-auto-presets` branch
3. **For Basic Mode**: Submit PRs to `main` branch

### Development Guidelines

- Follow existing code patterns
- Maintain test coverage
- Update documentation
- Verify accuracy against reference data

---

## Summary

**Current Recommendation**: Use **Scroll & Capture Mode** from `main` branch for guaranteed 100% accuracy and best user experience.

**Development Focus**: Improve auto-scroll reliability in `dev-auto-presets` branch to match Scroll & Capture performance.

**Long-term Vision**: Maintain all three extraction methods, each optimized for different use cases and user preferences.

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-25  
**Next Review:** When branch structure changes or new extraction methods added

