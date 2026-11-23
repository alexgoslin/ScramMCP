// Skills for the user's own AI (Claude, ChatGPT…), in the Agent Skills format: a folder with a
// SKILL.md and its reference files (src/skills/). The research skill is the research phase the
// RoboBuild extension did, done by the user's AI with its own tools. Scram Desktop only hands the
// skill over: as a ZIP to upload (Claude's Customize → Skills), or copied into the folder an app
// reads personal skills from (the ChatGPT desktop app, Claude Code). It researches nothing itself.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

export const RESEARCH_SKILL = "scram-research";
// Claude's page for adding skills (Customize → Skills).
export const CLAUDE_SKILLS_PAGE = "https://claude.ai/customize/skills";

const ROOT = fileURLToPath(new URL("./skills/", import.meta.url));

// The skill's files, [{ path: "SKILL.md" | "references/….md", data }], in a fixed order.
export function skillFiles(name) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const path = rel ? `${rel}/${entry}` : entry;
      if (statSync(full).isDirectory()) walk(full, path);
      else out.push({ path, data: readFileSync(full) });
    }
  };
  walk(join(ROOT, name), "");
  return out;
}

// The name and description in a SKILL.md's frontmatter (the lines between the first two "---").
export function skillInfo(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text));
  const field = (k) => (m ? new RegExp(`^${k}:\\s*(.*)$`, "m").exec(m[1])?.[1].trim() || "" : "");
  return { name: field("name"), description: field("description") };
}

// The whole skill as one text (SKILL.md, then each reference file under its path), for agents
// without the skill: scram_guide topic "research".
export function skillText(name) {
  return skillFiles(name)
    .sort((a, b) => (a.path === "SKILL.md" ? -1 : b.path === "SKILL.md" ? 1 : a.path.localeCompare(b.path)))
    .map((f) => {
      const text = f.data.toString("utf8").replace(/\r\n/g, "\n").trim();
      return f.path === "SKILL.md" ? text : `---\n\n# File: ${f.path}\n\n${text}`;
    })
    .join("\n\n");
}

// ------------------------------------------------------------------ the ZIP (for Claude)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A ZIP of entries [{ name, data }] (a name ending in "/" is a folder), compressed, with UTF-8
// names and a fixed date, so the same skill always makes the same file.
export function zip(entries) {
  const DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 1 January 2026, 00:00
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const folder = e.name.endsWith("/");
    const raw = folder ? Buffer.alloc(0) : Buffer.from(e.data);
    const data = folder ? raw : deflateRawSync(raw);
    const crc = folder ? 0 : crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(folder ? 0 : 8, 8); // stored / deflated
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(folder ? 0 : 8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(folder ? 0x10 : 0, 38); // a folder's attribute
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// The skill as Claude wants it: a ZIP with the skill's folder at its top.
export function skillZip(name) {
  const files = skillFiles(name);
  const folders = [...new Set(files.flatMap((f) => f.path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))))].sort();
  return zip([{ name: `${name}/` }, ...folders.map((d) => ({ name: `${name}/${d}/` })), ...files.map((f) => ({ name: `${name}/${f.path}`, data: f.data }))]);
}

// Saves the ZIP in `dir` (e.g. Downloads) and returns its path.
export function saveSkillZip(name, dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.zip`);
  writeFileSync(file, skillZip(name));
  return file;
}

// ------------------------------------------------------------------ copying it into an app's folder

// The folders apps read personal skills from.
export function skillFolders({ env = process.env, home = homedir() } = {}) {
  return {
    chatgpt: join(home, ".agents", "skills"), // the ChatGPT desktop app (and OpenAI's Codex)
    claudeCode: join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "skills"),
  };
}

// Copies the skill to `root`/`name`, replacing an older copy of it. A folder of that name that
// isn't this skill (no SKILL.md with this name) is left alone.
export function installSkill(name, root) {
  const dir = join(root, name);
  const existed = existsSync(dir);
  if (existed) {
    let ours = false;
    try {
      ours = skillInfo(readFileSync(join(dir, "SKILL.md"), "utf8")).name === name;
    } catch {
      /* no SKILL.md */
    }
    if (!ours) return { ok: false, dir, reason: `There's already a folder called “${name}” in ${root} that isn't Scram Desktop's skill, so Scram Desktop left it alone.` };
  }
  // Written beside it first, then swapped in, so a half-written copy is never left in its place.
  const fresh = join(root, `.${name}-new-${process.pid}`);
  rmSync(fresh, { recursive: true, force: true });
  for (const f of skillFiles(name)) {
    const to = join(fresh, ...f.path.split("/"));
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, f.data);
  }
  rmSync(dir, { recursive: true, force: true });
  renameSync(fresh, dir);
  return { ok: true, dir, updated: existed };
}
