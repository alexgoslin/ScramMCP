> **Scram MCP is now Scram Desktop.** If you installed Scram MCP before, uninstall it once Scram Desktop is set up (Windows: Settings → Apps → Scram MCP → Uninstall; Mac: drag Scram MCP from Applications to the Bin). Scram Desktop brings over your Scram login and connection settings, so Claude stays connected. (Scram Desktop used to be called Scram MCP.)

## Install Scram Desktop

**Windows:** download **Scram-Desktop-Setup-….exe** below and double-click it. The installer asks who it's for ("Only for me" needs no admin rights) and where to install it, then adds **Scram Desktop** to the Start menu and desktop. Afterwards, open it from the desktop icon or the Start menu.
Windows may say "Windows protected your PC", because the installer isn't code-signed yet: click **More info**, then **Run anyway**. That's needed once.

**Mac:** download **Scram-Desktop-…-mac.dmg** below, open it, and drag **Scram Desktop** into Applications. The first time you open it, macOS blocks it, because it isn't signed with an Apple certificate yet: open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Scram Desktop. That's needed once.

## Then

1. Log in to Scram in the Scram Desktop window.
2. Connect Claude, from the **Scram Desktop** menu:
   - **Claude desktop app:** click **Connect the Claude desktop app**, then **Restart Claude and connect**. That's all: nothing to copy, paste or install. (Fixed in 0.3.5: this now works with the Microsoft Store version of Claude on Windows, which recently moved its settings to a new folder.)
   - **Claude Code** (Terminal): click **Connect Claude Code**. You need [Claude Code](https://code.claude.com/docs/en/setup) installed.
   - **ChatGPT desktop app** (new in 0.4.0): click **Connect the ChatGPT desktop app**, then **Restart ChatGPT and connect**, and start a new chat in ChatGPT. Nothing to copy, paste or install. (ChatGPT's desktop app sometimes doesn't offer local tools in normal chats yet: a known issue on OpenAI's side.)
3. Ask Claude to build something in Scram.

**New in 0.5.0: Claude (or ChatGPT) can test the app it builds.** In Run mode, it reads the app's pages, fills in forms, clicks buttons and links, and checks the result, then tells Scram's bot about anything that doesn't work. Try: *"Using Scram, test the order form and fix anything that doesn't work."* It asks you first before clicking anything that could delete data, cost money or send something for real.

**New in 0.9.0: your AI can research first, if you want it to.** For an app like one that already exists, or the best of a kind of app, your own AI can now do the research the RoboBuild extension used to do: what those apps do, their screens and how they work, what's worth building, and a short briefing for you to check before anything is built. For a whole kind of app, it compares the leaders and decides on one app that beats them. **Your AI does the research with its own tools; Scram Desktop doesn't research anything.** Set it up once from **Scram Desktop menu → Add the research skill to your AI…** (Claude: upload the saved file in **Customize → Skills**; the ChatGPT desktop app and Claude Code: added for you). Then ask, for example, *"Research the best booking apps, then build one in Scram."*

**New in 0.8.0** (the rest of the RoboBuild extension's know-how):
- **Claude drives Scram's bot the way RoboBuild did**, with the lessons from real builds: what the bot can't do and what to do instead, keeping Run mode on, refreshing after rebuilds, pasting the work again when the bot loses track, and which proof to accept.
- **New controls Scram's bot can't use itself:** the preview's path box, size (desktop, tablet, mobile) and Refresh; closing panels and cookie banners; cancelling the bot's question forms; a fresh chat. In your app: real dragging, key presses, and leaving a field after typing (so things that save when you leave a field are saved).
- **Notices when Scram slips back into Edit mode** on its own, and switches Run back on.
- **The full handoff method** for big builds (Setup first, small steps each with its own context and tests, a final check of everything), with templates.
- **The autopilot is smarter:** it never lets the bot try to open Run mode itself, refreshes old previews, nudges the bot when it stops, and re-sends the step when the bot loses track.
- **Fix:** stopping Scram's bot now only ever presses the stop button by the chat box. Before, when that button had no label, it could press another button on the screen instead.

**New in 0.7.0** (from the RoboBuild extension):
- **Theme questions.** Before making a theme, Claude asks what vibe you want, how bold, and any must-haves, then makes it with **Scram's real theme rules checked first**: six ready-made themes (Scram, Ledger, Midnight, Atelier, Playground, Clinic), or its own.
- **Big requests in stages.** For a whole app or a large feature, Claude writes a staged **TypeScript brief**, which Scram Desktop keeps for you (Scram Desktop menu → Show saved briefs), and sends it to Scram's bot one batch at a time. Small requests stay plain messages. The autopilot can build a whole brief.
- **UI quality rules** for every screen.

**New in 0.6.0:**
- **Scram know-how.** Claude (or ChatGPT) can read Scram guides before building: how to get the best from Scram's bot, what Scram can and can't do, planning a build in steps, and design.
- **Automatic layout check** of the running app: menus off screen, things shown twice, overlapping or cut-off text, broken images, hard-to-read text, sideways scrolling.
- **Autopilot, only when you ask for it.** Say *"use the autopilot"*: Claude writes a step-by-step plan, Scram Desktop asks you to confirm, and then it builds the whole plan by itself, testing and checking each step, and pausing (with a notification) when it needs you. Stop it any time from the Scram Desktop menu.

**Safety fixes** (from a review of 0.5.0):
- **You decide on risky clicks.** Before the AI clicks anything in your app that could delete data, cost money or send something (or a button with only an icon), Scram Desktop asks you in its own window. Only you can click Allow.
- The bot's answer options like "Remove the old header" can be picked now; publishing and deleting projects still can't.
- Scram Desktop's entry in Claude's and ChatGPT's settings is now called **scram-desktop**, so it never replaces anything else called "scram". Existing connections are updated by themselves the next time you click Connect.
- On Windows, restarting the Claude app never closes Claude Code (or anything else called claude.exe).
- Sign-in windows only open inside Scram Desktop for known sign-in providers (or sign-in pages Scram itself opens), and show their site in the title. Other links open in your browser.

Keep the Scram Desktop window open while Claude works in Scram. To stop, close the window.
