// The research skill for the user's own AI (src/skills/scram-research): a valid skill in the
// Agent Skills format (as Claude and the ChatGPT desktop app read it), with every reference file
// it points to and nothing internal; the ZIP Claude uploads; copying it into an app's skills folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { crc32, installSkill, RESEARCH_SKILL, saveSkillZip, skillFiles, skillFolders, skillInfo, skillText, skillZip } from "../src/skills.js";

const dir = new URL("../src/skills/", import.meta.url);

// Reads a ZIP back: { name: Buffer | null (a folder) }, checking each file's checksum.
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "has an end record");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    if (name.endsWith("/")) out[name] = null;
    else {
      assert.equal(crc32(data), crc, `${name}: checksum`);
      out[name] = data;
    }
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
}

test("every skill is valid: its name matches its folder, and Claude's limits are kept", () => {
  const names = readdirSync(dir);
  assert.ok(names.includes(RESEARCH_SKILL));
  for (const name of names) {
    const text = readFileSync(new URL(`${name}/SKILL.md`, dir), "utf8");
    assert.ok(text.startsWith("---\n"), `${name}: starts with frontmatter`);
    const info = skillInfo(text);
    assert.equal(info.name, name, "the name in SKILL.md is the folder's name");
    assert.match(info.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(info.name.length <= 64);
    assert.ok(info.description.length > 50 && info.description.length <= 200, `${name}: description is ${info.description.length} characters (Claude allows 200)`);
    assert.doesNotMatch(info.description, /[<>]/);
    assert.ok(text.split("\n").length < 500, `${name}: SKILL.md stays short (details go in references/)`);
  }
});

test("the research skill: every reference file it names is there, and every one is named", () => {
  const files = skillFiles(RESEARCH_SKILL).map((f) => f.path);
  const all = skillFiles(RESEARCH_SKILL).map((f) => f.data.toString("utf8")).join("\n");
  const named = new Set(all.match(/references\/[a-z-]+\.md/g));
  for (const ref of named) assert.ok(files.includes(ref), `${ref} is mentioned but missing`);
  for (const f of files.filter((p) => p !== "SKILL.md")) assert.ok(named.has(f), `${f} is never mentioned`);
  assert.deepEqual(files, ["SKILL.md", "references/category-research.md", "references/questions-and-briefing.md", "references/scram-limits.md", "references/screen-spec.md", "references/site-research.md", "references/tribunal.md"]);
});

test("the research skill: the user's AI researches (not Scram Desktop), safely, without copying, and nothing internal", () => {
  const text = skillText(RESEARCH_SKILL);
  assert.match(text, /\*\*You\*\* do the research, with your own tools/);
  assert.match(text, /Never use Scram Desktop's `scram_app_\*` tools on other websites/);
  assert.match(text, /Learn what it does, don't copy what it is/);
  assert.match(text, /Never sign up, log in, post, send, buy, invite, delete/);
  assert.match(text, /Never ask for their password/);
  assert.match(text, /seen[\s\S]*documented[\s\S]*inferred/);
  assert.match(text, /Show the list to the user and let them confirm/); // the products to study
  assert.match(text, /Effort is never a reason/);
  assert.match(text, /# File: references\/tribunal\.md/);
  // Public material only: no internal tools, datasets, prompts or repositories.
  assert.doesNotMatch(text, /market-selection|market dataset|Scram Not|internal|ScramAutoBot|RoboBuild|CloudWatch|codegen|house style/i);
  assert.doesNotMatch(text, /\r/);
});

test("the ZIP for Claude: the skill's folder at its top, every file intact, the same every time", () => {
  const buf = skillZip(RESEARCH_SKILL);
  const entries = unzip(buf);
  const names = Object.keys(entries);
  assert.ok(names.every((n) => n.startsWith(`${RESEARCH_SKILL}/`)), names.join(", "));
  assert.ok(names.includes(`${RESEARCH_SKILL}/`) && names.includes(`${RESEARCH_SKILL}/references/`));
  for (const f of skillFiles(RESEARCH_SKILL)) assert.deepEqual(entries[`${RESEARCH_SKILL}/${f.path}`], f.data, f.path);
  assert.deepEqual(skillZip(RESEARCH_SKILL), buf);
  const where = mkdtempSync(join(tmpdir(), "scram-skill-zip-"));
  const file = saveSkillZip(RESEARCH_SKILL, join(where, "Downloads"));
  assert.equal(file, join(where, "Downloads", `${RESEARCH_SKILL}.zip`));
  assert.deepEqual(readFileSync(file), buf);
});

test("copying it into an app's skills folder: added, then updated; someone else's folder left alone", () => {
  const home = mkdtempSync(join(tmpdir(), "scram-skill-home-"));
  const folders = skillFolders({ home, env: {} });
  assert.equal(folders.chatgpt, join(home, ".agents", "skills"));
  assert.equal(folders.claudeCode, join(home, ".claude", "skills"));
  assert.equal(skillFolders({ home, env: { CLAUDE_CONFIG_DIR: join(home, "cc") } }).claudeCode, join(home, "cc", "skills"));

  const added = installSkill(RESEARCH_SKILL, folders.chatgpt);
  assert.deepEqual(added, { ok: true, dir: join(folders.chatgpt, RESEARCH_SKILL), updated: false });
  for (const f of skillFiles(RESEARCH_SKILL)) assert.deepEqual(readFileSync(join(added.dir, ...f.path.split("/"))), f.data);
  // An older copy (with a file the new one no longer has) is replaced whole.
  writeFileSync(join(added.dir, "references", "old.md"), "old");
  const again = installSkill(RESEARCH_SKILL, folders.chatgpt);
  assert.equal(again.updated, true);
  assert.equal(existsSync(join(added.dir, "references", "old.md")), false);
  assert.deepEqual(readdirSync(folders.chatgpt), [RESEARCH_SKILL]); // nothing left over beside it

  // A folder of that name that isn't this skill.
  const other = join(folders.claudeCode, RESEARCH_SKILL);
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "SKILL.md"), "---\nname: something-else\ndescription: Not ours.\n---\n");
  const refused = installSkill(RESEARCH_SKILL, folders.claudeCode);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /isn't Scram Desktop's skill/);
  assert.equal(readFileSync(join(other, "SKILL.md"), "utf8").includes("something-else"), true);
});
