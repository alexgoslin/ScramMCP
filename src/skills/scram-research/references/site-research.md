# Researching one product

The goal: understand the product well enough that Scram's AI can build an app that **works** the
same way (its screens, its workflows, the data behind them), without anyone visiting the
original again. A copy that looks right but whose buttons do nothing, or do the wrong thing, has
failed. So for every control that matters, work out what happens when it's used, not just what
it looks like.

For each feature, answer three questions:
1. **What does it do, step by step?** From the click to what the screen settles on.
2. **What must be behind it?** The data it reads and writes, the checks, the side effects.
3. **Why is it built that way?** (Instant feedback, safety, convention…) If you can't say why,
   you haven't understood it yet, and Scram's AI won't be able to fill the gaps sensibly.

## 1. Decide the scope first

From the product's home page, navigation, help centre and what you know of it, list:
- **product:** one line on what it is and who uses it;
- **core:** the features to study and build, most important first (usually 6 to 14), each with
  why it matters to users;
- **skip:** what to leave out, each with its reason: not functional (marketing, pricing, legal,
  careers, help pages), admin plumbing (single sign-on, audit logs, permission consoles), or
  something Scram can't do (references/scram-limits.md). Simplify rather than skip when you can
  ("a Refresh button instead of live updates").

Don't skip a feature just because it isn't the very centre of the product: saved views,
favourites, dashboards from the user's own data, notifications, search, settings, sharing and
member lists all count when Scram can build them. The user's wishes override your judgement.

## 2. Explore (with a browser)

Keep a list of screens visited and a queue of screens to visit, starting with the main screen.
For each screen:
- Note it as a new screen and capture it (below).
- Queue every same-site link in its navigation, header, footer and body that belongs to the core
  scope and isn't visited or queued yet.
- Open each menu, dropdown, tab, "…" overflow button and dialog reachable from a visible button;
  capture what it shows as its own screen, then close it before moving on.

Never click or queue anything destructive or account-changing: log out, delete, remove, cancel,
unsubscribe, buy, pay, upgrade, invite, disconnect, close account, or anything that submits a
real form (posting, sending, saving someone else's data). If you aren't sure what a control does,
don't click it: note it as unexplored, and work out what it probably does from its label, its
icon, the text around it and any confirmation message you can see without confirming.

Stay on the product's own site (note links to other sites, don't follow them). Stop when the
last few screens turned up nothing new, when you've reached about 20 screens (unless the user
asked for more), or at a login wall: then ask the user how to continue.

If your browser can resize the page, check the main screens at desktop (1440 px wide), tablet
(768) and mobile (375) too, and note how the layout changes. Open menus can close when the page
resizes, so check those at one size only.

## 2b. Without a browser

Build the same picture from what's published:
- the product's feature pages (what each feature is for);
- its help centre and docs (the best source: they describe each screen and workflow step by
  step, with the names of the fields and buttons);
- its changelog (recent features, and how they behave);
- templates and examples (the data people keep in it);
- tutorials and walkthroughs;
- reviews and comparisons (what users love, and their complaints: real ones, with the source).

Mark what you learn this way as **documented**. Ask the user for screenshots of anything the
docs don't make clear.

## 3. What to capture on each screen

- **Purpose:** what the user comes here to do.
- **Layout:** the regions (navigation bar, sidebar, main area, side panel…), which scroll on their
  own, which stay fixed, how they stack, and what changes on smaller screens.
- **Components:** each reusable piece (a card, a row, a toolbar, a dialog…), what it shows, and
  every state it has: default, hover, focus, selected, disabled, loading, empty, error. Say which
  states you actually saw.
- **Content:** what kinds of data appear (a task's title, its due date, its assignee's avatar…).
  Describe the data, don't copy the product's own text.
- **Interactions:** what happens on click, hover, drag, typing, keyboard shortcuts, scrolling;
  any animation or instant feedback.
- **Workflows started here:** a pointer to each one in the workflow library (below).

## 4. The workflow behind each action

For every action that changes or fetches data (create, edit, delete, reorder, upload, search,
filter, share, sign in, notifications…), write down, marking what's seen and what's inferred:
- **Trigger:** the exact action (a click, Enter, a drag, scrolling to the end).
- **Before anything is sent:** checks on the input, disabling the button so it can't be pressed
  twice, the screen updating straight away.
- **What it changes:** which records are created, changed or deleted, and what else happens as a
  result (a count goes up, someone is notified, an activity line is added).
- **Who may do it:** owner only, members, anyone with the link.
- **How the screen settles:** the new item appears in the list, a toast confirms, the dialog
  closes.
- **When it fails:** empty or invalid input, no permission, a duplicate, a lost connection: what
  the user sees.
- **What Scram needs:** in Scram's terms (tables, a workflow on the button, page data that
  reloads, Table Security for who may see what, the File Store for uploads). Where Scram can't do
  it the same way, the nearest version (live updates become a Refresh button or a reload after
  each action).

If you can see the page's network requests (some browser tools can), use them: they show what
each action really sends and gets back. Otherwise infer from what the screen does, and say so.

## 5. The why

For each workflow, and each layout choice that isn't obvious, a sentence or two on why it's
probably built that way: instant feedback for frequent actions; a confirmation step for risky
ones; a dialog for a quick side task versus a page for a main one; a sidebar that collapses on
small screens; "every product in this category does it this way, so users expect it". This lets
Scram's AI make sensible choices in the gaps.

## 6. Put it together

Write it all up as a screen spec (references/screen-spec.md): one document for the whole product,
with the data model, the workflows and the reasons shared across screens rather than repeated.
Note on the way anything you aren't sure how to build in Scram: those become the user's open
questions (references/questions-and-briefing.md).
