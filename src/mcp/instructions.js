// What an agent is told about Scram Desktop when it connects (the MCP server's "instructions").
// Its own file so the connector the Claude and ChatGPT desktop apps run (connector/connector.js) can use it too.

export const INSTRUCTIONS = `Scram Desktop drives Scram (an AI app builder) through Scram's own AI chat, in a desktop window on the user's computer that is logged in as the user.

How to build something:
1. scram_status to see where the window is. If no project is open, use scram_open_project, scram_new_project or scram_list_projects.
2. scram_send_message with a clear request for Scram's bot (what to build or change). It waits for the bot and returns its reply.
3. The bot usually proposes a plan first and waits for approval: use scram_approve_plan (or reply with corrections via scram_send_message). When the bot asks a question, answer it with scram_answer_question (an option's title, or your own words).
4. If a reply says the bot is still working, call scram_wait_for_reply. To stop it mid-build, use scram_stop_bot.
5. scram_run_mode shows the running app (the bot needs Run mode to test its work); scram_edit_mode goes back to editing. scram_screenshot shows the editor (or the running app with area "app_preview").

Each request uses the user's Scram credits. Only one action runs at a time. Publishing to Live, deleting and billing are never done by this server: ask the user to do those in the window.`;
