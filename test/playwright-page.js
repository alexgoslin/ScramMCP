// The driver's "page", backed by Playwright's Chromium instead of Electron, so the chat-driving
// logic can be tested against the fake Scram pages without a desktop.

import { readFileSync } from "node:fs";

const HELPER = readFileSync(new URL("../src/scram/agent-dom.js", import.meta.url), "utf8");

export function playwrightPage(page) {
  return {
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
