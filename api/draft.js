// Claude analysiert eine Seite und schreibt die fertige Nachricht.
// POST { key, store, mode: "new" | "regen", pay?: { mode: "none"|"ask"|"offer", budget } } -> Entwurf (aus dem Speicher, wenn schon vorhanden)
// POST { key, store, action: "followup" }             -> Nachfass-E-Mail zu einer gesendeten Nachricht
// POST { key, store, action: "save", to, subject, message } -> eigene Änderungen speichern
// POST { key, store, action: "sent" | "unsent" | "skip" | "unskip" }

const L = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method" }); }
  const f = L.features();
  if (!f.db) return res.status(200).json({ configured: false });
  if (!L.pinOk(req)) return res.status(401).json({ error: "pin" });

  const b = L.body(req);
  if (!L.isKey(b.key) || !L.isStore(b.store)) return res.status(400).json({ error: "bad request" });
  const field = `${b.store}|${b.key}`;

  try {
    const cur = await L.hgetJSON(L.K.drafts, field);
    const now = new Date().toISOString();

    if (b.action === "save") {
      if (!cur) return res.status(404).json({ error: "no draft" });
      const next = { ...cur, edited: now };
      if (typeof b.to === "string") next.recipient_email = b.to.trim().slice(0, 200);
      if (typeof b.subject === "string") next.subject = b.subject.slice(0, 200);
      if (typeof b.message === "string") next.message = b.message.slice(0, 8000);
      if (b.followup && cur.followup && typeof b.followup === "object") next.followup = { ...cur.followup, subject: String(b.followup.subject || "").slice(0, 200), message: String(b.followup.message || "").slice(0, 8000) };
      await L.hsetJSON(L.K.drafts, field, next);
      return res.status(200).json({ draft: next });
    }
    if (["sent", "unsent", "skip", "unskip", "followupSent"].includes(b.action)) {
      const next = { ...(cur || { key: b.key, store: b.store, domain: b.key.replace(/^bl--/, ""), at: now, action: "email_outreach", subject: "", message: "" }) };
      if (b.action === "sent") next.sentAt = now;
      if (b.action === "unsent") delete next.sentAt;
      if (b.action === "skip") next.skippedAt = now;
      if (b.action === "unskip") delete next.skippedAt;
      if (b.action === "followupSent" && next.followup) next.followup.sentAt = now;
      await L.hsetJSON(L.K.drafts, field, next);
      return res.status(200).json({ draft: next });
    }

    if (!f.claude) return res.status(200).json({ error: "claude-off" });

    if (b.action === "followup") {
      if (!cur || !cur.sentAt) return res.status(400).json({ error: "not sent" });
      const profile = await L.getProfile(b.store);
      const next = { ...cur, followup: await L.writeFollowup(cur, profile) };
      await L.hsetJSON(L.K.drafts, field, next);
      return res.status(200).json({ draft: next });
    }

    if (cur && cur.message !== undefined && cur.page_type && b.mode !== "regen" && !(b.pay && cur.pay && b.pay.mode !== cur.pay.mode)) return res.status(200).json({ draft: cur, cached: true });
    const item = await L.findItem(b.key);
    if (!item) return res.status(404).json({ error: "unknown key" });
    const profile = await L.getProfile(b.store);
    const pay = b.pay && ["none", "ask", "offer"].includes(b.pay.mode) ? { mode: b.pay.mode, budget: b.pay.budget } : null;
    const draft = await L.writeDraft(item, profile, b.store, pay ? { pay } : {});
    if (cur && cur.sentAt) draft.sentAt = cur.sentAt;
    await L.hsetJSON(L.K.drafts, field, draft);
    return res.status(200).json({ draft });
  } catch (e) {
    const code = e && e.code === "refusal" ? "refusal" : e instanceof SyntaxError ? "parse" : (e && e.status) ? `api-${e.status}` : "failed";
    return res.status(502).json({ error: code, detail: String(e && e.message || e).slice(0, 300) });
  }
};
