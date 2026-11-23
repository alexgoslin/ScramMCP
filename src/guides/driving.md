# Driving Scram's bot well

How to get Scram's bot to build the right thing quickly: from RoboBuild's supervisor (which drove
whole builds) and the lessons it learnt on real builds. You are the user here: approve, answer,
keep it moving, and do yourself what it can't.

## What the bot can and can't do

Scram's bot can build (pages, components, workflows, database, theme) and test its own work in
Run mode with its own Run tool. It can run SQL on the dev database, read Server Logs, and fetch
its components' code.

It **can't** (so never ask it to; do it yourself with Scram Desktop's tools):
- switch Edit/Run mode → scram_run_mode (restart: true when stuck);
- change the preview size, go to a page by its path, or press the preview's Refresh → scram_preview;
- close panels, start a new chat, or leave a question form → scram_editor;
- give real input: its Run tool's clicks and typing never really focus or leave a field (so
  "save when you leave the field" never fires), it can't drag (grids, sliders, reordering), and
  it can't scroll inside popovers → scram_app_click / scram_app_type (it leaves the field) /
  scram_app_drag / scram_app_key, then have the bot check the stored result with SQL;
- see the app: it can't read computed colours, fonts, sizes or positions, measure scrollbars or
  overflow, or judge contrast → look yourself: scram_screenshot (area "app_preview"),
  scram_app_check_layout, scram_app_read; then tell it what you found;
- open two tabs at once, or read a file it downloaded (e.g. an exported CSV).

When it says it can't do something, believe it. Don't ask again in other words: do it yourself if
a tool fits, ask for a different check that proves the same thing, or move on.

## Each round

- **Plans:** it proposes a plan and waits. Approve it (scram_approve_plan) unless it clearly
  misses part of the request or adds something out of scope: then reply with precise corrections.
- **Questions:** answer them yourself, decisively, from the request (scram_answer_question).
  Don't push ordinary product or design choices back to the user. Never pick an option like
  "Open Run and test it for me": it can't. Pick "I'll open Run myself / go ahead when it's up"
  if offered; otherwise cancel the form (scram_editor "cancel_question"), put Run on
  (scram_run_mode), and tell it "Run mode is on now: please carry on."
- **Testing is asked for once,** in the request itself ("test it in Run mode and tell me when
  everything works"). Then trust its report: don't ask it to re-test or prove things again.
  Send it back only for a real gap: it says something failed and didn't fix it, it skipped part
  of the request, or it reported no testing at all (ask once).
- **It stopped mid-reply, or went quiet:** "Please continue where you left off."
- **Same problem two rounds running:** ask it to switch component or find another approach,
  rather than forcing the same method again.
- **An error shows** (a red cross, a failed build, an error banner): if it offers to fix it, take
  that; otherwise ask it to diagnose it (it can read Server Logs and run SQL in dev).
- **Stay on the current step:** if it starts building something a later step owns, tell it to
  stop and come back to this step.
- **Accept equivalent results** that avoid another rebuild cycle (e.g. a different but working
  URL parameter), and note them (in a brief: under AS BUILT).

## Run mode and the preview

- Keep Run mode on while it builds and tests. Scram can **silently drop back to Edit mode**, even
  right after switching Run on: the bot then says the app isn't running, its clicks or fills
  find nothing ("inputs not found"), or nothing happens on the server. Check (scram_status
  "mode", or a screenshot: a page picker and "Nothing selected" in the toolbar means Edit) and
  switch Run on again before any test. If the preview shows a placeholder or a blank skeleton,
  restart Run (scram_run_mode restart: true).
- **After a rebuild:**
  - the preview may say "This version is outdated" or "Build pending": wait for the build,
    then Refresh (scram_preview refresh), closing the Activity panel if it's in the way;
  - the path can lose its query (e.g. `?view=overview`), or land on a template path ("This link
    doesn't exist"): set the real path again (scram_preview path) and Refresh before re-testing;
  - the bot often assumes Run is off and offers to "open Run": see Questions above.
- **Screen sizes:** check the sizes the request asks for (desktop, then tablet 768 and mobile 375):
  switch with scram_preview size, then tell the bot which size is on and what to check.
- **Sign-in:** for testing pages behind a login, have the bot add a DEV ONLY sign-in with test
  accounts per role early on, and use it. Google or other social sign-in needs setting up by
  the user (Scram: More → Users → add the provider; Google Cloud: an OAuth client with Scram's
  callback URLs): ask them, don't loop on it.
- A form submission can leave the preview on an error page even though the data was saved:
  have the bot check the database (SQL) before submitting again, and Refresh.
- Cookie banners can cover the editor: scram_editor "close_panels" rejects them.

## The chat's memory

- Long builds get the bot's memory compressed, and it **can't re-open attached files** afterwards.
  If it asks which items are left, or starts guessing from earlier summaries: paste the exact
  remaining items into the chat (not a reference to the file).
- If it loses them again after that, start a new chat (scram_editor "new_chat") and send the step
  again in full, with a line on what's already built. Don't re-open old chats from the history.
- "Investigate only" isn't always respected: it may change things while investigating. Ask it to
  list everything it changed.

## Proof you can accept

- Data: the bot checking the database with SQL after you've done the interaction for real.
- Things neither of you can measure (contrast fixes, popover placement, overflow, scrollbars):
  its code-level fix plus your screenshot.
- Responsive checks: the bot querying elements it marked for each width (e.g. data attributes)
  as yes/no checks, plus your look at each size.
- Concurrency (double bookings, races): it can't open two tabs, so accept two parallel calls of
  the same server action (in its Run Code, or temporary parallel workflows) plus a SQL count;
  it should remove any test harness afterwards.
- Downloads (exports): the success message, the file name, and the code.
- Pages made of one custom component may read as empty to the bot's inspect tool: it should read
  the page's text instead. Custom components have no Scram ids in their HTML: it can find them
  by `data-testid` (ask it to add them).

## Platform facts that save rounds

- **Email in dev** only reaches the project owner's address; other recipients show "Not sent".
  That's correct behaviour: real delivery needs a third-party email provider from the user.
- **Table Security (row-level security):**
  - a row inserted in one SQL step isn't visible to the next statement in that same step:
    insert parents and children in separate steps;
  - an anonymous `INSERT … RETURNING` fails without a public SELECT policy: reserve the id
    first (`nextval(pg_get_serial_sequence(…))`), then insert with it, without RETURNING;
  - a public page's server workflow returning nothing for rows that exist: suspect Table
    Security blocking the anonymous session; fix with a public SELECT policy.
- **Custom components' events:** the platform passes `onChange`, `onAdd`… (capitalised). A
  component firing `on` + a lowercase name never reaches its workflow: check the casing.
- **Never name a reusable component's prop `props` or `events`:** every app in the project stops
  building.
- **Saves silently refused:** check the page loads its current data (and version) with a
  page-load workflow; without it, saves can be rejected as stale.
- **Draft-and-save cards:** some editors hold changes until their save bar is pressed: press it
  after editing, or nothing is stored.
- **A page stretching sideways:** the app shell's content area grows to fit wide content; the fix
  is `min-width: 0` on that content area, not on each page. Wide tables or grids: let cells fill
  the width on desktop with a minimum width, and scroll inside their own box on tablet and mobile.

## When to involve the user

Only for: Scram out of credits or at a usage limit; credentials, API keys or accounts you don't
have (Stripe, Google sign-in, an email provider); payments or plan upgrades; publishing to Live;
deleting the project or data; inviting people; or the same blocker after several different
attempts. Say plainly what they need to do and where.
