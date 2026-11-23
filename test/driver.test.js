// The Scram driver against the fake Scram pages in a real (headless) Chromium: sending a message
// and reading the reply, plans, question forms, long messages, Stop, and the dashboard.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ScramDriver } from "../src/scram/driver.js";
import { Autopilot } from "../src/scram/autopilot.js";
import { scramUrls } from "../src/scram/urls.js";
import { startFakeScram } from "./fake-scram/server.js";
import { playwrightPage } from "./playwright-page.js";

const { chromium } = createRequire(import.meta.url)("playwright");

let site, browser, page, driver;
// Stands in for Scram Desktop's "Allow the AI to …?" message: records what was asked, and
// answers with `answer`.
const asked = [];
let answer = "deny";
before(async () => {
  site = await startFakeScram();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  driver = new ScramDriver(playwrightPage(page), {
    urls: scramUrls(site.url),
    approve: async (q) => {
      asked.push(q.action);
      return answer;
    },
  });
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
  assert.match(opened.url, /\/editor\/p2\/page\/home$/);
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
  await assert.rejects(driver.approvePlan(), /no plan waiting for approval/);
  const r = await driver.sendMessage("Make a plan for a pricing page", { waitMs: 60000 });
  assert.equal(r.state, "waiting_for_you");
  assert.match(r.waiting_for, /Approve plan/);
  assert.ok(r.choices.includes("Approve plan"), JSON.stringify(r.choices));
  assert.match(r.reply, /Here is my plan/);
  assert.match(r.reply, /three-tier pricing table/); // "Read more" was expanded
  await assert.rejects(driver.choose({ labels: ["Publish"] }), /never clicks publish/);
  const done = await driver.approvePlan({ waitMs: 60000 });
  assert.equal(done.state, "done");
  assert.match(done.reply, /I added the Pricing page/);
});

test("a question: answer cards and the Write my own answer box, like real Scram", async () => {
  await assert.rejects(driver.answerQuestion("Blue"), /isn't asking a question/);
  const r = await driver.sendMessage("Ask me a question first", { waitMs: 60000 });
  assert.equal(r.state, "waiting_for_you");
  assert.ok(r.choices.some((c) => c.startsWith("Just start building (I make all the design")), JSON.stringify(r.choices));
  assert.ok(r.choices.some((c) => c.startsWith("Help me scope it out (")), JSON.stringify(r.choices));
  assert.ok(r.choices.includes("[text box] Write my own answer"), JSON.stringify(r.choices));
  const a = await driver.answerQuestion("Just start building", { waitMs: 60000 });
  assert.equal(a.state, "done");
  assert.match(a.reply, /I'll go with: Just start building/);

  await driver.sendMessage("Another question please", { waitMs: 60000 });
  const b = await driver.answerQuestion("Purple buttons with white text", { waitMs: 60000 });
  assert.equal(b.state, "done");
  assert.match(b.reply, /I'll go with: Purple buttons with white text/);

  await driver.sendMessage("One more question", { waitMs: 60000 });
  const c = await driver.choose({ labels: ["Help me scope"], waitMs: 60000 });
  assert.match(c.reply, /I'll go with: Help me scope it out/);

  // An option that removes something from the app is a design choice, and can be picked; one
  // that publishes the app can't (and isn't even offered).
  const h = await driver.sendMessage("A header question", { waitMs: 60000 });
  assert.ok(h.choices.some((x) => x.startsWith("Remove the old header (")), JSON.stringify(h.choices));
  assert.ok(!h.choices.some((x) => /Publish/.test(x)), JSON.stringify(h.choices));
  await assert.rejects(driver.answerQuestion("Publish it now"), /never clicks publish/);
  assert.ok(!(await sent()).includes("Publish it now"), "not typed in as a written answer either");
  const d = await driver.answerQuestion("Remove the old header", { waitMs: 60000 });
  assert.match(d.reply, /I'll go with: Remove the old header/);
});

test("Run mode and Edit mode", async () => {
  assert.equal((await driver.status()).mode, "edit");
  const run = await driver.setMode("run");
  assert.deepEqual(run, { mode: "run", changed: true });
  assert.match(page.url(), /[?&]preview=run/);
  assert.equal((await driver.status()).mode, "run");
  assert.equal((await driver.setMode("run")).changed, false);
  const edit = await driver.setMode("edit");
  assert.deepEqual(edit, { mode: "edit", changed: true });
  assert.doesNotMatch(page.url(), /preview=run/);
  // Without the buttons (e.g. hidden behind something), it reopens the page with preview=run.
  await page.evaluate(() => document.getElementById("modes").remove());
  const viaUrl = await driver.setMode("run");
  assert.equal(viaUrl.changed, true);
  assert.match(page.url(), /[?&]preview=run/);
  assert.equal((await driver.status()).chat_box_found, true);
});

test("tests the running app: reads it, types, chooses, clicks, scrolls (Run mode)", async () => {
  // (Still in Run mode from the test before.) The app is in Scram's preview frame, from another address.
  assert.equal((await driver.status()).mode, "run");
  const appFrame = () => page.frames().find((f) => f.url().startsWith(site.appUrl));
  const state = () => appFrame().evaluate(() => ({ ...window.appState, orders: window.appOrders.length }));

  const first = await driver.readApp();
  assert.match(first, /“Bakery Orders”/);
  assert.match(first, /Place an order/);
  assert.match(first, /\[app_ref_\d+\]/);
  assert.doesNotMatch(first, /Describe the problem/); // only the app, not Scram's editor
  const found = await driver.readApp({ find: "place order" });
  assert.match(found.split("\n")[1], /button "Place order" \[app_ref_\d+\]/);

  // Typed and chosen with real input: the app only keeps what its input events tell it.
  assert.match(await driver.typeInApp({ field: "Name", text: "Ada" }), /Typed “Ada” into/);
  await driver.typeInApp({ field: "Email", text: "ada@example.com" });
  assert.match(await driver.typeInApp({ field: "Cake", text: "Lemon" }), /Chose “Lemon”/);
  await driver.clickApp({ text: "Gift wrap" });
  assert.deepEqual(await state(), { name: "Ada", email: "ada@example.com", cake: "Lemon", gift: true, orders: 0 });
  const ordered = await driver.clickApp({ text: "Place order" });
  assert.match(ordered, /Clicked “Place order”/);
  assert.match(ordered, /Thanks, Ada! Your lemon cake is ordered \(gift wrapped\)\./); // what the app shows afterwards
  assert.equal((await state()).orders, 1);

  // Adding to a field, replacing it, and pressing Enter (submits the form).
  await driver.typeInApp({ field: "Name", text: " Lovelace", clear: false });
  assert.equal((await state()).name, "Ada Lovelace");
  const entered = await driver.typeInApp({ field: "Email", text: "ada@lovelace.org", pressEnter: true });
  assert.match(entered, /then pressed Enter/);
  assert.match(entered, /Thanks, Ada Lovelace!/);
  assert.equal((await state()).orders, 2);

  // Scrolling: to something far down the page, and back to the top.
  const all = await driver.readApp({ filter: "all" });
  const footer = all.match(/"Bakery Orders, made with Scram" \[(app_ref_\d+)\]/)[1];
  assert.doesNotMatch(await driver.readApp(), /made with Scram/); // not on screen yet
  assert.match(await driver.scrollApp({ ref: footer }), /made with Scram/);
  assert.match(await driver.scrollApp({ direction: "top" }), /Place an order/);

  // Following a link to another page of the app.
  const orders = await driver.clickApp({ text: "Today's orders" });
  assert.match(orders, /Ada Lovelace: Lemon/);
  assert.match(orders, /#orders/);

  // Something that deletes data: only if the person clicks Allow in Scram Desktop's own message
  // (the agent can't say yes for them). No, and no answer in time, leave it alone.
  assert.equal(asked.length, 0, "ordinary clicks and typing (Place order, Enter) don't ask");
  answer = "deny";
  await assert.rejects(driver.clickApp({ text: "Delete all orders" }), /asked the user first, and they said no/);
  assert.deepEqual(asked, ["click “Delete all orders” in your app"]);
  answer = "timeout";
  await assert.rejects(driver.clickApp({ text: "Delete all orders" }), /nobody answered in time/);
  assert.equal((await state()).orders, 2);
  answer = "allow";
  assert.match(await driver.clickApp({ text: "Delete all orders" }), /No orders yet/);
  assert.equal((await state()).orders, 0);
  await driver.clickApp({ text: "Order" });

  // A button with only an icon: what it does can't be told, so it asks too.
  const iconRef = (await driver.readApp()).match(/button "" \[(app_ref_\d+)\]/)[1];
  asked.length = 0;
  answer = "deny";
  await assert.rejects(driver.clickApp({ ref: iconRef }), /they said no/);
  assert.match(asked[0], /unlabelled button/);
  assert.equal(await appFrame().evaluate(() => window.iconClicks), 0);
  // Enter in a field whose form is submitted by a risky button ("Subscribe") asks as well.
  await assert.rejects(driver.typeInApp({ field: "Newsletter email", text: "ada@example.com", pressEnter: true }), /they said no/);
  assert.match(asked[1], /press Enter in “Newsletter email”, which submits “Subscribe”/);
  assert.equal(await appFrame().evaluate(() => window.subscribed), undefined);
  // "Don't ask again until Scram Desktop is closed": later risky clicks go ahead without asking.
  answer = "allow-session";
  await driver.clickApp({ ref: iconRef });
  answer = "deny"; // (not asked any more)
  await driver.typeInApp({ field: "Newsletter email", text: "ada@example.com", pressEnter: true });
  assert.equal(asked.length, 3);
  assert.equal(await appFrame().evaluate(() => window.iconClicks), 1);
  assert.equal(await appFrame().evaluate(() => window.subscribed), "ada@example.com");
  driver.riskyAllowed = false;

  // Never clicks through something of Scram's that covers the app.
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "cover";
    d.textContent = "Plans";
    d.style.cssText = "position:fixed;left:300px;top:40px;right:0;bottom:0;background:#fff;z-index:9";
    document.body.append(d);
  });
  await assert.rejects(driver.clickApp({ text: "Today's orders" }), /covering the running app/);
  await page.evaluate(() => document.getElementById("cover").remove());

  // The layout check: nothing on the plain app; problems once there are some.
  assert.equal((await driver.checkLayout()).issues.length, 0);
  await appFrame().evaluate(() => {
    const menu = document.createElement("div");
    menu.id = "bad-menu";
    menu.setAttribute("role", "menu");
    menu.textContent = "Account menu";
    menu.style.cssText = "position:absolute;left:95%;top:10px;width:300px;height:40px";
    document.body.append(menu);
  });
  const problems = ScramDriver.describeLayout(await driver.checkLayout());
  assert.match(problems, /\[off-screen\] menu “Account menu” goes \d+px past the right edge/);
  assert.match(problems, /\[sideways-scroll\]/);
  await appFrame().evaluate(() => document.getElementById("bad-menu").remove());

  // A wrong reference, and Edit mode.
  await assert.rejects(driver.clickApp({ ref: "app_ref_99999" }), /isn't on the app's page any more/);
  await driver.setMode("edit");
  await assert.rejects(driver.readApp(), /isn't in Run mode.*scram_run_mode/);
});

test("the editor's controls Scram's bot can't use, and real input it can't give", async () => {
  await driver.setMode("run");
  const appFrame = () => page.frames().find((f) => f.url().startsWith(site.appUrl));

  // The preview's path box: another page of the app.
  let s = await driver.setPreview({ path: "/orders" });
  assert.match(s.did.join(" "), /went to \/orders/);
  assert.equal(s.path, "/orders");
  assert.match(await driver.readApp(), /Today's orders/);
  // The preview size (tablet is 768 px wide: the app sees a little less, inside the frame's border).
  s = await driver.setPreview({ size: "tablet" });
  assert.equal(s.size, "tablet");
  const width = await appFrame().evaluate(() => innerWidth);
  assert.ok(width > 750 && width <= 768, `tablet width: ${width}`);
  assert.match(await driver.readApp(), /Today's orders/); // reading still works at that size
  assert.equal((await driver.setPreview({ size: "desktop" })).size, "desktop");
  // "This version is outdated": Refresh.
  await page.evaluate(() => window.makeOutdated());
  assert.match((await driver.previewState()).notice, /This version is outdated/);
  assert.equal((await driver.setPreview({ refresh: true })).notice, null);
  // What covers the editor: the Activity panel, a cookie banner ("Reject all", never "Accept").
  await page.evaluate(() => (window.openActivity(), window.showConsent()));
  assert.deepEqual(await driver.closePanels(), ["the Activity panel", "a cookie banner (Reject all)"]);
  assert.equal(await page.evaluate(() => window.consent), "rejected");
  // Scram slipping back to Edit mode while its address still says Run: noticed, and fixed.
  await page.evaluate(() => window.fallBackToEdit());
  assert.equal(await driver.currentMode(), "edit");
  await assert.rejects(driver.readApp(), /isn't in Run mode/);
  await driver.setMode("run", { restart: true });
  assert.equal(await driver.currentMode(), "run");

  // Real input Scram's bot's own Run tool can't give: leaving a field (an autosave on leaving it),
  // dragging (painting a range of times), key presses.
  await driver.setPreview({ path: "/" });
  assert.match(await driver.typeInApp({ field: "Notes", text: "Ring the bell" }), /then left the field \(Tab\)/);
  assert.equal(await appFrame().evaluate(() => window.savedNotes), "Ring the bell");
  const page1 = await driver.readApp({ filter: "all" });
  const ref = (t) => page1.match(new RegExp(`"${t}" \\[(app_ref_\\d+)\\]`))[1];
  assert.match(await driver.dragInApp({ fromRef: ref("9:00"), toRef: ref("11:00") }), /Times picked: 9:00, 10:00, 11:00/);
  assert.deepEqual(await appFrame().evaluate(() => window.painted), ["9:00", "10:00", "11:00"]);
  await driver.typeInApp({ field: "Name", text: "Bo", leaveField: false });
  assert.match(await driver.pressKeyInApp("Escape"), /Pressed Escape/);
  assert.equal(await appFrame().evaluate(() => window.lastKey), "Escape");
  await assert.rejects(driver.pressKeyInApp("Delete"), /Only these keys/);

  // The chat: cancelling the bot's question form, then a fresh chat, then back to the page view.
  await driver.sendMessage("Ask me a question first", { waitMs: 60000 });
  assert.deepEqual(await driver.cancelQuestion(), { cancelled: true, chat_box_found: true });
  assert.equal((await driver.newChat()).new_chat, true);
  assert.equal(await page.evaluate(() => window.newChats), 1);
  assert.equal(await page.evaluate(() => document.getElementById("messages").children.length), 0);
  const home = await driver.backToPageView();
  assert.equal(home.chat_box_found, true);
  assert.equal(home.mode, "run");
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
  const chat = await driver.readChat({ maxChars: 50000 });
  assert.match(chat, /Do something slow/); // (the Run-mode test reloaded the page, clearing older messages)
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
  assert.match(r.url, /\/editor\/new1\/page\/home$/);
});

test("one action at a time", async () => {
  const first = driver.sendMessage("Do something slow", { waitMs: 3000 });
  await new Promise((r) => setTimeout(r, 300));
  await assert.rejects(driver.sendMessage("second"), /Busy: already sending a message/);
  await first;
  await driver.stopBot();
});

test("the autopilot: only with the user's OK; builds step by step; keeps Scram to itself; pauses when it needs the user", { timeout: 300000 }, async () => {
  await driver.openProject({ name: "Demo Project" });
  let ok = "deny";
  const notes = [];
  const pilot = new Autopilot(driver, { confirmStart: async () => ok, notify: (title, body) => notes.push(`${title}: ${body}`) });
  const steps = [
    { title: "Pricing page", request: "Add a pricing page with three tiers." },
    { title: "Scope", request: "Before building more, ask me a question first about the scope." },
    { title: "Run check", request: "Add a contact form, then the testing question." },
    { title: "Reviews", request: "Add customer reviews (a forgetful step)." },
    { title: "Payments", request: "Let customers take payments for the Pro tier." },
  ];
  // Not without the person's OK (in Scram Desktop's own window), and not twice.
  await assert.rejects(pilot.start({ steps }), /chose not to start the autopilot/);
  ok = "timeout";
  await assert.rejects(pilot.start({ steps }), /nobody answered in time/);
  assert.equal(pilot.state, "idle");
  await assert.rejects(pilot.start({ steps: [{ title: "x" }] }), /each with a title and a request/);

  ok = "allow";
  const before = (await sent()).length;
  const started = await pilot.start({ steps });
  assert.match(started, /The autopilot is building: step 1 of 5/);
  await assert.rejects(pilot.start({ steps }), /already running/);
  // While it builds, nobody else can act on Scram (looking is fine).
  await new Promise((r) => setTimeout(r, 500));
  await assert.rejects(driver.sendMessage("Something else"), /The autopilot is building in Scram/);
  assert.equal((await driver.status()).place, "editor");

  // It runs by itself until it needs the user: the bot asks for a Stripe key in step 3.
  for (let i = 0; i < 240 && pilot.state === "running"; i++) await new Promise((r) => setTimeout(r, 1000));
  const s = pilot.status();
  assert.equal(s.state, "paused", pilot.describe());
  assert.equal(s.step, 5);
  assert.match(s.needs_you, /Stripe secret API key/);
  assert.ok(notes.some((n) => /^Autopilot needs you: .*Stripe/.test(n)), JSON.stringify(notes));
  const log = pilot.describe();
  assert.match(log, /1\. Pricing page: done/);
  assert.match(log, /2\. Scope: done/);
  assert.match(log, /Approved the bot's plan/);
  assert.match(log, /Answered the bot's question: “Just start building”/); // not "Help me scope it out"
  // Never "Open Run and test it for me" (the bot can't): "I'll open Run myself · go ahead when it's up".
  assert.match(log, /Answered the bot's question: “I'll open Run myself · go ahead when it's up”/);
  assert.doesNotMatch(log, /Answered the bot's question: “Open Run/);
  // The bot lost the step (it can't re-open attachments): the whole step pasted again.
  assert.match(log, /Step 4: the bot lost track of the step: pasting it again/);
  assert.match(log, /4\. Reviews: done/);
  assert.match(log, /asking the bot to test it in Run mode/);
  assert.match(log, /layout check found no problems/);
  assert.equal(await driver.currentMode(), "run"); // it switched Run mode on for the bot's testing
  const messages = (await sent()).slice(before);
  assert.match(messages[0], /^Step 1 of 5: Pricing page\s+Add a pricing page with three tiers\./);
  assert.ok(messages.some((m) => /^Here is the whole step again \(you can't re-open the attachment\):\s+Step 4 of 5: Reviews/.test(m)), JSON.stringify(messages));
  assert.ok(messages.some((m) => /^Now test step 1 \(“Pricing page”\)/.test(m)), JSON.stringify(messages));
  assert.match(messages.at(-1), /^Step 5 of 5: Payments/);

  // Paused: Scram is free again for the user (or their agent) to sort things out.
  await driver.readChat();
  assert.throws(() => pilot.resume.call({ state: "idle" }));
  // Stopping a paused run.
  assert.match(await pilot.stop(), /stopped at step 5 of 5/);
  assert.equal(pilot.state, "stopped");
  await driver.waitForReply({ waitMs: 5000 }); // nothing reserved any more
});
