# Themes in Scram: the questions to ask, and how to make one

## 1. Ask the user first (before making or changing a theme)

Unless the user has already said what they want, ask these three questions, one line each,
with short options, and say which you recommend:

1. **"What vibe should the app have?"** Offer 8 vibes that could suit *this* app, each written
   "Vibe: a few plain words on how it looks and feels", for example:
   - Cozy: warm colours, soft corners, friendly type
   - Modern: clean, crisp, lots of space
   - Calm and minimal · Playful · Premium · Bold and energetic · Retro · Techy and precise ·
     Natural and organic · Friendly and approachable · Rough and raw (gritty, bold blocky type)

   Pick the 8 that make most sense for this app, and recommend the one that fits it best. Never
   offer literal themes or costumes (a construction site, a kitchen ticket, a casino, a spaceship).
   If they're recreating an existing product's feel, add "Stay close to <that product>'s look".
2. **"How bold should the design be?"** Exactly: "Subtle: understated, lets the content lead",
   "Balanced: distinctive but calm" (recommend this one), "Bold: strong colour and big type".
3. **"Any must-haves or no-gos for the look?"** "No preference: your call" (recommend),
   "Light background", "Dark background", "Use my brand colours / fonts (write them in)".

The vibe is the north star: every colour, font, corner and line of copy should express it. The
boldness sets how strong it is. Must-haves and no-gos override your taste. Keep it tasteful and
usable every day, and make each app look different from the others.

## 2. Start from an example, or design one

Six ready-made themes, already checked against Scram's theme schema (full files: topic
"theme_examples"); scram_send_theme sends any of them with `example`:

| example | look | mode |
|---|---|---|
| `scram` | Matches scram.com: warm cream page, near-black ink buttons, teal accents, lime and peach highlights (Archivo / Inter) | light |
| `ledger` | Dense, sober finance and back-office: cool slate, one confident blue, tight corners, compact spacing (IBM Plex Sans) | light |
| `midnight` | Dark developer tool: near-black, electric violet, cyan and lime accents (Space Grotesk / Inter) | dark |
| `atelier` | Editorial, magazine look: warm paper, black ink, an oxblood accent, a high-contrast serif, near-square corners (Fraunces / Libre Franklin) | light |
| `playground` | Bright, friendly consumer look: coral and sunflower on cream, rounded type, the roundest corners and thickest borders (Fredoka / Nunito) | switchable |
| `clinic` | Accessibility-first public service (healthcare, local government, charities): calm teal, high contrast, 18 px body text (Lexend / Atkinson Hyperlegible) | light |

Or design one from the answers (with the "design" guide), and write it as the theme object
scram_send_theme takes: the exact `createTheme` payload of Scram's own theme tool.

## 3. The rules (Scram's theme tool, Nov 2026)

Colours
- `baseColors` needs all six main roles (primary, secondary, neutral, success, alert, error),
  each `#RRGGBB`. A base colour sets the role's hue only: shades 50–950 are generated at fixed
  lightness, so the base hex itself appears nowhere. To get an exact hex, pin it in
  `colorShadeOverrides`.
- Pin only what the design depends on: usually the brand hex at 500, or the button fill at 800.
  Never hand-set whole scales.
- Solid buttons: fill = primary 800, label = primary 50. If you pin one, keep the pair
  contrasting (4.5:1). Never reuse primary 50 for anything else.
- custom1–custom5 have no base colour: they exist only as pins, at 500.
- Never use `surface` or `content` (legacy roles).

Dark
- Make a theme dark with `colorSchemeMode` (`dark-only` or `switchable`), never with dark hexes.
  Dark modes reverse the scale (50 = darkest), so "neutral 50 = page, neutral 900 = text" works
  in every theme.
- Pins land on one variant: dark for dark-only, light otherwise. The dark side of a switchable
  theme can't be pinned from the chat: the user sets it in Scram's theme editor.
- Pins stay until set to null, even when base colours change. When replacing a theme, null the
  old pins.

Scales (steps, not px)
- `spacing` 0–9 (default 5), `textSize` 0–9 (default 3), `roundness` 0–9, `border` 0–4,
  `size` 0–4 (default 2: button heights and icon sizes).
- Body text: 14 px at textSize 0–1, 16 px at 2–6, 18 px at 7, 20 px at 8, 22 px at 9. Headings
  grow with it. Roundness lg: 2 px at 0, 8 px at 4, 20 px at 9.

Fonts and icons
- Fonts: one Google Font name each (heading, body), no fallback stack. Commercial fonts aren't
  available: pick the closest Google Font.
- `iconLibrary`: feather, hero-outline, hero-solid or lucide.

Not storable in a theme (say them in the page requests instead): uppercase headings,
letter-spacing, shadows, mono fonts, exact px sizes, focus rings.

A project can hold several named themes, chosen per app. Switching in the editor and asking the
bot to switch change the same setting: whichever happens last wins.

## 4. Send it, then check it

1. scram_send_theme with the theme (or an example) and a **"Done when"** line a person can check
   by eye in Run mode, e.g. "the page is cream #F9F4EC and a test button is ink #26252C with
   8 px corners". It checks the theme against Scram's theme rules first, writes it as a
   TypeScript document (the exact manageThemes call), and sends it to Scram's bot to create
   (or update) and apply.
2. The bot reads back what it stored. Then check the "Done when" line in Run mode
   (scram_run_mode, scram_screenshot area "app_preview"), not in the editor preview.

In pages, use theme roles, never raw values: neutral 50 = page, neutral 100 = cards, nav and
inputs, neutral 200 = borders, neutral 600 = muted text, neutral 900 = text, primary 100 =
tints, primary 700 = accent text and icons. Written this way, one page works under every theme,
light or dark.
