// The MCP tools: what an agent (Claude Code, Cursor…) sees and can call. Each one is a thin
// wrapper around the Scram driver.

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { Autopilot } from "../scram/autopilot.js";
import { ScramDriver, ScramError } from "../scram/driver.js";
import { INSTRUCTIONS } from "./instructions.js";

// Scram know-how for the agent (from RoboBuild's guides, src/guides/*.md), read on request.
const GUIDES = {
  building: "How to build with Scram and its bot: what Scram is, a tour of the editor, getting the best results from the bot, testing, and when an app is done.",
  platform: "What Scram can and can't build (its building blocks, current limits, gotchas, social login).",
  planning: "How to split a build into small, testable steps, and write each as a complete work order (also: writing a plan for scram_autopilot_start).",
  design: "How to give an app its own distinctive, art-directed design.",
};
const guide = (topic) => readFileSync(new URL(`../guides/${topic}.md`, import.meta.url), "utf8");



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

export function createScramMcpServer(driver, { version = "0.1.0", activity, autopilot = new Autopilot(driver) } = {}) {
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
        "Switch Scram's editor to Run mode (the Run button, top right): the running app shows in the middle, and Scram's bot can click through it to test its work. Scram's bot can't switch modes itself.",
      annotations: { ...acts, idempotentHint: true },
    },
    guard("scram_run_mode", activity, async () => json(await driver.setMode("run")))
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
      }),
      annotations: acts,
    },
    guard("scram_app_type", activity, async ({ ref, field, text: value, clear, press_enter }) =>
      appText(await driver.typeInApp({ ref, field, text: value, clear: clear ?? true, pressEnter: !!press_enter }))
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
          .describe("The plan, in build order."),
        new_project_name: z.string().optional().describe("Build in a new project with this name. Leave out to build in the project that's open."),
        test_each_step: z.boolean().optional().describe("Have Scram's bot test each step in Run mode (default true)."),
        check_layout: z.boolean().optional().describe("Run the layout check after each step and send problems to the bot (default true)."),
      }),
      annotations: acts,
    },
    guard("scram_autopilot_start", activity, async ({ steps, new_project_name, test_each_step, check_layout }) =>
      text(await autopilot.start({ steps, projectName: new_project_name || "", test: test_each_step ?? true, checkLayout: check_layout ?? true }))
    )
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
