// The "page" the driver uses, for the Electron window that shows Scram.
//
// The DOM helper (agent-dom.js) runs in an isolated JavaScript world: it shares the page's DOM
// (so it can read and click Scram's chat) but not its variables, so Scram's own code never sees
// it, the same as RoboBuild's content script in Chrome.

import { readFileSync } from "node:fs";

const HELPER = readFileSync(new URL("./agent-dom.js", import.meta.url), "utf8");
const WORLD_ID = 1717; // any id other than 0 (the page's own world) and 999 (Electron's)

// `getWin` returns the current Scram window (it can be closed and opened again).
export function electronPage(getWin) {
  const current = () => {
    const win = getWin();
    return win && !win.isDestroyed() ? win : null;
  };
  const wc = () => {
    const win = current();
    if (!win) throw new Error("The Scram MCP window is closed.");
    return win.webContents;
  };
  const run = (code) => wc().executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code }]);
  // getBoundingClientRect() is in CSS pixels; input events and captures are in window pixels.
  const zoom = () => wc().getZoomFactor() || 1;

  return {
    url: () => (current() ? wc().getURL() : ""),
    title: () => (current() ? wc().getTitle() : ""),

    async dom(method, ...args) {
      const m = JSON.stringify(method);
      const call = `(typeof window.__sabDom?.[${m}] === "function" ? window.__sabDom[${m}](...${JSON.stringify(args)}) : "__sab_missing__")`;
      let result = await run(call);
      if (result === "__sab_missing__") {
        await run(HELPER);
        result = await run(call);
      }
      return result;
    },

    async trustedClick(x, y) {
      const z = zoom();
      const at = { x: Math.round(x * z), y: Math.round(y * z) };
      wc().sendInputEvent({ type: "mouseMove", ...at });
      wc().sendInputEvent({ type: "mouseDown", ...at, button: "left", clickCount: 1 });
      wc().sendInputEvent({ type: "mouseUp", ...at, button: "left", clickCount: 1 });
    },

    async trustedKey(key) {
      wc().focus();
      wc().sendInputEvent({ type: "keyDown", keyCode: key });
      if (key === "Enter") wc().sendInputEvent({ type: "char", keyCode: "\r" });
      wc().sendInputEvent({ type: "keyUp", keyCode: key });
    },

    async navigate(url) {
      // Single-page apps often redirect while loading, which rejects loadURL with ERR_ABORTED
      // even though the page loads fine.
      await wc()
        .loadURL(url)
        .catch((e) => {
          if (!/ERR_ABORTED|\(-3\)/.test(e.message)) throw e;
        });
    },

    async screenshot({ rect, maxWidth = 1400 } = {}) {
      const z = zoom();
      const r = rect && { x: Math.round(rect.x * z), y: Math.round(rect.y * z), width: Math.round(rect.w * z), height: Math.round(rect.h * z) };
      let img = await wc().capturePage(r);
      if (img.isEmpty()) throw new Error("The window couldn't be captured (is it minimised?).");
      const { width } = img.getSize();
      if (width > maxWidth) img = img.resize({ width: maxWidth, quality: "good" });
      return { data: img.toJPEG(75).toString("base64"), mimeType: "image/jpeg" };
    },
  };
}
