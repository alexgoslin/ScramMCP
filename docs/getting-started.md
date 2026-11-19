# Build Scram apps by chatting with Claude: Scram Desktop (beta)

**Scram Desktop** lets Claude (or another AI assistant) build in Scram for you. You tell Claude what you want in plain English, and Claude works in Scram the way you would: it types into Scram's AI chat, approves plans, answers the bot's questions and checks the result. You can watch it happen in the Scram Desktop window.

It runs on your own computer, logged in as you. Nothing extra is put on the internet.

> **Beta:** this is new. If anything is confusing or doesn't work, tell us in the comments.

---

## What you need

- A **Windows 10/11 PC** or a **Mac**
- Your **Scram account**
- **Claude**: either the **Claude desktop app** (most people; [download it here](https://claude.ai/download)) or **Claude Code** (if you use Claude in Terminal or PowerShell)

That's all. You don't need any technical tools. (Claude in a web browser can't use Scram Desktop, because it can't reach programs on your computer. Use the Claude desktop app.)

---

## Step 1: Install Scram Desktop

1. Go to the **[Scram Desktop download page](https://github.com/alexgoslin/ScramMCP/releases/latest)**.
2. Download the file for your computer:
   - **Windows:** `Scram-Desktop-Setup-….exe`
   - **Mac:** `Scram-Desktop-…-mac.dmg`

![Screenshot 1: the download page, with the two files highlighted](images/01-download.png)

### On Windows

1. Double-click the file you downloaded.
2. If Windows shows **"Windows protected your PC"**, click **More info**, then **Run anyway**. You only see this once. It appears because the app is new and Windows doesn't recognise it yet.

   ![Screenshot 2: the "Windows protected your PC" box, with "More info" and "Run anyway" highlighted](images/02-windows-protected.png)

3. Choose **Only for me** and click **Next**.
4. Click **Install**. Leave the folder as it is unless you have a reason to change it.
5. Click **Finish**. Scram Desktop opens.

![Screenshot 3: the installer's "Choose Install Location" page](images/03-windows-installer.png)

> If Windows says the app was **blocked** and there's no "Run anyway" button, your computer has **Smart App Control** or a work security policy turned on. Ask in the comments: we're working on this.

### On a Mac

1. Double-click the file you downloaded. A window opens.
2. Drag **Scram Desktop** into the **Applications** folder.

   ![Screenshot 4: the disk image window, dragging Scram Desktop onto Applications](images/04-mac-drag.png)

3. Open **Applications** and double-click **Scram Desktop**. The first time, your Mac won't open it and shows a message instead. Click **Done**.
4. Open **System Settings** (from the Apple menu, top left of the screen) and click **Privacy & Security** in the sidebar.
5. Scroll down to **Security**. Next to *"Scram Desktop" was blocked…*, click **Open Anyway**, then enter your Mac password. You only do this once.

   ![Screenshot 5: Privacy & Security with "Open Anyway" highlighted](images/05-mac-open-anyway.png)

6. Scram Desktop opens. From now on, it opens normally from Applications, Launchpad or Spotlight.

---

## Step 2: Log in to Scram

The Scram Desktop window shows Scram as you know it. **Log in as usual.** Scram Desktop remembers your login, so you only do this once.

![Screenshot 6: Scram Desktop showing the Scram dashboard after logging in](images/06-logged-in.png)

**Keep the Scram Desktop window open whenever you want Claude to work in Scram.** You can minimise it, or put other windows in front of it.

---

## Step 3: Connect Claude (once)

### If you use the Claude desktop app (most people)

1. Make sure the **Claude desktop app** is installed, and that you've opened it once and logged in. ([Get it here](https://claude.ai/download) if not.)
2. In Scram Desktop, open the **Scram Desktop** menu and click **Connect the Claude desktop app**. On a Mac, this menu is in the menu bar at the top of the screen. (The first time you open Scram Desktop, it also asks which Claude you use.)

   ![Screenshot 7: the Scram Desktop menu with "Connect the Claude desktop app" highlighted](images/07-connect-menu.png)

3. If Claude is open, Scram Desktop asks to restart it, because Claude only picks up new connections when it starts. Click **Restart Claude**. Scram Desktop then waits until Claude has picked it up and says **"Connected"**.

   ![Screenshot 8: the "Restart the Claude app to finish" message](images/08-restart-claude.png)

That's it. You don't need to copy, paste or install anything.

### If you use Claude Code (Terminal or PowerShell)

1. If you don't have Claude Code yet, install it. Open **PowerShell** (Windows: Start, type *PowerShell*) or **Terminal** (Mac: ⌘ Space, type *Terminal*), paste the line for your computer, and press Enter:
   - **Windows:** `irm https://claude.ai/install.ps1 | iex`
   - **Mac:** `curl -fsSL https://claude.ai/install.sh | bash`
2. In Scram Desktop, open the **Scram Desktop** menu and click **Connect Claude Code**. You should see **"Claude Code is connected to Scram Desktop"**.

> If it says Claude Code isn't installed, close and reopen PowerShell/Terminal after installing, and try again. Or click **Copy the command**, paste it into PowerShell or Terminal, and press Enter.

---

## Step 4: Ask Claude to build something

1. In Scram Desktop, open the project you want Claude to work on, or ask Claude to make a new one.
2. Open Claude:
   - **Claude desktop app:** start a **new chat**.
   - **Claude Code:** in PowerShell or Terminal, type `claude` and press Enter.
3. Tell Claude what you want. For example:

   > Using Scram, add a contact page to this project with a form for name, email and message. Approve the bot's plan if it looks right, then switch to Run mode and check the form works.

   > Using Scram, create a new project called "Bakery Orders" with a page where customers place orders and a page where I see today's orders.

4. The first time Claude uses Scram, it asks for permission. Choose **Always allow** (or **Allow**).

![Screenshot 9: the Claude app working in Scram, next to Scram Desktop showing the message in Scram's chat](images/09-claude-working.png)

You'll see Claude's messages appear in Scram's AI chat, Scram's bot reply, and the app being built. While Claude is working, the Scram Desktop window title shows **"● Agent working"**. If Scram Desktop is closed when you ask Claude for something, it opens by itself (log in if it asks).

### What Claude can do in Scram

- Send requests to Scram's AI bot and read its replies
- Approve the bot's plans, and answer its questions
- Switch between **Run mode** (try out the app) and **Edit mode**
- Stop the bot if it's going the wrong way
- Open your projects, or create new ones
- Take screenshots to check the result

### What Claude won't do

Claude never **publishes** your app, **deletes** anything, or touches **sharing, billing or your account**. Those stay with you.

---

## Good to know

- **It uses your Scram credits.** Each request Claude sends to Scram's bot uses credits, just like typing it yourself.
- **One thing at a time.** Claude works on one request at a time, in whichever project is open in Scram Desktop.
- **You can step in at any time.** Type in Scram's chat yourself, or tell Claude to stop.
- **To close Scram Desktop**, close its window. Claude can't use Scram until you open it again.

---

## Something not working?

| What you see | What to do |
|---|---|
| **Claude desktop app:** Claude doesn't seem to know about Scram | Quit the Claude app completely (Windows: right-click its icon by the clock → **Quit**; Mac: **Claude → Quit Claude**) and open it again, then start a new chat. If that doesn't help, click **Connect the Claude desktop app** in Scram Desktop again. In Claude, **Settings → Desktop app → Extensions → Local MCP servers** should list **scram**. |
| **Claude Code:** Claude says it can't reach Scram, or "scram" isn't in its list of tools | Make sure Scram Desktop is open. Then, in Claude Code, type `/mcp` and check **scram** says *connected*. If it doesn't, click **Connect Claude Code** in Scram Desktop again, then restart Claude Code (type `/exit`, then `claude`). |
| Claude says you need to log in | Log in to Scram in the Scram Desktop window. |
| Nothing happens when you open Scram Desktop | It may already be running in the background. Restart your computer, or on Windows end **Scram Desktop** in Task Manager, then open it again. |
| Windows blocks the installer with no "Run anyway" | Your PC has Smart App Control or a work security policy. Let us know in the comments. |
| Something else | Post in the comments with a screenshot. |

---

<!--
FOR THE PERSON PREPARING THIS POST (delete this section before publishing)

Screenshots to take, saved with these names:
01-download.png          GitHub release page (Latest), with the .exe and .dmg files highlighted
02-windows-protected.png Windows SmartScreen "Windows protected your PC", after clicking More info (shows Run anyway)
03-windows-installer.png Installer wizard, "Choose Install Location" page (Windows 11)
04-mac-drag.png          The .dmg window: Scram Desktop icon and the Applications folder (an arrow helps)
05-mac-open-anyway.png   System Settings → Privacy & Security → "Scram Desktop was blocked…" with Open Anyway
06-logged-in.png         Scram Desktop window on the Scram dashboard after logging in
07-connect-menu.png      Scram Desktop menu open, "Connect the Claude desktop app" highlighted (take on a Mac: menu bar)
08-restart-claude.png    Scram Desktop's "Restart the Claude app to finish" message (Restart Claude button)
09-claude-working.png    Side by side: a Claude desktop app chat using Scram, and Scram Desktop showing the message in
                         Scram's chat with the bot replying

Tips: use a test Scram account with no private data; crop to the relevant part; highlight with a red box or arrow;
don't show the token (it appears in "Connect another agent…" and the copied command).

When code signing is set up, remove the "Windows protected your PC" and Mac "Open Anyway" steps (and screenshots 2 and 5).
-->
