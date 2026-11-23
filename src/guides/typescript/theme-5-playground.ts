// ============================================================================
// Scram theme 5 of 6: "Playground"  (v3, 9 Nov 2026)
//
// Bright, friendly consumer look: coral and sunflower on cream, rounded type,
// the roundest corners and thickest borders available.
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme named "Playground" already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin
// not listed below to null. Then applyTheme it to this app.
// Build nothing else.
//
// Done when: a test button is coral #C8323A with a light label and 14 px corners; cards
// have 20 px corners; switching the device to dark mode gives a dark page.
// ============================================================================
//
// It follows Scram's theme colour rules: base colours set
// each role, and only the exact hexes the design depends on are pinned.
// Pins:
//   - primary 500: the brand coral; 800: a deeper coral so the button label passes (4.8:1)
//   - neutral 50: the cream page
//   - these pins land on the LIGHT variant only (the AI cannot reach the dark one yet);
//   dark mode uses the generated, reversed scale
//   - custom1 = Learn (cyan), custom2 = Rewards (purple)
//
// Not part of the theme (apply when building pages, only if asked):
//   pill buttons, 2 px neutral 900 border, hard offset shadows.

export {};
const call = {
  explanation: "Playground theme",
  operations: [{ createTheme: {
    id: "playground",
    themeName: "Playground",
    description: "Bright, friendly consumer look: coral and sunflower on cream, rounded type, the roundest corners and thickest borders available.",
    baseColors: { primary: "#FF5A5F", secondary: "#FFC93C", neutral: "#6B6478", success: "#2BB673", alert: "#FF9F1C", error: "#E63946" },
    colorShadeOverrides: {
      primary: {"500": "#FF5A5F", "800": "#C8323A"},
      neutral: {"50": "#FFFBF5"},
      custom1: {"500": "#4CC9F0"},
      custom2: {"500": "#9B5DE5"},
    },
    fonts: { heading: "Fredoka", body: "Nunito" },
    spacing: 4, textSize: 5, border: 4, roundness: 9,
    iconLibrary: "lucide",
    colorSchemeMode: "switchable",
    reasoning: "Theme from the Scram theme set (v3)",
  } }],
} satisfies ManageThemes;

// Read back, from the stored theme (not from this file):
//   1. Theme id, name, colour scheme mode, both fonts
//   2. Every pinned shade with its stored hex and variant (light or dark)
//   3. The scale levels as stored
//   4. Which app now uses this theme
// Then stop.
