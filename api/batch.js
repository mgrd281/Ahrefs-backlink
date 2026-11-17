// Jetzt sofort Nachrichten schreiben lassen (statt bis morgen früh zu warten).
// POST { store, n }  -> Claude schreibt die nächsten n Nachrichten (max. 12), stärkste Chancen zuerst.

const L = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method" }); }
  const f = L.features();
  if (!f.db) return res.status(200).json({ configured: false });
  if (!L.pinOk(req)) return res.status(401).json({ error: "pin" });
  if (!f.claude) return res.status(200).json({ error: "claude-off" });

  const b = L.body(req);
  const store = L.isStore(b.store) ? b.store : L.DEFAULT_STORES[0];
  const want = Math.max(1, Math.min(12, parseInt(b.n, 10) || 10));
  const lockKey = L.K.lock + ":batch";
  if (!(await L.redis(["SET", lockKey, "1", "NX", "EX", 200]))) return res.status(409).json({ error: "running" });

  const start = Date.now(), deadline = start + 100000;
  const out = { store, made: [], skipped: [], failed: [] };
  try {
    const { opps, broken } = await L.allItems();
    const [marks, drafts] = await Promise.all([L.hgetallJSON(L.K.marks), L.hgetallJSON(L.K.drafts)]);
    const profile = await L.getProfile(store);
    const queue = L.pickCandidates({ opps, broken, marks, drafts, store, want, now: start });
    let i = 0;
    const worker = async () => {
      while (i < queue.length && Date.now() < deadline) {
        const item = queue[i++];
        const field = `${store}|${item.key}`;
        try {
          const d = await L.writeDraft(item, profile, store);
          await L.hsetJSON(L.K.drafts, field, d);
          (d.action === "skip" ? out.skipped : out.made).push(item.key);
        } catch (e) {
          const old = drafts[field];
          await L.hsetJSON(L.K.drafts, field, { key: item.key, domain: item.d, store, at: new Date().toISOString(), error: String(e.message || e).slice(0, 200), fails: ((old && old.fails) || 0) + 1 });
          out.failed.push(item.key);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  } finally {
    await L.redis(["DEL", lockKey]);
  }
  out.ms = Date.now() - start;
  return res.status(200).json(out);
};
