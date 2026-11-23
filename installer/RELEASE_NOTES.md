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
