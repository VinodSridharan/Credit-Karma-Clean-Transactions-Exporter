# Extension Reload Checklist

**Issue**: Loop still exiting at 10 scrolls despite fixes

**Root Cause**: Extension may be running cached/old version of code

---

## ✅ Step-by-Step Reload Instructions

### 1. Reload Extension
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Find "TxVault Exporter" extension
4. Click the **🔄 Reload** button (circular arrow icon)
5. Wait for reload to complete

### 2. Hard Refresh Credit Karma Page
1. Navigate to Credit Karma transactions page
2. Press **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac)
3. Wait for page to fully load

### 3. Clear Browser Cache (Optional but Recommended)
1. Press **F12** to open DevTools
2. Right-click the **🔄 Reload** button in browser toolbar
3. Select **"Empty Cache and Hard Reload"**

### 4. Verify Code is Loaded
1. Press **F12** to open DevTools
2. Go to **Console** tab
3. Look for these messages when you start extraction:
   - `🔍 [LOOP CHECK] Scroll X: ...` (should appear for scrolls 1-15)
   - `📊 [SCROLL CAP INCREASE] ALWAYS - Found range newer than target detected`
   - `🔍 [STAGNATION] Scroll X: ...` (should appear when stagnation detected)

**If you DON'T see these messages**, the extension is running old code - reload again.

---

## 🔍 What to Look For in Console

### ✅ Good Signs (Code is Loaded):
- `🔍 [LOOP CHECK]` messages appear
- `📊 [SCROLL CAP INCREASE]` messages appear when November found
- `⚠️ CRITICAL: Found range is NEWER than target` messages appear
- `🔍 [STAGNATION]` messages appear

### ❌ Bad Signs (Old Code):
- No `[LOOP CHECK]` messages
- No `[SCROLL CAP INCREASE]` messages
- Error appears immediately without diagnostic logs
- Loop exits at 10 scrolls without any protection messages

---

## 🐛 If Still Exiting at 10 Scrolls After Reload

Check console for these specific messages to identify which exit condition is being hit:

1. **Stagnation Exit**: Look for `⚠️ STAGNATION DETECTED` message
   - Should be blocked by: `⚠️ CRITICAL: Found range is NEWER than target`
   - If not blocked, check `foundRangeIsNewerThanTarget` value in logs

2. **Normal Exit**: Look for `Last Month: Found range, scrolled past...`
   - Should be blocked by: `⚠️ CRITICAL: Found range is NEWER than target. Blocking exit.`

3. **Bottom Detection**: Look for `✅ Reached bottom, boundaries found...`
   - Should be blocked by: `⚠️ CRITICAL: Reached bottom but found range is NEWER than target`

4. **Oscillation Exit**: Look for `✅ EARLY EXIT: No progress for X consecutive oscillations`
   - Should be blocked by: `⚠️ CRITICAL: Oscillation exit blocked - found range is NEWER than target`

5. **Logout**: Look for `⚠️ Scroll loop stopped due to logout detection`
   - This is a valid exit (user logged out)

---

## 📋 Quick Verification Test

After reload, run "Last Month" preset and check console:

1. **Scroll 1-3**: Should see `🔍 [LOOP CHECK]` messages
2. **When November found**: Should see `📊 [SCROLL CAP INCREASE]` message
3. **If stagnation**: Should see `⚠️ CRITICAL: Found range is NEWER than target` blocking exit
4. **Loop should continue**: Past 10 scrolls, up to 4200+ scrolls

If any of these don't happen, extension needs reload.

---

## 🔧 Troubleshooting

### Extension Won't Reload
- Close all Credit Karma tabs
- Reload extension
- Open new Credit Karma tab

### Code Still Not Loading
- Uninstall extension completely
- Reinstall from source
- Reload extension

### Still Seeing Old Behavior
- Check manifest.json version (should be 4.2.1)
- Verify content.js has latest code (check line numbers match)
- Clear browser cache completely

---

**Last Updated**: 2025-11-24  
**Status**: Ready for Testing

