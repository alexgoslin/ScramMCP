// Drives Scram's editor the way a person would: type into the AI chat, press send, wait for
// Scram's bot to finish, read what it said, click its "Approve plan" / answer buttons.
//
// Most of what's known about Scram's page comes from RoboBuild (lib/scram-pilot.js and
// content/agent-dom.js in alexgoslin/ScramAutoBot). This file is the same logic without the
// Chrome-extension parts, so it can run in the Electron app (and in tests against a fake page).
//
// It talks to the page through a small "page" object:
//   url(), title()                       where the window is (title may return a promise)
//   dom(method, ...args)                 call window.__sabDom[method](...args) in the page
//   trustedClick(x, y), trustedKey(key)  real (trusted) mouse / keyboard input
//   navigate(url)                        load a URL in the window
//   screenshot({ rect, maxWidth })       { data: base64, mimeType }
// and, for testing the running app inside Scram's Run preview:
//   frames()                             [{ id, url }] of the frames inside the page
//   frameViewport(id)                    { w, h, url } of a frame
//   frameDom(id, method, ...args)        the DOM helper inside that frame
//   insertText(text), selectAll()        typing, as a person would, where the focus is

import { scramUrls } from "./urls.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// How long the chat must stay unchanged before the bot counts as finished.
const QUIET_AFTER_STOP_MS = 5000; // we saw its Stop control, and it has gone
const QUIET_MS = 15000; // we never saw a Stop control: wait for a longer silence
const QUIET_WAITING_MS = 4000; // an Approve / answer button is on screen
const NO_REPLY_MS = 120000; // nothing at all happened after sending
const POLL_MS = 1500;
const LONG_MESSAGE = 1500; // longer messages that won't type are attached as a .md file
const MAX_REPLY_CHARS = 20000;

// Never offered or clicked, whatever is asked (from RoboBuild's "never click" list).
const NEVER_CLICK = /publish|deploy|delete|remove|log ?out|sign ?out|billing|upgrade|invite|share|cookie|bug report|savepoint|generate token|reset pane/i;
// The chat's own furniture: not answers to anything.
const NOT_A_CHOICE = /^(send|attach files?|stop|stop generating|stop response|plans?|new chat|chat history|history|collapse|expand|page structure|read more|show more|see more|ask claude.*)$/i;
const STOP_LABEL = /^(stop|stop generating|stop response|cancel generation)$/i;
// A question form's submit button. Kept narrow: a looser match ("Continue", "Done") could click
// an unrelated button in an older message.
const SUBMIT_LABEL = /^(submit|submit answers?|send answers?)$/i;
const APPROVE_LABEL = /^(approve( plan)?|accept( plan)?|approve (and|&) build|build it|proceed)$/i;
const ANSWER_BOX = /own answer|your answer|other answer/i;
// In the running app: controls that could delete the user's data, cost money or send something
// for real. Clicked only when the agent says the user agreed (confirm: true).
const RISKY_IN_APP = /\b(delete|remove|erase|destroy|wipe|reset|pay|payment|purchase|buy|checkout|check out|unsubscribe|publish|deploy|send (an? )?(e-?mail|sms|text|invoice|payment))\b/i;
const APP_AFTER_CHARS = 4000; // how much of the app's page to show after an action

const norm = (t) => (t || "").replace(/\d+/g, "#");
const squash = (t) => String(t || "").replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Lines in `after` beyond those already in `before` (counted, so a line the bot repeats verbatim
// still shows up as new), minus the message we sent ourselves. (RoboBuild's newLines.)
export function newLines(before, after, exclude = "") {
  const count = new Map();
  for (const l of (before || "").split("\n")) {
    const t = l.trim();
    if (t) count.set(t, (count.get(t) || 0) + 1);
  }
  const excl = new Set(String(exclude || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 3));
  const out = [];
  for (const l of (after || "").split("\n")) {
    const t = l.trim();
    if (!t) continue;
    const n = count.get(t) || 0;
    if (n > 0) count.set(t, n - 1);
    else if (!excl.has(t)) out.push(t);
  }
  return out.join("\n");
}

export class ScramError extends Error {}

// The button whose label is `label` (exact, then starts with, then contains; case doesn't matter).
function pickChoice(choices, label) {
  const l = squash(label).toLowerCase();
  const buttons = choices.filter((c) => c.kind === "button");
  return (
    buttons.find((c) => c.label.toLowerCase() === l) ||
    buttons.find((c) => c.label.toLowerCase().startsWith(l)) ||
    buttons.find((c) => c.label.toLowerCase().includes(l))
  );
}

export class ScramDriver {
  constructor(page, { urls = scramUrls(), log = () => {} } = {}) {
    this.page = page;
    this.urls = urls;
    this.log = log;
    this.busyWith = null; // what the driver is doing right now (one action at a time)
    this.baseline = null; // the chat's text just before our last message
    this.sent = ""; // our last message (left out of the reply)
  }

  // ------------------------------------------------------------------ helpers

  async dom(method, ...args) {
    return this.page.dom(method, ...args);
  }

  async try(method, ...args) {
    return this.page.dom(method, ...args).catch(() => null);
  }

  // One action at a time: Scram has one chat, and two agents typing into it at once would mix
  // their messages up.
  async exclusive(what, fn) {
    if (this.busyWith) throw new ScramError(`Busy: already ${this.busyWith}. Wait for that to finish, then try again.`);
    this.busyWith = what;
    try {
      return await fn();
    } finally {
      this.busyWith = null;
    }
  }

  // Click an element the way a person would (a trusted click in the middle of it), falling back
  // to a script click.
  async click(target) {
    const t = typeof target === "string" ? { id: target } : { id: target.id, label: target.label, role: target.role };
    const at = await this.try("centerOf", t);
    if (at && !at.covered) {
      await this.page.trustedClick(at.x, at.y);
      return true;
    }
    const r = await this.try("click", t);
    return !!r?.ok;
  }

  where() {
    const url = this.page.url();
    if (this.urls.isEditor(url)) return "editor";
    if (this.urls.isScram(url)) return "dashboard";
    return url && url !== "about:blank" ? "other" : "nowhere";
  }

  async loginNeeded() {
    const snap = await this.try("snapshot", { maxElements: 40, maxText: 800 });
    const url = this.page.url();
    if (!snap) return null;
    return !!(snap.hasPassword || /log ?in|sign ?in/i.test(snap.title || "") || /\/(login|signin|sign-in|auth)\b/i.test(url));
  }

  async ensureLoggedIn() {
    if (await this.loginNeeded()) {
      throw new ScramError("Scram needs you to log in. Log in in the Scram Desktop window, then try again.");
    }
  }

  async ensureEditor() {
    await this.ensureLoggedIn();
    if (this.where() !== "editor") {
      throw new ScramError(
        "No Scram project is open. Open one first with scram_open_project or scram_new_project (scram_list_projects shows your projects)."
      );
    }
  }

  // Get the AI chat box on screen: close menus, leave sub-views (‹ Back), go back to the page
  // view (frontend tab), re-open a collapsed chat. Returns the chat box's id, or null.
  async revealChat() {
    let id = await this.try("findChatInput");
    if (id) return id;
    await this.try("pressKey", "Escape");
    await sleep(400);
    for (let i = 0; i < 3; i++) {
      const back = await this.try("backTarget");
      if (!back) break;
      await this.click(back);
      await sleep(1200);
    }
    if ((id = await this.try("findChatInput"))) return id;
    const fe = await this.try("frontendTab");
    if (fe) {
      await this.click(fe);
      await sleep(1800);
      if ((id = await this.try("findChatInput"))) return id;
    }
    const expand = await this.try("chatExpandTarget");
    if (expand) {
      await this.click(expand);
      await sleep(900);
    }
    return this.try("findChatInput");
  }

  // The bot's buttons and fields: plan approval, answer options, "Write my own answer", Submit.
  // Only the AI chat's own controls and pop-up dialogs, never the editor around it, and never
  // anything on the never-click list. (RoboBuild's "controls" filter.) Answer options in real
  // Scram are cards (a title over a description): they're listed by their title.
  async choices() {
    const snap = await this.try("snapshot", { maxElements: 300, maxText: 0, pointer: true });
    if (!snap) return [];
    const col = await this.try("chatColumn");
    const inputId = await this.try("findChatInput");
    const inChat = (e) => {
      if (!col || !e.box) return true;
      const cx = e.box[0] + e.box[2] / 2;
      return cx >= col.left - 2 && cx <= col.right + 2 && e.box[1] < col.psTop;
    };
    const seen = new Set();
    const out = [];
    const add = (c) => {
      const key = `${c.kind}:${c.label.toLowerCase()}`;
      if (seen.has(key) || NOT_A_CHOICE.test(c.label) || NEVER_CLICK.test(c.label)) return;
      seen.add(key);
      out.push(c);
    };
    for (const card of (await this.try("chatCards")) || []) {
      add({ id: card.id, label: squash(card.title), detail: squash(card.detail), kind: "button" });
    }
    for (const e of snap.elements) {
      const label = squash(e.label);
      if (e.href || e.header || e.disabled) continue;
      // While the bot asks a question, its "Write my own answer" box can stand in for the chat box.
      if (e.id === inputId && !ANSWER_BOX.test(label)) continue;
      if (!(e.inLayer || inChat(e))) continue;
      if (!e.editable && (label.length < 3 || label.length > 240)) continue;
      if (!e.editable && out.some((c) => label.toLowerCase().startsWith(c.label.toLowerCase()) && c.detail)) continue; // a card's own button
      add({ id: e.id, label, role: e.role, kind: e.editable ? "text box" : "button" });
    }
    return out;
  }

  // Choices as text for the agent: "Approve plan", "Just start building (I make all the design…)".
  static describeChoices(choices) {
    return choices.map((c) => (c.kind === "text box" ? `[text box] ${c.label}` : c.detail ? `${c.label} (${c.detail.slice(0, 120)})` : c.label));
  }

  // Wait until Scram's bot has finished. Watches the chat panel only (the running app in Run
  // mode never stops changing). Finished = the Stop control has gone and the chat has been quiet
  // for a few seconds, or a long quiet spell, or an Approve / answer button is waiting for us.
  // (RoboBuild's waitForIdle, simplified.)
  // "Changed" means the bot has visibly reacted: its Stop control showed, it's waiting on us, or
  // the chat has lines that weren't there before our message (and aren't our message). That's
  // measured against the chat from BEFORE we sent, so a reply that came and went while we were
  // still pressing send (an instant "out of credits", say) isn't missed.
  async waitForBot({ waitMs, onProgress, signal }) {
    const start = Date.now();
    let lastChat = null;
    let quietSince = Date.now();
    let changed = false;
    let sawGenerating = false;
    let lastProgress = 0;
    for (;;) {
      if (signal?.aborted) return { state: "cancelled" };
      await sleep(POLL_MS);
      await this.try("scrollChatToBottom");
      const chat = norm((await this.try("chatText")) || "");
      const generating = await this.working();
      if (generating) sawGenerating = true;
      const readable = (await this.try("chatReadable"))?.text || "";
      const replied = this.baseline != null && newLines(this.baseline, readable, this.sent).trim().length > 0;
      let reason = generating ? "" : (await this.try("awaitingUser")) || "";
      // "the bot asked: …" can be our own question being matched: ignore that.
      const asked = reason.match(/^the bot asked: “(.+)”$/);
      if (asked && this.sent && squash(this.sent).includes(squash(asked[1]))) reason = "";
      const button = reason.startsWith("“");
      const waitingOnUs = reason && (button || replied) ? reason : "";
      if (replied || generating || waitingOnUs) changed = true;
      if (chat !== lastChat || generating) {
        lastChat = chat;
        quietSince = Date.now();
      }
      const quiet = Date.now() - quietSince;
      const elapsed = Date.now() - start;
      if (onProgress && Date.now() - lastProgress > 10000) {
        lastProgress = Date.now();
        onProgress({
          elapsed,
          message: generating ? "Scram's bot is working…" : changed ? "Scram's bot is finishing…" : "Waiting for Scram's bot to start…",
        });
      }
      if (waitingOnUs && quiet >= (button ? QUIET_WAITING_MS : QUIET_WAITING_MS * 2)) return { state: "waiting_for_you", reason: waitingOnUs };
      if (changed) {
        if (sawGenerating && !generating && quiet >= QUIET_AFTER_STOP_MS) return { state: "done" };
        if (!generating && quiet >= QUIET_MS) return { state: "done" };
      } else if (elapsed > NO_REPLY_MS) {
        return { state: "no_reply" };
      }
      if (elapsed > waitMs) return { state: changed ? "still_working" : "no_reply_yet" };
    }
  }

  // What the bot said since our last message, as the person sees it (no collapsed "Thought"
  // blocks or tool-step lists), plus what it's waiting for.
  async collectReply(result) {
    if (await this.try("expandCollapsed")) await sleep(800); // plan cards: "Read more"
    const readable = (await this.try("chatReadable")) || { text: "", hidden: [] };
    const hidden = new Set(readable.hidden || []);
    let reply = newLines(this.baseline ?? "", readable.text, this.sent)
      .split("\n")
      .filter((l) => !hidden.has(l.trim()))
      .join("\n");
    if (reply.length > MAX_REPLY_CHARS) reply = `…(earlier part cut)…\n${reply.slice(-MAX_REPLY_CHARS)}`;
    const out = { state: result.state, reply };
    if (result.reason) out.waiting_for = result.reason;
    if (result.state === "waiting_for_you" || result.state === "done") {
      const choices = await this.choices();
      if (choices.length) out.choices = ScramDriver.describeChoices(choices);
    }
    return out;
  }

  // ------------------------------------------------------------------ status

  async status() {
    const url = this.page.url();
    const out = { url, title: await this.page.title(), place: this.where(), mcp_busy: this.busyWith || false };
    const login = await this.loginNeeded();
    out.logged_in = login === null ? null : !login;
    if (out.place === "editor") {
      out.chat_box_found = !!(await this.try("findChatInput"));
      out.bot_working = await this.working();
      out.waiting_for_you = (!out.bot_working && (await this.try("awaitingUser"))) || false;
      const choices = await this.choices();
      if (choices.length) out.choices = ScramDriver.describeChoices(choices);
      out.mode = await this.currentMode();
    }
    return out;
  }

  async readChat({ maxChars = 8000 } = {}) {
    await this.ensureEditor();
    await this.try("scrollChatToBottom");
    if (await this.try("expandCollapsed")) await sleep(800);
    const readable = (await this.try("chatReadable")) || { text: "" };
    const text = readable.text.replace(/\n{3,}/g, "\n\n").trim();
    return text.length > maxChars ? `…(earlier part cut)…\n${text.slice(-maxChars)}` : text;
  }

  // ------------------------------------------------------------------ talking to the bot

  async sendMessage(text, { waitMs = 300000, onProgress, signal } = {}) {
    text = String(text || "").trim();
    if (!text) throw new ScramError("The message is empty.");
    return this.exclusive("sending a message to Scram's bot", async () => {
      await this.ensureEditor();
      if (await this.working()) {
        throw new ScramError("Scram's bot is still working on the last request. Wait for it with scram_wait_for_reply, or stop it with scram_stop_bot.");
      }
      const inputId = await this.revealChat();
      if (!inputId) {
        const reason = await this.try("awaitingUser");
        throw new ScramError(
          reason
            ? `Couldn't find Scram's chat box: Scram is showing a question (${reason}). Answer it with scram_choose first.`
            : "Couldn't find Scram's AI chat box in the editor. Check the Scram Desktop window (the chat may be closed or covered)."
        );
      }
      await this.try("scrollChatToBottom");
      const before = (await this.try("chatReadable"))?.text || "";
      await this.typeAndSend(inputId, text);
      this.baseline = before;
      this.sent = text;
      this.log(`Sent a message to Scram's bot (${text.length} characters).`);
      const result = await this.waitForBot({ waitMs, onProgress, signal });
      return this.collectReply(result);
    });
  }

  async typeAndSend(inputId, text) {
    let typed = await this.dom("typeChat", inputId, text);
    if (!typed?.ok) {
      // Never send part of a message: clear the box first.
      await this.try("typeText", inputId, "");
      if (text.length > LONG_MESSAGE && (await this.attachAsFile(inputId, text))) {
        text = "The attached file is my full message to you. Read all of it and follow it.";
        typed = await this.dom("typeChat", inputId, text);
      }
    }
    if (!typed?.ok) {
      // Last resort: the same text on one line (nothing in it can act as Enter).
      const flat = text.replace(/\s*\n\s*/g, " / ").replace(/\s{2,}/g, " ").trim();
      typed = flat !== text ? await this.dom("typeChat", inputId, flat) : typed;
      if (!typed?.ok) {
        await this.try("typeText", inputId, "");
        throw new ScramError(`Couldn't type into Scram's chat box (it took ${typed?.got ?? 0} of ${typed?.want ?? text.length} characters).`);
      }
      text = flat;
    }
    await sleep(700);
    const stillThere = async () => {
      const v = await this.try("inputValue", inputId);
      return v != null && squash(v).length > 0 && squash(text).startsWith(squash(v).slice(0, 40));
    };
    // Escalate until the box empties: script click on send → script Enter → real click on
    // send → real Enter key.
    const sendId = await this.try("findSendButton", inputId);
    const attempts = [
      () => sendId && this.dom("click", sendId),
      () => this.dom("pressKey", "Enter", inputId),
      () => sendId && this.click(sendId),
      async () => {
        await this.try("click", inputId); // focus the box
        await this.page.trustedKey("Enter");
      },
    ];
    for (const attempt of attempts) {
      if (!(await stillThere())) break;
      await Promise.resolve(attempt()).catch(() => {});
      for (let i = 0; i < 10 && (await stillThere()); i++) await sleep(150);
    }
    if (await stillThere()) throw new ScramError("Typed the message into Scram's chat, but couldn't press send. Check the Scram Desktop window.");
  }

  // A long message as an attached .md file, if Scram's chat takes one this way. True if the
  // file shows up in the chat.
  async attachAsFile(inputId, text) {
    const name = `scram-desktop-message-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.md`;
    for (const method of ["file-input", "drop-input", "drop-container", "paste"]) {
      const r = await this.try("attachVia", method, inputId, name, text);
      if (!r?.ok) continue;
      await sleep(2000);
      if (await this.try("fileShown", name)) {
        this.log(`Attached a ${text.length}-character message as ${name} (${method}).`);
        return true;
      }
    }
    return false;
  }

  async waitForReply({ waitMs = 300000, onProgress, signal } = {}) {
    return this.exclusive("waiting for Scram's bot", async () => {
      await this.ensureEditor();
      // Already finished? Then just report.
      const generating = await this.working();
      const result = generating ? await this.waitForBot({ waitMs, onProgress, signal }) : { state: "done" };
      if (result.state === "done") {
        const reason = await this.try("awaitingUser");
        if (reason) Object.assign(result, { state: "waiting_for_you", reason });
      }
      return this.collectReply(result);
    });
  }

  // Click the bot's buttons (e.g. "Approve plan", an answer option), optionally type a written
  // answer, then press Submit if the form has one, and wait for the bot again.
  async choose({ labels = [], text = "", submit = true, waitMs = 300000, onProgress, signal } = {}) {
    labels = (Array.isArray(labels) ? labels : [labels]).map(squash).filter(Boolean);
    text = String(text || "").trim();
    if (!labels.length && !text) throw new ScramError("Say which choice to pick (labels) and/or what to write (text).");
    return this.exclusive("answering Scram's bot", async () => {
      await this.ensureEditor();
      if (await this.working()) throw new ScramError("Scram's bot is still working. Wait for it with scram_wait_for_reply, or stop it with scram_stop_bot.");
      await this.try("scrollChatToBottom");
      const before = (await this.try("chatReadable"))?.text || "";
      for (const label of labels) {
        if (NEVER_CLICK.test(label)) throw new ScramError(`Not clicking “${label}”: Scram Desktop never clicks publish, delete, share, billing or log-out controls.`);
        const choices = await this.choices();
        const c = pickChoice(choices, label);
        if (!c) {
          throw new ScramError(`There's no “${label}” choice on screen. Choices right now: ${ScramDriver.describeChoices(choices).join(" · ") || "none"}`);
        }
        await this.click(c);
        this.log(`Clicked “${c.label}” in Scram's chat.`);
        await sleep(900);
      }
      let box = null;
      if (text) {
        box = await this.answerBox();
        if (!box) {
          const own = pickChoice(await this.choices(), "write my own answer") || pickChoice(await this.choices(), "write your own answer");
          if (own) {
            await this.click(own);
            await sleep(900);
            box = await this.answerBox();
          }
        }
        if (!box) throw new ScramError("Scram isn't showing a box for a written answer. Use scram_send_message to reply in the chat instead.");
        const typed = await this.dom("typeChat", { id: box.id, label: box.label, role: box.role }, text);
        if (!typed?.ok) throw new ScramError("Couldn't type the answer into Scram's answer box.");
        await sleep(400);
      }
      if (submit) {
        const submitBtn = (await this.choices()).find((c) => c.kind === "button" && SUBMIT_LABEL.test(c.label));
        if (submitBtn) {
          await this.click(submitBtn);
          this.log(`Clicked “${submitBtn.label}”.`);
        } else if (box) {
          // No Submit button: Enter sends a written answer, else the box's own send arrow.
          await this.try("click", box.id);
          await this.page.trustedKey("Enter");
          await sleep(1200);
          if (squash(await this.try("inputValue", box.id))) {
            const send = await this.try("findSendButton", box.id);
            if (send) await this.click(send);
          }
        }
      }
      this.baseline = before;
      this.sent = [...labels, text].filter(Boolean).join("\n");
      const result = await this.waitForBot({ waitMs, onProgress, signal });
      return this.collectReply(result);
    });
  }

  // The box for a written answer ("Write my own answer"), if Scram is showing one.
  async answerBox() {
    const boxes = (await this.choices()).filter((c) => c.kind === "text box");
    const inputId = await this.try("findChatInput");
    return boxes.find((c) => ANSWER_BOX.test(c.label)) || boxes.find((c) => c.id !== inputId) || null;
  }

  // Approve the plan Scram's bot is waiting on (its "Approve plan" button).
  async approvePlan(opts = {}) {
    await this.ensureEditor();
    const choices = await this.choices();
    const approve = choices.find((c) => c.kind === "button" && APPROVE_LABEL.test(c.label));
    if (!approve) {
      throw new ScramError(
        `There's no plan waiting for approval (no “Approve plan” button in the chat). Choices right now: ${ScramDriver.describeChoices(choices).join(" · ") || "none"}`
      );
    }
    return this.choose({ ...opts, labels: [approve.label], submit: false });
  }

  // Answer the question Scram's bot is asking: pick the option whose title matches, or else write
  // the answer in its "Write my own answer" box.
  async answerQuestion(answer, opts = {}) {
    answer = squash(answer);
    if (!answer) throw new ScramError("The answer is empty.");
    await this.ensureEditor();
    const choices = await this.choices();
    const options = choices.filter((c) => c.kind === "button" && !APPROVE_LABEL.test(c.label) && !/^cancel$/i.test(c.label));
    const a = answer.toLowerCase();
    const option = options.find((c) => c.label.toLowerCase() === a) || options.find((c) => c.label.toLowerCase().startsWith(a) && a.length >= 4);
    if (option) return this.choose({ ...opts, labels: [option.label] });
    if (!(await this.answerBox()) && !pickChoice(choices, "write my own answer")) {
      throw new ScramError(
        `Scram isn't asking a question right now (no answer options or answer box in the chat). Choices right now: ${ScramDriver.describeChoices(choices).join(" · ") || "none"}`
      );
    }
    return this.choose({ ...opts, text: answer });
  }

  // Stop Scram's AI mid-build: press the stop button (the send button turns into one while it
  // works). Not one-at-a-time: it must work while another call is waiting on the bot.
  async stopBot() {
    await this.ensureEditor();
    if (!(await this.working())) {
      return { stopped: false, note: "Scram's AI isn't working on anything right now (its send button isn't a stop button)." };
    }
    let stop = await this.try("chatStopButton");
    if (!stop) {
      const snap = await this.dom("snapshot", { maxElements: 400, maxText: 0 });
      stop = snap.elements.find((e) => STOP_LABEL.test(squash(e.label))) || null;
    }
    if (!stop) throw new ScramError("Scram's AI is working, but its stop button couldn't be found. Use scram_screenshot to see the window.");
    await this.click(stop);
    this.log("Pressed Scram's stop button.");
    const stopped = await this.waitFor(async () => !(await this.working()), 20000);
    return stopped ? { stopped: true } : { stopped: false, note: "Pressed the stop button, but Scram's AI still looks busy. Check with scram_screenshot." };
  }

  // Is Scram's AI working? A "Stop" control on screen, or (real Scram) the chat box saying
  // "Add to queue…" while its send button is a stop button.
  async working() {
    return !!(await this.try("isGenerating")) || !!(await this.try("chatWorking"));
  }

  // ------------------------------------------------------------------ Edit / Run mode

  // Run mode shows the running app in the middle of the editor (and lets Scram's bot test it);
  // Edit mode shows the canvas for editing. In Scram's address, Run mode is "preview=run".
  async currentMode() {
    if (/[?&]preview=run\b/.test(this.page.url())) return "run";
    const t = await this.try("modeToggle");
    if (t?.active === true) return "run";
    return "edit";
  }

  // The Edit / Run buttons (top right of the page view), getting them on screen if a panel or a
  // sub-view (workflow canvas, Plans panel) is in the way. (From RoboBuild's findModeToggle.)
  async findModeToggle() {
    const visible = async () => {
      const t = await this.try("modeToggle");
      if (!t) return null;
      const c = await this.try("centerOf", { id: t.id });
      return c?.covered ? null : t;
    };
    let t = await visible();
    if (t) return t;
    const plansX = await this.try("panelCloseTarget", "^plans$");
    if (plansX) {
      await this.click(plansX);
      await sleep(1200);
      if ((t = await visible())) return t;
    }
    await this.try("pressKey", "Escape");
    await sleep(400);
    for (let i = 0; i < 3; i++) {
      const back = await this.try("backTarget");
      if (!back) break;
      await this.click(back);
      await sleep(1500);
      if ((t = await visible())) return t;
    }
    return visible();
  }

  async setMode(mode) {
    if (mode !== "run" && mode !== "edit") throw new ScramError('Mode must be "run" or "edit".');
    const name = mode === "run" ? "Run" : "Edit";
    return this.exclusive(`switching Scram to ${name} mode`, async () => {
      await this.ensureEditor();
      if ((await this.currentMode()) === mode) return { mode, changed: false, note: `Scram was already in ${name} mode.` };
      let how = "";
      const t = await this.findModeToggle();
      const id = t && (mode === "run" ? t.id : t.editId);
      if (id) {
        await this.click({ id });
        if (await this.waitFor(async () => (await this.currentMode()) === mode, 8000)) how = `clicked ${name}`;
      }
      if (!how) {
        // Last resort: open the page with the mode in its address (preview=run), on a page view.
        const u = new URL(this.page.url());
        if (!/\/page\//.test(u.pathname)) {
          throw new ScramError(`Couldn't find Scram's ${name} button. Open a page of the app in the editor (the page view) and try again.`);
        }
        if (mode === "run") u.searchParams.set("preview", "run");
        else u.searchParams.delete("preview");
        await this.page.navigate(u.href);
        await this.waitFor(async () => (await this.currentMode()) === mode && !!(await this.try("findChatInput")), 20000);
        await this.try("scrollChatToBottom");
        how = "reopened the page in that mode";
      }
      if ((await this.currentMode()) !== mode) throw new ScramError(`Tried to switch Scram to ${name} mode, but it still looks like it isn't.`);
      this.log(`Switched Scram to ${name} mode (${how}).`);
      return { mode, changed: true };
    });
  }

  // ------------------------------------------------------------------ projects

  async goHome() {
    if (this.where() !== "dashboard") await this.page.navigate(this.urls.home);
    await this.waitFor(async () => (await this.try("bodyText"))?.trim().length > 0, 20000);
    await sleep(1500);
    await this.ensureLoggedIn();
  }

  async waitFor(check, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check().catch(() => false)) return true;
      await sleep(1000);
    }
    return false;
  }

  async waitForEditor(ms) {
    return this.waitFor(async () => this.where() === "editor" && !!(await this.try("findChatInput")), ms);
  }

  // Best effort: Scram's project list isn't an API. Links into the editor are projects; other
  // clickable names on the page are listed too, so an agent can pick one by name.
  async listProjects() {
    return this.exclusive("listing projects", async () => {
      await this.goHome();
      const snap = await this.dom("snapshot", { maxElements: 400, maxText: 0, pointer: true });
      const projects = [];
      const others = [];
      for (const e of snap.elements) {
        const label = squash(e.label);
        // (Not filtered on "nav": that heuristic also catches cards on the left of the page.)
        if (!label || label.length > 80 || e.header || e.editable) continue;
        const href = e.href ? new URL(e.href, this.page.url()).href : "";
        if (href && this.urls.isEditor(href)) projects.push({ name: label, url: href });
        else if (!e.href && !NEVER_CLICK.test(label) && !/create (a )?new project/i.test(label) && e.role === "clickable") others.push(label);
      }
      return { projects, other_clickable_items: [...new Set(others)].slice(0, 60) };
    });
  }

  async openProject({ url, name } = {}) {
    return this.exclusive("opening a project", async () => {
      if (url) {
        if (!this.urls.isEditor(url)) throw new ScramError("That isn't a Scram editor address (it should start with https://editor.buildwithscram.com/).");
        await this.page.navigate(url);
      } else if (name) {
        await this.goHome();
        const hits = (await this.dom("findText", `^${escapeRe(squash(name))}$`, { maxLen: 120 })) || [];
        if (!hits.length) throw new ScramError(`Couldn't find a project called “${name}” on Scram's dashboard. Use scram_list_projects to see what's there.`);
        await this.click(hits[0]);
      } else {
        throw new ScramError("Give the project's editor URL or its name.");
      }
      await this.ensureLoggedIn();
      if (!(await this.waitForEditor(60000))) throw new ScramError("The project didn't open in the editor within a minute. Check the Scram Desktop window.");
      this.baseline = null;
      this.sent = "";
      return { opened: true, url: this.page.url(), title: await this.page.title() };
    });
  }

  async newProject({ name } = {}) {
    return this.exclusive("creating a project", async () => {
      await this.goHome();
      let card = null;
      for (let i = 0; i < 10 && !card; i++) {
        card = ((await this.try("findText", "create (a )?new project")) || [])[0] || null;
        if (!card) await sleep(1500);
      }
      if (!card) throw new ScramError("Couldn't find Scram's “Create new project” button on the dashboard.");
      await this.click(card);
      this.log("Clicked “Create new project”.");
      // Scram takes ~20s to create the project, then opens its editor by itself.
      if (!(await this.waitForEditor(150000))) throw new ScramError("Scram didn't open the new project's editor within 2½ minutes. Check the Scram Desktop window.");
      this.baseline = null;
      this.sent = "";
      const out = { created: true, url: this.page.url() };
      if (name) out.renamed = await this.renameProject(squash(name));
      return out;
    });
  }

  // More (top left) → click the project name above "Describe your project…" → type the new
  // name → Enter. Then back to the page view. (RoboBuild's renameProject, without its AI fallback.)
  async renameProject(name) {
    const titled = async () => new RegExp(`^${escapeRe(name)}\\b`, "i").test((await this.page.title()) || "");
    if (await titled()) return true;
    let ok = false;
    try {
      const plansX = await this.try("panelCloseTarget", "^plans$"); // the Plans panel can cover the name
      if (plansX) {
        await this.click(plansX);
        await sleep(600);
      }
      const more = ((await this.try("findText", "^more$", { maxLen: 10 })) || [])[0];
      if (more) {
        await this.click(more);
        await sleep(2000);
        await this.try("pressKey", "Escape"); // "More" also pops open the section menu
        await sleep(400);
        const nameEl = await this.try("projectNameTarget");
        if (nameEl) {
          await this.click(nameEl);
          await sleep(1000);
          const typed = await this.try("typeActive", name);
          if (typed?.ok) {
            await this.try("pressKey", "Enter");
            await sleep(1500);
            ok = (await this.try("projectNameTarget"))?.text === name || (await titled());
          }
        }
      }
    } catch {
      ok = false;
    }
    await this.revealChat(); // back to the page view with the chat
    this.log(ok ? `Renamed the project to “${name}”.` : "Couldn't rename the project; it keeps Scram's default name.");
    return ok;
  }

  // ------------------------------------------------------------------ screenshots

  async screenshot({ area = "window", maxWidth = 1400 } = {}) {
    if (area === "app_preview") {
      const pf = await this.try("previewFrame");
      if (!pf) throw new ScramError("There's no running app preview on screen. Switch Scram to Run mode first (or take a window screenshot).");
      return this.page.screenshot({ rect: pf.rect, maxWidth });
    }
    return this.page.screenshot({ maxWidth });
  }

  // ------------------------------------------------------------------ testing the running app

  // In Run mode, Scram shows the app being built in a frame in the middle of the editor. These
  // read it, and click and type in it the way a person would (real mouse clicks and typing), so
  // an agent can check the app works. References to its elements look like "app_ref_12".

  // The running app's frame. Scram must be in Run mode, with the app on screen.
  async appFrame() {
    await this.ensureEditor();
    if ((await this.currentMode()) !== "run") {
      throw new ScramError("Scram isn't in Run mode, so the app isn't running. Call scram_run_mode first, then try again.");
    }
    let pf = null;
    for (let i = 0; i < 10 && !pf; i++) {
      pf = await this.try("previewFrame");
      if (!pf) await sleep(500);
    }
    if (!pf) throw new ScramError("Scram is in Run mode, but the running app isn't on screen. Check with scram_screenshot.");
    if (pf.covered >= 0.5) {
      throw new ScramError(`Something in Scram is covering the running app${pf.coverLabel ? ` (“${pf.coverLabel}”)` : ""}. Check with scram_screenshot.`);
    }
    // Which frame it is: the one drawn at the preview's size (other frames, e.g. a help widget,
    // aren't), preferring one at the preview's address.
    const origin = (u) => {
      try {
        return new URL(u).origin;
      } catch {
        return "";
      }
    };
    let best = null;
    for (const f of await this.page.frames()) {
      const vp = await this.page.frameViewport(f.id).catch(() => null);
      if (!vp || !vp.w || !vp.h) continue;
      const scale = pf.content.w / vp.w;
      if (Math.abs(vp.h * scale - pf.content.h) > Math.max(4, pf.content.h * 0.05)) continue; // not this size
      const score = (vp.url === pf.src ? 2 : 0) + (pf.src && origin(vp.url) === origin(pf.src) ? 1 : 0);
      if (!best || score > best.score) best = { id: f.id, url: vp.url, scale, score };
    }
    if (!best) throw new ScramError("Couldn't reach the running app inside Scram's preview. Check with scram_screenshot that it's showing.");
    return { id: best.id, scale: best.scale, pf };
  }

  async appDom(frame, method, ...args) {
    return this.page.frameDom(frame.id, method, ...args);
  }

  // Where an element of the app (from refTarget) is in the window, checking a click there would
  // really land on it: inside the visible part of the preview, with nothing in front of it.
  async appPoint(frame, target, ref) {
    const { pf, scale } = frame;
    const x = pf.content.x + target.x * scale;
    const y = pf.content.y + target.y * scale;
    if (x < pf.rect.x || y < pf.rect.y || x > pf.rect.x + pf.rect.w || y > pf.rect.y + pf.rect.h) {
      throw new ScramError(`${ref} is outside the part of the app Scram is showing. Use scram_app_scroll, then try again.`);
    }
    const inApp = await this.appDom(frame, "elementAt", target.x, target.y);
    if (inApp && inApp.label !== target.label) {
      throw new ScramError(`Something in the app is in front of ${ref}${inApp.label ? ` (“${inApp.label}”)` : ""}. Close it first, or check with scram_screenshot (area "app_preview").`);
    }
    const inScram = await this.try("elementAt", x, y);
    if (inScram && !inScram.iframe) {
      throw new ScramError(`Something in Scram is in front of the app there${inScram.label ? ` (“${inScram.label}”)` : ""}. Check with scram_screenshot.`);
    }
    return { x, y };
  }

  // A reference for something on the app's page, by its text (the best match that can be clicked or typed in).
  async appRefFor(frame, text) {
    const found = (await this.appDom(frame, "findRefs", text))?.text || "";
    const line =
      found.split("\n").find((l) => /^(button|link|textbox|searchbox|combobox|checkbox|radio|switch|tab|menuitem|option|clickable)\b/.test(l) && /\[app_ref_\d+\]/.test(l)) ||
      found.split("\n").find((l) => /\[app_ref_\d+\]/.test(l));
    return line ? line.match(/\[(app_ref_\d+)\]/)[1] : null;
  }

  async appTarget(frame, { ref, text }) {
    await this.appDom(frame, "setRefPrefix", "app_");
    const r = ref || (text ? await this.appRefFor(frame, text) : null);
    if (!r) {
      throw new ScramError(ref || text ? `Couldn't find “${text}” on the app's page. Call scram_app_read to see what's there.` : "Say which element: a reference from scram_app_read (like app_ref_12), or its text.");
    }
    const t = await this.appDom(frame, "refTarget", r);
    if (!t) throw new ScramError(`${r} isn't on the app's page any more (the page may have changed). Call scram_app_read for fresh references.`);
    return { ref: r, target: t };
  }

  // After an action: let the app settle, then show its page (what's on screen), so the agent sees
  // what happened without another call.
  async appAfter(note) {
    await sleep(300);
    let frame;
    try {
      frame = await this.appFrame();
      await this.appDom(frame, "settle", 400, 3000).catch(() => {});
      frame = await this.appFrame(); // (it may have loaded another page)
    } catch (e) {
      return `${note}\n\n(Couldn't read the app afterwards: ${e.message})`;
    }
    await this.appDom(frame, "setRefPrefix", "app_");
    const vp = await this.appDom(frame, "viewport");
    const tree = await this.appDom(frame, "a11yTree", { filter: "", maxChars: APP_AFTER_CHARS });
    return `${note}\n\nThe app now: “${vp.title}” (${vp.url})\n${tree.text || "(nothing on screen)"}`;
  }

  // The running app's page as text, with references (app_ref_N) for clicking and typing.
  // filter: "visible" (what's on screen), "interactive" (only controls), "all" (the whole page).
  async readApp({ filter = "visible", find = "", maxChars = 20000 } = {}) {
    return this.exclusive("reading the running app", async () => {
      const frame = await this.appFrame();
      await this.appDom(frame, "setRefPrefix", "app_");
      const vp = await this.appDom(frame, "viewport");
      const r = find ? await this.appDom(frame, "findRefs", find) : await this.appDom(frame, "a11yTree", { filter: filter === "visible" ? "" : filter, maxChars });
      if (r?.error) throw new ScramError(r.error);
      return `The running app: “${vp.title}” (${vp.url})\n${r?.text || (find ? `Nothing matching “${find}”.` : "(nothing on screen)")}`;
    });
  }

  async clickApp({ ref, text, confirm = false } = {}) {
    return this.exclusive("clicking in the running app", async () => {
      const frame = await this.appFrame();
      const { ref: r, target } = await this.appTarget(frame, { ref, text });
      const name = target.label || r;
      if (RISKY_IN_APP.test(name) && !confirm) {
        throw new ScramError(
          `“${name}” could delete data, cost money or send something for real in the user's app. Ask the user first; if they agree, call scram_app_click again with confirm: true.`
        );
      }
      const at = await this.appPoint(frame, target, r);
      await this.page.trustedClick(at.x, at.y);
      this.log(`Clicked “${name}” in the running app.`);
      return this.appAfter(`Clicked “${name}”.`);
    });
  }

  // Types into a text field the way a person would: clicks it, selects what's there (unless
  // adding to it), types. A dropdown gets the option with that text instead.
  async typeInApp({ ref, field, text = "", clear = true, pressEnter = false } = {}) {
    return this.exclusive("typing in the running app", async () => {
      const frame = await this.appFrame();
      const found = await this.appTarget(frame, { ref, text: field });
      // A field's label (or a box around it) stands for the field itself.
      const r = (await this.appDom(frame, "fieldRef", found.ref)) || found.ref;
      const target = r === found.ref ? found.target : await this.appDom(frame, "refTarget", r);
      if (!target) throw new ScramError(`${r} isn't on the app's page any more. Call scram_app_read for fresh references.`);
      const name = target.label || found.target.label || r;
      const before = await this.appDom(frame, "refValue", r);
      if (before?.tag === "select") {
        const chose = await this.appDom(frame, "formInput", r, text);
        if (chose?.error) throw new ScramError(chose.error);
        this.log(`Chose “${text}” in the running app.`);
        return this.appAfter(`Chose “${text}” in “${name}”.`);
      }
      if (before?.checkbox) throw new ScramError(`${r} (“${name}”) is a checkbox or switch: click it with scram_app_click instead.`);
      if (!before || before.value === null) throw new ScramError(`${r} (“${name}”) isn't something you can type in. Call scram_app_read to find the text field.`);

      const want = clear ? text : `${before.value}${text}`;
      const typed = (v) => String(v ?? "").replace(/\r\n/g, "\n") === want.replace(/\r\n/g, "\n");
      const at = await this.appPoint(frame, target, r);
      await this.page.trustedClick(at.x, at.y);
      await sleep(150);
      let how = "typed";
      if ((await this.appDom(frame, "refValue", r))?.focused) {
        if (clear) await this.page.selectAll();
        else await this.page.trustedKey("End");
        if (text) await this.page.insertText(text);
        else if (clear) await this.page.trustedKey("Backspace");
        await sleep(100);
      }
      if (!typed((await this.appDom(frame, "refValue", r))?.value)) {
        // Typing didn't land (e.g. the field didn't take the focus): set it directly, with the
        // events an app listens for.
        const set = await this.appDom(frame, "formInput", r, want);
        if (set?.error || !typed((await this.appDom(frame, "refValue", r))?.value)) {
          throw new ScramError(`Couldn't type into ${r} (“${name}”). Check with scram_screenshot (area "app_preview").`);
        }
        how = "filled in";
      }
      if (pressEnter) await this.page.trustedKey("Enter");
      const shown = before.type === "password" ? `${text.length} characters` : `“${text.length > 80 ? `${text.slice(0, 80)}…` : text}”`;
      this.log(`Typed into “${name}” in the running app.`);
      return this.appAfter(`${how === "typed" ? "Typed" : "Filled in"} ${shown} ${clear ? "into" : "at the end of"} “${name}”${pressEnter ? ", then pressed Enter" : ""}.`);
    });
  }

  async scrollApp({ direction = "down", ref } = {}) {
    return this.exclusive("scrolling the running app", async () => {
      const frame = await this.appFrame();
      if (ref) {
        await this.appDom(frame, "setRefPrefix", "app_");
        const r = await this.appDom(frame, "scrollToRef", ref);
        if (r?.error) throw new ScramError(r.error);
        return this.appAfter(`Scrolled to ${ref}.`);
      }
      const to = direction === "top" ? "top" : direction === "up" ? -0.8 : 0.8;
      await this.appDom(frame, "scroll", to);
      return this.appAfter(direction === "top" ? "Scrolled to the top." : `Scrolled ${direction}.`);
    });
  }
}
