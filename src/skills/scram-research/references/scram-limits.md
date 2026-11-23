# What Scram can and can't build

From Scram's public documentation. With Scram Desktop connected, `scram_guide` topic "platform"
has the fuller, current version: prefer it.

## What Scram builds

- Web apps made of **pages** built from **components** (lists with pagination, cards, forms and
  inputs, date pickers, tabs, navigation, dialogs and overlays, toasts, avatars, chips, meters and
  progress bars), and **custom components** made from other components.
- **Workflows** that run on clicks, form submissions, changes and page loads, or on the server.
- A built-in **database** (PostgreSQL): tables, relations, SQL; **Table Security** decides who
  may read and write each table.
- **Users and sign-in**: email and password, social sign-in (Google, Microsoft, Facebook and
  others, which the user sets up), roles, pages only some users may open.
- **File uploads** (a file store), outgoing calls to other services' APIs, and incoming webhooks.
- A project-wide **theme** (colours, fonts, spacing, corners, icons).
- **Rich interactions** too: drag and drop, reordering by dragging, inline editing, keyboard
  shortcuts, live previews, filtering and checking input as the user types. Scram's AI builds
  them with custom components, its HTML Element and Run Code (JavaScript). They are not limits.

## What Scram can't do yet

Plan the nearest simple version, or leave the feature out and say why:
- **Live updates pushed to the screen** (live chat, presence, live notifications): use a Refresh
  button, or reload after each action.
- **Scheduled jobs** (nightly syncs, daily digests) and **background jobs over many records**
  ("email every customer").
- **Database triggers** (the workflow that writes a row must do its side effects itself).
- **Fuzzy, full-text or "smart" search**: only simple text matching.
- **Charts and graphs**: show numbers as cards, tables, meters or progress bars.
- **Interactive maps** and location features (map widgets, distance sorting, place lookup).
- **Private files with expiring links**: uploaded files are served from public addresses.
- **Search-engine settings** (page titles and descriptions, social preview cards, sitemaps) and
  **tracking or chat scripts** (analytics, pixels, chat widgets).
- **Connecting other tools to its database** directly, IP allow-lists, cookie-consent gating,
  shorter sign-in sessions (users stay signed in for 30 days), checking incoming webhook
  signatures, and services that need server-signed tokens (some video, chat and search services).

## How to use this in research

- Keep a feature when users really use it and Scram can build it, however much work it is.
- When a feature needs one of the limits above, say so, and offer the nearest version as one of
  the user's open questions.
- Payments, email delivery to real customers, and social sign-in need accounts that only the
  user can set up (a payment provider, an email provider, Google): note them for the user.
