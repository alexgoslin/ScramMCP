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
    if (!win) throw new Error("The Scram Desktop window is closed.");
    return win.webContents;
  };
  const run = (code) => wc().executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code }]);
  const callCode = (method, args) => {
    const m = JSON.stringify(method);
    return `(typeof window.__sabDom?.[${m}] === "function" ? window.__sabDom[${m}](...${JSON.stringify(args)}) : "__sab_missing__")`;
  };
  // The frames inside the page (e.g. Scram's Run preview, showing the app being built). A frame
  // keeps its id while it loads other pages.
  const frameId = (f) => String(f.frameTreeNodeId ?? `${f.processId}:${f.routingId}`);
  const subFrames = () => {
    const main = wc().mainFrame;
    return main.framesInSubtree.filter((f) => f !== main && !f.detached);
  };
  const frameById = (id) => {
    const f = subFrames().find((x) => frameId(x) === id);
    if (!f) throw new Error("That frame has gone (the app preview may have reloaded).");
    return f;
  };
  // getBoundingClientRect() is in CSS pixels; input events and captures are in window pixels.
  const zoom = () => wc().getZoomFactor() || 1;

  return {
    url: () => (current() ? wc().getURL() : ""),
    title: () => (current() ? wc().getTitle() : ""),

    async dom(method, ...args) {
      const call = callCode(method, args);
      let result = await run(call);
      if (result === "__sab_missing__") {
        await run(HELPER);
        result = await run(call);
      }
      return result;
    },

    frames: () => subFrames().map((f) => ({ id: frameId(f), url: f.url })),

    // Its size and address, without adding anything to it.
    async frameViewport(id) {
      return frameById(id).executeJavaScript("({ w: innerWidth, h: innerHeight, url: location.href })");
    },

    // The DOM helper inside a frame. (Frames can't be given an isolated world from here, so it runs
    // in the frame's own one: fine for the app being built, which is the user's own.)
    async frameDom(id, method, ...args) {
      const frame = frameById(id);
      const call = callCode(method, args);
      let result = await frame.executeJavaScript(call);
      if (result === "__sab_missing__") {
        await frame.executeJavaScript(HELPER);
        result = await frame.executeJavaScript(call);
      }
      return result;
    },

    // Typing as a person would, into whatever has the keyboard focus (in any frame).
    async insertText(text) {
      await wc().insertText(text);
    },
    async selectAll() {
      wc().selectAll();
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
