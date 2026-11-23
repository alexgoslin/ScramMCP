// ============================================================================
// Scram theme 4 of 6: "Atelier"  (v3, 9 Nov 2026)
//
// Editorial, magazine look: warm paper, black ink, an oxblood accent, a
// high-contrast serif, near-square corners.
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme named "Atelier" already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin
// not listed below to null. Then applyTheme it to this app.
// Build nothing else.
//
// Done when: the page is paper #FBF8F3, a test button is oxblood #7A1F2B with 1 px
// corners, and headings are visibly larger than the platform default.
// ============================================================================
//
// It follows Scram's theme colour rules: base colours set
// each role, and only the exact hexes the design depends on are pinned.
// Pins:
//   - primary 800: the button fill is exactly the oxblood
//   - neutral 50: the paper page colour
//   - secondary is now slate-blue #4F6D7A (was ochre, which clashed with alert)
//
// Not part of the theme (apply when building pages, only if asked):
//   heading weight 500, h3 italic; eyebrow 12 px UPPERCASE letter-spacing 0.18em; outline buttons.

export {};
const call = {
  explanation: "Atelier theme",
  operations: [{ createTheme: {
    id: "atelier",
    themeName: "Atelier",
    description: "Editorial, magazine look: warm paper, black ink, an oxblood accent, a high-contrast serif, near-square corners.",
    baseColors: { primary: "#7A1F2B", secondary: "#4F6D7A", neutral: "#7A7266", success: "#3F6B3A", alert: "#B7832F", error: "#A1271B" },
    colorShadeOverrides: {
      primary: {"800": "#7A1F2B"},
      neutral: {"50": "#FBF8F3"},
    },
    fonts: { heading: "Fraunces", body: "Libre Franklin" },
    spacing: 6, textSize: 6, border: 1, roundness: 0,
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
