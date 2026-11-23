// TypeScript briefs (the staged-brief method, src/guides/briefs.md): for big requests
// only. A brief is kept in Scram Desktop, on the user's computer, so it outlives any one chat; it
// is sent to Scram's bot one batch at a time, each with the brief's conventions so the bot
// knows how to read it.
//
// A batch is a section that starts with a header like
//   // ============================================================================
//   // BATCH 1 — Tables, the core page, the admin page.
//   // Done when: …
//   // ============================================================================
// and runs to the next batch's header (or the end of the file).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ScramError } from "./driver.js";

const MAX_BYTES = 400000;
const RULE = /^\s*\/\/\s*={8,}\s*$/;
const BATCH = /^\s*\/\/\s*BATCH\s+(\d+)\s*(?:[—–:-]\s*)?(.*)$/i;

// The brief's name as a file name: lowercase letters, digits and hyphens only.
export function briefName(name) {
  const n = String(name || "")
    .toLowerCase()
    .replace(/\.ts$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!n) throw new ScramError("Give the brief a name, e.g. \"bakery-orders\".");
  return n;
}

// The CONVENTIONS block (between the dashed lines around it), or the template's if the brief
// has none: Scram's bot needs it to read the brief the intended way.
export function conventionsOf(text) {
  const lines = String(text).split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*\/\/\s*CONVENTIONS\b/.test(l));
  if (at >= 0) {
    const dashed = (l) => /^\s*\/\/\s*-{8,}\s*$/.test(l);
    let start = at;
    while (start > 0 && !dashed(lines[start - 1]) && at - start < 3) start--;
    if (start > 0 && dashed(lines[start - 1])) start--;
    let end = at + 1;
    while (end < lines.length && !dashed(lines[end]) && !RULE.test(lines[end])) end++;
    return lines.slice(start, Math.min(end + 1, lines.length)).join("\n").trim();
  }
  return conventionsOf(readFileSync(new URL("../guides/typescript/brief-template.ts", import.meta.url), "utf8"));
}

// The batches: [{ n, title, doneWhen, text }], in the order they appear.
export function batchesOf(text) {
  const lines = String(text).split(/\r?\n/);
  const heads = [];
  lines.forEach((l, i) => {
    const m = BATCH.exec(l);
    if (m) heads.push({ i, n: Number(m[1]), title: m[2].replace(/\.\s*$/, "").trim() });
  });
  return heads.map((h, k) => {
    const start = h.i > 0 && RULE.test(lines[h.i - 1]) ? h.i - 1 : h.i;
    const next = heads[k + 1];
    const end = next ? (next.i > 0 && RULE.test(lines[next.i - 1]) ? next.i - 1 : next.i) : lines.length;
    // "// Done when: …" in the header, which may run over several comment lines.
    let doneWhen = "";
    for (let j = h.i + 1; j < end && !RULE.test(lines[j]); j++) {
      const m = /^\s*\/\/\s*Done when:\s*(.*)$/i.exec(lines[j]);
      if (m) {
        doneWhen = m[1];
        for (let x = j + 1; x < end && !RULE.test(lines[x]) && /^\s*\/\/\s{1,}\S/.test(lines[x]); x++) doneWhen += ` ${lines[x].replace(/^\s*\/\/\s*/, "")}`;
        break;
      }
    }
    return { n: h.n, title: h.title, doneWhen: doneWhen.trim(), text: lines.slice(start, end).join("\n").trim() };
  });
}

// What's sent to Scram's bot for one batch: what to do, the preamble (answers, fixes first),
// the conventions, then the batch.
export function batchMessage(text, batch, preamble = "") {
  return [
    `This is batch ${batch.n} of a staged brief, written as TypeScript: it describes the app (interfaces are tables, enums are dropdowns, functions are actions, Page* are pages, comments are rules); it is not code to run. Read the conventions first. Then build ONLY this batch. When it's built, do the read-back the batch asks for (if it gives one), tell me anything you'd like me to answer, and stop.`,
    String(preamble || "").trim() && `Before this batch:\n${String(preamble).trim()}`,
    conventionsOf(text),
    batch.text,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export class Briefs {
  constructor(dir) {
    this.dir = dir;
  }

  file(name) {
    return join(this.dir, `${briefName(name)}.ts`);
  }

  list() {
    let names = [];
    try {
      names = readdirSync(this.dir).filter((f) => f.endsWith(".ts"));
    } catch {
      /* none yet */
    }
    return names.map((f) => {
      const text = readFileSync(join(this.dir, f), "utf8");
      return { name: f.replace(/\.ts$/, ""), batches: batchesOf(text).map((b) => `${b.n}: ${b.title}`), changed: statSync(join(this.dir, f)).mtime.toISOString() };
    });
  }

  read(name) {
    const file = this.file(name);
    if (!existsSync(file)) throw new ScramError(`There's no brief called “${briefName(name)}”. Briefs saved: ${this.list().map((b) => b.name).join(", ") || "none"}.`);
    return readFileSync(file, "utf8");
  }

  save(name, text) {
    text = String(text || "");
    if (!text.trim()) throw new ScramError("The brief is empty.");
    if (Buffer.byteLength(text) > MAX_BYTES) throw new ScramError(`That brief is over ${MAX_BYTES / 1000} KB: split it into separate briefs.`);
    mkdirSync(this.dir, { recursive: true });
    const file = this.file(name);
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
    return { name: briefName(name), file, batches: batchesOf(text) };
  }

  batch(name, n) {
    const text = this.read(name);
    const all = batchesOf(text);
    const b = all.find((x) => x.n === Number(n));
    if (!b) throw new ScramError(`The brief “${briefName(name)}” has no batch ${n}. Its batches: ${all.map((x) => x.n).join(", ") || "none (mark each with a // BATCH n — title header)"}.`);
    return { text, batch: b, all };
  }
}
