// The MCP tools: what an agent (Claude Code, Cursor…) sees and can call. Each one is a thin
// wrapper around the Scram driver.

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { ScramError } from "../scram/driver.js";

const INSTRUCTIONS = `Scram MCP drives Scram (an AI app builder) through Scram's own AI chat, in a desktop window on the user's computer that is logged in as the user.

How to build something:
1. scram_status to see where the window is. If no project is open, use scram_open_project, scram_new_project or scram_list_projects.
2. scram_send_message with a clear request for Scram's bot (what to build or change). It waits for the bot and returns its reply.
3. The bot usually proposes a plan first and waits for approval: use scram_approve_plan (or reply with corrections via scram_send_message). When the bot asks a question, answer it with scram_answer_question (an option's title, or your own words).
4. If a reply says the bot is still working, call scram_wait_for_reply. To stop it mid-build, use scram_stop_bot.
5. scram_run_mode shows the running app (the bot needs Run mode to test its work); scram_edit_mode goes back to editing. scram_screenshot shows the editor (or the running app with area "app_preview").

Each request uses the user's Scram credits. Only one action runs at a time. Publishing to Live, deleting and billing are never done by this server: ask the user to do those in the window.`;

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
      const msg = e instanceof ScramError ? e.message : `Something went wrong in Scram MCP: ${e?.message || e}`;
      return { ...text(msg), isError: true };
    } finally {
      activity?.(name, false);
    }
  };
}

export function createScramMcpServer(driver, { version = "0.1.0", activity } = {}) {
  const server = new McpServer({ name: "scram", title: "Scram", version }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const acts = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "scram_status",
    {
      title: "Scram status",
      description:
        "Where the Scram MCP window is (dashboard, a project's editor, a login page), whether you're logged in, whether Scram's bot is working or waiting for an answer, and the choices it's showing.",
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

  server.registerTool(
    "scram_screenshot",
    {
      title: "Screenshot Scram",
      description: 'A picture of the Scram MCP window ("window", the default) or just the running app\'s preview in Run mode ("app_preview").',
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
