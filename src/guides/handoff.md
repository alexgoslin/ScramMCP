# Splitting a big build into steps (the handoff method)

From RoboBuild's phased build handoff splitter. Giving Scram's bot a whole app in one message has
a predictable failure: it tries to hold everything at once, earlier requirements get dropped or
half-built as it goes, testing is put off and then rushed, and by the time something's wrong it's
buried under more features. So split the build into **small, self-contained steps**, given to the
bot **one at a time**, each ending with a hard testing gate: the bot gets the next step only after
it has built and tested everything in this one (nothing hardcoded, every control really works,
every case checked) and said so.

This is how to cut the work, not how to build it. For a big build, write the steps as the
**batches of a TypeScript brief** (scram_guide topics "briefs" and "brief_template"; save it with
scram_brief): the same structure below, in the brief's form. The Markdown templates below suit
smaller multi-step work, and steps for scram_autopilot_start.

## 1. Decide the order

1. **Step 0 is Setup, and only Setup.** The bedrock every other step builds on:
   - the theme (scram_send_theme: real theme values, never typed into each component);
   - the database tables and relationships, with real create/read/update/delete for each, and
     their security rules (who may see and change what);
   - the pages and navigation (routes), and the app shell's layout (its regions, correctly sized
     at desktop, tablet and mobile), with no screen content yet;
   - who the users are: a "current user" from the start, and a DEV ONLY sign-in with test
     accounts per role, so every later step can be tested signed in.
   No screen content and no individual features.
2. **Then order by dependency, not convenience:** sign-in before anything that needs it; core data
   before the screens that list, filter or edit it; a shared component before the first screen
   that relies on it. A good default:
   - Step 0: Setup
   - Step 1: sign-in and accounts, if the app has them
   - Step 2: the main shell (navigation, layout) wired to real data
   - Step 3+: one step per screen or small group of related screens, in the order a new user
     meets them
   - later: secondary screens, dialogs, settings, nice-to-haves
   - last: a **final regression** step (no new features; see 6)
3. **Keep steps small.** If a step's testing checklist would pass 8 to 10 items, split it. A
   complex screen gets several steps (e.g. "3a: list + add", "3b: edit, delete, react",
   "3c: attachments").

Write the sequence down first: that's the manifest (5).

## 2. The Context Block, in every step

The most important part: it makes up for the bot losing the thread as a build gets longer. One
condensed but complete block, pasted **in full into every step**, Setup included. Never "see
step 0" or "as before": every step stands alone, as if it were the first thing the bot has seen.

- **The app:** what it is and who it's for, in one line.
- **How it's built:** what Setup settled (tables, roles, how sign-in works), stated as fact.
- **The look:** the handful of theme values used constantly.
- **The data:** tables and relationships, plainly ("Customer → Order → OrderItem; an Order
  belongs to a Customer and has many OrderItems").
- **The map:** the pages and navigation, so the bot knows where this step fits.
- **The testing rules, written out in full every time** (they're the first thing to erode):
  - Nothing hardcoded: anything that looks like data comes from the database and changes with it.
  - Every workflow built end to end, not just its first visible step.
  - Every listed state of a component reachable by real interaction, not just styled.
  - Test each piece as it's built, not at the end.
  - Cover the happy path, edge cases, failures, consistency across screens, and desktop, tablet
    and mobile.
  - Nothing is done on a single successful click.
- **Progress so far:** one line per finished step ("Step 0: theme, tables, pages, shell, dev
  sign-in: done").

A page, not ten: dense, nothing load-bearing cut.

## 3. Setup (Step 0) in full

It must deliver working, verified results, not placeholders: the theme applied as theme values;
the tables with real create/read/update/delete and security rules; the pages and navigation that
really navigate; the shell's regions at all three sizes; the current user and the dev sign-in.

Its testing gate proves the foundation, not any feature: a record can be created, read back,
changed and deleted for each table, and it's still there after a refresh; theme values are used
(no raw colours or sizes typed into components); every page opens; the shell is right at
desktop, tablet and mobile; links to pages not built yet are visibly inactive, not fake.

## 4. Every other step

- **Scope:** exactly what to build, in full detail (fields, buttons, what each does, success and
  error behaviour, empty and loading states). This is the one part that should be the full
  specification, not a summary.
- **Out of scope:** anything nearby it might build early. If the layout needs something there, a
  clearly labelled inactive placeholder, never a fake version.
- **Testing checklist** for this step only, each item expanded into its real cases (see the
  template), always ending with a no-hardcoding check.
- **Done means:** an explicit, checkable list.
- **The gate**, in the same words every time: verify every checklist item against the running
  app (not by reading its own code), then report back item by item, confirming nothing in this
  step is hardcoded and every control was tested; don't start anything else.

## 5. The manifest

A short list of every step in order, with one line each: for you (and the user), to follow the
whole plan. It is **not** given to the bot: it only ever sees the step in play, plus the progress
lines in the Context Block.

## 6. The final regression step

After the feature steps: no new features, the full testing rules across the whole app, looking
for what only shows once everything coexists: a later feature that broke an earlier one, two
features disagreeing about shared data, a workflow that passed alone but fails now, any
hardcoded value left anywhere, any state that can't really be reached.

## Templates

### Manifest (for you, not the bot)

```markdown
# Build plan: {App name}

| Step | Delivers | Depends on |
|---|---|---|
| 0 | Setup: theme, tables + security, pages, shell, dev sign-in | — |
| 1 | {one line} | 0 |
| 2 | {one line} | 0, 1 |
| … | … | … |
| N | Final regression: the whole app, no new features | all |

One step at a time, in order. The next step only after the bot has confirmed this step's
checklist, including nothing hardcoded and every control tested.
```

### Step 0: Setup

```markdown
# Step 0 of {N}: Setup for {App name}

## Context Block (the baseline every later step repeats)
- App: {what it is, who it's for}.
- This step sets up everything below: there is no earlier step.

## This step only
Build, as real working parts (no placeholders):
1. The theme, as theme values (already sent separately: {theme name}); components use theme roles,
   never raw colours or sizes.
2. Tables: {tables, fields, relationships}, with create/read/update/delete for each, and security
   rules: {who can see and change what}.
3. Pages and navigation: {pages and routes}.
4. The app shell: {regions, sizes}, right at desktop, tablet (768) and mobile (375). Regions empty
   for now.
5. Users: a current user, roles {roles}, and a DEV ONLY sign-in with one test account per role.

## Not in this step
No screen content, no workflows from later steps. Navigation to pages not built yet: visible but
inactive.

## Testing checklist: all of these before reporting done
- [ ] For every table: create, read back, update and delete a record, by actually doing it.
- [ ] Records are still there after a refresh.
- [ ] Theme values are used everywhere: no raw colours or sizes typed into components.
- [ ] Every page opens; navigation goes to the right page.
- [ ] The shell is right at desktop, tablet and mobile.
- [ ] Inactive navigation items really do nothing.
- [ ] The dev sign-in works for each role.

## Gate
Check every item against the running app (not by reading your code), then report back item by
item, confirming nothing is hardcoded and you tested each one yourself. Don't start anything else.
```

### Every later step

```markdown
# Step {n} of {N}: {Title}

## Context Block (in full: don't rely on memory of earlier steps)
- App: {what it is, who it's for}.
- How it's built: {tables, roles, sign-in: as settled in Setup}.
- The look: {the core theme values}.
- The data: {tables and relationships}.
- The map: {pages and navigation; where this step fits}.
- Testing rules (every step, no exceptions):
  - Nothing hardcoded: data comes from the database and changes when it changes.
  - Every workflow built end to end, not just its first visible step.
  - Every listed state reachable by real interaction, not just styled.
  - Test each piece as you build it.
  - Happy path, edge cases, failures, consistency across screens, desktop / tablet / mobile.
  - Nothing is done on a single successful click.
- Progress: {one line per finished step}.

## This step only
{The full detail of what to build: screens, components and their states, workflows, data.}

## Not in this step
{Nearby things not to build yet, and any inactive placeholder needed instead.}

## Testing checklist: all of these before reporting done
- [ ] {Workflow}: works end to end.
- [ ] {Workflow}: empty or invalid input is handled, with a visible message.
- [ ] {Workflow}: pressing it quickly twice doesn't duplicate or break anything.
- [ ] {Workflow}: its failure case shows a real error state.
- [ ] {Workflow}: the result shows correctly everywhere else that data appears.
- [ ] {Component}: every listed state (hover, focus, disabled, selected, loading, empty, error…)
      reached by real interaction.
- [ ] All of the above at tablet (768) and mobile (375) too.
- [ ] Nothing hardcoded in this step: checked, not assumed.

## Gate
Check every item against the running app (not by reading your code), then report back item by
item, confirming nothing is hardcoded and you tested each one yourself. Don't start the next step.
```

### Final regression

```markdown
# Step {N} of {N}: Final regression for {App name}

## Context Block (in full, with every step in the progress list)

## This step
No new features. Go through the whole app again, every page, component and workflow, looking for:
- a later feature that broke an earlier one;
- two features that disagree about the same data;
- a workflow that passed alone but fails now other features exist (shared data, timing, more data);
- any hardcoded value left anywhere;
- any state that can't really be reached.

## Testing checklist
- [ ] Every page, end to end.
- [ ] Every component state, reachable.
- [ ] Every workflow again, with its edge and failure cases.
- [ ] One piece of shared data checked everywhere it appears.
- [ ] The whole app at desktop, tablet and mobile.
- [ ] A final search for hardcoded values across the whole app.

## Gate
Report back confirming every item, and that the app as a whole has no hardcoded values and every
control works.
```

## Before you call the split done

- Step 0 is only the bedrock, and nothing in it is re-argued later.
- Every step's Context Block stands alone: no "see step X".
- Every step is small enough to test in one focused pass (about 8 to 10 checklist items at most).
- Every checklist is specific to its step and ends with the no-hardcoding check.
- Every step ends with the same gate.
- A final regression step closes the plan.
- The bot never sees more than the step in play.
