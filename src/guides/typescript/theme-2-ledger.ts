// ============================================================================
// Scram theme 2 of 6: "Ledger"  (v3, 9 Nov 2026)
//
// Dense, sober finance and back-office: cool slate, one confident blue, tight
// corners, compact spacing.
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme named "Ledger" already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin
// not listed below to null. Then applyTheme it to this app.
// Build nothing else.
//
// Done when: a test button is blue #1D4ED8 with 4 px corners, and spacing is visibly
// tighter than the platform default.
// ============================================================================
//
// It follows Scram's theme colour rules: base colours set
// each role, and only the exact hexes the design depends on are pinned.
// Fonts: Same family in both slots on purpose.
// Pins:
//   - primary 800: the button fill is exactly the brand blue
//   - custom1 = pending approval, custom2 = scheduled (extra status colours)
//
// Not part of the theme (apply when building pages, only if asked):
//   IBM Plex Mono for amounts, ids and dates; zebra table rows neutral 50, 1 px neutral 200 rules.

export {};
const call = {
  explanation: "Ledger theme",
  operations: [{ createTheme: {
    id: "ledger",
    themeName: "Ledger",
    description: "Dense, sober finance and back-office: cool slate, one confident blue, tight corners, compact spacing.",
    baseColors: { primary: "#1D4ED8", secondary: "#475569", neutral: "#64748B", success: "#047857", alert: "#B45309", error: "#B91C1C" },
    colorShadeOverrides: {
      primary: {"800": "#1D4ED8"},
      custom1: {"500": "#6D28D9"},
      custom2: {"500": "#0E7490"},
    },
    fonts: { heading: "IBM Plex Sans", body: "IBM Plex Sans" },
    spacing: 2, textSize: 2, border: 1, roundness: 3,
    iconLibrary: "lucide",
    colorSchemeMode: "light-only",
    reasoning: "Theme from the Scram theme set (v3)",
  } }],
} satisfies ManageThemes;

// Read back, from the stored theme (not from this file):
//   1. Theme id, name, colour scheme mode, both fonts
//   2. Every pinned shade with its stored hex and variant (light or dark)
//   3. The scale levels as stored
//   4. Which app now uses this theme
// Then stop.
