# TypeScript briefs: for big requests only

**Use a TypeScript brief only when a request is big.** Most requests stay plain English, sent
with scram_send_message: a field, a colour, a page tweak, a bug fix, one small feature.

Use a brief when the request is any of these:
- a whole app, or a large feature (more than about 2 tables, 2 pages, or an integration);
- more than you could describe clearly in a short message (roughly 1,500+ characters);
- something that needs a build order (tables, then pages, then integrations).

Then don't send it all at once. Break it into **batches**, each one paste with a "Done when"
line a person can check, and send them one at a time. A brief is pseudo-code that Scram's bot
reads very well: `interface` = a table, `enum` = a dropdown, `function` = an action, `Page*` =
a page, comments = rules. It is never compiled.

## In Scram Desktop

1. **Write the brief** from the template (scram_guide topic "brief_template"): the CONVENTIONS
   block, a BUILD LOG, then `// BATCH n — title` sections, each with `// Done when: …`.
   Themes are not written by hand in a brief: batch 0 is the theme, sent with scram_send_theme
   (see topic "themes").
2. **Save it in Scram Desktop**: scram_brief with action "save". It's kept on the user's
   computer (not in a chat), so it survives across chats. "list" and "read" get it back.
3. **Send one batch**: scram_brief with action "send_batch". Scram Desktop sends the
   conventions plus that batch (and your preamble: answers to the bot's questions, fixes to make
   first), then waits for the bot. Approve its plan and answer its questions as usual.
4. **Read back and check**: ask the bot for the read-back the batch describes, then check the
   "Done when" line yourself in Run mode (scram_app_read, scram_app_click, scram_app_type,
   scram_app_check_layout, scram_screenshot).
5. **Record what was built**: add an `// AS BUILT (batch n):` block under the batch and a row in
   the BUILD LOG, and save the brief again. Later batches are written against AS BUILT.
6. Next batch. Or, if the user asked for a hands-off build: scram_autopilot_start with the
   brief's name runs all its batches by itself (only when the user asks for the autopilot).

Scram's chat can't create a new app; scram_new_project creates a project from the dashboard,
and briefs build into the project that's open.

The method in full (written for pasting by hand: in Scram Desktop, scram_brief does the pasting,
and scram_send_theme checks a theme before it's sent):

# Building a Scram app from staged TypeScript briefs

A way of briefing Scram's editor chat that has produced working apps on the first pass: write the spec as a TypeScript file, split it into batches with a testable end point each, and paste one batch at a time. Briefs are never compiled. Themes are checked against Scram's theme rules before they're sent (scram_send_theme), which catches wrong property names and out-of-range values before Scram sees them.

## 1. Why a TypeScript file

- An `interface` is a table. A field comment is that field's rule. There is no prose to misread.
- An `enum` is a dropdown. The order is the display order; the string is the label.
- A `function` is an action, endpoint or MCP tool. The body is pseudo-code: numbered steps, not code to run.
- A `Page*` function returns an object: that object is what must be on screen.
- Where a real Scram type exists, write the data in that shape and add `satisfies <Type>`. Themes are written as the exact `manageThemes` payload, so Scram's AI passes them through instead of interpreting them.
- One file holds spec, preamble, build log, open items and what was actually built. Nothing lives in chat history.

Scram reads these conventions well on Free mode. The aim is the best result, not the cheapest; it happens to be both.

## 2. Before the first batch

1. Create the app by hand in the editor. Scram's chat cannot create a new app or a second app; briefs build into apps that already exist.
2. Create the first admin user by hand and give them the role. New accounts start with no roles, so a tester who signs up cannot reach Admin until someone adds the role.
3. Fill in the BUILD LOG header: project name, editor URL, app id, mode.
4. Make the theme first, with scram_send_theme (it checks the theme before sending it).

## 3. Batches

Each batch is one paste. Each ends with a **Done when** line that a person can verify end to end without reading the spec. Typical order:

| Batch | Contents | Done when (pattern) |
|---|---|---|
| 0 | Theme only (a file from `themes/`) | The theme's own Done-when line holds in Run mode |
| 1 | Tables, the one page that is the product, Admin | Create in Admin → open the public page logged out → change from Admin → see it on the page |
| 2 | Integrations: inbound webhook, MCP tools | One external event changes one record, with a history row, with nobody touching Admin |
| 3 | People: watchers, private access, notifications | Two people attached to one record both get the email; a private record 404s without its link |
| 4 | Public surfaces: feed, RSS, board | A record created by the integration appears publicly with no human involvement |

Rules that keep batches honest:

- **One way to do each thing.** Say which action is the ONLY way a record is created or changed, and make every later batch reuse it. Webhooks and MCP tools call the same action as the Admin form.
- **Append-only history.** Changes are rows, never edits to previous rows.
- **Automatic moves go forward only.** Declare the status order as a `const`. Integrations advance along it; humans in Admin are unrestricted. A terminal status such as "Won't do" sits outside the order and automation never moves a record out of it.
- **Secrets are settings with a placeholder.** Tell Scram not to invent a value and never to print one in chat. Rotate by replacing the value.
- **Full URLs, always.** Every link the app hands out (post-create panel, copy button, webhook response, MCP result) is a full URL built from one `publicBaseUrl` setting. A bare `/path` looks right in the editor and 500s everywhere else.
- **Idempotent endpoints.** Store the delivery id; the same delivery twice must not create two rows. Unknown ids are ignored, not errors; always return 200 with the ids handled.

## 4. The preamble

Each batch after the first is pasted with a short preamble above the code:

- Answers to the questions Scram asked at the end of the previous batch.
- Fixes to carry out first, before building the new batch.
- Project-wide component defaults the theme could not store (uppercase headings, mono fonts, shadows, focus rings).
- **Self-tests**, with inputs and expected outputs, for every pure function: `parseIds("X-3 fix and x-012, also X-3 again") → ["X-3","X-012"]`. Scram runs them and reports; you don't have to.
- The instruction to read back and to create ONE test record.

## 5. Read-back and sign-off

After each batch, ask Scram to read back what it built. A read-back is a test, not a summary:

- Values as built, read from the thing itself, not the values that were asked for.
- Every page, including ones Scram added on its own (a login page, an edit page where a modal was specced).
- Every deviation from the spec and the reason.
- What was verified by a real call and what is still untested.

Then verify the Done-when line yourself, in a separate tab at the real address, logged out where the spec says logged out. The editor preview is not a test: it can show a stale build and does not persist state.

**Scram cannot verify what a page looks like.** It cannot read computed colours, fonts or sizes, or resize the window. For anything visual, check in a real browser by reading the computed styles of the running page. Each build has its own Run address (`<project>.dev.scramapps.com/<buildId>/<appId>/app/`), and a theme switch makes a new build: take the current address from the editor's preview iframe, not from an earlier link.

**"Investigate only" is not always respected.** In testing, the editor's AI rebuilt components and switched themes during an investigation it was told not to change anything in. Ask it to list everything it changed.

**Separate the editor's AI from the platform.** When Scram's AI says something "isn't possible", it often means its own tool can't do it, not that Scram can't. Try another way, or ask the user, before treating it as a platform limit.

Record the outcome in two places in the file:

- The **BUILD LOG** table: batch, time sent, one-line result.
- An **AS BUILT** block directly under the batch's spec. It wins over the spec above it when they differ. Future batches are written against AS BUILT, not against the original spec.

Keep an **Open items** list in the header. Close items with `[x]` and leave them until the batch is signed off, then prune.

## 6. Things Scram does that the brief should anticipate

### Themes

- **Colour roles:** primary, secondary, neutral, success, alert, error, custom1–5. A theme needs a base hex for the six main roles; custom roles exist only as pins.
- **A base colour sets hue and saturation only.** Each shade 50–950 is generated at a fixed lightness, so the base hex itself appears nowhere. To get an exact hex, pin it with `colorShadeOverrides`. The tool's own guidance: pin the brand hex (usually at 500) and let the rest generate; do not hand-set whole scales.
- **Dark themes come from `colorSchemeMode`, not pins.** Dark-only and switchable themes reverse the scale (50 = darkest, 950 = lightest), so "neutral 50 = page, neutral 900 = text" works in both without pinning. Never build a dark theme from dark hexes.
- **Solid buttons:** fill from primary 800, label from primary 50. In dark mode the reversal makes 800 the light end and 50 the dark end, which still contrasts. Pin both ends only together, and keep them contrasting.
- **Pins and variants.** The platform stores pins per variant (light and dark). The AI's tool sends all pins to one variant: dark for dark-only, light for light-only and switchable. So the dark side of a switchable theme cannot be pinned from chat yet; set it in the theme editor by hand.
- **Pins persist** until set to `null`, even when base colours change. When replacing a theme, null the old pins.
- **Legacy `surface` and `content`.** Never use them (scram_send_theme rejects them).
- **Scales are steps, not px:** `spacing` 0–9 (default 5), `textSize` 0–9 (default 3), `roundness` 0–9, `border` 0–4, `size` 0–4 (default 2, button heights and icon sizes). Body text (md) is 14 px at textSize 0–1, 16 px at 2–6, 18 px at 7, 20 px at 8, 22 px at 9, and headings grow with it. Roundness lg is 2 px at 0, 8 px at 4, 20 px at 9.
- **Fonts:** any single Google Font name, no fallback stack. Commercial fonts are not available.
- **Icon libraries:** feather, hero-outline, hero-solid, lucide.
- **A project can hold several named themes**, chosen per app. Switching in the editor and asking the AI to switch change the same setting; whichever happens last wins. The theme list's "used by" can be wrong: check which theme the running app shows.

### Pages and components

- **Reserved prop names:** never name a reusable component's prop `props` or `events`: **every app in the project stops building**, and the editor shows no warning.
- **Components have no id.** For in-page links, put an invisible marker element just above each section. Check where the markers land.
- **Breakpoints:** use the tablet style for "768 and below".
- **Email input** ignores the theme's background and radius.

### Back end

- **Backend steps cannot run script code.** Pure parsing functions end up as SQL functions in the database. That is fine; self-test them.
- **Workflows cannot see the raw request body**, so HMAC signatures (GitHub's `X-Hub-Signature-256`) cannot be verified. The working fallback is a shared key in the URL query (`?key=`), which is weaker because the key appears in the sender's delivery logs. Decide up front whether that is acceptable.
- **MCP auth:** a bare HTTP 401 makes MCP clients start an OAuth handshake, so Scram returns HTTP 200 with a JSON-RPC error instead. The platform may intercept an `Authorization` header before the workflow runs; test the real key as Bearer, and fall back to `?key=` in the client config if it 401s.
- **Enums are stored as keys** with labels mapped in the UI; a display id (`STAT-001`) is stored beside the auto integer id. Say in the brief whether lookups must match by number (`STAT-3` finds `STAT-003`).
- **Dates default to `05/11/2026`.** Specify the format in the page spec (`5 Nov 2026`) or you get the locale default.
- **Modals may become pages.** If it matters, say so; otherwise accept it and record it.
- **The dev address changes.** The Run-view host is per-build; share the stable `<project>.dev.scramapps.com/<appId>/app/...` form, and change `publicBaseUrl` when publishing to the live domain.

## 7. Writing style inside the file

- Comments are rules. "required, 1–120 chars" not "should be fairly short".
- Mark the default option on an enum with `<-- default`.
- Put `/** Public. No login. */` or `/** Internal. Login with the X role. */` on every page.
- `// UI:` prefixes layout and styling; everything without it is behaviour.
- Give the 404 wording, the footer text, the date format. Anything you leave out, Scram chooses.
- Keep pure functions tiny and name them so a self-test reads naturally.
- Never paste real secrets, account ids or customer data into a brief. The file will be shared.
