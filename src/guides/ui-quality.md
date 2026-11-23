# UI quality: the gate, craft and consistency rules

Rules for the screens Scram builds. Use them two ways:
- **In requests to Scram's bot**: say the rules that matter for the screen (one focal point,
  one primary action, states for empty/loading/error, overflow with "…", theme tokens only…).
- **Before calling a screen finished**: check it against the gate below, with evidence. In
  Scram Desktop: scram_app_read (labels, states, focus order as listed), scram_app_check_layout
  (overflow, overlap, duplicates, contrast, sideways scrolling), scram_screenshot area
  "app_preview" (the look), and scram_app_type with very long text, then with none, to see
  overflow and empty states. Scram Desktop can't resize the preview: report widths you couldn't
  check as unverified, as the gate says.


# UI Quality Gate

Sets scope at the start and proves the result at the end. A screen isn't finished until the report shows evidence.

## At the start
1. List every request in the message as a checklist. The final report answers it.
2. Change only what was asked. A change to a shared component applies everywhere it's used; nothing else changes.
3. On an existing screen: make the smallest fix, keep its layout, and note how affected components look before editing.

## At the end
Check at a narrow, a medium and a full width, in light and dark. Measure in the running app where you can; where you can't, check the code and list screen-only checks as unverified.
1. **Overflow:** no text cut off without "…" and nothing overlapping — with very long text, 1 item and 500 items.
2. **Consistency:** same-kind components match in height, radius, padding and hover. Rows of a type share one height; trailing items share one right edge.
3. **Theme:** no colour, font, size, radius, border or shadow outside the theme.
4. **Craft:** one focal point and one primary action per screen; the accent only on its roles.
5. **States and access:** hover, focus, empty, loading and error states exist. Focus is visible, fields are labelled, tab order follows the screen, and state is never shown by colour alone.
6. **Regressions (existing screens only):** nothing that worked now stacks, wraps or moves.

## Failures
Fix failures inside the scope. List failures outside it, unfixed. If a built-in component can't take a value, keep its default and note it; that isn't a failure.

## Report
Each request: done or not done. Each component built or changed: widths tested and results. Anything unverified or outside scope. "Checked" with no evidence is not a pass.


# App Craft

Generated UIs look unfinished through omissions, not taste. This skill fills those gaps inside the app's own theme, as outcomes rather than values.

## Before you build
1. **Theme.** Every colour, shadow, radius and space comes from the app's theme. If asked to change the theme, propose values and change nothing until approved.
2. **Direction.** State one line — density, shape, surfaces (flat or layered), colour (muted or bold; warm, cool or true-grey neutrals) — chosen for the app's audience, so apps don't all look alike.

## Craft
- **Focal point:** one per screen, clearly the largest thing on it.
- **Depth:** regions separate from the page by tone and a border; a shadowed card is lighter than the page, never darker. Menus, dialogs and sheets stand out most; dialogs sit on a scrim.
- **Regions, not rows:** a list is one region with dividers, never a card per row. Separate sections with headings and space, not more cards.
- **Type:** up to three roles per region, separated by weight and colour before size; `tabular-nums` for numbers in columns.
- **Colour:** neutrals carry the screen; the accent marks only selection, focus, active nav and the primary action. Status is a soft tinted pill. Text 4.5:1, large text and borders 3:1.
- **Icons:** one family, one size in nav and controls, including built-in inputs, selects and toggles; hit area comes from padding. Control text matches body text.
- **Corners:** controls share one radius; regions and dialogs a larger one.
- **Forms:** every field's purpose is clear; an error replaces helper text. The primary action ends the form.
- **Destructive actions:** last in their group, outline style; filled only in a confirm dialog.
- **Motion:** short feedback only, respecting reduced motion.

## States
- Interactive elements have hover, focus, selected and disabled states in the shared component. Hover is never the only way to reach an action.
- Data views have loading (a skeleton matching the layout), empty and error states. An empty state has an icon, a title, one line of help and a button; with no data at all, it replaces the whole layout.
- Every screen works in light and dark.

## Growth
- Views work with 0, 1 and 500+ items and very long text. Long lists paginate with a count; avatars fall back to initials.
- Cards in a row share one width and height, with actions lined up at the bottom.
- The page never scrolls sideways; tables scroll inside their region or stack on small screens. No type below 12px.

## Finish
Run ui-quality-gate.


# UI Consistency

How things line up and repeat. These rules hold no look, so two apps can follow them all and look nothing alike. Every rule can be checked in the running app.

## Rows
- One height per row type, used everywhere; avatars and icons fit the row, and rows don't grow to fit them. Controls on one row share one height and are vertically centred.
- The last item in a row (action, "…", chevron, count, pill) sits against the row's right edge, so trailing items form one column.
- Leading content, labels and headers share one left edge with the body below.
- A table's header and rows share one column definition. Flexible columns keep a minimum width; when space runs out, the table scrolls inside its region. Columns never shrink to nothing.

## Shape and spacing
- Every button uses one corner radius and one height per size. Inputs and selects match the buttons of their size.
- The same relationship gets the same gap everywhere — items in a row, inside cards, around the page — from the theme's steps.
- Container padding is equal on all sides and larger than the gaps inside it.
- Every page uses one content max width, so content edges line up from page to page.

## Components
- Shell, buttons, inputs, menus, pills and empty states each come from one shared component. Extend it with a variant; never copy it into a page, because copies drift. Make a new component only when it's needed in 3+ places.
- Components doing the same job share identical hover, focus, selected and disabled styles, with one hover style app-wide.
- The same job gets the same control: toggle for instant on/off, checkbox for selection, segmented control for small sets, select for long lists.
- Items of the same kind get the same treatment: nav items all have icons, or none do.

## Overflow
- Any one-line text, headers included, that's too long shortens with "…" and shows the full text on hover. It never overlaps or pushes a neighbour.
- Text in flex or grid children sets `min-width: 0`; long words and URLs wrap. No fixed heights on user-entered text.

Checking these is ui-quality-gate's job.
