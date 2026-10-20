const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "";
const DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DIR, "guests.json");
fs.mkdirSync(DIR, { recursive: true });

let db = { guests: [] };
try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) {}
const save = () => { const t = FILE + ".tmp"; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, FILE); };
const rid = () => crypto.randomBytes(4).toString("hex");
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise(r => {
  let s = "";
  req.on("data", c => { s += c; if (s.length > 20000) req.destroy(); });
  req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch (e) { r({}); } });
});
const authed = req => {
  if (!PASS) return false;
  const a = Buffer.from(String(req.headers["x-admin-password"] || "")), b = Buffer.from(PASS);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const page = (res, f) => fs.readFile(path.join(__dirname, f), (e, d) => {
  if (e) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(d);
});

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), p = u.pathname;
  try {
    // ---- User panel ----
    if (req.method === "GET" && p === "/") return page(res, "index.html");
    if (req.method === "GET" && p === "/api/guest") {
      const g = db.guests.find(x => x.id === u.searchParams.get("id"));
      if (!g) return send(res, 404, {});
      g.opens = (g.opens || 0) + 1; g.openedAt = g.openedAt || Date.now(); g.lastOpen = Date.now();
      save(); return send(res, 200, { name: g.name });
    }
    if (req.method === "POST" && p === "/api/rsvp") {
      const b = await readBody(req), g = db.guests.find(x => x.id === b.id);
      if (!g) return send(res, 404, {});
      if (Number.isInteger(b.q) && b.q >= 0 && b.q < 4 && typeof b.a === "string") { g.answers = g.answers || {}; g.answers[b.q] = b.a.slice(0, 200); }
      if (["started", "confirmed", "rejected"].includes(b.status)) g.status = b.status;
      g.updatedAt = Date.now(); save(); return send(res, 200, { ok: 1 });
    }
    // ---- Admin panel ----
    if (req.method === "GET" && p === "/admin") return page(res, "admin.html");
    if (p.startsWith("/api/admin/")) {
      if (!PASS) return send(res, 503, { error: "ADMIN_PASSWORD o’rnatilmagan (Railway → Variables)" });
      if (!authed(req)) return send(res, 401, { error: "Parol noto’g’ri" });
      if (p === "/api/admin/guests" && req.method === "GET") return send(res, 200, { guests: db.guests });
      if (p === "/api/admin/guests" && req.method === "POST") {
        const b = await readBody(req);
        const names = (Array.isArray(b.names) ? b.names : [b.name]).map(n => String(n || "").trim().slice(0, 80)).filter(Boolean).slice(0, 200);
        if (!names.length) return send(res, 400, { error: "Ism kiriting" });
        names.forEach(name => db.guests.push({ id: rid(), name, createdAt: Date.now(), status: "new", opens: 0, answers: {} }));
        save(); return send(res, 200, { added: names.length });
      }
      if (p === "/api/admin/guests" && req.method === "DELETE") {
        db.guests = db.guests.filter(x => x.id !== u.searchParams.get("id")); save(); return send(res, 200, { ok: 1 });
      }
    }
    res.writeHead(404); res.end("Not found");
  } catch (e) { res.writeHead(500); res.end("Error"); }
}).listen(PORT, () => console.log("Server on " + PORT));
