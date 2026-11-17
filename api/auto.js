// Zustand der Automatik für die Seite.
// GET                         -> { features, drafts, extra, extraBroken, verified, lastrun, runs, profiles }
// POST { profile: {...} }     -> Shop-Profil speichern (Absender, Beschreibung, Signatur)

const L = require("./_lib");

const clip = (s, n) => String(s || "").slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const features = L.features();
  if (!features.db) return res.status(200).json({ configured: false, features });

  try {
    if (req.method === "GET") {
      const [drafts, extra, extraBroken, verified, profiles, lastrun, runs] = await Promise.all([
        L.hgetallJSON(L.K.drafts), L.hgetallJSON(L.K.extra), L.hgetallJSON(L.K.extraBroken),
        L.hgetallJSON(L.K.verified), L.hgetallJSON(L.K.profiles),
        L.redis(["GET", L.K.lastrun]), L.redis(["LRANGE", L.K.runs, 0, 13]),
      ]);
      const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
      return res.status(200).json({
        configured: true, features, drafts,
        extra: Object.values(extra), extraBroken: Object.values(extraBroken), verified, profiles,
        lastrun: parse(lastrun), runs: (runs || []).map(parse).filter(Boolean),
      });
    }

    if (req.method === "POST") {
      if (!L.pinOk(req)) return res.status(401).json({ error: "pin" });
      const b = L.body(req);
      const p = b.profile;
      if (p && L.isStore(p.store)) {
        const profile = {
          store: p.store, company: clip(p.company, 120), shopUrl: clip(p.shopUrl, 200),
          description: clip(p.description, 1200), sender: clip(p.sender, 120), signature: clip(p.signature, 600),
          email: clip(p.email, 120), phone: clip(p.phone, 60), address: clip(p.address, 300), shortDesc: clip(p.shortDesc, 200),
        };
        await L.hsetJSON(L.K.profiles, p.store, profile);
        return res.status(200).json({ ok: true, profile });
      }
      return res.status(400).json({ error: "bad request" });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "storage" });
  }
};
