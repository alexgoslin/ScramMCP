// Scram themes (src/guides/typescript/): the theme is written as the exact manageThemes →
// createTheme call Scram's AI makes, as a TypeScript document, so the AI passes it through
// instead of interpreting it.
//
// checkTheme() checks a theme against Scram's theme rules (Nov 2026: the colour roles and shades,
// the scales, the fonts, icon libraries and colour scheme modes), in plain words, before anything
// is sent. When Scram's theme rules change, update this file.

import { readFileSync } from "node:fs";

const MAIN_ROLES = ["primary", "secondary", "neutral", "success", "alert", "error"];
const CUSTOM_ROLES = ["custom1", "custom2", "custom3", "custom4", "custom5"];
const ROLES = [...MAIN_ROLES, ...CUSTOM_ROLES];
const LEGACY = ["surface", "content"];
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const MODES = ["light-only", "dark-only", "switchable"];
const ICONS = ["feather", "hero-outline", "hero-solid", "lucide"];
const STEPS = { spacing: 9, textSize: 9, roundness: 9, border: 4, size: 4 };
const KEYS = ["id", "themeName", "description", "baseColors", "colorShadeOverrides", "fonts", ...Object.keys(STEPS), "iconLibrary", "colorSchemeMode", "reasoning"];
const HEX = /^#[0-9A-Fa-f]{6}$/;

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const hexProblem = (where, v) => (HEX.test(String(v)) ? null : `${where} is "${v}": a colour must be a hex with the #, like #26252C (6 digits)`);

// The theme, checked, and filled in (id from the name, reasoning from the description). Returns
// { theme, problems: [plain-English reasons] }: send it only if there are no problems.
export function checkTheme(input) {
  const problems = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { theme: null, problems: ["The theme must be an object (the createTheme payload)."] };
  const t = { ...input };
  for (const k of Object.keys(t)) {
    if (!KEYS.includes(k)) problems.push(`"${k}" isn't a theme setting (they are: ${KEYS.join(", ")}).`);
  }
  if (!t.themeName || typeof t.themeName !== "string") problems.push("themeName is missing.");
  if (!t.description || typeof t.description !== "string") problems.push("description is missing: one sentence on the look and who it's for.");
  t.id = t.id || slug(t.themeName);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(t.id)) problems.push(`id "${t.id}" must be a lowercase slug, like "my-theme".`);
  t.reasoning = t.reasoning || t.description;

  // Base colours: all six main roles; custom roles only as pins; no legacy roles.
  if (!t.baseColors || typeof t.baseColors !== "object") problems.push(`baseColors is missing: it needs all six of ${MAIN_ROLES.join(", ")}.`);
  else {
    for (const role of MAIN_ROLES) {
      if (t.baseColors[role] === undefined) problems.push(`baseColors.${role} is missing: all six main roles need a base colour.`);
      else {
        const p = hexProblem(`baseColors.${role}`, t.baseColors[role]);
        if (p) problems.push(p);
      }
    }
    for (const role of Object.keys(t.baseColors)) {
      if (LEGACY.includes(role)) problems.push(`baseColors.${role}: "${role}" is a legacy colour role: don't use it (use neutral shades for surfaces and text).`);
      else if (CUSTOM_ROLES.includes(role)) problems.push(`baseColors.${role}: custom roles have no base colour. Pin it in colorShadeOverrides instead, at 500.`);
      else if (!MAIN_ROLES.includes(role)) problems.push(`baseColors.${role}: there's no colour role "${role}" (they are: ${MAIN_ROLES.join(", ")}).`);
    }
  }

  // Pins: role → shade → hex (or null to remove a pin).
  if (t.colorShadeOverrides !== undefined) {
    if (typeof t.colorShadeOverrides !== "object" || t.colorShadeOverrides === null) problems.push("colorShadeOverrides must be role → shade → hex.");
    else {
      for (const [role, shades] of Object.entries(t.colorShadeOverrides)) {
        if (LEGACY.includes(role)) {
          problems.push(`colorShadeOverrides.${role}: "${role}" is a legacy colour role: don't use it.`);
          continue;
        }
        if (!ROLES.includes(role)) {
          problems.push(`colorShadeOverrides.${role}: there's no colour role "${role}" (they are: ${ROLES.join(", ")}).`);
          continue;
        }
        if (!shades || typeof shades !== "object") {
          problems.push(`colorShadeOverrides.${role} must be shade → hex, e.g. { "500": "#F97316" }.`);
          continue;
        }
        for (const [shade, hex] of Object.entries(shades)) {
          if (!SHADES.includes(String(shade))) problems.push(`colorShadeOverrides.${role}["${shade}"]: there's no shade ${shade} (shades are ${SHADES.join(", ")}).`);
          else if (hex !== null) {
            const p = hexProblem(`colorShadeOverrides.${role}["${shade}"]`, hex);
            if (p) problems.push(p);
          }
        }
      }
    }
  }

  // Fonts: one Google Font name each, no fallback stack.
  if (t.fonts !== undefined) {
    if (!t.fonts || typeof t.fonts !== "object") problems.push("fonts must be { heading, body }.");
    else
      for (const [k, v] of Object.entries(t.fonts)) {
        if (!["heading", "body"].includes(k)) problems.push(`fonts.${k}: only "heading" and "body" can be set.`);
        else if (typeof v !== "string" || !v.trim()) problems.push(`fonts.${k} must be a Google Font name.`);
        else if (/[,;]/.test(v) || /\b(sans-serif|serif|monospace|system-ui)\b/.test(v)) problems.push(`fonts.${k} is "${v}": one Google Font name only, no fallback stack.`);
      }
  }

  // Scales: steps, not px.
  for (const [k, max] of Object.entries(STEPS)) {
    if (t[k] === undefined) continue;
    if (!Number.isInteger(t[k]) || t[k] < 0 || t[k] > max) problems.push(`${k} is ${JSON.stringify(t[k])}: it's a step from 0 to ${max}, not px.`);
  }

  if (!ICONS.includes(t.iconLibrary)) problems.push(`iconLibrary is ${t.iconLibrary === undefined ? "missing" : `"${t.iconLibrary}"`}: it must be one of ${ICONS.join(", ")}.`);
  if (!MODES.includes(t.colorSchemeMode)) {
    problems.push(
      `colorSchemeMode is ${t.colorSchemeMode === undefined ? "missing" : `"${t.colorSchemeMode}"`}: it must be light-only, dark-only or switchable${/dark/i.test(t.colorSchemeMode || "") ? ' (a dark theme is "dark-only", never dark hexes)' : ""}.`
    );
  }
  return { theme: problems.length ? null : t, problems };
}

// Notes worth passing on with a checked theme (not problems).
export function themeNotes(t) {
  const notes = [];
  const pins = t.colorShadeOverrides || {};
  if (t.colorSchemeMode === "switchable" && Object.keys(pins).length) {
    notes.push("This theme is switchable: its pins land on the light side only. The dark side can't be pinned from the chat: the user sets it in Scram's theme editor if it matters.");
  }
  const p = pins.primary || {};
  if ((p["800"] && !p["50"]) || (p["50"] && !p["800"])) notes.push("Only one end of the solid-button pair (primary 800 fill / primary 50 label) is pinned: check the button label still reads clearly.");
  return notes;
}

// The theme as a TypeScript document: the exact manageThemes call (the theme template's form).
export function themeDocument(t, doneWhen) {
  const payload = JSON.stringify({ explanation: `${t.themeName} theme`, operations: [{ createTheme: t }] }, null, 2)
    .split("\n")
    .join("\n");
  return [
    "// ============================================================================",
    `// Scram theme: "${t.themeName}"`,
    "//",
    `// ${t.description}`,
    "//",
    "// For Scram's AI: call manageThemes with the payload below exactly as written.",
    `// If a theme named "${t.themeName}" already exists, send the same values as`,
    "// editTheme instead (changes.colors = baseColors), and set any existing pin",
    "// not listed below to null. Then applyTheme it to this app.",
    "// Build nothing else.",
    "//",
    `// Done when: ${String(doneWhen || "").replace(/\s+/g, " ").trim()}`,
    "// ============================================================================",
    "",
    "export {};",
    `const call = ${payload} satisfies ManageThemes;`,
    "",
    "// Read back, from the stored theme (not from this file):",
    "//   1. Theme id, name, colour scheme mode, both fonts",
    "//   2. Every pinned shade with its stored hex and variant (light or dark)",
    "//   3. The scale levels as stored",
    "//   4. Which app now uses this theme",
    "// Then stop.",
  ].join("\n");
}

// The six example themes (src/guides/typescript/theme-1-scram.ts …), as data.
let examples = null;
export function themeExamples() {
  if (!examples) {
    const raw = JSON.parse(readFileSync(new URL("./theme-examples.json", import.meta.url), "utf8"));
    examples = Object.fromEntries(Object.entries(raw).map(([file, v]) => [file.replace(/^theme-\d+-/, ""), v]));
  }
  return examples;
}
