// ============================================================================
// Scram theme 1 of 6: "Scram"  (v3, 9 Nov 2026)
//
// Matches scram.com (computed styles from the live site): warm cream page,
// near-black ink buttons, teal accents, lime and peach highlights.
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme named "Scram" already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin
// not listed below to null. Then applyTheme it to this app.
// Build nothing else.
//
// Done when: the page is cream #F9F4EC with white cards, and a test button is ink #26252C
// with a near-white label and 8 px corners.
// ============================================================================
//
// It follows Scram's theme colour rules: base colours set
// each role, and only the exact hexes the design depends on are pinned.
// Fonts: scram.com uses Youth and Aeonik (commercial, not Google Fonts): Archivo and Inter are the closest.
// Pins:
//   - primary 800: the button fill is exactly the brand ink
//   - neutral 50 / 100: the cream page and white cards are the scram.com look
//   - custom1 / custom2: custom roles have no base colour, so they only exist as pins
//
// Not part of the theme (apply when building pages, only if asked):
//   UPPERCASE headings, weight 400; buttons UPPERCASE 14 px, letter-spacing 0.35 px;
//   hero gradient secondary 500 → secondary 200 → neutral 50, emphasised word in custom1 500.

export {};
const call = {
  explanation: "Scram theme",
  operations: [{ createTheme: {
    id: "scram",
    themeName: "Scram",
    description: "Matches scram.com (computed styles from the live site): warm cream page, near-black ink buttons, teal accents, lime and peach highlights.",
    baseColors: { primary: "#26252C", secondary: "#468D80", neutral: "#8A8A8A", success: "#097E00", alert: "#D99A3D", error: "#C93C3C" },
    colorShadeOverrides: {
      primary: {"800": "#26252C"},
      secondary: {"500": "#468D80"},
      neutral: {"50": "#F9F4EC", "100": "#FFFFFF"},
      custom1: {"500": "#EBF5B4"},
      custom2: {"500": "#F8D3A5"},
    },
    fonts: { heading: "Archivo", body: "Inter" },
    border: 1, roundness: 4,
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
