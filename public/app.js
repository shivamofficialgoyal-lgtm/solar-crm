const API_URL = "https://solar-crm-uudg.onrender.com";

const app = document.getElementById("app");
let currentUser = null;

const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );

async function api(url, opt = {}) {
  const options = {
    credentials: "include",
    ...opt,
    headers: {
      "Content-Type": "application/json",
      ...(opt.headers || {})
    }
  };

  const fullUrl = url.startsWith("http")
    ? url
    : API_URL + url;

  const r = await fetch(fullUrl, options);

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(d.error || `Request failed (${r.status})`);
  }

  return d;
}

/* =========================
   LOGIN
========================= */

function loginView() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand">☀ Solar CRM</div>
        <p class="muted">V2 • Secure Lead Management</p>

        <div id="login-msg"></div>

        <form id="login-form">

          <div class="field">
            <label>Login ID</label>
            <input
              id="username"
              name="username"
              autocomplete="username"
              required
            >
          </div>

          <div class="field">
            <label>Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            >
          </div>

          <button class="btn btn-primary" style="width:100%">
            Login
          </button>

        </form>
      </div>
    </div>
  `;

  document.getElementById("login-form").onsubmit =
    async e => {
      e.preventDefault();

      const username =
        document.getElementById("username").value;

      const password =
        document.getElementById("password").value;

      try {
        const d = await api("/api/login", {
          method: "POST",
          body: JSON.stringify({
            username,
            password
          })
        });

        currentUser = d.user;

        renderShell();

      } catch (x) {

        document.getElementById("login-msg").innerHTML = `
          <div class="notice error">
            ${esc(x.message)}
          </div>
        `;
      }
    };
}

/* =========================
   MAIN SHELL
========================= */

function renderShell() {

  let nav = `
    <button
      data-page="dashboard"
      class="active"
    >
      Dashboard
    </button>
  `;

  if (currentUser.role === "agent") {

    nav += `
      <button data-page="create">
        ＋ Create Lead
      </button>

      <button data-page="myleads">
        My Leads
      </button>
    `;
  }

  if (currentUser.role === "qc_manager") {

    nav += `
      <button data-page="qcleads">
        QC Queue
      </button>
    `;
  }

  if (currentUser.role === "admin") {

    nav += `
      <button data-page="adminleads">
        All Leads
      </button>

      <button data-page="users">
        Users
      </button>

      <button data-page="export">
        Export
      </button>
    `;
  }

  app.innerHTML = `
    <div class="shell">

      <aside class="sidebar">

        <div class="logo">
          ☀ Solar CRM
          <span class="role">V2</span>
        </div>

        <div class="nav">
          ${nav}
        </div>

        <div class="userbox">

          <strong>
            ${esc(currentUser.displayName)}
          </strong>

          <br>

          <span class="role">
            ${esc(
              currentUser.role.replace("_", " ")
            )}
          </span>

          <br><br>

          <button
            id="logout"
            class="btn btn-secondary"
          >
            Logout
          </button>

        </div>

      </aside>

      <main class="main">
        <div id="page"></div>
      </main>

    </div>
  `;

  document
    .querySelectorAll(".nav button")
    .forEach(b => {

      b.onclick = () => {

        document
          .querySelectorAll(".nav button")
          .forEach(x =>
            x.classList.remove("active")
          );

        b.classList.add("active");

        route(b.dataset.page);
      };
    });

  document.getElementById("logout").onclick =
    async () => {

      try {
        await api("/api/logout", {
          method: "POST"
        });
      } catch (e) {}

      currentUser = null;
      loginView();
    };

  route("dashboard");
}

/* =========================
   ERROR HANDLING
========================= */

async function route(p) {

  const page =
    document.getElementById("page");

  try {

    if (p === "dashboard")
      return await dashboard();

    if (p === "create")
      return createLead();

    if (p === "myleads")
      return await myLeads();

    if (p === "qcleads")
      return await qcLeads();

    if (p === "adminleads")
      return await adminLeads();

    if (p === "users")
      return await users();

    if (p === "export")
      return exportPage();

  } catch (e) {

    console.error("CRM ERROR:", e);

    if (page) {

      page.innerHTML = `
        <div class="card" style="margin:30px">

          <h2>Something went wrong</h2>

          <p>
            <strong>Error:</strong>
            ${esc(e.message)}
          </p>

          <p class="muted">
            Please send me a screenshot of this message.
          </p>

          <button
            class="btn btn-primary"
            onclick="route('dashboard')"
          >
            Try Again
          </button>

        </div>
      `;
    }
  }
}

/* =========================
   TITLES / STATS
========================= */

function title(t, s) {

  return `
    <div class="top">

      <div>

        <div class="title">
          ${esc(t)}
        </div>

        <div class="muted">
          ${esc(s || "")}
        </div>

      </div>

    </div>
  `;
}

function statusPill(s) {

  let c =
    s === "Qualified"
      ? "good"
      : s === "Unqualified"
      ? "bad"
      : "pending";

  return `
    <span class="pill ${c}">
      ${esc(s)}
    </span>
  `;
}

function stats(a) {

  return `
    <div class="grid">

      ${a.map(x => `
        <div class="card">

          <div class="muted">
            ${esc(x.a)}
          </div>

          <div class="stat">
            ${esc(x.n)}
          </div>

        </div>
      `).join("")}

    </div>
  `;
}

/* =========================
   DASHBOARD
========================= */

async function dashboard() {

  const el =
    document.getElementById("page");

  if (!currentUser) {
    return loginView();
  }

  if (currentUser.role === "admin") {

    const d =
      await api("/api/admin/stats");

    el.innerHTML =
      title(
        "Admin Dashboard",
        "Full CRM overview"
      )

      +

      stats([
        {
          a: "Total Leads",
          n: d.total
        },
        {
          a: "Appointments",
          n: d.appointments
        },
        {
          a: "Callbacks",
          n: d.callbacks
        },
        {
          a: "Pending QC",
          n: d.pending
        },
        {
          a: "Qualified",
          n: d.qualified
        },
        {
          a: "Unqualified",
          n: d.unqualified
        },
        {
          a: "No Solar",
          n: d.noSolar
        },
        {
          a: "Has Solar",
          n: d.hasSolar
        }
      ])

      +

      `
        <br>

        <div class="card">

          <h3>
            Agent Performance
          </h3>

          ${agentTable(d.agents)}

        </div>
      `;
  }

  else if (
    currentUser.role === "qc_manager"
  ) {

    const d =
      await api("/api/qc/stats");

    el.innerHTML =
      title(
        "QC Manager Dashboard",
        "Review leads and record QC decisions"
      )

      +

      stats([
        {
          a: "Total Leads",
          n: d.total
        },
        {
          a: "Pending QC",
          n: d.pending
        },
        {
          a: "Qualified",
          n: d.qualified
        },
        {
          a: "Unqualified",
          n: d.unqualified
        }
      ])

      +

      `
        <br>

        <div class="card">

          <h3>
            QC Rule
          </h3>

          <div class="muted">

            Review the lead, add a QC Comment,
            then choose Qualified or Unqualified.

            Customer mobile numbers are not
            available to QC Managers.

          </div>

        </div>
      `;
  }

  else {

    const d =
      await api("/api/my-leads");

    el.innerHTML =
      title(
        "Agent Dashboard",
        `Welcome, ${currentUser.displayName}`
      )

      +

      stats([
        {
          a: "My Leads",
          n: d.leads.length
        },
        {
          a: "Appointments",
          n: d.leads.filter(
            x =>
              x.product_type ===
              "Appointment"
          ).length
        },
        {
          a: "Callbacks",
          n: d.leads.filter(
            x =>
              x.product_type ===
              "Callback"
          ).length
        },
        {
          a: "Qualified",
          n: d.leads.filter(
            x =>
              x.status ===
              "Qualified"
          ).length
        }
      ])

      +

      `
        <br>

        <div class="card">

          <h3>
            Mobile Number Protection
          </h3>

          <div class="muted">

            Mobile numbers are accepted during
            lead creation but are never returned
            to Agents after submission.

            Only Admin can retrieve them.

          </div>

        </div>
      `;
  }
}

function agentTable(a) {

  if (!a.length) {

    return `
      <div class="muted">
        No agents yet.
      </div>
    `;
  }

  return `
    <div class="table-wrap">

      <table class="table">

        <tr>
          <th>Agent</th>
          <th>ID</th>
          <th>Leads</th>
          <th>Qualified</th>
          <th>Unqualified</th>
        </tr>

        ${a.map(x => `
          <tr>

            <td>
              ${esc(x.display_name)}
            </td>

            <td>
              ${esc(x.username)}
            </td>

            <td>
              ${x.lead_count}
            </td>

            <td>
              ${x.qualified || 0}
            </td>

            <td>
              ${x.unqualified || 0}
            </td>

          </tr>
        `).join("")}

      </table>

    </div>
  `;
}

/* =========================
   SELECT
========================= */

function select(
  n,
  l,
  opts,
  req = true
) {

  return `
    <div class="field">

      <label>
        ${esc(l)}
        ${req ? " *" : ""}
      </label>

      <select
        name="${esc(n)}"
        ${req ? "required" : ""}
      >

        <option value="">
          Select...
        </option>

        ${opts.map(x => `
          <option value="${esc(x)}">
            ${esc(x)}
          </option>
        `).join("")}

      </select>

    </div>
  `;
}

/* =========================
   CREATE LEAD
========================= */

function createLead() {

  document.getElementById("page").innerHTML =
    title(
      "Create New Lead",
      "The mobile number becomes inaccessible to Agents after saving."
    )

    +

    `
    <div class="card form-card">

      <div id="lead-msg"></div>

      <form id="lead-form">

        <div class="section-title">
          Lead Type
        </div>

        <div class="form-grid">

          ${select(
            "product_type",
            "Product Type",
            [
              "Callback",
              "Appointment"
            ]
          )}

          ${select(
            "solar_status",
            "Solar Status",
            [
              "No Solar",
              "Has Solar"
            ]
          )}

        </div>

        <div class="section-title">
          Customer Details
        </div>

        <div class="form-grid">

          <div class="field">
            <label>First Name *</label>
            <input name="first_name" required>
          </div>

          <div class="field">
            <label>Last Name *</label>
            <input name="last_name" required>
          </div>

          <div class="field">
            <label>Mobile Number *</label>
            <input
              name="mobile_number"
              inputmode="tel"
              required
            >
          </div>

          <div class="field">
            <label>Email</label>
            <input
              name="email"
              type="email"
            >
          </div>

          <div class="field">
            <label>Street Name *</label>
            <input name="street_name" required>
          </div>

          <div class="field">
            <label>Suburb *</label>
            <input name="suburb" required>
          </div>

          <div class="field">
            <label>Postcode *</label>
            <input
              name="postcode"
              maxlength="4"
              required
            >
          </div>

          ${select(
            "free_standing",
            "Free Standing",
            [
              "Yes",
              "No"
            ]
          )}

          ${select(
            "roof_type",
            "Roof Type",
            [
              "Tile",
              "Metal",
              "Colorbond",
              "Terracotta",
              "Other"
            ]
          )}

          <div class="field">
            <label>Bill *</label>
            <input
              name="bill"
              placeholder="$300"
              required
            >
          </div>

          ${select(
            "under_75",
            "Under 75",
            [
              "Yes",
              "No"
            ]
          )}

        </div>

        <div
          id="solar-extra"
          class="hidden"
        >

          <div class="section-title">
            Existing Solar Details
          </div>

          <div class="form-grid">

            <div class="field">
              <label>
                Number of Panels *
              </label>

              <input
                name="number_of_panels"
                type="number"
                min="0"
              >
            </div>

            <div class="field">
              <label>
                Panels Age *
              </label>

              <input name="panels_age">
            </div>

            ${select(
              "battery",
              "Battery",
              [
                "Yes",
                "No"
              ]
            )}

          </div>

        </div>

        <div class="section-title">
          Qualification & Booking
        </div>

        <div class="form-grid">

          ${select(
            "sunlight",
            "Sunlight",
            [
              "Good",
              "Average",
              "Poor",
              "Unknown"
            ]
          )}

          ${select(
            "quote",
            "Quote",
            [
              "Yes",
              "No",
              "Not Yet"
            ]
          )}

          <div class="field">

            <label>
              Callback / Appointment Date *
            </label>

            <input
              name="appointment_date"
              type="date"
              required
            >

          </div>

          <div class="field">

            <label>
              Callback / Appointment Time *
            </label>

            <input
              name="appointment_time"
              type="time"
              required
            >

          </div>

          <div class="field full">

            <label>
              Additional Comments
            </label>

            <textarea
              name="additional_comment"
            ></textarea>

          </div>

        </div>

        <button
          class="btn btn-primary"
        >
          Create Lead
        </button>

      </form>

    </div>
    `;

  const f =
    document.getElementById("lead-form");

  const solar =
    f.querySelector(
      '[name="solar_status"]'
    );

  const extra =
    document.getElementById(
      "solar-extra"
    );

  function toggle() {

    const hasSolar =
      solar.value === "Has Solar";

    extra.classList.toggle(
      "hidden",
      !hasSolar
    );

    extra
      .querySelectorAll(
        "input,select"
      )
      .forEach(x => {
        x.required = hasSolar;
      });
  }

  solar.onchange = toggle;

  toggle();

  f.onsubmit =
    async e => {

      e.preventDefault();

      try {

        const body =
          Object.fromEntries(
            new FormData(f).entries()
          );

        const d =
          await api("/api/leads", {
            method: "POST",
            body: JSON.stringify(body)
          });

        document.getElementById(
          "lead-msg"
        ).innerHTML = `
          <div class="notice success">

            Lead created:
            <strong>
              ${esc(d.leadCode)}
            </strong>.

            Mobile number is now protected.

          </div>
        `;

        f.reset();

        toggle();

      } catch (x) {

        document.getElementById(
          "lead-msg"
        ).innerHTML = `
          <div class="notice error">
            ${esc(x.message)}
          </div>
        `;
      }
    };
}

/* =========================
   TABLE
========================= */

function basicTable(
  rows,
  admin = false,
  qc = false
) {

  if (!rows.length) {

    return `
      <div class="card empty muted">
        No leads found.
      </div>
    `;
  }

  return `
    <div class="table-wrap">

      <table class="table">

        <tr>

          <th>Lead ID</th>

          ${
            admin || qc
              ? "<th>Agent</th>"
              : ""
          }

          <th>Customer</th>

          ${
            admin
              ? "<th>Mobile</th>"
              : ""
          }

          <th>Solar</th>
          <th>Type</th>
          <th>Suburb</th>
          <th>Postcode</th>
          <th>Date</th>
          <th>Time</th>
          <th>Status</th>

          ${
            qc
              ? "<th>QC Comment</th><th>Action</th>"
              : admin
              ? "<th>QC Comment</th>"
              : ""
          }

        </tr>

        ${rows.map(r => `

          <tr>

            <td>
              ${esc(r.lead_code)}
            </td>

            ${
              admin || qc
                ? `
                  <td>
                    ${esc(r.agent_name)}
                    <br>
                    <span class="muted">
                      ${esc(r.agent_username)}
                    </span>
                  </td>
                `
                : ""
            }

            <td>
              ${esc(r.first_name)}
              ${esc(r.last_name)}
            </td>

            ${
              admin
                ? `
                  <td>
                    <strong>
                      ${esc(r.mobile_number)}
                    </strong>
                  </td>
                `
                : ""
            }

            <td>
              ${esc(r.solar_status)}
            </td>

            <td>
              ${esc(r.product_type)}
            </td>

            <td>
              ${esc(r.suburb)}
            </td>

            <td>
              ${esc(r.postcode)}
            </td>

            <td>
              ${esc(r.appointment_date)}
            </td>

            <td>
              ${esc(r.appointment_time)}
            </td>

            <td>
              ${statusPill(r.status)}
            </td>

            ${
              qc
                ? `
                  <td>
                    ${esc(
                      r.qc_comment || "—"
                    )}
                  </td>

                  <td>

                    ${
                      r.status ===
                      "Pending QC"

                        ? `
                          <button
                            class="btn btn-success mini"
                            onclick="reviewLead(${r.id},'Qualified')"
                          >
                            Qualified
                          </button>

                          <button
                            class="btn btn-danger mini"
                            onclick="reviewLead(${r.id},'Unqualified')"
                          >
                            Unqualified
                          </button>
                        `

                        : "Reviewed"
                    }

                  </td>
                `

                : admin
                ? `
                  <td>
                    ${esc(
                      r.qc_comment || "—"
                    )}
                  </td>
                `
                : ""
            }

          </tr>

        `).join("")}

      </table>

    </div>
  `;
}

/* =========================
   MY LEADS
========================= */

async function myLeads() {

  const d =
    await api("/api/my-leads");

  document.getElementById(
    "page"
  ).innerHTML =

    title(
      "My Leads",
      "Only your leads. Mobile numbers are excluded."
    )

    +

    basicTable(d.leads);
}

/* =========================
   QC
========================= */

async function qcLeads() {

  const d =
    await api("/api/qc/leads");

  document.getElementById(
    "page"
  ).innerHTML =

    title(
      "QC Queue",
      "Mobile numbers are deliberately unavailable to QC Managers"
    )

    +

    `
      <div class="toolbar">

        <select id="qcfilter">

          <option value="">
            All
          </option>

          <option value="Pending QC">
            Pending QC
          </option>

          <option value="Qualified">
            Qualified
          </option>

          <option value="Unqualified">
            Unqualified
          </option>

        </select>

      </div>

      <div id="qc-table">
        ${basicTable(
          d.leads,
          false,
          true
        )}
      </div>
    `;

  document.getElementById(
    "qcfilter"
  ).onchange = async () => {

    const filter =
      document.getElementById(
        "qcfilter"
      ).value;

    const x =
      await api(
        "/api/qc/leads?status=" +
        encodeURIComponent(filter)
      );

    document.getElementById(
      "qc-table"
    ).innerHTML =
      basicTable(
        x.leads,
        false,
        true
      );
  };
}

async function reviewLead(
  id,
  status
) {

  const comment =
    prompt(
      `Enter QC Comment for ${status}:`
    );

  if (comment === null)
    return;

  if (!comment.trim()) {

    alert(
      "QC Comment is required."
    );

    return;
  }

  try {

    await api(
      "/api/qc/leads/" +
      id +
      "/review",
      {
        method: "PATCH",
        body: JSON.stringify({
          status,
          qc_comment:
            comment.trim()
        })
      }
    );

    await qcLeads();

  } catch (e) {

    alert(e.message);
  }
}

/* =========================
   ADMIN LEADS
========================= */

async function adminLeads() {

  const d =
    await api("/api/admin/leads");

  document.getElementById(
    "page"
  ).innerHTML =

    title(
      "All Leads",
      "Admin-only: full lead data including protected mobile numbers"
    )

    +

    `
      <div class="toolbar">

        <input
          id="search"
          placeholder="Search lead, name, suburb, agent or mobile"
        >

        <select id="af">

          <option value="">
            All statuses
          </option>

          <option value="Pending QC">
            Pending QC
          </option>

          <option value="Qualified">
            Qualified
          </option>

          <option value="Unqualified">
            Unqualified
          </option>

        </select>

        <button
          class="btn btn-secondary"
          onclick="loadAdmin()"
        >
          Search
        </button>

        <a
          class="btn btn-primary"
          href="${API_URL}/api/admin/export"
          target="_blank"
        >
          Export CSV
        </a>

      </div>

      <div id="admin-table">

        ${basicTable(
          d.leads,
          true
        )}

      </div>
    `;
}

async function loadAdmin() {

  const q =
    encodeURIComponent(
      document.getElementById(
        "search"
      ).value
    );

  const s =
    encodeURIComponent(
      document.getElementById(
        "af"
      ).value
    );

  const d =
    await api(
      "/api/admin/leads?q=" +
      q +
      "&status=" +
      s
    );

  document.getElementById(
    "admin-table"
  ).innerHTML =
    basicTable(
      d.leads,
      true
    );
}

/* =========================
   USERS
========================= */

async function users() {

  const d =
    await api("/api/admin/users");

  document.getElementById(
    "page"
  ).innerHTML =

    title(
      "User Management",
      "Create, deactivate or reset accounts"
    )

    +

    `
      <div class="two-col">

        <div class="card">

          <h3>
            Create User
          </h3>

          <div id="user-msg"></div>

          <form id="user-form">

            <div class="field">

              <label>
                Display Name *
              </label>

              <input
                name="display_name"
                required
              >

            </div>

            <div class="field">

              <label>
                Login ID *
              </label>

              <input
                name="username"
                required
              >

            </div>

            ${select(
              "role",
              "Role",
              [
                "agent",
                "qc_manager",
                "admin"
              ]
            )}

            <div class="field">

              <label>
                Password *
              </label>

              <input
                name="password"
                type="password"
                minlength="8"
                required
              >

            </div>

            <button
              class="btn btn-primary"
            >
              Create User
            </button>

          </form>

        </div>

        <div class="card">

          <h3>
            Roles
          </h3>

          <div class="muted">

            <b>Agent:</b>
            creates and sees own leads only.

            <br><br>

            <b>QC Manager:</b>
            reviews leads and records
            Qualified/Unqualified +
            QC Comment.

            <br><br>

            <b>Admin:</b>
            full control and mobile-number access.

          </div>

        </div>

      </div>

      <br>

      <div class="table-wrap">

        <table class="table">

          <tr>

            <th>Name</th>
            <th>Login ID</th>
            <th>Role</th>
            <th>Active</th>
            <th>Created</th>
            <th>Actions</th>

          </tr>

          ${d.users.map(u => `

            <tr>

              <td>
                ${esc(u.display_name)}
              </td>

              <td>
                ${esc(u.username)}
              </td>

              <td>
                ${esc(u.role)}
              </td>

              <td>
                ${u.active ? "Yes" : "No"}
              </td>

              <td>
                ${esc(u.created_at)}
              </td>

              <td class="actions">

                ${
                  u.id !== currentUser.id

                    ? `

                      <button
                        class="btn ${
                          u.active
                            ? "btn-danger"
                            : "btn-success"
                        } mini"
                        onclick="toggleUser(
                          ${u.id},
                          ${!u.active}
                        )"
                      >
                        ${
                          u.active
                            ? "Deactivate"
                            : "Activate"
                        }
                      </button>

                      <button
                        class="btn btn-secondary mini"
                        onclick="resetPw(${u.id})"
                      >
                        Reset Password
                      </button>

                    `

                    : "Current account"
                }

              </td>

            </tr>

          `).join("")}

        </table>

      </div>
    `;

  document.getElementById(
    "user-form"
  ).onsubmit =
    async e => {

      e.preventDefault();

      try {

        await api(
          "/api/admin/users",
          {
            method: "POST",
            body: JSON.stringify(
              Object.fromEntries(
                new FormData(
                  e.target
                ).entries()
              )
            )
          }
        );

        await users();

      } catch (x) {

        document.getElementById(
          "user-msg"
        ).innerHTML = `
          <div class="notice error">
            ${esc(x.message)}
          </div>
        `;
      }
    };
}

async function toggleUser(
  id,
  active
) {

  try {

    await api(
      "/api/admin/users/" +
      id +
      "/active",
      {
        method: "PATCH",
        body: JSON.stringify({
          active
        })
      }
    );

    await users();

  } catch (e) {

    alert(e.message);
  }
}

async function resetPw(id) {

  const p =
    prompt(
      "Enter new password (minimum 8 characters):"
    );

  if (p === null)
    return;

  try {

    await api(
      "/api/admin/users/" +
      id +
      "/password",
      {
        method: "PATCH",
        body: JSON.stringify({
          password: p
        })
      }
    );

    alert(
      "Password reset successfully."
    );

  } catch (e) {

    alert(e.message);
  }
}

/* =========================
   EXPORT
========================= */

function exportPage() {

  document.getElementById(
    "page"
  ).innerHTML =

    title(
      "Export",
      "Download the complete lead database as CSV"
    )

    +

    `
      <div class="card">

        <h3>
          Export Leads
        </h3>

        <p class="muted">
          Admin-only export containing
          complete lead information,
          including mobile numbers.
        </p>

        <a
          class="btn btn-primary"
          href="${API_URL}/api/admin/export"
          target="_blank"
        >
          Download CSV
        </a>

      </div>
    `;
}

/* =========================
   START
========================= */

(async () => {

  try {

    const d =
      await api("/api/me");

    if (d.user) {

      currentUser =
        d.user;

      renderShell();

    } else {

      loginView();
    }

  } catch (e) {

    console.error(
      "Initialisation error:",
      e
    );

    loginView();
  }

})();
