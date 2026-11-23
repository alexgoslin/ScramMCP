// The autopilot: builds a plan of steps in Scram by itself, hands-off, the way RoboBuild's
// Autopilot does, but with the plan written by the agent (Claude, ChatGPT…) beforehand, so it
// needs no AI of its own. Only started when the user asks for it, and only after the user
// confirms in Scram Desktop's own window (which the agent can't answer).
//
// For each step it:
//   1. sends the step's work order to Scram's bot,
//   2. approves the bot's plan, answers its questions with sensible defaults,
//   3. has the bot test the step in Run mode (the bot can't switch to Run mode itself, so the
//      autopilot does), and runs the layout check on the running app, sending any problems back,
//   4. moves on when the bot has finished and the checks are done.
// It pauses, and tells the user, when it needs a person: Scram needs a log-in, the bot asks for
// a secret or a payment, credits run out, or a step goes on too long. While it runs, only it may
// act on Scram (others can still look: status, chat, screenshots).

import { ScramError } from "./driver.js";

const WHO = "autopilot";
const MAX_STEPS = 40;
const WAIT_MS = 10 * 60000; // one wait for the bot (they repeat while it works)

// From RoboBuild (lib/scram-pilot.js): the bot asking for Run mode, or saying the app isn't running.
const ASKS_FOR_RUN = /\b(click|press|hit|tap|switch|put|turn|toggle|enable|activate|launch|start)\b[^.\n]{0,60}\brun\b|\brun mode\b[^.\n]{0,40}\b(active|on|enabled|needed|required)\b|\bin run mode\b[^.\n]{0,30}\?/i;
const SAYS_NOT_RUNNING = /\b(left the run (view|mode)|not (in )?run mode|isn['’]?t running|is not running|edit[- ]mode|app (is )?not drivable|can['’]?t (reach|drive|interact with) the (running )?app|preview (is )?(blank|not loading|outdated|stale))\b/i;
// The bot needing something only a person can give.
const NEEDS_YOU =
  /\b(i need|i['’]ll need|please (provide|add|enter|give|share|connect|set up)|can you (provide|add|enter|give|share|connect)|you['’]?ll need to (add|enter|provide|set up|connect|create)|requires? (your|a|an))\b[^.\n?]{0,80}\b(api key|secret|client (id|secret)|credentials|password|access token|payment|stripe|billing|credit card|domain|dns|oauth)/i;
const OUT_OF_CREDITS = /\b(out of credits|no credits (left|remaining)|not enough credits|insufficient credits|credit (limit|balance) (reached|exceeded)|top up)\b/i;
// Answer options: the ones that let the bot get on with it, rather than ones that start a
// conversation or stop.
const PREFER_OPTION = /\b(recommend(ed)?|just start building|start building|go ahead|build it|proceed|continue|yes|sounds good|use (your|the) (best|default|suggested)|keep it simple|default)\b/i;
const AVOID_OPTION = /\b(scope it out|talk (it )?through|ask me|let me (decide|choose|think)|later|cancel|stop|no|skip)\b/i;
// From RoboBuild: the bot offering to open Run itself (it can't), or saying the user will / Run is
// on already (the right answer once Run is on). An offer to fix an error is taken.
const RUN_ASK_OPTION = /\b(open|switch|turn on|enter|launch|start|go to|use|reopen)\b[^.]{0,20}\brun\b|^\W*run(\s+mode)?\W*$/i;
const GO_AHEAD_OPTION = /\b(i['’]?ll open (run|it)|i['’]?ve opened run|go ahead when|when it['’]?s (up|on|open|ready)|run is (on|open|up)|it['’]?s (on|open|up) now|already (open|on|running))\b/i;
const FIX_OPTION = /\b(let (the )?ai (fix|solve)|fix (it|this|the error)|solve (it|this)|try to fix)\b/i;
// The bot having lost the step (its memory was compressed and it can't re-open attachments).
const LOST_TRACK =
  /\b(which (items|parts|ones|things) (are|remain|still|were)|what (are|were) the (remaining|outstanding) (items|tasks)|can['’]?t (find|open|access|load|re-?open) (the )?(attach|step file|file|work order|original)|(lost|don['’]?t have) (the|access to the) (attach|step|file|list)|remind me (what|which))\b/i;
const RUN_ON = "Run mode is on now (I switched it on: you can't, and don't need to). Please carry on.";
const DEFAULT_ANSWER = "Please use your best judgement: keep it simple and consistent with the rest of the app and with this step's request, and carry on.";

const tail = (t, n = 2500) => String(t || "").slice(-n);
const short = (t, n = 200) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const time = () => new Date().toTimeString().slice(0, 5);

class Pause extends Error {}

export class Autopilot {
  // confirmStart({ steps, projectName, test, checkLayout }): asks the user in Scram Desktop;
  // resolves to "allow", "deny" or "timeout". notify(title, body): tells the user (e.g. a system
  // notification). onChange(): something changed (e.g. to update the window title).
  constructor(driver, { log = () => {}, confirmStart = async () => "deny", notify = () => {}, onChange = () => {}, maxRoundsPerStep = 14, stepTimeoutMs = 60 * 60000 } = {}) {
    Object.assign(this, { driver, log, confirmStart, notify, onChange, maxRoundsPerStep, stepTimeoutMs });
    this.run = null;
  }

  get state() {
    return this.run?.state || "idle";
  }

  note(text) {
    const line = `${time()} ${text}`;
    this.run.history.push(line);
    if (this.run.history.length > 200) this.run.history.shift();
    this.log(`Autopilot: ${text}`);
    this.onChange();
  }

  status() {
    const r = this.run;
    if (!r) return { state: "idle" };
    return {
      state: r.state,
      step: Math.min(r.step + 1, r.steps.length),
      steps: r.steps.length,
      current: r.steps[r.step]?.title || null,
      needs_you: r.needsYou || null,
      requests_to_bot: r.sent,
      started: r.started,
      finished: r.finished || null,
      plan: r.steps.map((s, i) => `${i + 1}. ${s.title}: ${i < r.step || r.state === "done" ? "done" : i === r.step ? r.state : "to do"}`),
      recent: r.history.slice(-15),
    };
  }

  describe() {
    const s = this.status();
    if (s.state === "idle") return "The autopilot isn't running. (It only runs when the user asks for it: scram_autopilot_start.)";
    const head = {
      running: `The autopilot is building: step ${s.step} of ${s.steps}, “${s.current}”.`,
      paused: `The autopilot is paused at step ${s.step} of ${s.steps}, “${s.current}”, because it needs the user: ${s.needs_you} When that's sorted, call scram_autopilot_resume (or the user can choose Resume autopilot in Scram Desktop's menu).`,
      stopping: "The autopilot is stopping.",
      stopped: `The autopilot was stopped at step ${s.step} of ${s.steps}.`,
      done: `The autopilot has finished all ${s.steps} steps.`,
    }[s.state];
    return [head, "", "Plan:", ...s.plan, "", `Requests to Scram's bot so far (each uses Scram credits): ${s.requests_to_bot}`, "", "Recent:", ...s.recent].join("\n");
  }

  // Starts a run (after the user confirms in Scram Desktop). Returns at once; the build goes on
  // in the background.
  async start({ steps, projectName = "", test = true, checkLayout = true } = {}) {
    if (this.state === "running" || this.state === "paused" || this.state === "stopping") {
      throw new ScramError(`The autopilot is already ${this.state === "paused" ? "paused mid-build" : "running"}. Use scram_autopilot_status, scram_autopilot_resume or scram_autopilot_stop.`);
    }
    steps = (Array.isArray(steps) ? steps : []).map((s) => ({ title: short(s?.title, 120), request: String(s?.request || "").trim() }));
    if (!steps.length || steps.some((s) => !s.title || !s.request)) throw new ScramError("Give the autopilot a plan: steps, each with a title and a request (the full work order for Scram's bot).");
    if (steps.length > MAX_STEPS) throw new ScramError(`That's ${steps.length} steps: the autopilot takes at most ${MAX_STEPS}. Combine some, or run it in parts.`);
    if (!projectName && this.driver.where() !== "editor") throw new ScramError("No Scram project is open. Open one (scram_open_project), or give a name for a new project.");
    if (this.driver.busyWith) throw new ScramError(`Busy: ${this.driver.busyWith}. Wait for that to finish, then try again.`);

    const answer = await this.confirmStart({ steps, projectName, test, checkLayout });
    if (answer !== "allow") {
      throw new ScramError(
        answer === "timeout"
          ? "Scram Desktop asked the user to confirm the autopilot, and nobody answered in time, so it didn't start. Ask the user to watch for Scram Desktop's message, then try again."
          : "The user chose not to start the autopilot in Scram Desktop. Don't start it again unless they ask."
      );
    }
    this.run = { state: "running", steps, projectName, test, checkLayout, step: 0, progress: {}, sent: 0, history: [], started: new Date().toISOString() };
    this.note(`Started: ${steps.length} step(s)${projectName ? ` in a new project “${projectName}”` : ""}.`);
    this.go();
    return this.describe();
  }

  resume() {
    if (this.state !== "paused") throw new ScramError(this.state === "idle" ? "The autopilot isn't running." : `The autopilot isn't paused (it's ${this.state}).`);
    this.run.state = "running";
    this.run.needsYou = null;
    this.note("Resumed.");
    this.go();
    return this.describe();
  }

  async stop({ stopBot = false } = {}) {
    if (!["running", "paused"].includes(this.state)) return this.describe();
    const wasPaused = this.state === "paused";
    this.run.state = wasPaused ? "stopped" : "stopping";
    this.run.abort?.abort();
    if (stopBot) await this.driver.stopBot().catch(() => {});
    this.note(`Stopped by request${stopBot ? " (and Scram's bot was stopped)" : ""}.`);
    if (wasPaused) this.finish("stopped");
    return this.describe();
  }

  // Runs (or carries on) in the background, keeping Scram to itself meanwhile.
  go() {
    const r = this.run;
    r.abort = new AbortController();
    this.driver.reserve(WHO, `The autopilot is building in Scram (step ${r.step + 1} of ${r.steps.length}). Use scram_autopilot_status to follow it, or scram_autopilot_stop to stop it.`);
    this.onChange();
    this.driver
      .runAs(WHO, () => this.runAll())
      .catch((e) => this.pause(`Something went wrong: ${e?.message || e}`))
      .finally(() => this.driver.release(WHO));
  }

  finish(state) {
    const r = this.run;
    r.state = state;
    r.finished = new Date().toISOString();
    this.driver.release(WHO);
    if (state === "done") {
      this.note("Finished: all steps built.");
      this.notify("Autopilot finished", `All ${r.steps.length} steps are built. Check the app in Scram Desktop.`);
    }
    this.onChange();
  }

  pause(reason) {
    const r = this.run;
    if (!r || r.state === "stopping" || r.state === "stopped") return this.finish("stopped");
    r.state = "paused";
    r.needsYou = reason;
    this.driver.release(WHO);
    this.note(`Paused: ${reason}`);
    this.notify("Autopilot needs you", reason);
    this.onChange();
  }

  checkStop() {
    if (this.run.state !== "running") throw new Pause("stopped");
  }

  async runAll() {
    const r = this.run;
    try {
      if (r.projectName && !r.progress.projectMade) {
        this.note(`Creating the project “${r.projectName}”.`);
        const made = await this.driver.newProject({ name: r.projectName });
        r.progress.projectMade = true;
        this.note(made.renamed ? "Project created." : "Project created (it couldn't be renamed: it keeps Scram's default name).");
      }
      if (r.test || r.checkLayout) await this.runMode();
      for (; r.step < r.steps.length; r.step++) {
        await this.runStep(r.step);
        r.progress = {};
      }
      this.finish("done");
    } catch (e) {
      if (e instanceof Pause && e.message === "stopped") return this.finish("stopped");
      this.pause(e instanceof Pause || e instanceof ScramError ? e.message : `Something went wrong: ${e?.message || e}`);
    }
  }

  async runMode({ restart = false } = {}) {
    try {
      if (restart || (await this.driver.currentMode()) !== "run") {
        await this.driver.setMode("run", { restart });
        this.note(restart ? "Restarted Run mode (the bot said the app wasn't running)." : "Switched Scram to Run mode (so the bot can test what it builds).");
      }
      // After a rebuild the preview can be an old version: Refresh it.
      if ((await this.driver.previewState()).notice) {
        await this.driver.setPreview({ refresh: true });
        this.note("Refreshed the preview (it was showing an old version).");
      }
    } catch (e) {
      this.note(`Couldn't get the running app showing: ${e.message}`);
    }
  }

  async send(message) {
    this.checkStop();
    const reply = await this.driver.sendMessage(message, { waitMs: WAIT_MS, signal: this.run.abort.signal });
    this.run.sent++;
    return reply;
  }

  workOrder(i) {
    const { steps } = this.run;
    const s = steps[i];
    return `Step ${i + 1} of ${steps.length}: ${s.title}\n\n${s.request}\n\n(Work on this step only. Plan it first and wait for my approval. After building it, test it yourself in Run mode and tell me clearly when everything works.)`;
  }

  async runStep(i) {
    const r = this.run;
    const s = r.steps[i];
    const p = r.progress;
    const begun = Date.now();
    let reply;
    if (!p.sent) {
      this.note(`Step ${i + 1} of ${r.steps.length}: sending “${s.title}” to Scram's bot.`);
      reply = await this.send(this.workOrder(i));
      p.sent = true;
    } else {
      this.checkStop();
      reply = await this.driver.waitForReply({ waitMs: WAIT_MS, signal: r.abort.signal });
    }
    p.rounds ||= 0;
    for (;;) {
      this.checkStop();
      // Still working: keep waiting (each wait is up to 10 minutes), within the step's time limit.
      while (reply.state === "still_working" || reply.state === "no_reply_yet") {
        if (Date.now() - begun > this.stepTimeoutMs) throw new Pause(`Step ${i + 1} (“${s.title}”) has taken over ${Math.round(this.stepTimeoutMs / 60000)} minutes. Check Scram Desktop's window: the bot may be stuck.`);
        this.checkStop();
        reply = await this.driver.waitForReply({ waitMs: WAIT_MS, signal: r.abort.signal });
      }
      this.checkStop();
      if (reply.state === "no_reply") {
        // It sometimes just stops: nudge it (twice at most) before asking the user.
        p.nudges = (p.nudges || 0) + 1;
        if (p.nudges > 2) throw new Pause("Scram's bot didn't reply, even after two nudges. It may be out of credits, or showing an error: check Scram Desktop's window.");
        this.note("The bot went quiet: nudging it to continue.");
        reply = await this.send("Please continue where you left off.");
        continue;
      }
      if (++p.rounds > this.maxRoundsPerStep) throw new Pause(`Step ${i + 1} (“${s.title}”) has gone ${this.maxRoundsPerStep} rounds with Scram's bot without finishing. Check the chat in Scram Desktop's window, sort it out with the bot, then resume.`);
      const said = tail(reply.reply);
      const broke = said.match(OUT_OF_CREDITS);
      if (broke) throw new Pause(`Scram's bot says the account is out of credits: “${short(said.slice(Math.max(0, broke.index - 80), broke.index + 120))}”. Top up in Scram, then resume.`);
      const need = said.match(NEEDS_YOU);
      if (need) throw new Pause(`Scram's bot needs something only you can give: “${short(said.slice(Math.max(0, need.index - 60), need.index + 200))}”. Sort it out in Scram Desktop's window (e.g. add the key where the bot says), then resume.`);

      // It lost the step (memory compressed; it can't re-open attachments): paste the step again,
      // then, if that happens again, start a new chat with the step.
      if (LOST_TRACK.test(said)) {
        if (!p.repasted) {
          p.repasted = true;
          this.note(`Step ${i + 1}: the bot lost track of the step: pasting it again.`);
          reply = await this.send(`Here is the whole step again (you can't re-open the attachment):\n\n${this.workOrder(i)}`);
          continue;
        }
        if (!p.newChat) {
          p.newChat = true;
          this.note(`Step ${i + 1}: the bot lost track again: starting a new chat with the step.`);
          await this.driver.newChat();
          const done = r.steps.slice(0, i).map((x, k) => `Step ${k + 1} (${x.title}): done.`).join(" ");
          reply = await this.send(`${done ? `Already built: ${done}\n\n` : ""}${this.workOrder(i)}`);
          continue;
        }
        throw new Pause(`Scram's bot keeps losing track of step ${i + 1} (“${s.title}”), even in a new chat. Check the chat in Scram Desktop's window, then resume.`);
      }

      // The bot can't switch to Run mode itself: if it asks, or says the app isn't running, switch
      // (or restart Run, if it's on: Scram can silently drop back to Edit mode).
      if (ASKS_FOR_RUN.test(said) || SAYS_NOT_RUNNING.test(said)) {
        const off = (await this.driver.currentMode()) !== "run";
        if (off) await this.runMode();
        else if (SAYS_NOT_RUNNING.test(said) && (!p.restartedRun || p.rounds - p.restartedRun > 2)) {
          p.restartedRun = p.rounds;
          await this.runMode({ restart: true });
        }
        // (The bot mentions Run mode in passing a lot: say it's on only when it was off, or now
        // and then, never every round.)
        if (reply.state !== "waiting_for_you" && (off || p.rounds - (p.runOnAt ?? -9) > 2)) {
          p.runOnAt = p.rounds;
          reply = await this.send(RUN_ON);
          continue;
        }
      }

      if (reply.state === "waiting_for_you") {
        reply = await this.answer(reply);
        continue;
      }

      // The bot has finished this round.
      if (r.test && !p.tested) {
        p.tested = true;
        await this.runMode();
        this.note(`Step ${i + 1}: asking the bot to test it in Run mode.`);
        reply = await this.send(
          `Now test step ${i + 1} (“${s.title}”) yourself in Run mode, like a real user would: go through every item on this step's testing checklist, and try every button, form and screen this step added, with real data and edge cases. Fix anything that doesn't work and test it again. When everything works, tell me clearly that this step is done and tested.`
        );
        continue;
      }
      if (r.checkLayout && (p.layoutRounds || 0) < 2) {
        const audit = await this.driver.checkLayout().catch((e) => {
          this.note(`Layout check skipped: ${e.message}`);
          return null;
        });
        const issues = audit?.issues || [];
        if (issues.length) {
          p.layoutRounds = (p.layoutRounds || 0) + 1;
          this.note(`Step ${i + 1}: the layout check found ${issues.length} possible problem(s); sending them to the bot.`);
          reply = await this.send(
            `I checked the layout of the running app (the page showing in Run mode) and found these possible problems:\n${issues.map((x) => `- ${x.detail}`).join("\n")}\n\nPlease look at each one, fix the real problems (some may be false alarms), and test again. Tell me when it's done.`
          );
          continue;
        }
        if (audit) this.note(`Step ${i + 1}: layout check found no problems.`);
        p.layoutRounds = 2;
      }
      this.note(`Step ${i + 1} of ${r.steps.length} (“${s.title}”) done.`);
      return;
    }
  }

  // The bot is waiting: approve its plan, or answer its question.
  async answer(reply) {
    const r = this.run;
    const opts = { waitMs: WAIT_MS, signal: r.abort.signal };
    this.checkStop();
    if (/approve|accept|build it|proceed/i.test(reply.waiting_for || "")) {
      this.note("Approved the bot's plan.");
      r.sent++;
      return this.driver.approvePlan(opts);
    }
    const all = ((await this.driver.choices()) || []).filter((c) => c.kind === "button" && !/^(cancel|approve( plan)?)$/i.test(c.label));
    // Never the bot opening Run itself (it can't); "I'll open Run / go ahead when it's up" once
    // Run is on; an offer to fix an error; then the "get on with it" answers.
    const goAhead = all.find((c) => GO_AHEAD_OPTION.test(c.label));
    if (goAhead) await this.runMode();
    const options = all.filter((c) => !RUN_ASK_OPTION.test(c.label) || GO_AHEAD_OPTION.test(c.label));
    if (all.length && !options.length) {
      // Only "open Run for me" choices: cancel the form, put Run on, and say so.
      this.note("The bot offered to open Run itself (it can't): cancelled its form and put Run on.");
      await this.driver.cancelQuestion().catch(() => {});
      await this.runMode();
      r.sent++;
      return this.driver.sendMessage(RUN_ON, opts);
    }
    const pick = goAhead || options.find((c) => FIX_OPTION.test(c.label)) || options.find((c) => PREFER_OPTION.test(c.label)) || options.find((c) => !AVOID_OPTION.test(c.label)) || options[0];
    r.sent++;
    if (pick) {
      this.note(`Answered the bot's question: “${short(pick.label, 80)}”.`);
      return this.driver.choose({ labels: [pick.label], ...opts });
    }
    this.note("Answered the bot's question: use your best judgement.");
    return this.driver.answerQuestion(DEFAULT_ANSWER, opts);
  }
}

