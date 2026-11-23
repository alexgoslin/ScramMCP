// ============================================================================
// Scram theme 3 of 6: "Midnight"  (v3, 9 Nov 2026)
//
// Dark developer tool: near-black, electric violet, cyan and lime accents.
//
// For Scram's AI: call manageThemes with the payload below exactly as written.
// If a theme named "Midnight" already exists, send the same values as
// editTheme instead (changes.colors = baseColors), and set any existing pin
// not listed below to null. Then applyTheme it to this app.
// Build nothing else.
//
// Done when: the page is near-black with near-white text, and solid buttons are violet
// with a label that reads clearly (report the two hexes and their contrast).
// ============================================================================
//
// It follows Scram's theme colour rules: base colours set
// each role, and only the exact hexes the design depends on are pinned.
// Pins:
//   - dark-only reverses the generated scale (50 = darkest, 950 = lightest), so the page,
//   cards and text need NO pins. This replaces the hand-mirrored pins of v2.
//   - primary 500: the brand violet, exactly
//   - custom1: badge accent (pink)
//
// Not part of the theme (apply when building pages, only if asked):
//   JetBrains Mono for code and ids; 2 px secondary focus outline.

export {};
const call = {
  explanation: "Midnight theme",
  operations: [{ createTheme: {
    id: "midnight",
    themeName: "Midnight",
    description: "Dark developer tool: near-black, electric violet, cyan and lime accents.",
    baseColors: { primary: "#8B5CF6", secondary: "#22D3EE", neutral: "#71717A", success: "#A3E635", alert: "#FBBF24", error: "#F87171" },
    colorShadeOverrides: {
      primary: {"500": "#8B5CF6"},
      custom1: {"500": "#F472B6"},
    },
    fonts: { heading: "Space Grotesk", body: "Inter" },
    border: 2, roundness: 5,
    iconLibrary: "lucide",
    colorSchemeMode: "dark-only",
    reasoning: "Theme from the Scram theme set (v3)",
  } }],
} satisfies ManageThemes;

// Read back, from the stored theme (not from this file):
//   1. Theme id, name, colour scheme mode, both fonts
//   2. Every pinned shade with its stored hex and variant (light or dark)
//   3. The scale levels as stored
//   4. Which app now uses this theme
// Then stop.
