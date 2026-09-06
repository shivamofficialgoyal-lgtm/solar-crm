const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(
  path.join(dataDir, "crm.sqlite")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
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
  status TEXT NOT NULL DEFAULT 'Pending QC',
  qc_comment TEXT,
  qc_by INTEGER,
  qc_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(agent_id) REFERENCES users(id),
  FOREIGN KEY(qc_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  lead_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const userSql =
  db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    )
    .get()?.sql || "";

if (!userSql.includes("'qc_manager'")) {
  db.exec(`
    CREATE TABLE users_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','qc_manager','agent')),
      display_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_v2 (
      id,
      username,
      password_hash,
      role,
      display_name,
      active,
      created_at
    )
    SELECT
      id,
      username,
      password_hash,
      CASE
        WHEN role='admin'
        THEN 'admin'
        ELSE 'agent'
      END,
      display_name,
      active,
      created_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_v2 RENAME TO users;
  `);
}

function addColumnIfMissing(table, column, definition) {
  const exists =
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some(x => x.name === column);

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

addColumnIfMissing("leads", "qc_comment", "TEXT");
addColumnIfMissing("leads", "qc_by", "INTEGER");
addColumnIfMissing("leads", "qc_at", "TEXT");

db.prepare(`
  UPDATE leads
  SET status='Pending QC'
  WHERE status IS NULL
  OR status NOT IN (
    'Pending QC',
    'Qualified',
    'Unqualified'
  )
`).run();

function ensureInitialAdmin() {
  const count =
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role='admin'"
      )
      .get().n;

  if (count) return;

  const username =
    process.env.ADMIN_USERNAME ||
    "admin";

  const password =
    process.env.ADMIN_PASSWORD ||
    "ChangeMe123!";

  const hash =
    bcrypt.hashSync(password, 12);

  db.prepare(`
    INSERT INTO users
    (username,password_hash,role,display_name)
    VALUES (?,?,?,?)
  `).run(
    username,
    hash,
    "admin",
    "Administrator"
  );

  console.log(
    `Initial admin created: ${username}`
  );
}

ensureInitialAdmin();

/* TEMPORARY ADMIN PASSWORD RESET
   Remove this section after the password has been reset.
*/
if (process.env.RESET_ADMIN_PASSWORD) {
  const newPassword = process.env.RESET_ADMIN_PASSWORD;

  if (newPassword.length >= 8) {
    db.prepare(`
      UPDATE users
      SET password_hash=?
      WHERE username='admin'
    `).run(
      bcrypt.hashSync(newPassword, 12)
    );

    console.log("Admin password reset successfully.");
  }
}

app.use(
  express.json({
    limit: "150kb"
  })
);

app.use(
  express.urlencoded({
    extended: false
  })
);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production",
      maxAge:
        8 * 60 * 60 * 1000
    }
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

const ROLES = [
  "admin",
  "qc_manager",
  "agent"
];

function clean(v) {
  return typeof v === "string"
    ? v.trim()
    : "";
}

function audit(
  userId,
  action,
  leadId = null
) {
  db.prepare(`
    INSERT INTO audit_log
    (user_id,action,lead_id)
    VALUES (?,?,?)
  `).run(
    userId || null,
    action,
    leadId
  );
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Not authenticated"
    });
  }

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({
        error: "Not authenticated"
      });
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({
        error: "You do not have permission for this action"
      });
    }

    next();
  };
}

const requireAdmin = requireRole("admin");

function validateLead(b) {
  const required = [
    "product_type",
    "solar_status",
    "first_name",
    "last_name",
    "mobile_number",
    "street_name",
    "suburb",
    "postcode",
    "free_standing",
    "roof_type",
    "bill",
    "under_75",
    "sunlight",
    "quote",
    "appointment_date",
    "appointment_time"
  ];

  for (const key of required) {
    if (!clean(b[key])) {
      return `${key} is required`;
    }
  }

  if (
    !["Callback", "Appointment"].includes(
      clean(b.product_type)
    )
  ) {
    return "Invalid product type";
  }

  if (
    !["No Solar", "Has Solar"].includes(
      clean(b.solar_status)
    )
  ) {
    return "Invalid solar status";
  }

  if (
    !/^[0-9 +()\-]{7,20}$/.test(
      clean(b.mobile_number)
    )
  ) {
    return "Invalid mobile number";
  }

  if (
    !/^[0-9]{4}$/.test(
      clean(b.postcode)
    )
  ) {
    return "Postcode must be 4 digits";
  }

  if (
    !["Yes", "No"].includes(
      clean(b.free_standing)
    )
  ) {
    return "Invalid Free Standing value";
  }

  if (
    !["Yes", "No"].includes(
      clean(b.under_75)
    )
  ) {
    return "Invalid Under 75 value";
  }

  if (
    b.solar_status === "Has Solar" &&
    (
      !clean(b.number_of_panels) ||
      !clean(b.panels_age) ||
      !["Yes", "No"].includes(
        clean(b.battery)
      )
    )
  ) {
    return "Number of panels, panel age and battery are required for Has Solar";
  }

  return null;
}

app.post("/api/login", (req, res) => {
  const username = clean(req.body.username);
  const password = req.body.password || "";

  const user = db
    .prepare(
      "SELECT * FROM users WHERE username=? AND active=1"
    )
    .get(username);

  if (
    !user ||
    !bcrypt.compareSync(
      password,
      user.password_hash
    )
  ) {
    return res.status(401).json({
      error: "Invalid ID or password"
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name
  };

  audit(
    user.id,
    "LOGIN"
  );

  res.json({
    user: req.session.user
  });
});

app.post(
  "/api/logout",
  requireAuth,
  (req, res) => {
    audit(
      req.session.user.id,
      "LOGOUT"
    );

    req.session.destroy(
      () => res.json({ ok: true })
    );
  }
);

app.get(
  "/api/me",
  (req, res) => {
    res.json({
      user: req.session.user || null
    });
  }
);

app.post(
  "/api/leads",
  requireRole("agent"),
  (req, res) => {
    const error =
      validateLead(req.body);

    if (error) {
      return res.status(400).json({
        error
      });
    }

    const b = req.body;

    const leadCode =
      "SOL-" +
      new Date().getFullYear() +
      "-" +
      crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase();

    const result =
      db.prepare(`
        INSERT INTO leads (
          lead_code,
          agent_id,
          product_type,
          solar_status,
          first_name,
          last_name,
          mobile_number,
          street_name,
          suburb,
          postcode,
          free_standing,
          roof_type,
          bill,
          under_75,
          number_of_panels,
          panels_age,
          battery,
          sunlight,
          quote,
          email,
          appointment_date,
          appointment_time,
          additional_comment,
          status
        )
        VALUES (
          @lead_code,
          @agent_id,
          @product_type,
          @solar_status,
          @first_name,
          @last_name,
          @mobile_number,
          @street_name,
          @suburb,
          @postcode,
          @free_standing,
          @roof_type,
          @bill,
          @under_75,
          @number_of_panels,
          @panels_age,
          @battery,
          @sunlight,
          @quote,
          @email,
          @appointment_date,
          @appointment_time,
          @additional_comment,
          'Pending QC'
        )
      `)
      .run({
        lead_code: leadCode,
        agent_id:
          req.session.user.id,
        product_type:
          clean(b.product_type),
        solar_status:
          clean(b.solar_status),
        first_name:
          clean(b.first_name),
        last_name:
          clean(b.last_name),
        mobile_number:
          clean(b.mobile_number),
        street_name:
          clean(b.street_name),
        suburb:
          clean(b.suburb),
        postcode:
          clean(b.postcode),
        free_standing:
          clean(b.free_standing),
        roof_type:
          clean(b.roof_type),
        bill:
          clean(b.bill),
        under_75:
          clean(b.under_75),
        number_of_panels:
          clean(b.number_of_panels),
        panels_age:
          clean(b.panels_age),
        battery:
          clean(b.battery),
        sunlight:
          clean(b.sunlight),
        quote:
          clean(b.quote),
        email:
          clean(b.email),
        appointment_date:
          clean(b.appointment_date),
        appointment_time:
          clean(b.appointment_time),
        additional_comment:
          clean(b.additional_comment)
      });

    audit(
      req.session.user.id,
      "CREATE_LEAD",
      result.lastInsertRowid
    );

    res.status(201).json({
      ok: true,
      leadCode
    });
  }
);

app.get(
  "/api/my-leads",
  requireRole("agent"),
  (req, res) => {
    const rows =
      db.prepare(`
        SELECT
          id,
          lead_code,
          product_type,
          solar_status,
          first_name,
          last_name,
          suburb,
          postcode,
          free_standing,
          roof_type,
          bill,
          under_75,
          number_of_panels,
          panels_age,
          battery,
          sunlight,
          quote,
          email,
          appointment_date,
          appointment_time,
          additional_comment,
          status,
          qc_comment,
          created_at
        FROM leads
        WHERE agent_id=?
        ORDER BY id DESC
      `)
      .all(req.session.user.id);

    res.json({
      leads: rows
    });
  }
);

app.get(
  "/api/qc/leads",
  requireRole("qc_manager"),
  (req, res) => {
    const status =
      clean(req.query.status);

    let sql = `
      SELECT
        l.id,
        l.lead_code,
        l.product_type,
        l.solar_status,
        l.first_name,
        l.last_name,
        l.street_name,
        l.suburb,
        l.postcode,
        l.free_standing,
        l.roof_type,
        l.bill,
        l.under_75,
        l.number_of_panels,
        l.panels_age,
        l.battery,
        l.sunlight,
        l.quote,
        l.email,
        l.appointment_date,
        l.appointment_time,
        l.additional_comment,
        l.status,
        l.qc_comment,
        l.qc_at,
        u.username AS agent_username,
        u.display_name AS agent_name,
        l.created_at
      FROM leads l
      JOIN users u
        ON u.id=l.agent_id
    `;

    const params = [];

    if (
      status &&
      [
        "Pending QC",
        "Qualified",
        "Unqualified"
      ].includes(status)
    ) {
      sql += " WHERE l.status=?";
      params.push(status);
    }

    sql += " ORDER BY l.id DESC";

    res.json({
      leads:
        db.prepare(sql).all(...params)
    });
  }
);

app.get(
  "/api/qc/stats",
  requireRole("qc_manager"),
  (req, res) => {
    const get = s =>
      db.prepare(s).get().n;

    res.json({
      pending: get(
        "SELECT COUNT(*) n FROM leads WHERE status='Pending QC'"
      ),
      qualified: get(
        "SELECT COUNT(*) n FROM leads WHERE status='Qualified'"
      ),
      unqualified: get(
        "SELECT COUNT(*) n FROM leads WHERE status='Unqualified'"
      ),
      total: get(
        "SELECT COUNT(*) n FROM leads"
      )
    });
  }
);

app.patch(
  "/api/qc/leads/:id/review",
  requireRole("qc_manager"),
  (req, res) => {
    const status =
      clean(req.body.status);

    const comment =
      clean(req.body.qc_comment);

    if (
      ![
        "Qualified",
        "Unqualified"
      ].includes(status)
    ) {
      return res.status(400).json({
        error:
          "QC status must be Qualified or Unqualified"
      });
    }

    if (!comment) {
      return res.status(400).json({
        error:
          "QC Comment is required"
      });
    }

    const result =
      db.prepare(`
        UPDATE leads
        SET
          status=?,
          qc_comment=?,
          qc_by=?,
          qc_at=CURRENT_TIMESTAMP
        WHERE id=?
      `)
      .run(
        status,
        comment,
        req.session.user.id,
        req.params.id
      );

    if (!result.changes) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    audit(
      req.session.user.id,
      "QC_REVIEW:" + status,
      Number(req.params.id)
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  "/api/admin/leads",
  requireAdmin,
  (req, res) => {
    const q =
      clean(req.query.q);

    const status =
      clean(req.query.status);

    let sql = `
      SELECT
        l.*,
        u.username AS agent_username,
        u.display_name AS agent_name,
        q.display_name AS qc_name
      FROM leads l
      JOIN users u
        ON u.id=l.agent_id
      LEFT JOIN users q
        ON q.id=l.qc_by
      WHERE 1=1
    `;

    const params = [];

    if (q) {
      sql += `
        AND (
          l.lead_code LIKE ?
          OR l.first_name LIKE ?
          OR l.last_name LIKE ?
          OR l.suburb LIKE ?
          OR u.username LIKE ?
          OR l.mobile_number LIKE ?
        )
      `;

      const x =
        "%" + q + "%";

      params.push(
        x,
        x,
        x,
        x,
        x,
        x
      );
    }

    if (
      [
        "Pending QC",
        "Qualified",
        "Unqualified"
      ].includes(status)
    ) {
      sql +=
        " AND l.status=?";

      params.push(status);
    }

    sql +=
      " ORDER BY l.id DESC";

    res.json({
      leads:
        db.prepare(sql).all(...params)
    });
  }
);

app.get(
  "/api/admin/stats",
  requireAdmin,
  (req, res) => {
    const get = s =>
      db.prepare(s).get().n;

    const agents =
      db.prepare(`
        SELECT
          u.display_name,
          u.username,
          COUNT(l.id) lead_count,
          SUM(
            CASE
              WHEN l.status='Qualified'
              THEN 1
              ELSE 0
            END
          ) qualified,
          SUM(
            CASE
              WHEN l.status='Unqualified'
              THEN 1
              ELSE 0
            END
          ) unqualified
        FROM users u
        LEFT JOIN leads l
          ON u.id=l.agent_id
        WHERE u.role='agent'
        GROUP BY u.id
        ORDER BY lead_count DESC
      `)
      .all();

    res.json({
      total: get(
        "SELECT COUNT(*) n FROM leads"
      ),
      appointments: get(
        "SELECT COUNT(*) n FROM leads WHERE product_type='Appointment'"
      ),
      callbacks: get(
        "SELECT COUNT(*) n FROM leads WHERE product_type='Callback'"
      ),
      noSolar: get(
        "SELECT COUNT(*) n FROM leads WHERE solar_status='No Solar'"
      ),
      hasSolar: get(
        "SELECT COUNT(*) n FROM leads WHERE solar_status='Has Solar'"
      ),
      pending: get(
        "SELECT COUNT(*) n FROM leads WHERE status='Pending QC'"
      ),
      qualified: get(
        "SELECT COUNT(*) n FROM leads WHERE status='Qualified'"
      ),
      unqualified: get(
        "SELECT COUNT(*) n FROM leads WHERE status='Unqualified'"
      ),
      agents
    });
  }
);

app.get(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {
    res.json({
      users:
        db.prepare(`
          SELECT
            id,
            username,
            display_name,
            role,
            active,
            created_at
          FROM users
          ORDER BY id DESC
        `)
        .all()
    });
  }
);

app.post(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {
    const username =
      clean(req.body.username);

    const displayName =
      clean(req.body.display_name);

    const role =
      clean(req.body.role);

    const password =
      req.body.password || "";

    if (
      !/^[A-Za-z0-9._-]{3,40}$/.test(
        username
      )
    ) {
      return res.status(400).json({
        error:
          "Login ID must be 3-40 characters and use letters, numbers, dot, underscore or hyphen"
      });
    }

    if (!displayName) {
      return res.status(400).json({
        error:
          "Display name is required"
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        error: "Invalid role"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters"
      });
    }

    try {
      const hash =
        bcrypt.hashSync(
          password,
          12
        );

      const r =
        db.prepare(`
          INSERT INTO users
          (
            username,
            password_hash,
            role,
            display_name
          )
          VALUES (?,?,?,?)
        `)
        .run(
          username,
          hash,
          role,
          displayName
        );

      audit(
        req.session.user.id,
        "CREATE_USER"
      );

      res.status(201).json({
        ok: true,
        id: r.lastInsertRowid
      });
    } catch (e) {
      res.status(400).json({
        error:
          "Login ID already exists"
      });
    }
  }
);

app.patch(
  "/api/admin/users/:id/active",
  requireAdmin,
  (req, res) => {
    const id =
      Number(req.params.id);

    const active =
      req.body.active ? 1 : 0;

    if (
      id === req.session.user.id &&
      !active
    ) {
      return res.status(400).json({
        error:
          "You cannot deactivate your own account"
      });
    }

    const r =
      db.prepare(
        "UPDATE users SET active=? WHERE id=?"
      )
      .run(
        active,
        id
      );

    if (!r.changes) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    audit(
      req.session.user.id,
      active
        ? "ACTIVATE_USER"
        : "DEACTIVATE_USER"
    );

    res.json({
      ok: true
    });
  }
);

app.patch(
  "/api/admin/users/:id/password",
  requireAdmin,
  (req, res) => {
    const password =
      req.body.password || "";

    if (password.length < 8) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters"
      });
    }

    const r =
      db.prepare(
        "UPDATE users SET password_hash=? WHERE id=?"
      )
      .run(
        bcrypt.hashSync(
          password,
          12
        ),
        req.params.id
      );

    if (!r.changes) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    audit(
      req.session.user.id,
      "RESET_PASSWORD"
    );

    res.json({
      ok: true
    });
  }
);

app.patch(
  "/api/admin/leads/:id/status",
  requireAdmin,
  (req, res) => {
    const status =
      clean(req.body.status);

    if (
      ![
        "Pending QC",
        "Qualified",
        "Unqualified"
      ].includes(status)
    ) {
      return res.status(400).json({
        error: "Invalid status"
      });
    }

    const r =
      db.prepare(
        "UPDATE leads SET status=? WHERE id=?"
      )
      .run(
        status,
        req.params.id
      );

    if (!r.changes) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    audit(
      req.session.user.id,
      "ADMIN_STATUS:" + status,
      Number(req.params.id)
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  "/api/admin/export",
  requireAdmin,
  (req, res) => {
    const rows =
      db.prepare(`
        SELECT
          l.*,
          u.username AS agent_username,
          u.display_name AS agent_name
        FROM leads l
        JOIN users u
          ON u.id=l.agent_id
        ORDER BY l.id DESC
      `)
      .all();

    const headers = [
      "Lead ID",
      "Agent",
      "Agent ID",
      "First Name",
      "Last Name",
      "Mobile",
      "Email",
      "Street",
      "Suburb",
      "Postcode",
      "Free Standing",
      "Roof Type",
      "Bill",
      "Under 75",
      "Solar",
      "Panels",
      "Panel Age",
      "Battery",
      "Sunlight",
      "Quote",
      "Product Type",
      "Booking Date",
      "Booking Time",
      "Additional Comment",
      "Status",
      "QC Comment",
      "Created At"
    ];

    const val = v =>
      `"${String(v ?? "").replace(
        /"/g,
        '""'
      )}"`;

    const lines = [
      headers
        .map(val)
        .join(",")
    ];

    for (const r of rows) {
      lines.push(
        [
          r.lead_code,
          r.agent_name,
          r.agent_username,
          r.first_name,
          r.last_name,
          r.mobile_number,
          r.email,
          r.street_name,
          r.suburb,
          r.postcode,
          r.free_standing,
          r.roof_type,
          r.bill,
          r.under_75,
          r.solar_status,
          r.number_of_panels,
          r.panels_age,
          r.battery,
          r.sunlight,
          r.quote,
          r.product_type,
          r.appointment_date,
          r.appointment_time,
          r.additional_comment,
          r.status,
          r.qc_comment,
          r.created_at
        ]
        .map(val)
        .join(",")
      );
    }

    audit(
      req.session.user.id,
      "EXPORT_LEADS"
    );

    res.setHeader(
      "Content-Type",
      "text/csv; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="solar-crm-leads.csv"'
    );

    res.send(
      "\uFEFF" +
      lines.join("\n")
    );
  }
);

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `Solar CRM V2 running on port ${PORT}`
    );
  }
);
