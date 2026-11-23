# Researching a whole category

For "one app that takes the best of a category" (form builders, booking tools, team chat…):
study several leading products, compare them, and decide on one coherent app that users of the
leaders would choose over them.

## 1. Find the products to study

Use web search: "best {category} software", comparison and review sites, "alternatives to
{leader}" pages, and what you already know. Pick about 3 to 6 products (or as many as the user
asks), best first:
- the leaders users know (they set what people expect);
- products that do the core job differently, or notably better or worse (they make the
  comparison rich).

Leave out products whose value is mostly a huge ecosystem that can't be rebuilt as one app (a full
office suite, a platform with thousands of integrations), unless the user wants them. For each,
give one line on what it adds to the comparison.

**Show the list to the user and let them confirm, drop or add products before you research any
of them.** If they have accounts with some of these products, they may prefer you focus on those.

## 2. Research each product

The same method as one product (references/site-research.md), with the same rules (look, don't
touch; mark the evidence; no copying), but lighter: its core screens and workflows rather than
every screen. Also look for:
- what users love about it, and what they complain about (reviews, comparisons, community
  forums: real complaints, with where you found them);
- what's hard about it (features that need something Scram can't do: references/scram-limits.md).

## 3. A digest of each product

Condense each product's research into one digest, concrete and complete, keeping real flows and
numbers:

```markdown
# {Product}: digest
## Product and users: what it is, who uses it, the main job it does.
## Features: every core feature: what it does, how it works step by step, how it's presented (screens, layout, controls).
## Navigation: the main areas and how screens connect.
## Look and feel: the general style, layout patterns, notable components.
## Data and workflows (inferred): the main records and how they relate; how the key actions work (checks, side effects).
## Strengths: what it does better than most.
## Weaknesses: friction, missing pieces, user complaints (with sources).
## Notable details: anything distinctive worth adopting, or avoiding.
```

## 4. Decide what to build

Hold the design tribunal (references/tribunal.md) on the digests. It gives the **blueprint**: the
product vision, every decision with its reason, the features and how they work, the screens, the
data and the workflows. Show the user the blueprint's vision and decisions before going on.

## 5. Then

As for one product: the open questions for the user, then the briefing and the handoff to the
build (SKILL.md, steps 4 to 6). The blueprint plays the screen spec's part: each build step
carries the parts of it that the step needs.
