// ============================================================================
// Scram theme 6 of 6: "Clinic"  (v3, 9 Nov 2026)
//
// Accessibility-first public service (healthcare, local government, charities):
// calm teal, high contrast, 18 px body text.
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme named "Clinic" already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin
// not listed below to null. Then applyTheme it to this app.
// Build nothing else.
//
// Done when: body text renders at 18 px, a test button is teal #0F766E with a light
// label, and every 700 step reaches 4.5:1 on white.
// ============================================================================
//
// It follows Scram's theme colour rules: base colours set
// each role, and only the exact hexes the design depends on are pinned.
// Pins:
//   - primary 800: the button fill is exactly the brand teal
//   - success / alert / error 700: exact AA-checked colours for status text
//   - custom1: focus ring only
//
// Not part of the theme (apply when building pages, only if asked):
//   3 px custom1 focus ring on every control; 2 px neutral 400 input borders; labels always visible.
//   textSize 7 gives 18 px body but large headings (h1 up to 88 px): cap h1 in the page brief.

export {};
const call = {
  explanation: "Clinic theme",
  operations: [{ createTheme: {
    id: "clinic",
    themeName: "Clinic",
    description: "Accessibility-first public service (healthcare, local government, charities): calm teal, high contrast, 18 px body text.",
    baseColors: { primary: "#0F766E", secondary: "#1E3A5F", neutral: "#4B5563", success: "#15803D", alert: "#B45309", error: "#B91C1C" },
    colorShadeOverrides: {
      primary: {"800": "#0F766E"},
      success: {"700": "#15803D"},
      alert: {"700": "#B45309"},
      error: {"700": "#B91C1C"},
      custom1: {"500": "#FFDD00"},
    },
    fonts: { heading: "Lexend", body: "Atkinson Hyperlegible" },
    textSize: 7, border: 2, roundness: 3,
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
