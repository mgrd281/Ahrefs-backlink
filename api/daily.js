// Täglicher Automatik-Lauf (Vercel Cron, siehe vercel.json) – oder manuell über die Seite.
//  1. Prüfen (Ahrefs): Welche Seiten verlinken die Shops jetzt wirklich? Gefundene Links werden
//     als „bestätigt“ markiert und automatisch abgehakt; neue und verlorene Links werden notiert.
//  2. Entdecken (Ahrefs): neue Links der Wettbewerber der letzten Tage → neue Chancen.
//  3. Defekte Links der Wettbewerber (einmal pro Woche).
//  4. Claude schreibt die nächsten Nachrichten vor (Standard 8 pro Tag), die stärksten Chancen zuerst.
//  5. Nachfassen: nach 7 Tagen ohne Link schreibt Claude eine kurze Erinnerung.
// Versendet wird nichts automatisch: Jede Nachricht wird mit einem Klick in Outlook geöffnet und
// von Hand abgeschickt (UWG § 7 – unaufgeforderte Werbe-E-Mails – und Schutz der Absender-Domain).

const L = require("./_lib");

const DAY = 86400000;
const iso = d => new Date(d).toISOString();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization === `Bearer ${secret}`) return true;
  if (req.method === "POST") return L.pinOk(req);
  // Vercel Cron ohne CRON_SECRET (nicht empfohlen): nur der Cron-Aufruf selbst
  return !secret && /vercel-cron/i.test(req.headers["user-agent"] || "");
}

async function pool(items, n, fn, deadline) {
  const out = []; let i = 0;
  async function worker() {
    while (i < items.length && Date.now() < deadline) { const it = items[i++]; out.push(await fn(it)); }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const matchDomain = (set, d) => set.has(d) || set.has(L.rootOf(d));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const f = L.features();
  if (!f.db) return res.status(200).json({ configured: false });
  if (!authorized(req)) return res.status(401).json({ error: "auth" });

  const got = await L.redis(["SET", L.K.lock, iso(Date.now()), "NX", "EX", 900]);
  if (!got) return res.status(409).json({ error: "running" });

  const start = Date.now();
  const deadline = start + 260000;
  const run = { at: iso(start), trigger: req.method === "POST" ? "manual" : "cron", steps: {}, errors: [] };
  const prevRun = JSON.parse((await L.redis(["GET", L.K.lastrun])) || "null");

  try {
    const savedStores = JSON.parse((await L.redis(["GET", L.K.stores])) || "[]");
    const stores = L.DEFAULT_STORES.concat(savedStores.filter(s => !L.DEFAULT_STORES.includes(s)));
    const primary = process.env.PRIMARY_STORE || stores[0];
    let { opps, broken } = await L.allItems();
    const marks = await L.hgetallJSON(L.K.marks);
    const verified = await L.hgetallJSON(L.K.verified);
    const known = new Set(opps.map(o => o.d).concat(L.DATA.spam.map(s => s[0])));
    const knownBroken = new Set(broken.map(b => b.d));
    const primaryRefs = new Set();

    /* 1. verify */
    if (f.ahrefs) {
      const step = run.steps.verify = { stores: {} };
      for (const store of stores) {
        try {
          const j = await L.ahrefs("site-explorer/refdomains", {
            target: store, mode: "subdomains", history: "live", select: "domain,domain_rating",
            where: JSON.stringify({ field: "is_spam", is: ["eq", false] }), order_by: "domain_rating:desc", limit: "1000",
          });
          const doms = (j.refdomains || []).map(r => r.domain);
          const now = new Set(doms.concat(doms.map(L.rootOf)));
          if (store === primary) now.forEach(d => primaryRefs.add(d));
          const prev = JSON.parse((await L.redis(["GET", L.K.refs(store)])) || "null");
          const s = { total: doms.length, newRefs: prev ? doms.filter(d => !prev.includes(d)) : [], lost: prev ? prev.filter(d => !doms.includes(d)) : [], autoMarked: [] };
          await L.redis(["SET", L.K.refs(store), JSON.stringify(doms)]);
          const cmds = [];
          const touch = (key, d) => {
            const v = verified[d] || (verified[d] = {});
            if (!v[store]) { v[store] = iso(start); cmds.push(["HSET", L.K.verified, d, JSON.stringify(v)]); }
            const m = marks[key] || {};
            if (!m[store]) { m[store] = iso(start); marks[key] = m; cmds.push(["HSET", L.K.marks, key, JSON.stringify(m)]); s.autoMarked.push(key); }
          };
          for (const o of opps) if (matchDomain(now, o.d) && !(o.o === 3 && store === "karinex.de")) touch(o.d, o.d);
          for (const b of broken) if (matchDomain(now, b.d)) touch("bl--" + b.d, b.d);
          await L.pipeline(cmds);
          step.stores[store] = s;
        } catch (e) { run.errors.push(`verify ${store}: ${e.message}`); }
      }
    }

    /* 2. discover new competitor links */
    if (f.ahrefs && Date.now() < deadline) {
      const step = run.steps.discover = { added: [] };
      const since = new Date(start - 3 * DAY).toISOString().slice(0, 10);
      const cmds = [];
      for (const [ci, comp] of L.COMPS.entries()) {
        try {
          const j = await L.ahrefs("site-explorer/all-backlinks", {
            target: comp, mode: "subdomains", aggregation: "1_per_domain", history: "live",
            select: "root_name_source,domain_rating_source,is_dofollow,url_from",
            where: JSON.stringify({ and: [{ field: "is_spam", is: ["eq", false] }, { field: "first_seen_link", is: ["gte", since] }, { field: "domain_rating_source", is: ["gte", 5] }] }),
            order_by: "domain_rating_source:desc", limit: "40",
          });
          for (const r of j.backlinks || []) {
            const d = r.root_name_source;
            if (!d || known.has(d) || L.looksSpam(d)) continue;
            known.add(d);
            const l = L.COMPS.map((_, i) => (i === ci ? r.url_from : ""));
            const dr = Math.round((r.domain_rating_source || 0) * 10) / 10;
            const o = primaryRefs.has(d) ? 3 : dr >= 30 ? 2 : 1;
            const row = [d, dr, 0, r.is_dofollow ? 1 : 0, o, l, L.today()];
            cmds.push(["HSET", L.K.extra, d, JSON.stringify(row)]);
            opps.push({ d, dr, tr: 0, df: row[3], o, l, at: row[6] });
            step.added.push(d);
          }
        } catch (e) { run.errors.push(`discover ${comp}: ${e.message}`); }
      }
      await L.pipeline(cmds);
    }

    /* 3. broken links, weekly */
    const lastBroken = prevRun && prevRun.lastBroken ? Date.parse(prevRun.lastBroken) : 0;
    run.lastBroken = prevRun && prevRun.lastBroken || null;
    if (f.ahrefs && start - lastBroken > 6.5 * DAY && Date.now() < deadline) {
      const step = run.steps.broken = { added: [] };
      const cmds = [];
      for (const [ci, comp] of L.COMPS.entries()) {
        try {
          const j = await L.ahrefs("site-explorer/broken-backlinks", {
            target: comp, mode: "subdomains", aggregation: "1_per_domain",
            select: "root_name_source,domain_rating_source,is_dofollow,url_from,url_to",
            where: JSON.stringify({ and: [{ field: "is_spam", is: ["eq", false] }, { field: "domain_rating_source", is: ["gte", 10] }] }),
            order_by: "domain_rating_source:desc", limit: "30",
          });
          for (const r of j.backlinks || []) {
            const d = r.root_name_source;
            if (!d || knownBroken.has(d) || L.looksSpam(d)) continue;
            knownBroken.add(d);
            const k = /forum|thread|topic|viewtopic|showthread|discussion|community|board|gathering/i.test(r.url_from) ? "f" : "a";
            const row = [d, Math.round((r.domain_rating_source || 0) * 10) / 10, 0, r.is_dofollow ? 1 : 0, r.url_from, r.url_to, ci, k, L.today()];
            cmds.push(["HSET", L.K.extraBroken, d, JSON.stringify(row)]);
            broken.push({ d, dr: row[1], tr: 0, df: row[3], from: row[4], to: row[5], c: ci, k, at: row[8] });
            step.added.push(d);
          }
        } catch (e) { run.errors.push(`broken ${comp}: ${e.message}`); }
      }
      await L.pipeline(cmds);
      run.lastBroken = iso(start);
    }

    /* 4. Claude writes the next messages */
    if (f.claude && Date.now() < deadline) {
      const step = run.steps.drafts = { store: primary, made: [], skipped: [], failed: [] };
      const drafts = await L.hgetallJSON(L.K.drafts);
      const profile = await L.getProfile(primary);
      const want = Math.max(0, Math.min(25, parseInt(process.env.DAILY_DRAFTS || "8", 10) || 0));
      const hasDraft = key => {
        const dr = drafts[`${primary}|${key}`];
        if (!dr) return false;
        if (dr.error) return start - Date.parse(dr.at) < 3 * DAY || (dr.fails || 0) >= 2;
        return true;
      };
      const isDone = key => !!(marks[key] || {})[primary];
      const comps = l => l.map((u, i) => (u ? L.COMPS[i] : "")).filter(Boolean);
      const queue = [
        ...broken.filter(b => b.k === "a" && !isDone("bl--" + b.d) && !hasDraft("bl--" + b.d))
          .sort((a, b) => b.dr - a.dr)
          .map(b => ({ key: "bl--" + b.d, d: b.d, kind: "broken", url: b.from, dead: b.to, dr: b.dr, df: b.df, comps: [L.COMPS[b.c]] })),
        ...opps.filter(o => o.o === 2 && !isDone(o.d) && !hasDraft(o.d) && !L.looksSpam(o.d))
          .sort((a, b) => (b.dr + (b.df ? 15 : 0) + Math.log10((b.tr || 0) + 1) * 3) - (a.dr + (a.df ? 15 : 0) + Math.log10((a.tr || 0) + 1) * 3))
          .map(o => { const i = o.l.findIndex(Boolean); return { key: o.d, d: o.d, kind: "opp", url: o.l[i] || `https://${o.d}/`, dr: o.dr, df: o.df, comps: comps(o.l) }; }),
      ].slice(0, want);
      await pool(queue, 3, async item => {
        const field = `${primary}|${item.key}`;
        try {
          const d = await L.writeDraft(item, profile, primary);
          d.auto = true;
          await L.hsetJSON(L.K.drafts, field, d);
          (d.action === "skip" ? step.skipped : step.made).push(item.key);
        } catch (e) {
          const old = drafts[field];
          await L.hsetJSON(L.K.drafts, field, { key: item.key, domain: item.d, store: primary, at: iso(Date.now()), error: String(e.message || e).slice(0, 200), fails: ((old && old.fails) || 0) + 1 });
          step.failed.push(item.key);
        }
      }, deadline - 60000);
    }

    /* 5. follow-ups */
    if (f.claude && Date.now() < deadline - 30000) {
      const step = run.steps.followups = { made: [] };
      const drafts = await L.hgetallJSON(L.K.drafts);
      const profile = await L.getProfile(primary);
      const due = Object.entries(drafts).filter(([k, d]) => k.startsWith(primary + "|") && d.sentAt && !d.followup && d.recipient_email
        && /email_outreach|contact_form|add_coupon/.test(d.action || "") && start - Date.parse(d.sentAt) > 7 * DAY
        && !((verified[d.domain] || {})[primary])).slice(0, 3);
      for (const [field, d] of due) {
        if (Date.now() > deadline - 30000) break;
        try { await L.hsetJSON(L.K.drafts, field, { ...d, followup: await L.writeFollowup(d, profile) }); step.made.push(d.key); }
        catch (e) { run.errors.push(`followup ${d.key}: ${e.message}`); }
      }
    }
  } catch (e) {
    run.errors.push(String(e && e.message || e));
  } finally {
    run.ms = Date.now() - start;
    run.features = { claude: f.claude, ahrefs: f.ahrefs };
    try {
      await L.pipeline([
        ["SET", L.K.lastrun, JSON.stringify(run)],
        ["LPUSH", L.K.runs, JSON.stringify(run)],
        ["LTRIM", L.K.runs, 0, 29],
        ["DEL", L.K.lock],
      ]);
    } catch (e) {}
  }
  return res.status(200).json(run);
};
