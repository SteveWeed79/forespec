#!/usr/bin/env node
// Selection-recall harness — the missing half of the trust story.
//
// The verifier-eval corpus proves the GRADER: hand it the vulnerable code and it grades
// it right. But on a real repo the pipeline is selection -> grader, and if selection hands
// the grader the WRONG file, you get a false-green the corpus never sees. This measures the
// selection half: for synthetic repos where we KNOW which file holds each checkpoint's
// issue, does selectForCheckpoint actually surface it? Pure, deterministic, zero API cost.
//
// Runs at a deliberately TIGHT budget so ranking + budget pressure actually bite (the real
// 60k budget wouldn't pressure tiny fixtures); a miss here is a real large-repo failure mode.
//
//   node repo-verify/selection-eval.mjs            # default tight budget
//   node repo-verify/selection-eval.mjs 20000      # custom budget

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLibrary } from "../library/resolve.mjs";
import { loadRepo, selectForCheckpoint, scoreFile, keywordsFor } from "./select.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "selection-fixtures");
const lib = loadLibrary();

const BUDGET = Number(process.argv[2]) || 9000;
const PERFILE = 3000;

export function measureRecall({ budget = BUDGET, perFile = PERFILE } = {}) {
  const repos = readdirSync(fixturesDir).filter((d) => {
    try { return statSync(join(fixturesDir, d)).isDirectory() && existsSync(join(fixturesDir, d, "_labels.json")); }
    catch { return false; }
  });
  const rows = [];
  for (const repo of repos) {
    const root = join(fixturesDir, repo);
    const { labels } = JSON.parse(readFileSync(join(root, "_labels.json"), "utf8"));
    const files = loadRepo(root);
    for (const [cpId, targets] of Object.entries(labels)) {
      const cp = lib.get(cpId);
      if (!cp) { rows.push({ repo, cpId, target: "(all)", missing: true }); continue; }
      const sel = selectForCheckpoint(files, cp, budget, perFile);
      const selected = new Set(sel.files.map((f) => f.path));
      const kw = keywordsFor(cp);
      const ranked = files.map((f) => ({ p: f.path, s: scoreFile(f, kw) })).sort((a, b) => b.s - a.s);
      for (const t of targets) {
        const rank = ranked.findIndex((r) => r.p === t);
        rows.push({ repo, cpId, target: t, inSlice: selected.has(t), rank: rank + 1, of: files.length, score: ranked[rank]?.s ?? 0 });
      }
    }
  }
  return rows;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("selection-eval.mjs")) {
  const rows = measureRecall();
  console.log(`\nSelection-recall — does selection surface the known-vulnerable file? (budget ${BUDGET}/perfile ${PERFILE})\n`);
  let hit = 0, total = 0;
  for (const r of rows) {
    if (r.missing) { console.log(`  ?    ${r.repo}/${r.cpId} — checkpoint not in library`); continue; }
    total++;
    if (r.inSlice) hit++;
    console.log(`  ${r.inSlice ? "ok  " : "MISS"} ${r.repo}/${r.cpId.padEnd(36)} → ${r.target.padEnd(30)} rank ${r.rank}/${r.of}, score ${r.score}${r.inSlice ? "" : "   ← NOT graded (false-green risk)"}`);
  }
  const misses = rows.filter((r) => !r.missing && !r.inSlice);
  console.log(`\nselection recall: ${hit}/${total} (${total ? ((hit / total) * 100).toFixed(0) : 0}%)`);
  if (misses.length) {
    console.log(`\n${misses.length} MISS(es) — selection would hand the grader the wrong file, so a real bug goes ungraded:`);
    for (const m of misses) console.log(`   ${m.repo}/${m.cpId} → ${m.target} (rank ${m.rank}, score ${m.score})`);
  }
  process.exit(misses.length ? 1 : 0);
}
