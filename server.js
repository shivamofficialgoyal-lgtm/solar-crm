const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "CHANGE_THIS_SESSION_SECRET_IN_PRODUCTION";

const dataDir = path.join(__dirname, "data");
require("fs").mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "crm.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','agent')),
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_code TEXT UNIQUE NOT NULL,
  agent_id INTEGER NOT NULL,
  product_type TEXT NOT NULL CHECK(product_type IN ('Callback','Appointment')),
  solar_status TEXT NOT NULL CHECK(solar_status IN ('No Solar','Has Solar')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  street_name TEXT NOT NULL,
  suburb TEXT NOT NULL,
  postcode TEXT NOT NULL,
  free_standing TEXT NOT NULL,
  roof_type TEXT NOT NULL,
  bill TEXT NOT NULL,
  under_75 TEXT NOT NULL,
  number_of_panels TEXT,
  panels_age TEXT,
  battery TEXT,
  sunlight TEXT NOT NULL,
  quote TEXT NOT NULL,
  email TEXT,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  additional_comment TEXT,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(agent_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  lead_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function ensureDemoUser(username, password, role, displayName) {
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (!exists) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare("INSERT INTO users (username,password_hash,role,display_name) VALUES (?,?,?,?)")
      .run(username, hash, role, displayName);
  }
}
ensureDemoUser("admin", "ChangeMe123!", "admin", "Administrator");
ensureDemoUser("agent01", "Agent123!", "agent", "Agent 01");

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
function audit(userId, action, leadId = null) {
  db.prepare("INSERT INTO audit_log (user_id, action, lead_id) VALUES (?,?,?)")
    .run(userId || null, action, leadId);
}
function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}
function validateLead(body) {
  const required = [
    "product_type","solar_status","first_name","last_name","mobile_number",
    "street_name","suburb","postcode","free_standing","roof_type","bill",
    "under_75","sunlight","quote","appointment_date","appointment_time"
  ];
  for (const key of required) {
    if (!clean(body[key])) return `${key} is required`;
  }
  if (!["Callback","Appointment"].includes(body.product_type)) return "Invalid product type";
  if (!["No Solar","Has Solar"].includes(body.solar_status)) return "Invalid solar status";
  if (!/^[0-9 +()\-]{7,20}$/.test(body.mobile_number)) return "Invalid mobile number";
  if (!/^[0-9]{4}$/.test(body.postcode)) return "Postcode must be 4 digits";
  if (!["Yes","No"].includes(body.free_standing)) return "Invalid Free Standing value";
  if (!["Yes","No"].includes(body.under_75)) return "Invalid Under 75 value";
  if (body.solar_status === "Has Solar") {
    if (!clean(body.number_of_panels) || !clean(body.panels_age) || !["Yes","No"].includes(body.battery)) {
      return "Number of panels, panel age and battery are required for Has Solar";
    }
  }
  return null;
}

// Login
app.post("/api/login", (req, res) => {
  const username = clean(req.body.username);
  const password = req.body.password || "";
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid ID or password" });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name
  };
  audit(user.id, "LOGIN");
  res.json({ user: req.session.user });
});

app.post("/api/logout", requireAuth, (req, res) => {
  audit(req.session.user.id, "LOGOUT");
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// Create lead. Mobile number is accepted here, but never returned to an agent.
app.post("/api/leads", requireAuth, (req, res) => {
  const error = validateLead(req.body);
  if (error) return res.status(400).json({ error });

  const b = req.body;
  const leadCode = "SOL-" + new Date().getFullYear() + "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase();

  const stmt = db.prepare(`
    INSERT INTO leads (
      lead_code, agent_id, product_type, solar_status, first_name, last_name,
      mobile_number, street_name, suburb, postcode, free_standing, roof_type,
      bill, under_75, number_of_panels, panels_age, battery, sunlight, quote,
      email, appointment_date, appointment_time, additional_comment
    ) VALUES (
      @lead_code, @agent_id, @product_type, @solar_status, @first_name, @last_name,
      @mobile_number, @street_name, @suburb, @postcode, @free_standing, @roof_type,
      @bill, @under_75, @number_of_panels, @panels_age, @battery, @sunlight, @quote,
      @email, @appointment_date, @appointment_time, @additional_comment
    )
  `);

  const result = stmt.run({
    lead_code: leadCode,
    agent_id: req.session.user.id,
    product_type: clean(b.product_type),
    solar_status: clean(b.solar_status),
    first_name: clean(b.first_name),
    last_name: clean(b.last_name),
    mobile_number: clean(b.mobile_number),
    street_name: clean(b.street_name),
    suburb: clean(b.suburb),
    postcode: clean(b.postcode),
    free_standing: clean(b.free_standing),
    roof_type: clean(b.roof_type),
    bill: clean(b.bill),
    under_75: clean(b.under_75),
    number_of_panels: clean(b.number_of_panels),
    panels_age: clean(b.panels_age),
    battery: clean(b.battery),
    sunlight: clean(b.sunlight),
    quote: clean(b.quote),
    email: clean(b.email),
    appointment_date: clean(b.appointment_date),
    appointment_time: clean(b.appointment_time),
    additional_comment: clean(b.additional_comment)
  });

  audit(req.session.user.id, "CREATE_LEAD", result.lastInsertRowid);
  res.status(201).json({ ok: true, leadCode });
});

// Agent list: phone number is intentionally NOT selected.
app.get("/api/my-leads", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, lead_code, product_type, solar_status, first_name, last_name,
           suburb, postcode, free_standing, roof_type, bill, under_75,
           number_of_panels, panels_age, battery, sunlight, quote, email,
           appointment_date, appointment_time, additional_comment, status, created_at
    FROM leads
    WHERE agent_id = ?
    ORDER BY id DESC
  `).all(req.session.user.id);

  res.json({ leads: rows });
});

// Admin list: admin gets the protected mobile number.
app.get("/api/admin/leads", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT leads.*, users.username AS agent_username, users.display_name AS agent_name
    FROM leads
    JOIN users ON users.id = leads.agent_id
    ORDER BY leads.id DESC
  `).all();

  res.json({ leads: rows });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM leads").get().n;
  const appointments = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE product_type='Appointment'").get().n;
  const callbacks = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE product_type='Callback'").get().n;
  const noSolar = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE solar_status='No Solar'").get().n;
  const hasSolar = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE solar_status='Has Solar'").get().n;
  const agents = db.prepare(`
    SELECT users.display_name, users.username, COUNT(leads.id) AS lead_count
    FROM users LEFT JOIN leads ON users.id=leads.agent_id
    WHERE users.role='agent'
    GROUP BY users.id ORDER BY lead_count DESC
  `).all();
  res.json({ total, appointments, callbacks, noSolar, hasSolar, agents });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, display_name, role, active, created_at
    FROM users ORDER BY id DESC
  `).all();
  res.json({ users });
});

app.patch("/api/admin/leads/:id/status", requireAdmin, (req, res) => {
  const allowed = ["New", "Contacted", "Confirmed", "Completed", "Cancelled", "Replacement"];
  const status = clean(req.body.status);
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const result = db.prepare("UPDATE leads SET status=? WHERE id=?").run(status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Lead not found" });
  audit(req.session.user.id, "UPDATE_STATUS:" + status, Number(req.params.id));
  res.json({ ok: true });
});

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Solar CRM V1 running at http://localhost:${PORT}`);
});
