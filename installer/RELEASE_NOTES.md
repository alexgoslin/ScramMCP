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

Keep the Scram Desktop window open while Claude works in Scram. To stop, close the window.
