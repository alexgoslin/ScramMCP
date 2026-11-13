// The Scram driver against the fake Scram pages in a real (headless) Chromium: sending a message
// and reading the reply, plans, question forms, long messages, Stop, and the dashboard.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ScramDriver } from "../src/scram/driver.js";
import { scramUrls } from "../src/scram/urls.js";
import { startFakeScram } from "./fake-scram/server.js";
import { playwrightPage } from "./playwright-page.js";

const { chromium } = createRequire(import.meta.url)("playwright");

let site, browser, page, driver;
before(async () => {
  site = await startFakeScram();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  driver = new ScramDriver(playwrightPage(page), { urls: scramUrls(site.url) });
});
after(async () => {
  await browser?.close();
  await site?.close();
});

const sent = () => page.evaluate(() => window.sentMessages);

test("status on the dashboard, and refusing to chat with no project open", async () => {
  await page.goto(site.url);
  const s = await driver.status();
  assert.equal(s.place, "dashboard");
  assert.equal(s.logged_in, true);
  await assert.rejects(driver.sendMessage("hello"), /No Scram project is open/);
});

test("lists projects and opens one by name", async () => {
  const list = await driver.listProjects();
  assert.deepEqual(list.projects.map((p) => p.name), ["Demo Project", "Bakery Orders"]);
  const opened = await driver.openProject({ name: "Bakery Orders" });
  assert.match(opened.url, /\/editor\/p2$/);
  const s = await driver.status();
  assert.equal(s.place, "editor");
  assert.equal(s.chat_box_found, true);
  assert.equal(s.bot_working, false);
});

test("sends a message and returns the bot's reply (without its hidden thinking)", async () => {
  const r = await driver.sendMessage("Make the header blue", { waitMs: 60000 });
  assert.equal(r.state, "done");
  assert.match(r.reply, /You said 20 characters\. I updated the app\./);
  assert.doesNotMatch(r.reply, /Internal reasoning/);
  assert.doesNotMatch(r.reply, /Make the header blue/); // our own message isn't part of the reply
  assert.deepEqual(await sent(), ["Make the header blue"]);
});

test("multi-line messages arrive whole", async () => {
  const msg = "Build a booking page.\nIt needs:\n- a calendar\n- a form";
  const r = await driver.sendMessage(msg, { waitMs: 60000 });
  assert.equal(r.state, "done");
  const got = (await sent()).at(-1);
  assert.equal(got.replace(/\s+/g, " "), msg.replace(/\s+/g, " "));
});

test("a plan: waits for approval, then Approve plan builds it", async () => {
  const r = await driver.sendMessage("Make a plan for a pricing page", { waitMs: 60000 });
  assert.equal(r.state, "waiting_for_you");
  assert.match(r.waiting_for, /Approve plan/);
  assert.ok(r.choices.includes("Approve plan"), JSON.stringify(r.choices));
  assert.match(r.reply, /Here is my plan/);
  assert.match(r.reply, /three-tier pricing table/); // "Read more" was expanded
  await assert.rejects(driver.choose({ labels: ["Publish"] }), /never clicks publish/);
  const done = await driver.choose({ labels: ["Approve"], waitMs: 60000 });
  assert.equal(done.state, "done");
  assert.match(done.reply, /I added the Pricing page/);
});

test("a question form: pick an option and submit, or write an answer", async () => {
  const r = await driver.sendMessage("Ask me a question first", { waitMs: 60000 });
  assert.equal(r.state, "waiting_for_you");
  assert.ok(r.choices.includes("Green") && r.choices.includes("Submit answers"), JSON.stringify(r.choices));
  await assert.rejects(driver.sendMessage("hello"), /showing a question/);
  const a = await driver.choose({ labels: ["Green"], waitMs: 60000 });
  assert.equal(a.state, "done");
  assert.match(a.reply, /I'll use Green/);

  await driver.sendMessage("Another question please", { waitMs: 60000 });
  const b = await driver.choose({ text: "Purple with white text", waitMs: 60000 });
  assert.match(b.reply, /I'll use Purple with white text/);
});

test("a long message is typed in full", async () => {
  const long = "Please build this.\n" + Array.from({ length: 80 }, (_, i) => `Requirement ${i + 1}: the page must do thing number ${i + 1}.`).join("\n");
  const r = await driver.sendMessage(long, { waitMs: 60000 });
  assert.equal(r.state, "done");
  assert.equal((await sent()).at(-1).replace(/\s+/g, " "), long.replace(/\s+/g, " "));
});

test("stop, wait for reply and read chat", async () => {
  const pending = driver.sendMessage("Do something slow", { waitMs: 1500 });
  const r = await pending;
  assert.equal(r.state, "still_working");
  const s = await driver.status();
  assert.equal(s.bot_working, true);
  const stopped = await driver.stopBot();
  assert.equal(stopped.stopped, true);
  const w = await driver.waitForReply({ waitMs: 30000 });
  assert.equal(w.state, "done");
  assert.match(w.reply, /Working on it/);
  const chat = await driver.readChat();
  assert.match(chat, /Make the header blue/);
  assert.doesNotMatch(chat, /Internal reasoning/);
});

test("screenshots of the window and of the running app", async () => {
  const win = await driver.screenshot();
  assert.ok(win.data.length > 1000);
  const app = await driver.screenshot({ area: "app_preview" });
  assert.ok(app.data.length > 500);
});

test("creates a new project", async () => {
  const r = await driver.newProject({});
  assert.equal(r.created, true);
  assert.match(r.url, /\/editor\/new1$/);
});

test("one action at a time", async () => {
  const first = driver.sendMessage("Do something slow", { waitMs: 3000 });
  await new Promise((r) => setTimeout(r, 300));
  await assert.rejects(driver.sendMessage("second"), /Busy: already sending a message/);
  await first;
  await driver.stopBot();
});
