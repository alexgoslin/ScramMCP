// ============================================================================
// Scram staged brief — TEMPLATE
//
// A brief is a TypeScript file that describes an app to Scram's editor chat.
// It is never compiled. Paste ONE batch at a time into the chat, into an app you
// have already created by hand in the editor. After each batch, ask Scram to read
// back what it built and check it against the batch's "Done when" line before
// sending the next one.
//
// This file is pseudo-code and is NOT type-checked. Themes are made separately,
// and checked before they're sent: scram_send_theme.
//
// Replace every {{placeholder}}. Delete the EXAMPLE blocks or keep them as a
// pattern. Keep the comment conventions exactly as they are: Scram reads them.
// Read scram_guide topic "briefs" first.
// ============================================================================

// ----------------------------------------------------------------------------
// CONVENTIONS (keep this block at the top of every brief)
//
//   interface   = a table. A field comment is that field's validation rule.
//   enum        = a dropdown field with fixed options, in display order.
//                 The string value is the label shown to users.
//   function    = an action, button, endpoint or MCP tool. The body is
//                 pseudo-code describing behaviour, not code to run.
//   Page*       = a page. The returned object is what must be on screen.
//   const       = settings or ordered lists the app relies on.
//   // UI:      = a layout or styling note. Everything else is behaviour.
//   // AS BUILT: = what Scram actually did, recorded after each batch.
//                 Wins over the spec above it when the two differ.
//   /** Public. */ / /** Internal. */ on a page = who can open it and
//                 whether login is required. State it on every page.
//
// STYLING RULE: pages use theme tokens only, never raw hex, px font sizes or
// px radii. Use colour roles, not hexes:
//   neutral 50 = page · neutral 100 = cards, nav, inputs · neutral 200 = borders
//   neutral 600 = muted text · neutral 900 = text
//   primary 100 = tints · primary 700 = accent text and icons
//   primary 800 / 50 = solid button fill / label (set by the platform)
// Written this way, one page works under every theme, light or dark.
//
// RESERVED NAMES: never name a reusable component's prop `props` or `events`:
// every app in the project stops building (Nov 2026).
// ----------------------------------------------------------------------------

// ============================================================================
// BUILD LOG
// Project: "{{project-name}}" — {{editor URL}}
// App: {{app name and id, e.g. Frontend 1 (aAA_00001)}}. Mode: {{Free | Mid | Pro}}.
//
// | Batch | Sent        | Result                                              |
// |-------|-------------|-----------------------------------------------------|
// | 0     | —           |                                                     |
// | 1     | —           |                                                     |
// | 2     | —           |                                                     |
// | 3     | —           |                                                     |
//
// Open items:  (one line each; [x] when closed; keep closed ones until the
//               batch they belong to is signed off, then prune)
//   - [ ] {{item}}
//
// Stable dev address (share this, not the Run-view host):
//   {{https://<project>.dev.scramapps.com/<appId>/app/...}}
// ============================================================================

// ============================================================================
// BATCH 0 — Theme.
// Made with scram_send_theme (an example theme, or your own, checked before it's
// sent). Build no pages in batch 0.
// Done when: the theme's own "Done when" line holds in Run mode.
// ============================================================================

// AS BUILT (batch 0):
//   {{theme id; pins as stored, with variant; scale levels as stored}}

// ============================================================================
// BATCH 1 — Tables, the core page, the admin page.
// Done when: {{one sentence a tester can verify end to end, e.g. "you can
// create a record in Admin, open its public page logged out, post a change
// from Admin and see it appear on the public page"}}.
// ============================================================================

// Sent with this preamble (answers to Scram's batch 0 questions, plus
// project-wide component defaults the theme could not hold):
//   {{e.g. uppercase headings, mono font for ids and code, shadows off}}
//   Then build the spec. Read back, and create ONE test record.

// --- EXAMPLE enums -----------------------------------------------------------

enum ItemType {
  typeA = "Type A",            // first option in the dropdown
  typeB = "Type B",
}

enum ItemStatus {
  open = "Open",               // every item starts here
  active = "Active",           // set by a human in Admin
  closed = "Closed",           // set by an integration (batch 2)
}

enum Visibility {
  public = "Public",           // listed; anyone can open
  linkable = "Linkable",       // not listed; anyone with the URL can open  <-- default
  private = "Private",         // not listed; named people only (later batch)
}

// --- EXAMPLE tables ----------------------------------------------------------

interface Item {
  id: string;            // "{{PREFIX}}-" + zero-padded auto number, e.g. {{PREFIX}}-007. Read-only.
  slug: string;          // from title on create, lowercase, hyphens, unique.
                         // Never changes after create, even if title changes.
  title: string;         // required, 1–120 chars, user-facing language
  body: string;          // markdown, required
  type: ItemType;        // required
  status: ItemStatus;    // default open
  visibility: Visibility;// default linkable
  createdAt: Date;       // auto
  updatedAt: Date;       // auto; bumped whenever a child row is added
}

interface Change {
  id: string;
  item: Item;            // relation, required
  body: string;          // markdown, required
  statusAfter?: ItemStatus; // the status this change moved the item TO, if any
  sourceRef?: string;    // external reference (URL, ticket id) — plain text
  createdAt: Date;       // auto
}

// --- Actions ---------------------------------------------------------------
// One function per action. Say which actions are the ONLY way to do a thing;
// later batches (webhooks, MCP tools) must reuse them rather than re-implement.

function createItem(input: {
  title: string;
  body: string;
  type: ItemType;
  visibility?: Visibility;   // default linkable
}): { item: Item; url: string } {
  // 1. Create Item with status = open, slug from title.
  // 2. Create one Change: body = "Opened", statusAfter = open.
  // 3. Return the item and its FULL public URL, built from the publicBaseUrl setting.
  // This is the ONLY way an item is created. Later batches reuse it.
}

function postChange(input: {
  item: Item;
  body: string;
  newStatus?: ItemStatus;    // optional: change status in the same action
  sourceRef?: string;
}): Change {
  // 1. Create the Change row with statusAfter = newStatus (or null).
  // 2. If newStatus given: set item.status = newStatus.
  // 3. Set item.updatedAt = now.
  // Never edit a previous Change; the history is append-only.
}

// --- Pages -----------------------------------------------------------------

/** Public. No login. Must work at 1440, 768 and 390 wide. */
function PageItem(slug: string) {
  // Lookup Item by slug. Not found → plain 404 page "{{404 wording}}".
  return {
    statusBadge: Item.status,     // UI: pill; fill <role> 100, label <role> 800 (map statuses to roles)
    title: Item.title,            // UI: h1, heading font, neutral 900
    body: Item.body,              // UI: rendered markdown, neutral 900
    history: Change[],            // newest first. Row: date, statusAfter pill if
                                  // present, body. UI: left-border timeline, neutral 200.
    lastUpdated: Item.updatedAt,  // UI: "Last updated {{d MMM yyyy}}", neutral 600
  };
  // UI: page neutral 50, single column max 720px. Footer: "{{footer text}}".
  // UI: below 768 use the tablet style.
}

/** Internal. Login with the Admin role required. */
function PageAdmin() {
  return {
    newItemForm: {
      fields: ["title", "body", "type", "visibility"],
      onSubmit: createItem,       // after create: show the URL with a Copy button
    },
    list: Item[],                 // columns: id, title, status (dropdown),
                                  // visibility (dropdown), type, updatedAt.
                                  // Sort updatedAt desc. Filter by status.
                                  // Changing a dropdown inline = postChange
                                  // with body "Status changed" and newStatus.
    rowActions: {
      open: "open the public page in a new tab",
      copyLink: "copy the full URL",
      postChange: { fields: ["body", "newStatus?"], onSubmit: postChange }, // UI: modal
      edit: ["title", "body", "type", "visibility"],   // slug and id NOT editable
    },
  };
}

// Read-back for batch 1, from the running page in its own tab (not the editor):
//   1. Every page, including any Scram added on its own, with its address
//   2. Each control: control name as built, label, placeholder, value
//   3. Anything set with a raw value instead of a theme token, and why
//   4. Every deviation from the spec and the reason
//   5. What was verified by a real call and what is still untested
// Then stop.

// AS BUILT (batch 1):
//   {{Tables as named by Scram, with any storage differences (e.g. display id
//     stored beside the auto integer id; enums stored as keys and mapped in
//     the UI). Actions as named. Pages built, including any Scram added on
//     its own. Test record and its URL. Deviations to fix. What is NOT yet
//     verified.}}

// ============================================================================
// BATCH 2 — Integrations. Inbound webhook + MCP tools.
// Done when: {{one externally triggered event changes one item with a
// history row, and nobody touched Admin}}.
// ============================================================================

// Sent with this preamble:
//   Reuse createItem / postChange. Links from the webhook and MCP must be
//   full URLs built from the publicBaseUrl setting. Secrets = settings with a
//   placeholder value; do not invent one and never print one in chat.
//   Self-tests asked for (give inputs AND expected outputs):
//     {{parseIds("X-3 fix and x-012, also X-3 again") → ["X-3","X-012"]}}
//     {{fake inbound event → expected item change}}

/** Pure. Keep tiny so it can be self-tested. */
function parseIds(text: string): string[] {
  // regex /{{PREFIX}}-\d+/g, uppercase, de-duplicated, in order of appearance.
  // Match by number: "{{PREFIX}}-3" finds {{PREFIX}}-003.
}

/** Public HTTP endpoint. POST /webhooks/{{source}}. Reject unauthenticated calls. */
function inboundWebhook(event: {
  type: string;
  action: string;
  payload: unknown;          // describe the fields you actually read
}): { handled: string[] } {
  // For each id in parseIds(...): postChange(item, "{{what happened}}", {{newStatus}}, sourceRef).
  // Unknown id → ignore, do not fail the request. Always return 200 with the ids handled.
  // Idempotent: the same delivery id twice must not create two Change rows.
  // Automatic moves only go FORWARD through a declared order; humans in Admin
  // are unrestricted. Declare the order as a const if it matters.
  // Note: workflows cannot see the raw body, so HMAC signatures cannot be
  // verified. Fallback: a shared ?key= in the URL. Decide if that is acceptable.
}

/** Exposed as an MCP tool on this app. Same behaviour as the Admin form. */
function create_item(input: {
  title: string;
  body: string;
  type: ItemType;
  visibility?: Visibility;
  ticket_ref?: string;       // stored as sourceRef on the first Change
}): { id: string; url: string } {
  // createItem(input), then set sourceRef on the "Opened" Change.
}

/** Exposed as an MCP tool. */
function get_item(id: string): { id: string; title: string; status: ItemStatus; url: string; lastChange: string } {
  // Lookup by id ({{PREFIX}}-nnn, number match) or slug. Not found → error.
  // MCP auth: return HTTP 200 with a JSON-RPC error, never a bare 401.
}

// AS BUILT (batch 2):
//   {{Endpoint URLs. New tables (deliveries for dedupe, settings). Setting
//     names and which hold secrets. Every DEVIATION from the spec with the
//     reason Scram gave. Which self-tests passed. What was verified by a real
//     call vs. what is still untested.}}

// ============================================================================
// BATCH 3 — {{People / notifications / access}}
// Done when: {{...}}
// ============================================================================

// ============================================================================
// BATCH 4 — {{Public surfaces: feed, RSS, board}}
// Done when: {{...}}
// ============================================================================
