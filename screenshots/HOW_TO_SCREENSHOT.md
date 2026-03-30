# How to Capture Chrome Web Store Screenshots

These HTML files render at exactly 1280×800px — the required Chrome Web Store screenshot size.

## Steps

1. **Open the file in Chrome**
   Drag any `screenshot-*.html` file onto Chrome, or use `File → Open File`.

2. **Open DevTools**
   Press `F12` (or `Cmd+Option+I` on Mac).

3. **Enable the Device Toolbar**
   Press `Ctrl+Shift+M` (Windows/Linux) or `Cmd+Shift+M` (Mac).
   A responsive toolbar appears at the top of the viewport.

4. **Set exact dimensions**
   In the width/height fields at the top, type `1280` × `800`.
   Make sure the device pixel ratio (DPR) is set to `1` for a clean 1:1 capture.

5. **Capture the screenshot**
   Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac) to open the Command Menu.
   Type `screenshot` and choose **Capture screenshot** (not "full size").
   Chrome saves a PNG to your Downloads folder.

6. **Rename the files**
   Save them as:
   - `screenshot-1.png` — Idle view
   - `screenshot-2.png` — Active / countdown view
   - `screenshot-3.png` — Blocked page
   - `screenshot-4.png` — Stats dashboard
   - `screenshot-5.png` — Session complete / Done view

## Tips

- If the popup looks too small or too large, verify the DPR is exactly `1` in the device toolbar dropdown.
- The caption bar at the bottom of each screenshot is part of the design — it acts as the store listing subtitle. You can remove it by deleting the `<div class="caption-bar">` element in DevTools before capturing if you prefer a clean image.
- Screenshots must be exactly 1280×800 px or 640×400 px for the Chrome Web Store. These files target 1280×800.
