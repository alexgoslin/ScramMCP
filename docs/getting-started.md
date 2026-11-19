# Build Scram apps by chatting with Claude: Scram Desktop (beta)

**Scram Desktop** lets Claude (or another AI assistant) build in Scram for you. You tell Claude what you want in plain English, and Claude works in Scram the way you would: it types into Scram's AI chat, approves plans, answers the bot's questions and checks the result. You can watch it happen in the Scram Desktop window.

It runs on your own computer, logged in as you. Nothing extra is put on the internet.

> **Beta:** this is new. If anything is confusing or doesn't work, tell us in the comments.

---

## What you need

- A **Windows 10/11 PC** or a **Mac**
- Your **Scram account**
- **Claude Code**, Anthropic's AI assistant for building things (Step 3 shows how to get it). It needs a Claude subscription.

You don't need anything else: no Node.js or other technical tools.

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

## Step 3: Install Claude Code (once)

Skip this step if you already use Claude Code.

1. Open your computer's command window:
   - **Windows:** click **Start**, type **PowerShell**, and press Enter.
   - **Mac:** press **⌘ Space**, type **Terminal**, and press Enter.
2. Copy the line for your computer, paste it into the window, and press Enter:
   - **Windows (PowerShell):**

     ```
     irm https://claude.ai/install.ps1 | iex
     ```

   - **Mac (Terminal):**

     ```
     curl -fsSL https://claude.ai/install.sh | bash
     ```

3. Wait until it says it has finished, then close the window.

Anthropic's full instructions are at [code.claude.com](https://code.claude.com/docs/en/setup).

---

## Step 4: Connect Claude to Scram Desktop (once)

1. In Scram Desktop, open the **Scram Desktop** menu and click **Connect Claude Code**. On a Mac, this menu is in the menu bar at the top of the screen.

   ![Screenshot 7: the Scram Desktop menu with "Connect Claude Code" highlighted](images/07-connect-menu.png)

2. You'll see **"Claude Code is connected to Scram Desktop"**. That's it.

   ![Screenshot 8: the "Claude Code is connected" message](images/08-connected.png)

> If it says Claude Code isn't installed, do Step 3 first. If it still says that, click **Copy the command**, paste it into PowerShell or Terminal, and press Enter.

---

## Step 5: Ask Claude to build something

1. Open PowerShell (Windows) or Terminal (Mac), type `claude`, and press Enter. The first time, Claude asks you to log in to your Claude account.
2. In Scram Desktop, open the project you want Claude to work on, or ask Claude to make a new one.
3. Tell Claude what you want. For example:

   > Using Scram, add a contact page to this project with a form for name, email and message. Approve the bot's plan if it looks right, then switch to Run mode and check the form works.

   > Using Scram, create a new project called "Bakery Orders" with a page where customers place orders and a page where I see today's orders.

4. The first time Claude uses Scram, it asks for permission. Choose **Yes** (or **Yes, and don't ask again**).

![Screenshot 9: Claude Code in the command window working in Scram, next to Scram Desktop showing the message in Scram's chat](images/09-claude-working.png)

You'll see Claude's messages appear in Scram's AI chat, Scram's bot reply, and the app being built. While Claude is working, the Scram Desktop window title shows **"● Agent working"**.

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
| Claude says it can't reach Scram, or "scram" isn't in its list of tools | Make sure Scram Desktop is open. Then, in Claude Code, type `/mcp` and check **scram** says *connected*. If it doesn't, click **Connect Claude Code** in Scram Desktop again, then restart Claude Code (type `/exit`, then `claude`). |
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
07-connect-menu.png      Scram Desktop menu open, Connect Claude Code highlighted (take on a Mac: menu bar)
08-connected.png         The "Claude Code is connected to Scram Desktop" message
09-claude-working.png    Side by side: Claude Code in Terminal sending a request, and Scram Desktop showing it in
                         Scram's chat with the bot replying

Tips: use a test Scram account with no private data; crop to the relevant part; highlight with a red box or arrow;
don't show the token (it appears in "Connect another agent…" and the copied command).

When code signing is set up, remove the "Windows protected your PC" and Mac "Open Anyway" steps (and screenshots 2 and 5).
When the one-click Claude desktop app extension is ready, add a "Using the Claude desktop app" section.
-->
