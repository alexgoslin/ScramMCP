# The design tribunal

How to decide, from several researched products, what our one app should be. Without it the
usual result is a bare-minimum app with no idea behind it, or a pile of features that don't fit
together. You play each role in turn, writing each part out before the next. (If you can give
tasks to separate helpers, giving each advocate their own helper keeps their arguments
independent, but it isn't needed.)

## Ground rules for every role

- We're making a product people would choose over the leaders, not a minimum version. The bar:
  as good as the best product in the category, without the leaders' friction.
- **Effort is never a reason.** Scram's AI does the building, so never cut or downgrade something
  because it's "a lot of work" or "would need a custom component". Scram's AI can build custom
  components, and uses its HTML Element and Run Code (JavaScript) for rich interactions: drag and
  drop, reordering by dragging, inline editing, keyboard shortcuts, live previews.
- **The only hard limits are Scram's official ones** (references/scram-limits.md). Cut or simplify
  something only for one of those, or for a real user reason: it confuses people, clutters the
  screen, puts their data at risk, or users of these products complain about it.
- **Think like a user of these products.** What do people coming from the leaders expect to just
  work? (In a form builder: dragging fields onto the form and reordering them by dragging.) Those
  expectations stand unless Scram can't do them.
- **Use what you know about these products, not just the research.** You may add well-known
  features or behaviours, marked "(known, not researched)".
- **Coherence beats a pile of features:** every choice should fit one clear idea of the product and
  one way of working.

## 1. The organiser: the vision and the points to decide

First the **product vision**, so every decision fits one idea:
- **Core experience:** the one interaction the product lives or dies by, described concretely
  ("building a form by dragging blocks onto a live preview").
- **Expectations:** 8 to 15 things a user arriving from the leaders will expect to just work,
  especially how things feel to use (drag and drop, editing in place, shortcuts, undo, instant
  feedback, autosave…), each with the products that set it.
- **Signature ideas:** 2 to 5 ways our app can be better than all of them, from the weaknesses
  and complaints in the digests.
- **A name:** an original name for our app (never one of the products' names).

Then the **points to decide** (about 15 to 30): every place where the products differ or where
we must choose, covering which features to include, how each one feels to use, where it lives
on screen, navigation, the data, how actions work, and the look. The first points are the core
experience and how the main screen works. For each point: the question, how each product does
it, and why it matters to users.

## 2. The three advocates

For every point, in turn:
- **For:** argues for the strongest, most delightful version: the best of the products combined,
  better where the leaders have friction. How it should feel to use, why users want it, how Scram
  can build it.
- **Impartial:** recommends what a best-in-class product would do for our users, weighing user
  value, fit with the vision and the rest of the app, users' expectations, the complaints, and
  Scram's limits. Not the middle option by default: if the rich version is right, says so.
- **Against:** stops the app getting bloated or confusing, not cheap: argues against clutter, too
  many ways to do one thing, settings nobody needs, confusing flows, risks to users' data, things
  users complain about, and what Scram's limits rule out. Never argues from effort; if a rich
  version is clearly what users expect, argues only against its excesses.

Each argument: a one-line position and 2 to 4 sentences, citing the products. A table per point
works well.

## 3. The judge: decide and write the blueprint

Decide every point so it serves the vision, and so the decisions fit together (one way of
working, one visual language, the same patterns on every screen). Decide on user value, not on
who argued: no point is won by default, and the middle option isn't automatically right. Use the
Against arguments to remove clutter and risk, not to strip the product down. Then write the
blueprint:

```markdown
# {Our app's name}: blueprint
## Product: what it is, who it's for, the core job.
## Vision: the core experience in a short paragraph; 4 to 6 principles (each one line, with what it means in practice); the signature interactions users will notice (what you do, and what you see).
## First five minutes: a new user's first session, screen by screen and action by action.
## Decisions: one bullet per point: **P{n} {topic}: {decision}**, then why, in terms of users and the products (what users expect, what the products show, which complaints it avoids, which Scram limit forces it). Never just "X won".
## Features to build: each feature: what it does, how it works step by step, how it feels in detail (what's draggable or editable in place, its states: hover / selected / dragging / empty / loading / error, shortcuts, undo, feedback), where it lives, and which product it's modelled on. For rich interactions, how Scram builds them, and the simpler fallback only if Scram's AI reports it can't.
## Left out: what we deliberately don't build, with the user reason or the Scram limit for each. Never "too costly".
## Screens and navigation: every screen, what's on it, how users move between them.
## Data: the tables, their fields and relations, and who may see and change what.
## Workflows: the key actions: inputs, steps, side effects, checks, errors.
## Look and feel: the general direction (density, layout patterns, key components and their states). The theme itself comes from the user's answers to the theme questions.
Be decisive and specific: no "consider", no "optionally".
```

## 4. The critic, then the final blueprint

Review the blueprint as someone who has used all the leading products for years. List:
- **Bare minimum:** features or interactions downgraded below what users of the leaders expect
  (Move up / Move down buttons where people expect to drag; a reload where they expect an instant
  update), or cut "for cost" rather than for a Scram limit or a user reason.
- **Missing expectations:** what users take for granted in this category that the blueprint never
  mentions (states, feedback, undo, empty screens, mobile).
- **Incoherence:** decisions that contradict each other or the vision, or screens that feel like
  they're from different products.
- **Vagueness:** places the builder would have to guess (an interaction without its states, a
  screen without its layout).
- **False limits:** things ruled out as impossible in Scram that aren't on its official list.

As "Must fix" (numbered, most important first, each with exactly what it should be instead),
"Should improve", and "Keep" (a few lines on what's strong).

Then, as the judge again, rewrite the **complete** blueprint with every Must fix applied and every
Should improve you agree with (reject one only for a Scram limit or a clear user reason, said in
the decision). The result must read as one coherent product: that final blueprint is what the
build follows.
