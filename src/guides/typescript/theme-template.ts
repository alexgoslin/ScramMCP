// ============================================================================
// Scram theme — TEMPLATE
//
// One theme per file, written as the exact manageThemes call Scram's AI makes,
// so the AI passes it through instead of interpreting it. In Scram Desktop,
// scram_send_theme writes this file for you from the theme's values, checks
// them first, and sends it to the chat with the target app open.
//
// Worked examples: theme-1-scram.ts … theme-6-clinic.ts.
// ============================================================================
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme with this themeName already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin that
// is not listed below to null. Then applyTheme it to this app. Build nothing else.
//
// Done when: TODO one line a person can check by eye in Run mode, e.g. "the page
// is cream #F9F4EC and a test button is ink #26252C with 8 px corners".
//
// ----------------------------------------------------------------------------
// RULES
//
// Colours
//   - baseColors sets each role's hue only. Shades 50–950 are generated at a fixed
//     lightness, so the base hex itself does not appear. To reproduce an exact hex,
//     pin it in colorShadeOverrides.
//   - Pin only what the design depends on: usually the brand hex at 500, or the
//     button fill at 800. Do not hand-set whole scales.
//   - Solid buttons: fill = primary 800, label = primary 50. If you pin one, check
//     the pair still contrasts (4.5:1). Never reuse primary 50 for anything else.
//   - custom1–custom5 have no base colour: they exist only as pins. Pin them at 500.
//   - Never use surface or content (legacy). The types reject them.
//
// Dark
//   - Make a theme dark with colorSchemeMode, never with dark hexes. dark-only and
//     switchable reverse the scale (50 = darkest), so a page written as
//     "neutral 50 = page, neutral 900 = text" works in every theme.
//   - Pins land on ONE variant: dark for dark-only, light otherwise. The dark side
//     of a switchable theme cannot be pinned from chat; set it in the theme editor.
//   - Pins persist until set to null, even when base colours change.
//
// Scales (steps, not px)
//   - spacing 0–9 (default 5), textSize 0–9 (default 3), roundness 0–9,
//     border 0–4, size 0–4 (default 2: button heights, icon sizes).
//   - Body text: 14 px at textSize 0–1, 16 px at 2–6, 18 px at 7, 20 px at 8,
//     22 px at 9. Headings grow with it.
//   - Roundness lg: 2 px at 0, 8 px at 4, 20 px at 9.
//
// Fonts and icons
//   - Fonts: one Google Font name each, no fallback stack.
//   - iconLibrary: feather | hero-outline | hero-solid | lucide.
//
// Not storable in a theme (apply in the page brief instead): uppercase headings,
// letter-spacing, shadows, mono fonts, exact px sizes, focus rings.
// ----------------------------------------------------------------------------

export {};
const call = {
  explanation: "TODO Theme name theme",
  operations: [{ createTheme: {
    id: "todo-theme-id",                 // lowercase slug
    themeName: "TODO Theme name",
    description: "TODO one sentence: the look and who it is for",
    baseColors: {                        // all six required, #RRGGBB
      primary: "#TODO", secondary: "#TODO", neutral: "#TODO",
      success: "#TODO", alert: "#TODO", error: "#TODO",
    },
    colorShadeOverrides: {               // only the exact hexes the design depends on
      primary: { "800": "#TODO" },       // e.g. button fill = brand colour
      // neutral: { "50": "#TODO" },     // e.g. a signature page colour
      // custom1: { "500": "#TODO" },    // extra accent: pin at 500
    },
    fonts: { heading: "TODO Google Font", body: "TODO Google Font" },
    spacing: 5, textSize: 3, border: 1, roundness: 4, size: 2,
    iconLibrary: "lucide",
    colorSchemeMode: "light-only",       // light-only | dark-only | switchable
    reasoning: "TODO why this theme exists",
  } }],
} satisfies ManageThemes;

// Read back, from the stored theme (not from this file):
//   1. Theme id, name, colour scheme mode, both fonts
//   2. Every pinned shade with its stored hex and variant (light or dark)
//   3. The scale levels as stored
//   4. Which app now uses this theme
// Then stop.
