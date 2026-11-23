---
name: scram-research
description: Research a website, product or software category before building a similar app in Scram, the no-code app builder. Use when the user wants research first, or an app like an existing one.
---

# Research before building in Scram

The research phase that comes before a Scram build. **You** do the research, with your own tools
(web search, reading web pages, a browser if you have one). Scram Desktop builds in Scram; it
doesn't research anything. Never use Scram Desktop's `scram_app_*` tools on other websites: they
only work inside Scram's preview of the app being built.

## When to use this

- The user wants an app like an existing product ("something like Trello for my team").
- The user wants one app that takes the best of a whole category ("the best form builder").
- The user asks you to research, scope out or study a site or product before building.

Not for a plain build request ("add a contact page"): build that straight away. If a big build
would clearly benefit from studying an existing product first, offer the research once, and go
with the user's answer.

## Ground rules

1. **Learn what it does, don't copy what it is.** Study the features, screens, workflows and data.
   Never reproduce another product's name, logo, images, illustrations, written copy, or its exact
   brand colours and fonts. The new app gets its own name and its own look (its theme comes from
   the user's answers, later).
2. **Look, don't touch.** Never sign up, log in, post, send, buy, invite, delete, cancel or change
   settings on someone else's site, and never submit a real form. Typing into a search box to see
   what it suggests is fine. If the useful screens are behind a login, ask the user: they can
   sign in themselves (in the browser you're using, if they're happy for you to look around
   their account, and the rule above still holds), share screenshots, or describe the screens.
   Never ask for their password.
3. **Be honest about evidence.** Mark each finding as **seen** (you looked at it), **documented**
   (the product's own help pages, docs or changelog say so) or **inferred** (your best reasoning).
   Never present a guess as a fact.
4. **Be polite to the sites.** A focused look, not a crawl: about 20 screens or pages for one
   product unless the user wants more. No bulk downloading, no getting around paywalls or limits,
   and respect each site's terms.
5. **Scope by value, and by what Scram can build.** Keep what users really use the product for;
   leave out marketing, upsells and admin plumbing. Check every feature against Scram's limits
   (references/scram-limits.md). How much work it is to build is never a reason to cut something:
   Scram's AI does the building.

## Pick your sources

Use the best you have, and tell the user which:
- **A browser you can drive** (for example Claude in Chrome, a built-in browser, or ChatGPT's agent
  mode): open the product's pages, menus, tabs and dialogs, and see the screens yourself.
- **Web search and page reading:** the product's own pages, help centre and docs (they often walk
  through every feature step by step), changelog, template gallery, tutorials, and reviews and
  comparisons (for what users love and complain about).
- **The user:** screenshots, a screen recording, or their own description of how they use it.

## The process

1. **Agree the target, in one message.** One product (its web address) or a category ("project
   management for small teams")? Which parts matter most? How deep: a quick look (the core
   screens and features) or thorough (every screen worth building)? Anything to leave out?
2. **Research.**
   - One product: follow references/site-research.md and write the screen spec
     (references/screen-spec.md).
   - A category: follow references/category-research.md (the user confirms which products to
     study), then hold the design tribunal in references/tribunal.md to decide what to build.
3. **Decide the scope:** the core features to build, most important first, and what to leave
   out, each with a one-line reason.
4. **Ask the user the open questions:** only the decisions that change how it's built, each with
   2 to 4 options and your recommendation (references/questions-and-briefing.md). Ask about the
   look separately, with Scram Desktop's theme questions.
5. **Write the research pack.** A plain-English **briefing** for the user (what you looked at,
   what you understood, what will be built, what's left out and why, what to double-check), plus
   the **screen spec** (one product) or the **blueprint** (a category). If you can create files,
   save each as a Markdown file and tell the user where; otherwise put them in the chat.
6. **Hand over to the build.** Show the user the briefing and get their go-ahead. Then:
   - **With Scram Desktop connected:** read its guides with `scram_guide` (topic "handoff" to split
     the build into steps, "briefs" if it's big, "themes" for the look), then build as usual.
     Scram's bot never gets the whole research pack: each step it gets carries the parts of the
     spec that step needs, in full.
   - **Without Scram Desktop:** tell the user that Scram Desktop lets their AI build this in Scram
     for them, or give them the build steps to paste into Scram's AI chat one at a time.

## Before you call the research done

- Every core feature has its screens, how it works step by step, the data behind it, and how it
  will work in Scram (pages, tables, workflows, sign-in).
- Every finding says how you know it (seen, documented or inferred).
- Anything you couldn't see (behind a login, a button you didn't press) is listed to double-check.
- Nothing in the pack copies another product's branding, copy or images.
- The user has answered the open questions, or has said to go with your recommendations.
