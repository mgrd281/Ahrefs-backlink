// Speichert die Haken (welcher Shop ist auf welcher Seite eingetragen) in Upstash Redis.
// Benötigt die Umgebungsvariablen, die Vercel beim Verbinden einer Upstash-Redis-Datenbank setzt:
// KV_REST_API_URL + KV_REST_API_TOKEN  (oder UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
// Optional: TRACKER_PIN – wenn gesetzt, darf nur speichern, wer diese PIN eingibt.

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.TRACKER_PIN || "";
const HASH = "tracker:marks";
const STORES = "tracker:stores";

async function redis(cmd) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

const isDomain = s => typeof s === "string" && /^[a-z0-9.-]{3,120}$/i.test(s);
const isIso = s => typeof s === "string" && !isNaN(Date.parse(s));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL || !TOKEN) return res.status(200).json({ configured: false });

  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", HASH])) || [];
      const done = {};
      for (let i = 0; i < flat.length; i += 2) {
        try { done[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) {}
      }
      let stores = [];
      try { stores = JSON.parse((await redis(["GET", STORES])) || "[]"); } catch (e) {}
      return res.status(200).json({ configured: true, done, stores });
    }

    if (req.method === "POST") {
      if (PIN && req.headers["x-tracker-pin"] !== PIN) return res.status(401).json({ error: "pin" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      if (Array.isArray(body.stores)) {
        const list = body.stores.filter(isDomain).slice(0, 20);
        await redis(["SET", STORES, JSON.stringify(list)]);
        return res.status(200).json({ ok: true });
      }
      if (isDomain(body.domain) && body.marks && typeof body.marks === "object") {
        const marks = {};
        for (const [s, at] of Object.entries(body.marks)) if (isDomain(s) && isIso(at)) marks[s] = at;
        if (Object.keys(marks).length) await redis(["HSET", HASH, body.domain, JSON.stringify(marks)]);
        else await redis(["HDEL", HASH, body.domain]);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "bad request" });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "storage" });
  }
};
