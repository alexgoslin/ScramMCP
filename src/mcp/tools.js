// The MCP tools: what an agent (Claude Code, Cursor…) sees and can call. Each one is a thin
// wrapper around the Scram driver.

import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { Autopilot } from "../scram/autopilot.js";
import { batchesOf, batchMessage, Briefs } from "../scram/briefs.js";
import { ScramDriver, ScramError } from "../scram/driver.js";
import { checkTheme, themeDocument, themeExamples, themeNotes } from "../scram/themes.js";
import { RESEARCH_SKILL, skillText } from "../skills.js";
import { INSTRUCTIONS } from "./instructions.js";

// Scram know-how for the agent, read on request: from RoboBuild's guides, plus TypeScript briefs,
// themes and UI rules (src/guides/).
const GUIDES = {
  driving: "Driving Scram's bot well: what it can and can't do (and which tool does it instead), handling plans, questions, testing and stalls, Run mode and the preview after rebuilds, its memory, what proof to accept, platform facts that save rounds, and when to involve the user. From real builds.",
  building: "How to build with Scram and its bot: what Scram is, a tour of the editor, getting the best results from the bot, testing, and when an app is done.",
  platform: "What Scram can and can't build (its building blocks, current limits, gotchas, social login).",
  planning: "How to split a build into small, testable steps, and write each as a complete work order (also: writing a plan for scram_autopilot_start).",
  handoff: "The full handoff method for a big build: Setup first, dependency order, a Context Block in every step, scope / out of scope / testing checklist / gate, a manifest, a final regression; with templates.",
  editor: "A map of Scram's editor (screens, toolbars, panels, what never to click): for reading screenshots and knowing what the tools do.",
  briefs: "For BIG requests only: writing them as a staged TypeScript brief, sent one batch at a time (scram_brief), and what Scram does that a brief should anticipate.",
  brief_template: "The TypeScript brief template to start a brief from.",
  themes: "Themes: the questions to ask the user first (vibe, boldness, must-haves), Scram's theme rules, the six example themes, and sending one (scram_send_theme).",
  theme_examples: "The six example themes and the theme template, as TypeScript files.",
  design: "How to give an app its own distinctive, art-directed design.",
  ui_quality: "UI rules for the screens Scram builds: the quality gate (scope, and evidence before calling a screen finished), craft, and consistency.",
  research:
    "Researching an existing product, or a whole category of products, before building something like it in Scram: done by you, with your own tools (web search, reading pages, a browser); Scram Desktop doesn't research. Scoping, exploring a site safely, the screen spec, comparing products in a design tribunal, the user's questions, the briefing, and handing over to the build. (The same as the scram-research skill.)",
};
// (Always with \n line endings: Git on Windows may check the files out with \r\n.)
const asset = (path) => readFileSync(new URL(`../guides/${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const typescriptFiles = (pick) =>
  readdirSync(new URL("../guides/typescript/", import.meta.url))
    .filter(pick)
    .sort()
    .map((f) => `// ===== ${f} =====\n${asset(`typescript/${f}`)}`)
    .join("\n\n");
const guide = (topic) =>
  ({
    brief_template: () => asset("typescript/brief-template.ts"),
    theme_examples: () => typescriptFiles((f) => /^theme-/.test(f)),
    ui_quality: () => asset("ui-quality.md"),
    research: () => skillText(RESEARCH_SKILL),
  })[topic]?.() ?? asset(`${topic}.md`);



const waitSeconds = z
  .number()
  .int()
  .min(5)
  .max(1800)
  .optional()
  .describe("How long to wait for Scram's bot before returning, in seconds (default 300). If it's still working then, call scram_wait_for_reply.");

const text = (t) => ({ content: [{ type: "text", text: t }] });
const json = (o) => text(JSON.stringify(o, null, 2));

function describeReply(r) {
  const head = {
    done: "Scram's bot has finished.",
    waiting_for_you: `Scram's bot is waiting for you: ${r.waiting_for}. Answer with scram_choose (click a choice and/or write an answer) or reply with scram_send_message.`,
    still_working: "Scram's bot is still working. Call scram_wait_for_reply to keep waiting.",
    no_reply: "Scram's bot didn't reply. Check scram_status or scram_screenshot (it may be out of credits or showing an error).",
    no_reply_yet: "Scram's bot hasn't replied yet. Call scram_wait_for_reply to keep waiting, or check scram_screenshot.",
    cancelled: "Stopped waiting because the request was cancelled. The bot may still be working: call scram_wait_for_reply.",
  }[r.state] || `State: ${r.state}`;
  const lines = [head];
  if (r.choices?.length) lines.push(`Choices on screen: ${r.choices.join(" · ")}`);
  lines.push("", "What the bot wrote since your last message:", r.reply?.trim() || "(nothing new in the chat)");
  return text(lines.join("\n"));
}

// Progress notifications while waiting (if the client asked for them), and cancellation.
function waiting(ctx) {
  const token = ctx?.mcpReq?._meta?.progressToken;
  const onProgress =
    token === undefined
      ? undefined
      : ({ elapsed, message }) =>
          ctx.mcpReq
            .notify({ method: "notifications/progress", params: { progressToken: token, progress: Math.round(elapsed / 1000), message } })
            .catch(() => {});
  return { onProgress, signal: ctx?.mcpReq?.signal };
}

// Run a tool, turning Scram problems into readable tool errors instead of protocol errors.
function guard(name, activity, fn) {
  return async (args, ctx) => {
    activity?.(name, true);
    try {
      return await fn(args || {}, ctx);
    } catch (e) {
      const msg = e instanceof ScramError ? e.message : `Something went wrong in Scram Desktop: ${e?.message || e}`;
      return { ...text(msg), isError: true };
    } finally {
      activity?.(name, false);
    }
  };
}

export function createScramMcpServer(driver, { version = "0.1.0", activity, autopilot = new Autopilot(driver), briefs = new Briefs(join(tmpdir(), "scram-desktop-briefs")) } = {}) {
  const server = new McpServer({ name: "scram", title: "Scram", version }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const acts = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "scram_status",
    {
      title: "Scram status",
      description:
        "Where the Scram Desktop window is (dashboard, a project's editor, a login page), whether you're logged in, whether Scram's bot is working or waiting for an answer, and the choices it's showing.",
      annotations: readOnly,
    },
    guard("scram_status", activity, async () => json(await driver.status()))
  );

  server.registerTool(
    "scram_send_message",
    {
      title: "Send a message to Scram's bot",
      description:
        "Type a message into the open project's AI chat in Scram and send it, as a person would. Scram's bot then builds or changes the app (pages, components, workflows, database, theme…). Waits for the bot to finish and returns what it wrote. The bot often replies with a plan to approve or a question: answer with scram_choose. Uses the user's Scram credits.",
      inputSchema: z.object({
        message: z.string().min(1).describe("What to ask Scram's bot, in plain language. Long, detailed requests are fine."),
        wait_seconds: waitSeconds,
      }),
      annotations: acts,
    },
    guard("scram_send_message", activity, async ({ message, wait_seconds }, ctx) =>
      describeReply(await driver.sendMessage(message, { waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) }))
    )
  );

  server.registerTool(
    "scram_wait_for_reply",
    {
      title: "Wait for Scram's bot",
      description: "Wait until Scram's bot has finished what it's doing, then return what it wrote since your last message (and any choices it's waiting on).",
      inputSchema: z.object({ wait_seconds: waitSeconds }),
      annotations: readOnly,
    },
    guard("scram_wait_for_reply", activity, async ({ wait_seconds }, ctx) =>
      describeReply(await driver.waitForReply({ waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) }))
    )
  );

  server.registerTool(
    "scram_approve_plan",
    {
      title: "Approve Scram's plan",
      description:
        "Approve the plan Scram's bot is waiting on (clicks its “Approve plan” button), so it starts building. Then waits for the bot and returns its reply. To ask for changes to the plan instead, describe them with scram_send_message.",
      inputSchema: z.object({ wait_seconds: waitSeconds }),
      annotations: acts,
    },
    guard("scram_approve_plan", activity, async ({ wait_seconds }, ctx) =>
      describeReply(await driver.approvePlan({ waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) }))
    )
  );

  server.registerTool(
    "scram_answer_question",
    {
      title: "Answer Scram's question",
      description:
        "Answer the question Scram's bot is asking. If the answer matches one of its options (by title, e.g. “Just start building”), that option is clicked; otherwise the answer is typed into its “Write my own answer” box and sent. Then waits for the bot and returns its reply. The options are listed in the reply that asked the question, and in scram_status.",
      inputSchema: z.object({
        answer: z.string().min(1).describe("An option's title, or your own answer in plain words."),
        wait_seconds: waitSeconds,
      }),
      annotations: acts,
    },
    guard("scram_answer_question", activity, async ({ answer, wait_seconds }, ctx) =>
      describeReply(await driver.answerQuestion(answer, { waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) }))
    )
  );

  server.registerTool(
    "scram_run_mode",
    {
      title: "Switch Scram to Run mode",
      description:
        "Switch Scram's editor to Run mode (the Run button, top right): the running app shows in the middle, and Scram's bot can click through it to test its work. Scram's bot can't switch modes itself: never ask it to. Scram can silently drop back to Edit mode (the bot then says the app isn't running, or its clicks find nothing): call this again. restart: true switches Run off and on again, when the preview is stuck, blank, a placeholder, or on an old version.",
      inputSchema: z.object({ restart: z.boolean().optional().describe("Switch Run off and on again (default false).") }),
      annotations: { ...acts, idempotentHint: true },
    },
    guard("scram_run_mode", activity, async ({ restart }) => json(await driver.setMode("run", { restart: !!restart })))
  );

  server.registerTool(
    "scram_edit_mode",
    {
      title: "Switch Scram to Edit mode",
      description: "Switch Scram's editor to Edit mode (the Edit button, top right): the page canvas for editing instead of the running app.",
      annotations: { ...acts, idempotentHint: true },
    },
    guard("scram_edit_mode", activity, async () => json(await driver.setMode("edit")))
  );

  server.registerTool(
    "scram_choose",
    {
      title: "Click Scram's buttons",
      description:
        'For anything scram_approve_plan and scram_answer_question don\'t cover: click the buttons Scram\'s bot is showing in the chat, in order (e.g. several options of a multi-part question), and/or type a written answer, then press its Submit button if there is one. Then waits for the bot and returns its reply. Labels can be partial. Never clicks publish, delete, share, billing or log-out controls.',
      inputSchema: z.object({
        choices: z.array(z.string()).optional().describe('Labels of the buttons to click, in order, e.g. ["Approve plan"].'),
        text: z.string().optional().describe('A written answer, typed into the bot\'s answer box ("Write my own answer").'),
        submit: z.boolean().optional().describe("Press the form's Submit button afterwards if there is one (default true)."),
        wait_seconds: waitSeconds,
      }),
      annotations: acts,
    },
    guard("scram_choose", activity, async ({ choices, text: answer, submit, wait_seconds }, ctx) =>
      describeReply(
        await driver.choose({ labels: choices || [], text: answer || "", submit: submit ?? true, waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) })
      )
    )
  );

  server.registerTool(
    "scram_read_chat",
    {
      title: "Read Scram's chat",
      description: "The open project's AI chat as a person sees it (newest at the end), without the bot's collapsed thinking and tool steps.",
      inputSchema: z.object({ max_chars: z.number().int().min(500).max(50000).optional().describe("Return at most this many characters, from the end (default 8000).") }),
      annotations: readOnly,
    },
    guard("scram_read_chat", activity, async ({ max_chars }) => text((await driver.readChat({ maxChars: max_chars ?? 8000 })) || "(the chat is empty)"))
  );

  server.registerTool(
    "scram_stop_bot",
    {
      title: "Stop Scram's bot",
      description:
        "Stop Scram's AI while it's building or replying: presses the stop button that takes the send button's place while it works. Does nothing if it isn't working. What it already built stays.",
      annotations: acts,
    },
    guard("scram_stop_bot", activity, async () => json(await driver.stopBot()))
  );

  server.registerTool(
    "scram_list_projects",
    {
      title: "List Scram projects",
      description:
        "Go to Scram's dashboard and list the projects there (best effort: Scram's project list isn't an API). Leaves the window on the dashboard.",
      annotations: { ...readOnly, idempotentHint: true },
    },
    guard("scram_list_projects", activity, async () => json(await driver.listProjects()))
  );

  server.registerTool(
    "scram_open_project",
    {
      title: "Open a Scram project",
      description: "Open a project in Scram's editor, by its editor URL (https://editor.buildwithscram.com/…) or by its name on the dashboard.",
      inputSchema: z.object({
        url: z.string().optional().describe("The project's editor URL."),
        name: z.string().optional().describe("The project's name, exactly as Scram's dashboard shows it."),
      }),
      annotations: acts,
    },
    guard("scram_open_project", activity, async ({ url, name }) => json(await driver.openProject({ url, name })))
  );

  server.registerTool(
    "scram_new_project",
    {
      title: "Create a Scram project",
      description: "Create a new, empty Scram project (the dashboard's “Create new project”), wait for its editor to open, and optionally rename it.",
      inputSchema: z.object({ name: z.string().optional().describe("A name for the new project.") }),
      annotations: acts,
    },
    guard("scram_new_project", activity, async ({ name }) => json(await driver.newProject({ name })))
  );

  // Testing the running app (Run mode).
  const appRef = z.string().regex(/^app_ref_\d+$/).optional().describe("A reference from scram_app_read, like app_ref_12.");
  const appText = (t) => text(t);

  server.registerTool(
    "scram_app_read",
    {
      title: "Read the running app",
      description:
        "Read the app Scram is building, as it runs in Scram's Run mode (call scram_run_mode first): its page as text, with a reference (app_ref_N) for each button, link and field, to use with scram_app_click and scram_app_type. Use this to test the app the bot built: check pages show the right things, then click through it and fill in its forms.",
      inputSchema: z.object({
        filter: z.enum(["visible", "interactive", "all"]).optional().describe('"visible" (default): what\'s on screen now; "interactive": only buttons, links and fields; "all": the whole page, including below the fold.'),
        find: z.string().optional().describe('Instead of the whole page: the elements best matching these words, e.g. "email field" or "submit".'),
      }),
      annotations: readOnly,
    },
    guard("scram_app_read", activity, async ({ filter, find }) => appText(await driver.readApp({ filter: filter || "visible", find: find || "" })))
  );

  server.registerTool(
    "scram_app_click",
    {
      title: "Click in the running app",
      description:
        "Click a button, link, checkbox or tab in the running app (Run mode), with a real mouse click, then return what the app shows afterwards. Give its reference from scram_app_read, or its text. Testing can change the app's data, like a real user would. Before anything that looks like it deletes data, costs money or sends something (\"Delete\", \"Pay\", \"Send email\"…), or a button with no name, Scram Desktop asks the user in its own window: if they say no, don't try again unless they ask you to.",
      inputSchema: z.object({
        ref: appRef,
        text: z.string().optional().describe("Or the text of what to click, e.g. \"Place order\"."),
      }),
      annotations: acts,
    },
    guard("scram_app_click", activity, async ({ ref, text: label }) => appText(await driver.clickApp({ ref, text: label })))
  );

  server.registerTool(
    "scram_app_type",
    {
      title: "Type in the running app",
      description:
        "Type into a text field of the running app (Run mode) the way a person would: click it, replace what's there (or add to it), and optionally press Enter. For a dropdown, give the option's text to choose it. Then returns what the app shows afterwards. Checkboxes: use scram_app_click.",
      inputSchema: z.object({
        ref: appRef,
        field: z.string().optional().describe('Or the field\'s label or placeholder, e.g. "Email".'),
        text: z.string().describe("What to type (or the dropdown option to choose)."),
        clear: z.boolean().optional().describe("Replace what's in the field (default true). false adds to the end."),
        press_enter: z.boolean().optional().describe("Press Enter afterwards, e.g. to submit a search (default false)."),
        leave_field: z.boolean().optional().describe("Leave the field afterwards (Tab), like a person, so anything saved when you leave a field is saved (default true)."),
      }),
      annotations: acts,
    },
    guard("scram_app_type", activity, async ({ ref, field, text: value, clear, press_enter, leave_field }) =>
      appText(await driver.typeInApp({ ref, field, text: value, clear: clear ?? true, pressEnter: !!press_enter, leaveField: leave_field ?? true }))
    )
  );

  server.registerTool(
    "scram_app_drag",
    {
      title: "Drag in the running app",
      description:
        "Drag with a real mouse in the running app (Run mode): from one element to another, e.g. painting a range of times on a calendar grid, a slider, or reordering a list. Scram's bot's own Run tool can't drag, so do it here, then have the bot check the result (e.g. with SQL). Returns what the app shows afterwards.",
      inputSchema: z.object({
        from_ref: appRef,
        from_text: z.string().optional().describe("Or the text of where to start."),
        to_ref: appRef,
        to_text: z.string().optional().describe("Or the text of where to let go."),
      }),
      annotations: acts,
    },
    guard("scram_app_drag", activity, async ({ from_ref, from_text, to_ref, to_text }) =>
      appText(await driver.dragInApp({ fromRef: from_ref, fromText: from_text, toRef: to_ref, toText: to_text }))
    )
  );

  server.registerTool(
    "scram_app_key",
    {
      title: "Press a key in the running app",
      description: "Press a key in the running app (Run mode), where its keyboard focus is (click or type in it first): Enter, Tab, Escape, Space, arrows, Home, End, PageUp, PageDown. Returns what the app shows afterwards.",
      inputSchema: z.object({ key: z.enum(["Enter", "Tab", "Escape", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]) }),
      annotations: acts,
    },
    guard("scram_app_key", activity, async ({ key }) => appText(await driver.pressKeyInApp(key)))
  );

  server.registerTool(
    "scram_preview",
    {
      title: "Control Scram's Run preview",
      description:
        'The Run preview\'s own controls, which Scram\'s bot can\'t use (Run mode): go to a page of the app by its path (the path box above the running app, e.g. "/orders?view=list"), change the preview size (desktop, tablet or mobile: for checking a layout at another width, then tell the bot which size is on), and Refresh (after a rebuild, or when it says "This version is outdated"). With nothing set, just says where the preview is. Closes panels covering it first. After a rebuild, the path can lose its query or land on a template path: set it again.',
      inputSchema: z.object({
        path: z.string().optional().describe('A path in the app, starting with "/".'),
        size: z.enum(["desktop", "tablet", "mobile"]).optional(),
        refresh: z.boolean().optional().describe("Press the preview's Refresh."),
      }),
      annotations: acts,
    },
    guard("scram_preview", activity, async ({ path, size, refresh }) => json(path || size || refresh ? await driver.setPreview({ path, size, refresh: !!refresh }) : await driver.previewState()))
  );

  server.registerTool(
    "scram_editor",
    {
      title: "Scram's editor: panels, chat, question forms",
      description:
        'Things in Scram\'s editor that Scram\'s bot can\'t do. "back_to_page": get back to the page view with the AI chat (closes panels, leaves workflow canvases, re-opens a collapsed chat). "close_panels": close what covers the editor (Plans, Activity, History, theme panel, warnings/errors dialogs, cookie banners). "cancel_question": cancel the bot\'s question form, e.g. when it offers "Open Run and test it for me" (it can\'t: put Run on yourself, then tell it Run is on). "new_chat": a fresh chat with the bot, when it has lost track (e.g. it can\'t re-open an attached file after its memory was compressed) or keeps going in circles; then send the work again in full.',
      inputSchema: z.object({ action: z.enum(["back_to_page", "close_panels", "cancel_question", "new_chat"]) }),
      annotations: acts,
    },
    guard("scram_editor", activity, async ({ action }) =>
      json(
        action === "back_to_page"
          ? await driver.backToPageView()
          : action === "close_panels"
            ? { closed: await driver.exclusive("closing panels", async () => (await driver.ensureEditor(), driver.closePanels())) }
            : action === "cancel_question"
              ? await driver.cancelQuestion()
              : await driver.newChat()
      )
    )
  );

  server.registerTool(
    "scram_app_scroll",
    {
      title: "Scroll the running app",
      description: "Scroll the running app's page (Run mode) up, down, to the top, or to an element, then return what's on screen. Useful before a screenshot of the app.",
      inputSchema: z.object({
        direction: z.enum(["down", "up", "top"]).optional().describe('"down" (default), "up" or "top".'),
        ref: appRef,
      }),
      annotations: { ...readOnly, idempotentHint: false },
    },
    guard("scram_app_scroll", activity, async ({ direction, ref }) => appText(await driver.scrollApp({ direction: direction || "down", ref })))
  );

  server.registerTool(
    "scram_app_check_layout",
    {
      title: "Check the running app's layout",
      description:
        "An automatic check of the page the running app is showing (Run mode) for what a person would notice is wrong: menus or popups off the screen, things shown twice, overlapping or cut-off text, broken images, hard-to-read text, sideways scrolling, a blank page. Some findings can be false alarms: compare with scram_screenshot (area \"app_preview\"). To fix real problems, describe them to Scram's bot.",
      annotations: readOnly,
    },
    guard("scram_app_check_layout", activity, async () => text(ScramDriver.describeLayout(await driver.checkLayout())))
  );

  server.registerTool(
    "scram_guide",
    {
      title: "Scram know-how",
      description: `Read how to build well with Scram before building anything substantial. Topics: ${Object.entries(GUIDES)
        .map(([k, v]) => `"${k}": ${v}`)
        .join(" ")}`,
      inputSchema: z.object({ topic: z.enum(Object.keys(GUIDES)).optional().describe('Which guide (default "building").') }),
      annotations: { ...readOnly, idempotentHint: true },
    },
    guard("scram_guide", activity, async ({ topic }) => text(guide(topic || "building")))
  );

  // Themes, written as the exact call Scram's theme tool makes.
  const examples = themeExamples();
  server.registerTool(
    "scram_send_theme",
    {
      title: "Make a theme in Scram",
      description:
        'Make (or update) a theme in the open Scram project and apply it to the app. Ask the user the theme questions first unless they\'ve said what they want (scram_guide topic "themes"). Give either one of the example themes, or your own theme: the createTheme payload of Scram\'s theme tool. It\'s checked against Scram\'s theme schema first (any problem is listed, and nothing is sent), then written as a TypeScript document (the exact manageThemes call) and sent to Scram\'s bot, which creates it, applies it and reads back what it stored. Then check the "Done when" line in Run mode.',
      inputSchema: z.object({
        example: z.enum(Object.keys(examples)).optional().describe(`One of the example themes: ${Object.entries(examples).map(([k, v]) => `"${k}" (${v.theme.themeName}: ${v.theme.colorSchemeMode})`).join(", ")}.`),
        theme: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Or your own theme: { themeName, description, baseColors: { primary, secondary, neutral, success, alert, error } (#RRGGBB), colorShadeOverrides?: { role: { shade: hex } }, fonts?: { heading, body } (Google Font names), spacing? 0-9, textSize? 0-9, roundness? 0-9, border? 0-4, size? 0-4, iconLibrary: feather|hero-outline|hero-solid|lucide, colorSchemeMode: light-only|dark-only|switchable }."
          ),
        done_when: z.string().optional().describe('For your own theme: one line a person can check by eye in Run mode, e.g. "the page is cream #F9F4EC and a test button is ink #26252C with 8 px corners".'),
        wait_seconds: waitSeconds,
      }),
      annotations: acts,
    },
    guard("scram_send_theme", activity, async ({ example, theme, done_when, wait_seconds }, ctx) => {
      let doc;
      let notes = [];
      let doneWhen;
      if (example) {
        // The example's own file (with its extra notes for the bot).
        const ex = examples[example];
        doc = asset(`typescript/${ex.file}`);
        doneWhen = ex.doneWhen;
        notes = themeNotes(ex.theme);
      } else {
        if (!theme) throw new ScramError("Give an example theme, or your own theme.");
        const { theme: checked, problems } = checkTheme(theme);
        if (problems.length) throw new ScramError(`The theme wasn't sent: it doesn't fit Scram's theme schema.\n- ${problems.join("\n- ")}\nFix these and try again (scram_guide topic "themes" has the rules).`);
        if (!done_when?.trim()) throw new ScramError('Add a "done_when" line: what a person will see in Run mode when the theme is right (exact colours, corners, sizes).');
        doc = themeDocument(checked, done_when);
        doneWhen = done_when.trim();
        notes = themeNotes(checked);
      }
      const reply = describeReply(await driver.sendMessage(doc, { waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) }));
      const after = [`Done when: ${doneWhen}`, "Check that in Run mode (scram_run_mode, then scram_screenshot area \"app_preview\"), not in the editor preview.", ...notes];
      return text(`${reply.content[0].text}\n\n${after.join("\n")}`);
    })
  );

  // TypeScript briefs: for big requests only (scram_guide topic "briefs").
  server.registerTool(
    "scram_brief",
    {
      title: "TypeScript briefs (big requests only)",
      description:
        'For BIG requests only (a whole app, or a feature with several tables, pages or integrations): keep a staged TypeScript brief in Scram Desktop and send it to Scram\'s bot one batch at a time. Small requests go as plain messages with scram_send_message. Read scram_guide topics "briefs" and "brief_template" first. Actions: "save" (name, content: the whole brief, with "// BATCH n — title" sections, each with "// Done when:"), "read" (name), "list", "send_batch" (name, batch number, optional preamble: answers to the bot\'s questions, fixes to make first): sends the brief\'s conventions plus that batch and waits for the bot. After each batch, add an "// AS BUILT" block and save the brief again.',
      inputSchema: z.object({
        action: z.enum(["save", "read", "list", "send_batch"]),
        name: z.string().optional().describe('The brief\'s name, e.g. "bakery-orders".'),
        content: z.string().optional().describe("For save: the whole brief."),
        batch: z.number().int().min(0).optional().describe("For send_batch: the batch number."),
        preamble: z.string().optional().describe("For send_batch: what to say before the batch (answers to the bot's questions from the last batch, fixes to make first)."),
        wait_seconds: waitSeconds,
      }),
      annotations: acts,
    },
    guard("scram_brief", activity, async ({ action, name, content, batch, preamble, wait_seconds }, ctx) => {
      const batchList = (all) => all.map((b) => `- Batch ${b.n}: ${b.title}${b.doneWhen ? `\n  Done when: ${b.doneWhen}` : ""}`).join("\n");
      if (action === "list") {
        const all = briefs.list();
        return text(all.length ? all.map((b) => `${b.name} (saved ${b.changed}): batches ${b.batches.join(" · ") || "none"}`).join("\n") : "No briefs saved yet.");
      }
      if (!name) throw new ScramError("Give the brief's name.");
      if (action === "read") return text(briefs.read(name));
      if (action === "save") {
        const saved = briefs.save(name, content);
        return text(
          saved.batches.length
            ? `Saved the brief “${saved.name}” in Scram Desktop. Its batches:\n${batchList(saved.batches)}\n\nSend one at a time with action "send_batch".`
            : `Saved the brief “${saved.name}”, but it has no batches: mark each one with a "// BATCH n — title" header and a "// Done when:" line (see scram_guide topic "brief_template").`
        );
      }
      if (batch === undefined) throw new ScramError("Say which batch to send (its number).");
      const { text: brief, batch: b } = briefs.batch(name, batch);
      const reply = describeReply(await driver.sendMessage(batchMessage(brief, b, preamble), { waitMs: (wait_seconds ?? 300) * 1000, ...waiting(ctx) }));
      return text(
        `${reply.content[0].text}\n\nSent batch ${b.n} (“${b.title}”) of the brief “${name}”.${b.doneWhen ? ` Done when: ${b.doneWhen}` : ""}\nWhen the bot has finished: check the Done-when line in Run mode, then add an "// AS BUILT (batch ${b.n}):" block and a BUILD LOG row to the brief and save it.`
      );
    })
  );

  // The autopilot: a hands-off build of a whole plan. Only when the user asks for it.
  server.registerTool(
    "scram_autopilot_start",
    {
      title: "Start the autopilot (only if the user asks)",
      description:
        "ONLY use this when the user has explicitly asked for the autopilot, or for a hands-off build. Never start it on your own initiative. Scram Desktop builds a whole plan in Scram by itself, in the background: for each step it sends the work order to Scram's bot, approves its plans, answers its questions with sensible defaults, has the bot test the step in Run mode, runs the layout check and sends back problems, then moves on. It pauses when it needs the user (a log-in, a secret or payment the bot asks for, credits running out, a step stuck too long). Before it starts, Scram Desktop asks the user to confirm in its own window. Write the plan first (read scram_guide topic \"planning\"): small steps in build order, each a complete work order. While it runs, the other tools that act on Scram are paused for you; follow it with scram_autopilot_status.",
      inputSchema: z.object({
        steps: z
          .array(z.object({ title: z.string().min(1).describe("A short title, e.g. \"Setup\" or \"Orders list\"."), request: z.string().min(1).describe("The full work order for Scram's bot for this step.") }))
          .min(1)
          .max(40)
          .optional()
          .describe("The plan, in build order."),
        brief: z.string().optional().describe("Or the name of a saved TypeScript brief (scram_brief): its batches are the steps."),
        from_batch: z.number().int().min(0).optional().describe("With brief: start from this batch (default: the first)."),
        new_project_name: z.string().optional().describe("Build in a new project with this name. Leave out to build in the project that's open."),
        test_each_step: z.boolean().optional().describe("Have Scram's bot test each step in Run mode (default true)."),
        check_layout: z.boolean().optional().describe("Run the layout check after each step and send problems to the bot (default true)."),
      }),
      annotations: acts,
    },
    guard("scram_autopilot_start", activity, async ({ steps, brief, from_batch, new_project_name, test_each_step, check_layout }) => {
      if (brief) {
        const doc = briefs.read(brief);
        steps = batchesOf(doc)
          .filter((b) => from_batch === undefined || b.n >= from_batch)
          .map((b) => ({ title: `Batch ${b.n}: ${b.title}`, request: batchMessage(doc, b) }));
        if (!steps.length) throw new ScramError(`The brief “${brief}” has no batches${from_batch !== undefined ? ` from batch ${from_batch} on` : ""}.`);
      }
      if (!steps?.length) throw new ScramError("Give the autopilot a plan: steps, or the name of a saved brief.");
      return text(await autopilot.start({ steps, projectName: new_project_name || "", test: test_each_step ?? true, checkLayout: check_layout ?? true }));
    })
  );

  server.registerTool(
    "scram_autopilot_status",
    {
      title: "Autopilot progress",
      description: "How the autopilot is getting on: which step it's on, what it's done recently, and whether it's paused because it needs the user.",
      annotations: readOnly,
    },
    guard("scram_autopilot_status", activity, async () => text(autopilot.describe()))
  );

  server.registerTool(
    "scram_autopilot_resume",
    {
      title: "Resume the autopilot",
      description: "Carry on a paused autopilot, once what it needed is sorted (e.g. the user has logged in, or added the key the bot asked for).",
      annotations: acts,
    },
    guard("scram_autopilot_resume", activity, async () => text(autopilot.resume()))
  );

  server.registerTool(
    "scram_autopilot_stop",
    {
      title: "Stop the autopilot",
      description: "Stop the autopilot (what's already built stays). Optionally stop Scram's bot too, if it's in the middle of something.",
      inputSchema: z.object({ stop_bot: z.boolean().optional().describe("Also stop Scram's bot mid-build (default false).") }),
      annotations: acts,
    },
    guard("scram_autopilot_stop", activity, async ({ stop_bot }) => text(await autopilot.stop({ stopBot: !!stop_bot })))
  );

  server.registerTool(
    "scram_screenshot",
    {
      title: "Screenshot Scram",
      description: 'A picture of the Scram Desktop window ("window", the default) or just the running app\'s preview in Run mode ("app_preview").',
      inputSchema: z.object({ area: z.enum(["window", "app_preview"]).optional() }),
      annotations: readOnly,
    },
    guard("scram_screenshot", activity, async ({ area }) => {
      const shot = await driver.screenshot({ area: area || "window" });
      return { content: [{ type: "image", data: shot.data, mimeType: shot.mimeType }] };
    })
  );

  return server;
}
