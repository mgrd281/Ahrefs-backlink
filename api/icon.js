// Logo (Favicon) einer Domain: GET /api/icon?d=example.de
// Holt das Icon serverseitig (DuckDuckGo, Google, sonst /favicon.ico der Seite) und lässt es 30 Tage im Vercel-CDN
// zwischenspeichern. Ohne Treffer: 404 – die Seite zeigt dann den Anfangsbuchstaben.

// public host names only: letters in the TLD, no IP addresses, no internal names
const isDomain = s => typeof s === "string" && s.length <= 120
  && /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i.test(s)
  && !/\.(local|internal|localhost|lan|home|corp|intranet)$/i.test(s);
const MAX = 200 * 1024;

async function tryFetch(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; KarinexTracker/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\//i.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100 || buf.length > MAX) return null;
    return { buf, type };
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  const d = String((req.query && req.query.d) || "").toLowerCase().replace(/^www\./, "");
  if (!isDomain(d)) return res.status(400).end();
  const icon = await tryFetch(`https://icons.duckduckgo.com/ip3/${d}.ico`)
    || await tryFetch(`https://www.google.com/s2/favicons?domain=${d}&sz=64`)
    || await tryFetch(`https://${d}/favicon.ico`)
    || await tryFetch(`https://www.${d}/favicon.ico`);
  if (!icon) {
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    return res.status(404).end();
  }
  res.setHeader("Content-Type", icon.type);
  res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(icon.buf);
};
