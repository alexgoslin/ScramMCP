# Planning a build in steps (for Scram's bot, and for scram_autopilot_start)

Scram's bot does its best work on one small, clearly scoped piece at a time. Given a whole
app in one message, it tends to hold too much in mind at once: earlier requirements get
dropped or half-built, testing gets put off, and problems end up buried under later work. So
split a build into a short sequence of steps, and give the bot one step at a time.

## 1. Decide the order

- **Step 1 is always Setup, and only Setup**: the app's name and purpose, the overall look
  (theme colours, fonts, spacing as reusable theme settings, not typed into each component),
  the database tables and how they relate, the pages and navigation, and who the users are
  (sign-in, if the app has accounts). No individual features yet. Every later step builds on it.
- **Then order by dependency, not convenience**: sign-in before anything that needs a
  signed-in user; the core data before the screens that list, filter or edit it; a shared
  component before the first screen that relies on it. A good default:
  1. Setup
  2. Sign-in and accounts, if the app has them
  3. The main layout (navigation, page shell) with real data
  4. One step per screen, or small group of related screens, in the order a new user meets them
  5. Secondary screens, settings, nice-to-haves
  6. **A final check of everything together** (no new features: see 5 below)
- **Keep steps small.** If a step's testing checklist would run past about 8 to 10 items,
  split it. A complex screen deserves several steps (e.g. "orders list and new order", then
  "edit and cancel orders", then "order emails").

## 2. Write each step as a complete work order

Each step's request must stand on its own: assume the bot remembers nothing reliable from
earlier steps. Include, every time:

- **Context** (short, but complete): what the app is, who it's for, the look (the few theme
  values that matter), the main database tables and how they relate, the pages and where this
  step fits, and one line per step already done ("Step 1: setup, theme, tables, pages, done").
- **Scope: this step only.** Exactly what to build, in plain words and Scram's terms (pages,
  components, workflows, database tables; see the "platform" guide). Be specific: fields,
  buttons, what each does, what happens on success and on errors, empty states.
- **Out of scope.** Anything nearby the bot might be tempted to build early: say plainly not
  to build it yet.
- **Testing checklist.** Concrete things to try in Run mode, like a real user: "Add an order
  with no name: it shows 'Please enter your name' and saves nothing". Real data, nothing
  hardcoded, every button and form actually tried, edge cases included.
- **The gate.** "Plan this step first and wait for my approval. Then build it, switch on Run
  mode testing, go through every item on the checklist yourself, fix anything that fails, and
  tell me clearly when everything works. Don't start anything outside this step."

## 3. Word requests in Scram's terms

Use the names Scram uses (see the "platform" guide): pages, components, workflows (frontend and
server), database tables and fields, the theme. Ask for real, working behaviour backed by the
database, not placeholder or hardcoded data. If something needs a secret (an API key, a
payment account), say so in the step, and expect to need the user for it.

## The full method

scram_guide topic "handoff" has the whole method this guide condenses, with templates: Setup
first, dependency order, a Context Block in every step, scope / out of scope / testing checklist
/ gate, a manifest, and a final regression step.

## For big builds: a TypeScript brief

When the build is big (a whole app, or a feature with several tables, pages or integrations),
write the steps as **batches of a staged TypeScript brief** (scram_guide topics "briefs" and
"brief_template"): the same ideas as above, in a form Scram's bot reads very precisely. Batch 0
is the theme (scram_send_theme). Save it with scram_brief and send one batch at a time. Smaller
requests stay plain English.

## 4. Mind the cost

Every message uses the user's Scram credits. Fewer, well-written steps cost less than many
vague ones followed by corrections.

## 5. Finish with a check of everything

The last step adds nothing new: the bot tests the whole app end to end, looking for later
steps that broke earlier ones, and for features that disagree about shared data. Then check it
yourself too (scram_app_read, scram_app_click, scram_app_type, scram_app_check_layout).

## Writing a plan for scram_autopilot_start

Only when the user asks for autopilot (a hands-off build). Give it the steps in order, each
with a short title and the full work order as its request (as above), or the name of a saved
TypeScript brief: its batches become the steps. The autopilot sends each
step, approves the bot's plans, answers its questions with sensible defaults, asks the bot to
test every step in Run mode, runs the layout check, and pauses if it needs the user (a secret,
a payment, the bot stuck). Steps that are vague get vague results: the autopilot can't add the
detail you left out.
