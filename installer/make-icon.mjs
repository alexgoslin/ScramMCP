// Draws the app icon (installer/build/icon.png, 1024×1024) in a headless browser. electron-builder
// turns it into the Windows .ico and Mac .icns. Run: node installer/make-icon.mjs
// (Needs Playwright's Chromium: npx playwright install chromium, if you don't have it.)

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const out = fileURLToPath(new URL("./build/icon.png", import.meta.url));

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">
  <div style="width:880px;height:880px;border-radius:200px;background:linear-gradient(145deg,#1d8f6f,#0b4f40);
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              box-shadow:inset 0 -14px 0 rgba(0,0,0,.18);font-family:'DejaVu Sans','Helvetica Neue',Arial,sans-serif;color:#fff">
    <svg width="360" height="300" viewBox="0 0 120 100" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M38 22 L12 50 L38 78"/><path d="M82 22 L108 50 L82 78"/><path d="M68 14 L52 86"/>
    </svg>
    <div style="font-size:190px;font-weight:800;letter-spacing:10px;margin-top:20px">MCP</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(html);
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(`Wrote ${out}`);
