// Forespec HTML report — the visual surface for people who don't live in a
// terminal. A pure, zero-dependency function: it takes the SAME data verify.mjs
// already computes (results, rollup, gaps) and returns one self-contained HTML
// document (inline CSS + a tiny theme-toggle script, no external requests). It
// reports what the verifier decided; it never grades and never changes a verdict.
//
//   renderReport({ project, archetype, version, adapter, model, generatedAt,
//                  results, rollup, gaps, checkpoints }) -> string (full HTML doc)

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const CSS = `
  :root {
    --ground:#f3f5f9; --surface:#fff; --surface-2:#e9edf3; --ink:#18202d; --muted:#576273;
    --faint:#8a94a3; --border:#e1e5ec; --border-strong:#ccd3dd; --brand:#3a6ea5; --brand-strong:#2c557f;
    --good:#2f9166; --good-strong:#1c7c52; --good-bg:#e6f3ec; --warn:#ab7318; --warn-bg:#f7edd8;
    --crit:#bd4630; --crit-bg:#f8e6e1; --gap:#7856cc; --gap-bg:#ece5fa;
    --shadow:0 1px 2px rgba(20,32,54,.05),0 6px 22px rgba(20,32,54,.06); --radius:12px;
    --mono:ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code",Menlo,Consolas,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  @media (prefers-color-scheme:dark){:root{
    --ground:#0d121b; --surface:#151d29; --surface-2:#1e2836; --ink:#e7ebf2; --muted:#97a2b3;
    --faint:#6b7789; --border:#263140; --border-strong:#33404f; --brand:#6ea3de; --brand-strong:#8fbaf0;
    --good:#45b586; --good-strong:#58c294; --good-bg:#123024; --warn:#d69f47; --warn-bg:#34290f;
    --crit:#e2765f; --crit-bg:#3a1c17; --gap:#a488ea; --gap-bg:#221a3a;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 26px rgba(0,0,0,.34);
  }}
  :root[data-theme="light"]{
    --ground:#f3f5f9; --surface:#fff; --surface-2:#e9edf3; --ink:#18202d; --muted:#576273; --faint:#8a94a3;
    --border:#e1e5ec; --border-strong:#ccd3dd; --brand:#3a6ea5; --brand-strong:#2c557f; --good:#2f9166;
    --good-strong:#1c7c52; --good-bg:#e6f3ec; --warn:#ab7318; --warn-bg:#f7edd8; --crit:#bd4630;
    --crit-bg:#f8e6e1; --gap:#7856cc; --gap-bg:#ece5fa; --shadow:0 1px 2px rgba(20,32,54,.05),0 6px 22px rgba(20,32,54,.06);
  }
  :root[data-theme="dark"]{
    --ground:#0d121b; --surface:#151d29; --surface-2:#1e2836; --ink:#e7ebf2; --muted:#97a2b3; --faint:#6b7789;
    --border:#263140; --border-strong:#33404f; --brand:#6ea3de; --brand-strong:#8fbaf0; --good:#45b586;
    --good-strong:#58c294; --good-bg:#123024; --warn:#d69f47; --warn-bg:#34290f; --crit:#e2765f; --crit-bg:#3a1c17;
    --gap:#a488ea; --gap-bg:#221a3a; --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 26px rgba(0,0,0,.34);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1000px;margin:0 auto;padding:32px 22px 80px}
  .top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:11px}
  .brand .name{font-size:19px;font-weight:700;letter-spacing:-.02em}
  .brand .name b{color:var(--brand);font-weight:700}
  .top-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
  .run-meta{font-family:var(--mono);font-size:11.5px;color:var(--muted);text-align:right;line-height:1.5}
  .run-meta b{color:var(--ink);font-weight:600}
  .tgl{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--surface);border:1px solid var(--border);
    border-radius:7px;padding:4px 9px;cursor:pointer}
  .tgl:hover{border-color:var(--border-strong)}
  .tgl:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  .horizon{height:2px;margin:20px 0 30px;border:0;background:linear-gradient(90deg,var(--brand),transparent 78%);border-radius:2px}
  .verdict{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:26px 26px 24px;margin-bottom:22px}
  .verdict-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  .verdict-badge{display:inline-flex;align-items:center;gap:9px;font-size:27px;font-weight:750;letter-spacing:-.025em;color:var(--good-strong)}
  .verdict-badge .dot{width:12px;height:12px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px var(--good-bg)}
  .verdict-badge.bad{color:var(--crit)}
  .verdict-badge.bad .dot{background:var(--crit);box-shadow:0 0 0 4px var(--crit-bg)}
  .verdict-rule{font-family:var(--mono);font-size:12px;color:var(--muted)}
  .verdict p{margin:12px 0 0;max-width:66ch;color:var(--muted);font-size:15px}
  .verdict p b{color:var(--ink);font-weight:600}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}
  @media (max-width:620px){.tiles{grid-template-columns:repeat(2,1fr)}}
  .tile{border:1px solid var(--border);border-radius:10px;padding:13px 14px;background:var(--ground);position:relative;overflow:hidden}
  .tile .n{font-family:var(--mono);font-size:30px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
  .tile .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:7px}
  .tile .stripe{position:absolute;left:0;top:0;bottom:0;width:3px}
  .tile.t-hard .n{color:var(--good-strong)}.tile.t-hard .stripe{background:var(--good-strong)}
  .tile.t-ship .n{color:var(--good)}.tile.t-ship .stripe{background:var(--good)}
  .tile.t-warn .n{color:var(--warn)}.tile.t-warn .stripe{background:var(--warn)}
  .tile.t-gap .n{color:var(--gap)}.tile.t-gap .stripe{background:var(--gap)}
  .band{margin-top:30px}
  .band-head{display:flex;align-items:center;gap:11px;margin-bottom:3px}
  .band-head .chip{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.04em;padding:3px 9px;border-radius:999px}
  .band-head .chip.warn{color:var(--warn);background:var(--warn-bg)}
  .band-head .chip.ship{color:var(--good);background:var(--good-bg)}
  .band-head .chip.hard{color:var(--good-strong);background:var(--good-bg)}
  .band-head .count{font-family:var(--mono);font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
  .band-note{font-size:13px;color:var(--muted);margin:0 0 13px}
  .cp{background:var(--surface);border:1px solid var(--border);border-radius:11px;margin-bottom:9px;box-shadow:var(--shadow);overflow:hidden}
  .cp>summary{list-style:none;cursor:pointer;padding:14px 16px;display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"sev title level" "meter meter meter";gap:6px 12px;align-items:center}
  .cp>summary::-webkit-details-marker{display:none}
  .cp>summary:focus-visible{outline:2px solid var(--brand);outline-offset:-2px;border-radius:8px}
  .cp-sev{grid-area:sev;font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.07em;padding:3px 7px;border-radius:5px;align-self:center}
  .cp-sev.critical{color:var(--crit);background:var(--crit-bg)}
  .cp-sev.high{color:var(--muted);background:var(--surface-2)}
  .cp-sev.medium,.cp-sev.low{color:var(--faint);background:var(--surface-2)}
  .cp-title{grid-area:title;font-weight:600;font-size:15px;letter-spacing:-.01em;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
  .cp-title .id{font-family:var(--mono);font-size:11px;font-weight:400;color:var(--faint)}
  .cp-level{grid-area:level;font-family:var(--mono);font-weight:600;font-size:21px;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:2px}
  .cp-level .u{font-size:10px;color:var(--faint);letter-spacing:.05em}
  .lv-9 .cp-level{color:var(--good-strong)}.lv-6 .cp-level{color:var(--good)}.lv-3 .cp-level{color:var(--warn)}
  .meter{grid-area:meter;position:relative;height:9px;border-radius:6px;background:var(--surface-2);margin-top:5px}
  .meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:6px;transform-origin:left center;animation:grow .9s cubic-bezier(.2,.7,.2,1) both}
  .lv-9 .meter .fill{background:linear-gradient(90deg,var(--good),var(--good-strong))}
  .lv-6 .meter .fill{background:var(--good)}
  .lv-3 .meter .fill{background:var(--warn)}
  .meter .ship{position:absolute;left:66.667%;top:-4px;bottom:-4px;width:0;border-left:2px dashed var(--faint);opacity:.8}
  @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @media (prefers-reduced-motion:reduce){.meter .fill{animation:none}}
  .cp-body{padding:14px 16px 17px;border-top:1px solid var(--border);display:grid;gap:12px}
  .field .lbl{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:4px}
  .field p{margin:0;font-size:13.5px;color:var(--muted);max-width:74ch}
  .field.gap p{color:var(--ink)}
  .ev{display:flex;flex-wrap:wrap;gap:6px}
  .ev code{font-family:var(--mono);font-size:11px;color:var(--brand-strong);background:var(--ground);border:1px solid var(--border);border-radius:6px;padding:2px 7px}
  .conf{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--muted)}
  .conf .track{width:70px;height:4px;border-radius:3px;background:var(--surface-2);position:relative;overflow:hidden}
  .conf .track i{position:absolute;left:0;top:0;bottom:0;background:var(--faint);border-radius:3px}
  .gaps{margin-top:34px;border:1px dashed var(--border-strong);border-radius:var(--radius);padding:22px 24px;background:color-mix(in srgb,var(--gap-bg) 55%,var(--surface));display:flex;gap:16px;align-items:flex-start}
  .gaps .mk{flex:none;width:34px;height:34px;border-radius:9px;background:var(--surface);border:1px solid var(--border);display:grid;place-items:center;color:var(--gap)}
  .gaps h3{margin:0 0 4px;font-size:15px;letter-spacing:-.01em}
  .gaps p{margin:0;font-size:13.5px;color:var(--muted);max-width:70ch}
  .gaps .allclear{color:var(--gap);font-weight:600}
  .gaplist{margin-top:14px;display:grid;gap:10px}
  .gaprow{border:1px solid var(--border);border-radius:10px;background:var(--surface);padding:13px 15px}
  .gaprow .gh{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
  .gaprow .u{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.06em;padding:2px 7px;border-radius:5px}
  .gaprow .u.now{color:var(--warn);background:var(--warn-bg)}
  .gaprow .u.soon{color:var(--brand-strong);background:var(--gap-bg)}
  .gaprow .gt{font-weight:600;font-size:14px}
  .gaprow .gid{font-family:var(--mono);font-size:11px;color:var(--faint)}
  .gaprow p{margin:7px 0 0;font-size:13px;color:var(--muted);max-width:74ch}
  .legend{margin-top:34px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px 26px}
  @media (max-width:620px){.legend{grid-template-columns:1fr}}
  .legend .row{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--muted)}
  .legend .sw{flex:none;width:13px;height:13px;border-radius:4px;margin-top:3px}
  .legend .sw.shipmark{background:transparent;border-left:2px dashed var(--faint);border-radius:0;width:2px;margin-left:5px}
  .legend b{color:var(--ink);font-weight:600}
  .minor{margin-top:26px;font-family:var(--mono);font-size:12px;color:var(--muted)}
  .minor b{color:var(--ink)}
  .honesty{margin-top:30px;padding-top:20px;border-top:1px solid var(--border);font-size:12.5px;color:var(--muted);max-width:74ch}
  .honesty b{color:var(--ink)}
  .foot{margin-top:22px;font-family:var(--mono);font-size:11px;color:var(--faint)}
`;

const BRAND_MARK = `<svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
  <circle cx="15" cy="15" r="13" stroke="var(--brand)" stroke-width="1.6"/>
  <circle cx="15" cy="15" r="5.4" stroke="var(--brand)" stroke-width="1.6"/>
  <path d="M15 1.6v6.2M15 22.2v6.2M1.6 15h6.2M22.2 15h6.2" stroke="var(--brand)" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="15" cy="15" r="1.7" fill="var(--brand)"/></svg>`;

const BANDS = [
  { level: 3, cls: "warn", label: "Worth tightening", gapLabel: "To reach shippable (6)",
    note: "A risky property is present in the code. Not blocking — but the honest read is that it's reachable and worth fixing." },
  { level: 6, cls: "ship", label: "Shippable", gapLabel: "To reach hardened (9)",
    note: "The guarded property holds and the code is production-ready." },
  { level: 9, cls: "hard", label: "Hardened", gapLabel: "Further hardening",
    note: "Shippable, plus real hardening — tests, replay/timing defenses, audit trails." },
];
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function renderRow(r, title) {
  const pct = ((r.level / 9) * 100).toFixed(2);
  const band = BANDS.find((b) => b.level === r.level) || BANDS[0];
  const sev = r.severity || "high";
  const ev = (r.evidence || []).map((f) => `<code>${esc(f)}</code>`).join("");
  const conf = typeof r.confidence === "number" ? r.confidence : null;
  return `<details class="cp lv-${r.level}">
    <summary>
      <span class="cp-sev ${esc(sev)}">${sev === "critical" ? "CRIT" : sev.toUpperCase()}</span>
      <span class="cp-title">${esc(title)} <span class="id">${esc(r.id)}</span></span>
      <span class="cp-level">${r.level}<span class="u">/9</span></span>
      <div class="meter"><span class="ship"></span><span class="fill" style="width:${pct}%"></span></div>
    </summary>
    <div class="cp-body">
      ${r.rationale ? `<div class="field why"><span class="lbl">Why this grade</span><p>${esc(r.rationale)}</p></div>` : ""}
      ${r.gap ? `<div class="field gap"><span class="lbl">${band.gapLabel}</span><p>${esc(r.gap)}</p></div>` : ""}
      ${ev ? `<div class="field"><span class="lbl">Files read</span><div class="ev">${ev}</div></div>` : ""}
      ${conf != null ? `<span class="conf">confidence ${conf.toFixed(2)}<span class="track"><i style="width:${(conf * 100).toFixed(0)}%"></i></span></span>` : ""}
    </div>
  </details>`;
}

export function renderReport({ project, archetype, version, adapter, model, generatedAt, results, rollup, gaps, checkpoints }) {
  const titleOf = new Map((checkpoints || []).map((c) => [c.id, c.title || c.id]));
  const assessed = results.filter((r) => r.applicable !== false && r.level != null);
  const errored = results.filter((r) => r.applicable !== false && r.level == null);
  const gapItems = (gaps && gaps.items) || [];
  const gapIds = new Set(gapItems.map((g) => g.id));
  const naQuiet = results.filter((r) => r.applicable === false && !gapIds.has(r.id));

  const count = (lvl) => assessed.filter((r) => r.level === lvl).length;
  const shippable = !!(rollup && rollup.shippable);
  const great = !!(rollup && rollup.great);
  const blocking = (rollup && rollup.blocking) || [];
  // State the REAL gate, never a hardcoded "critical": portfolio gates on critical+high, a
  // demoted gate must confess, and conclusive===false is its own verdict — rendering it as
  // "Not shippable: criticals below the line" fabricates a basis about checkpoints that were
  // never assessed. This report may only say what the rollup actually established.
  const gateTiers = (rollup && rollup.gate_tiers) || ["critical"];
  const gateLabel = esc((rollup && rollup.gate_tier) || gateTiers.join("+"));
  const conclusive = rollup ? rollup.conclusive !== false : true;
  const demotion = rollup && rollup.gate_demotion;
  const gatedAll = assessed.filter((r) => gateTiers.includes(r.severity));
  const gateRule = `<span class="verdict-rule">gate: every <b style="color:var(--ink)">${gateLabel}</b> checkpoint ≥ 6</span>`;
  const sevLabel = (rows) => {
    const sevs = [...new Set(rows.map((r) => r.severity))];
    return sevs.length === 1 ? `${esc(sevs[0])}-severity` : "lower-tier";
  };

  // ---- verdict ----
  let badge, sub;
  if (!conclusive) {
    badge = `<span class="verdict-badge bad"><span class="dot"></span>Inconclusive</span>${gateRule}`;
    sub = `Nothing gradable was found — every checkpoint came back not-applicable or errored. <b>This is NOT a pass:</b> no ${gateLabel} checkpoint was assessed.${errored.length ? ` ${errored.length} checkpoint(s) errored.` : ""}`;
  } else if (shippable) {
    const nine = count(9);
    const threes = assessed.filter((r) => r.level === 3);
    badge = `<span class="verdict-badge"><span class="dot"></span>${great ? "Hardened" : "Shippable"}</span>${gateRule}`;
    const parts = [];
    parts.push(`All <b>${gatedAll.length} ${gateLabel}</b> checkpoint${gatedAll.length === 1 ? "" : "s"} clear the ship line${nine ? ` — <b>${nine} hardened</b> (level 9)` : ""}.`);
    if (threes.length) parts.push(`<b>${threes.length} ${sevLabel(threes)}</b> item${threes.length === 1 ? "" : "s"} at level 3 ${threes.length === 1 ? "is" : "are"} worth tightening; none block release.`);
    parts.push(gapItems.length ? `<b>${gapItems.length}</b> required checkpoint${gapItems.length === 1 ? "" : "s"} not built yet — see gaps below.` : `Nothing required is missing — zero gaps.`);
    sub = parts.join(" ");
  } else {
    badge = `<span class="verdict-badge bad"><span class="dot"></span>Not shippable</span>${gateRule}`;
    const list = blocking.length ? `: <b>${blocking.map(esc).join(", ")}</b>` : "";
    sub = blocking.length
      ? `<b>${blocking.length}</b> ${gateLabel} checkpoint${blocking.length === 1 ? "" : "s"} sit${blocking.length === 1 ? "s" : ""} below the ship line${list}. Fix ${blocking.length === 1 ? "it" : "these"} before release.${errored.length ? ` ${errored.length} checkpoint(s) could not be graded.` : ""}`
      : errored.length
        ? `<b>${errored.length}</b> checkpoint(s) could not be graded — an ungraded ${gateLabel} checkpoint blocks the gate.`
        : `The ${gateLabel} gate did not clear.`;
  }
  if (demotion) {
    sub = `<b>⚠ Gate demoted ${esc(demotion.from)} → ${esc(demotion.to)}:</b> ${esc(demotion.reason)}. The ${esc(demotion.from)} tier was <b>not</b> cleared. ` + sub;
  }
  if (rollup && rollup.adapter_degraded) {
    sub = `<b>⚠ Graded by the mock keyword baseline (no API key) — not the validated reasoning verifier. Do not trust this verdict for a ship decision.</b> ` + sub;
  }

  // ---- tiles ----
  const tiles = [
    { cls: "t-hard", n: count(9), k: "hardened · 9" },
    { cls: "t-ship", n: count(6), k: "shippable · 6" },
    { cls: "t-warn", n: count(3), k: "to tighten · 3" },
    { cls: "t-gap", n: gapItems.length, k: "gaps missing" },
  ].map((t) => `<div class="tile ${t.cls}"><span class="stripe"></span><div class="n">${t.n}</div><div class="k">${t.k}</div></div>`).join("");

  // ---- bands ----
  const bandsHtml = BANDS.map((band) => {
    const rows = assessed.filter((r) => r.level === band.level).sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || (a.id < b.id ? -1 : 1));
    if (!rows.length) return "";
    return `<section class="band">
      <div class="band-head"><span class="chip ${band.cls}">${band.label}</span><span class="count">${rows.length} checkpoint${rows.length === 1 ? "" : "s"}</span></div>
      <p class="band-note">${band.note}</p>
      ${rows.map((r) => renderRow(r, titleOf.get(r.id) || r.id)).join("")}
    </section>`;
  }).join("");

  // ---- gaps panel ----
  let gapsHtml;
  if (gapItems.length) {
    const rows = gapItems.map((g) => `<div class="gaprow">
      <div class="gh"><span class="u ${g.urgency === "now" ? "now" : "soon"}">${(g.urgency || "soon").toUpperCase()}</span>
        <span class="gt">${esc(g.headline || g.id)}</span><span class="gid">${esc(g.id)} · ${esc(g.severity || "")}</span></div>
      ${g.why_your_archetype ? `<p>${esc(g.why_your_archetype)}</p>` : ""}
      ${g.what_good_looks_like ? `<p><b style="color:var(--ink)">Built right:</b> ${esc(g.what_good_looks_like)}</p>` : ""}
    </div>`).join("");
    gapsHtml = `<section class="gaps" style="display:block">
      <h3 style="margin-bottom:6px">Gaps ahead — ${gapItems.length} required checkpoint${gapItems.length === 1 ? "" : "s"} not built yet</h3>
      <p>These are the backbone your <b>${esc(archetype)}</b> archetype requires but the repo has no code for yet — surfaced now, so they're a week-one decision instead of a month-three surprise.</p>
      <div class="gaplist">${rows}</div></section>`;
  } else {
    gapsHtml = `<section class="gaps">
      <div class="mk"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div><h3>Gaps ahead</h3><p><span class="allclear">Nothing required is missing.</span> Every checkpoint the ${esc(archetype)} archetype insists on has real code behind it. On a younger repo this panel is where the foresight lives — the required backbone that isn't there yet, called out early.</p></div>
    </section>`;
  }

  const designSkipped = (rollup && rollup.design_skipped) || [];
  const minorHtml =
    (naQuiet.length ? `<p class="minor"><b>Not applicable (${naQuiet.length}):</b> ${naQuiet.map((r) => esc(r.id)).join(", ")} — no code relevant to ${naQuiet.length === 1 ? "this checkpoint" : "these checkpoints"} in the repo.</p>` : "") +
    (errored.length ? `<p class="minor"><b>Could not grade (${errored.length}):</b> ${errored.map((r) => esc(r.id)).join(", ")}.</p>` : "") +
    (designSkipped.length ? `<p class="minor"><b>⚠ Not reviewed (${designSkipped.length} design checkpoint${designSkipped.length === 1 ? "" : "s"}):</b> ${designSkipped.map(esc).join(", ")} — design isn't reliably gradable from source, so this run skipped it. For a design/a11y verdict, run <code>forespec design &lt;url&gt;</code> against the live page.</p>` : "");

  const meta = [
    project ? `project <b>${esc(project)}</b>` : "",
    `archetype <b>${esc(archetype)}${version ? " v" + esc(version) : ""}</b>`,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const meta2 = `verifier <b>${esc(adapter)}</b>${model ? ` (${esc(model)})` : ""} &nbsp;·&nbsp; ${assessed.length} checkpoint${assessed.length === 1 ? "" : "s"} graded`;

  const body = `<div class="wrap">
    <header class="top">
      <div class="brand">${BRAND_MARK}<span class="name"><b>Forespec</b> · backbone report</span></div>
      <div class="top-right">
        <button class="tgl" id="themeToggle" type="button">◐ theme</button>
        <div class="run-meta">${meta}<br>${meta2}${generatedAt ? `<br>${esc(generatedAt)}` : ""}</div>
      </div>
    </header>
    <hr class="horizon">
    <section class="verdict">
      <div class="verdict-head">${badge}</div>
      <p>${sub}</p>
      <div class="tiles">${tiles}</div>
    </section>
    <main>${bandsHtml || `<p class="minor">No applicable checkpoints were graded in this run.</p>`}</main>
    ${gapsHtml}
    <section class="legend" aria-label="How to read this">
      <div class="row"><span class="sw" style="background:var(--warn)"></span><span><b>Level 3 — a risk is present.</b> The guarded property is reachable in the code. Not a breach; worth fixing.</span></div>
      <div class="row"><span class="sw" style="background:var(--good)"></span><span><b>Level 6 — shippable.</b> The property holds and the code is production-ready.</span></div>
      <div class="row"><span class="sw" style="background:var(--good-strong)"></span><span><b>Level 9 — hardened.</b> Shippable plus real defenses: tests, replay/timing guards.</span></div>
      <div class="row"><span class="sw shipmark"></span><span><b>Dashed line = ship threshold (level 6).</b> A meter that crosses it clears the gate.</span></div>
    </section>
    ${minorHtml}
    <p class="honesty"><b>Every score states its basis.</b> Each grade shows the exact level, the concrete gap to the next one, and the files the verifier actually read to decide. A score that can't state its basis doesn't ship. Confidence is the verifier's own, per checkpoint.</p>
    <p class="foot">Generated by Forespec · grades unmodified · the verify half of plan → build → verify → correct.</p>
  </div>
  <script>
  (function(){var root=document.documentElement,KEY="forespec-theme",saved=null;
  try{saved=localStorage.getItem(KEY);}catch(e){}
  if(saved){root.setAttribute("data-theme",saved);}
  var b=document.getElementById("themeToggle");
  if(b){b.addEventListener("click",function(){var cur=root.getAttribute("data-theme");
  var next=cur==="dark"?"light":cur==="light"?"dark":(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"light":"dark");
  root.setAttribute("data-theme",next);try{localStorage.setItem(KEY,next);}catch(e){}});}})();
  </script>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forespec — ${esc(archetype)} backbone report</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
