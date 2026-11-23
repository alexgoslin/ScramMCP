// The driver's "page", backed by Playwright's Chromium instead of Electron, so the chat-driving
// logic can be tested against the fake Scram pages without a desktop.

import { readFileSync } from "node:fs";

const HELPER = readFileSync(new URL("../src/scram/agent-dom.js", import.meta.url), "utf8");

export function playwrightPage(page) {
  const ids = new WeakMap();
  let next = 1;
  const idOf = (f) => {
    if (!ids.has(f)) ids.set(f, `f${next++}`);
    return ids.get(f);
  };
  const frameById = (id) => {
    const f = page.frames().find((x) => ids.get(x) === id);
    if (!f) throw new Error("That frame has gone (the app preview may have reloaded).");
    return f;
  };
  return {
    frames: () => page.frames().filter((f) => f !== page.mainFrame()).map((f) => ({ id: idOf(f), url: f.url() })),
    frameViewport: (id) => frameById(id).evaluate(() => ({ w: innerWidth, h: innerHeight, url: location.href })),
    async frameDom(id, method, ...args) {
      const frame = frameById(id);
      const call = () => frame.evaluate(([m, a]) => (typeof window.__sabDom?.[m] === "function" ? window.__sabDom[m](...a) : "__sab_missing__"), [method, args]);
      let result = await call();
      if (result === "__sab_missing__") {
        await frame.addScriptTag({ content: HELPER });
        result = await call();
      }
      return result;
    },
    insertText: (text) => page.keyboard.insertText(text),
    selectAll: () => page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A"),
    url: () => page.url(),
    title: () => page.title(),
    async dom(method, ...args) {
      const call = () =>
        page.evaluate(([m, a]) => (typeof window.__sabDom?.[m] === "function" ? window.__sabDom[m](...a) : "__sab_missing__"), [method, args]);
      let result = await call();
      if (result === "__sab_missing__") {
        await page.addScriptTag({ content: HELPER });
        result = await call();
      }
      return result;
    },
    trustedClick: (x, y) => page.mouse.click(x, y),
    async trustedDrag(from, to) {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 12 });
      await page.mouse.up();
    },
    trustedKey: (key) => page.keyboard.press(key),
    navigate: async (url) => {
      await page.goto(url);
    },
    async screenshot({ rect } = {}) {
      const clip = rect && { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
      return { data: (await page.screenshot({ type: "jpeg", clip })).toString("base64"), mimeType: "image/jpeg" };
    },
  };
}
