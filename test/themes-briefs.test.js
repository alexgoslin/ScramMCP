// Themes and TypeScript briefs: the theme check catches what breaks Scram's theme rules, a theme is
// written as the exact manageThemes call, the six example themes pass, and briefs are kept, split
// into batches and sent one batch at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkTheme, themeDocument, themeExamples, themeNotes } from "../src/scram/themes.js";
import { batchesOf, batchMessage, briefName, Briefs, conventionsOf } from "../src/scram/briefs.js";

const good = {
  themeName: "Bakery",
  description: "Warm, friendly bakery ordering app.",
  baseColors: { primary: "#7A1F2B", secondary: "#468D80", neutral: "#8A8A8A", success: "#097E00", alert: "#D99A3D", error: "#C93C3C" },
  colorShadeOverrides: { primary: { 800: "#7A1F2B" }, custom1: { 500: "#F97316" } },
  fonts: { heading: "Fraunces", body: "Inter" },
  roundness: 4,
  iconLibrary: "lucide",
  colorSchemeMode: "light-only",
};

test("the six example themes pass the check", () => {
  const all = themeExamples();
  assert.deepEqual(Object.keys(all), ["scram", "ledger", "midnight", "atelier", "playground", "clinic"]);
  for (const [name, ex] of Object.entries(all)) {
    assert.deepEqual(checkTheme(ex.theme).problems, [], name);
    assert.ok(ex.doneWhen.length > 20, `${name} has a Done-when line`);
    // The data matches the example's own .ts file.
    const file = readFileSync(new URL(`../src/guides/typescript/${ex.file}`, import.meta.url), "utf8");
    assert.ok(file.includes(`themeName: "${ex.theme.themeName}"`), name);
  }
});

test("catches what breaks Scram's theme rules", () => {
  const problems = (change) => checkTheme({ ...good, ...change }).problems.join("\n");
  assert.equal(checkTheme(good).problems.length, 0);
  assert.match(problems({ baseColors: { ...good.baseColors, surface: "#FFFFFF" } }), /surface.*legacy/);
  assert.match(problems({ colorShadeOverrides: { content: { 500: "#111111" } } }), /content.*legacy/);
  assert.match(problems({ roundness: 24 }), /roundness is 24: it's a step from 0 to 9, not px/);
  assert.match(problems({ border: 5 }), /border is 5: it's a step from 0 to 4/);
  assert.match(problems({ colorShadeOverrides: { primary: { 850: "#000000" } } }), /no shade 850/);
  assert.match(problems({ colorSchemeMode: "dark" }), /light-only, dark-only or switchable.*"dark-only", never dark hexes/);
  assert.match(problems({ iconLibrary: "material" }), /iconLibrary is "material"/);
  const { error, ...five } = good.baseColors;
  assert.match(problems({ baseColors: five }), /baseColors\.error is missing/);
  assert.match(problems({ baseColors: { ...good.baseColors, primary: "7A1F2B" } }), /with the #/);
  assert.match(problems({ baseColors: { ...good.baseColors, custom1: "#F97316" } }), /custom roles have no base colour/);
  assert.match(problems({ fonts: { heading: "Inter, sans-serif" } }), /no fallback stack/);
  assert.match(problems({ cornerRadius: 8 }), /"cornerRadius" isn't a theme setting/);
});

test("writes the theme as the exact manageThemes call, with Done-when and read-back", () => {
  const { theme } = checkTheme(good);
  assert.equal(theme.id, "bakery");
  const doc = themeDocument(theme, "a test button is oxblood #7A1F2B with 8 px corners");
  assert.match(doc, /^\/\/ =+\n\/\/ Scram theme: "Bakery"/);
  assert.match(doc, /For Scram's AI: call manageThemes with the payload below exactly as written\./);
  assert.match(doc, /Done when: a test button is oxblood #7A1F2B with 8 px corners/);
  assert.match(doc, /Read back, from the stored theme/);
  const payload = JSON.parse(doc.slice(doc.indexOf("const call = ") + 13, doc.indexOf(" satisfies ManageThemes;")));
  assert.deepEqual(payload.operations[0].createTheme, theme);
  assert.deepEqual(themeNotes(theme), ["Only one end of the solid-button pair (primary 800 fill / primary 50 label) is pinned: check the button label still reads clearly."]);
  assert.match(themeNotes({ ...theme, colorSchemeMode: "switchable" }).join(" "), /dark side can't be pinned from the chat/);
});

test("splits a brief into batches, with the conventions, and sends only one", () => {
  const template = readFileSync(new URL("../src/guides/typescript/brief-template.ts", import.meta.url), "utf8");
  const batches = batchesOf(template);
  assert.deepEqual(batches.map((b) => b.n), [0, 1, 2, 3, 4]);
  assert.equal(batches[1].title, "Tables, the core page, the admin page");
  assert.match(batches[0].doneWhen, /the theme's own "Done when" line holds in Run mode/);
  assert.match(conventionsOf(template), /^\/\/ -+\n\/\/ CONVENTIONS/);
  assert.match(conventionsOf(template), /RESERVED NAMES/);
  const msg = batchMessage(template, batches[2], "Answers: prices in GBP.");
  assert.match(msg, /^This is batch 2 of a staged brief, written as TypeScript/);
  assert.match(msg, /Before this batch:\nAnswers: prices in GBP\./);
  assert.match(msg, /CONVENTIONS/);
  assert.match(msg, /BATCH 2 — Integrations/);
  assert.doesNotMatch(msg, /BATCH 1 — Tables/);
  assert.doesNotMatch(msg, /BATCH 3/);
  // A brief without its own conventions still gets them.
  assert.match(batchMessage("// =========\n// BATCH 1 — Orders\n// Done when: an order saves\n// =========\ninterface Order { id: string }", { n: 1, text: "// BATCH 1 — Orders" }), /CONVENTIONS/);
});

test("keeps briefs in Scram Desktop, safely named", () => {
  const store = new Briefs(mkdtempSync(join(tmpdir(), "briefs-")));
  assert.equal(briefName("../../etc/Bakery Orders.ts"), "etc-bakery-orders");
  assert.throws(() => briefName("../"), /Give the brief a name/);
  const saved = store.save("Bakery Orders", "// =========\n// BATCH 0 — Theme\n// Done when: cream page\n// =========\n// =========\n// BATCH 1 — Orders\n// Done when: an order saves\n// =========\ninterface Order {}");
  assert.equal(saved.name, "bakery-orders");
  assert.deepEqual(saved.batches.map((b) => [b.n, b.title, b.doneWhen]), [[0, "Theme", "cream page"], [1, "Orders", "an order saves"]]);
  assert.deepEqual(store.list().map((b) => [b.name, b.batches]), [["bakery-orders", ["0: Theme", "1: Orders"]]]);
  assert.match(store.read("bakery-orders"), /interface Order/);
  assert.equal(store.batch("bakery-orders", 1).batch.title, "Orders");
  assert.throws(() => store.batch("bakery-orders", 7), /has no batch 7\. Its batches: 0, 1/);
  assert.throws(() => store.read("nope"), /no brief called “nope”/);
  assert.throws(() => store.save("x", "  "), /empty/);
});
