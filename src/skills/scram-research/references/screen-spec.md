# The screen spec (one product)

Fill in every section. Write "not seen" rather than leaving a section out, and mark findings
**seen**, **documented** or **inferred**. It's a description of how the product works, for building
our own version: no copied branding, text or images.

```markdown
# Screen spec: {what the product is, e.g. "a team task board"} (studied: {product}, {address})

## About this research
- Sources: {the pages, docs and other sources used; whether a browser was used}
- Date: {date}
- Screen sizes checked: {desktop / tablet / mobile, or "desktop only"}
- Not explored: {login walls, buttons not pressed, areas out of scope}

## 1. The product
- What it is, who uses it, the main job it does:
- The main things it manages, and how they relate (e.g. "Workspace → Board → List → Card;
  a Card has a due date, an assignee and comments"):

## 2. Scope
### Build (most important first)
| # | Feature | Why it matters to users | Notes for Scram (simplified how, if at all) |
|---|---|---|---|
### Leave out
| Feature | Why |
|---|---|

## 3. Screens
| # | Screen | What the user does there | Reached from |
|---|---|---|---|

## 4. App shell and navigation
- Regions (navigation bar, sidebar, main area, panels): position, what scrolls, sizes:
- How screens connect; which are pages and which are dialogs or side panels:
- What changes at tablet (768) and mobile (375):

## 5. Components
### {Component}
- What it's for, and what it shows:
- States: default / hover / focus / selected / disabled / loading / empty / error (say which were seen)
- Starts workflow(s): {pointers to section 8}

## 6. Each screen
### {Screen}
- Layout, top to bottom and left to right (the order to build it in):
- Components used:
- Data shown (kinds of data, not the product's own text):
- Interactions and feedback:
- On smaller screens:
- Workflows started here: {pointers to section 8}

## 7. Data model (inferred)
- {Table}: {fields, with types} → relates to {table} ({one-to-many…})
- Who may see and change what (roles, owners, sharing):

## 8. Workflows
### {Action, e.g. "Add a card"}
- Where: {screen(s)}
- Evidence: seen / documented / inferred
- Trigger:
- Before anything is sent (checks, instant feedback, double-press protection):
- What it changes (records created / changed / deleted, side effects):
- Who may do it:
- How the screen settles:
- When it fails, and what the user sees:
- What Scram needs (tables, workflow, page data, Table Security, File Store), and the nearest
  version if Scram can't do it exactly:

## 9. Why it's built this way
- {Choice}: {the likely reason}

## 10. Design notes (for the theme questions, not for copying)
- General style: {e.g. "light, airy, lots of white space, rounded cards" or "dark, dense, sidebar-heavy"}
- Layout patterns and components worth having:

## 11. Open questions
- {Decisions only the user can make, and anything not seen that matters}

## 12. Testing rules for Scram's AI
- Nothing hardcoded: every value that looks like data comes from the database and changes with it.
- Every workflow in section 8 built end to end, not just its first visible step.
- Every component state in section 5 reachable through real use, not just styled.
- Test each feature as soon as it's built, before the next one.
- For each workflow: the normal case, edge cases (empty, very long, zero / one / many items,
  pressed twice quickly, refresh half-way), failures (invalid input, no permission), the same data
  shown correctly everywhere it appears, and desktop, tablet and mobile.
- A final pass over the whole app at the end, for anything one feature broke in another.
```

## Before it's done

- Every screen in section 3 has its detail in section 6.
- Every action that changes data has a workflow in section 8, honest about its evidence.
- The data model in section 7 can actually support the workflows in section 8.
- Every non-obvious choice has a "why".
- Someone who has never seen the original could build a working app from it: structurally right
  and behaving sensibly, not a static shell with dead buttons.
