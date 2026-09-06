const app = document.getElementById("app");

let currentUser = null;

const API_URL = "https://solar-crm-uudg.onrender.com";

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[c])
  );

async function api(url, options = {}) {
  const r = await fetch(API_URL + url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.error || `Request failed (${r.status})`);
  }

  return data;
}

/* =========================
   ERROR DISPLAY
========================= */

function showPageError(error) {
  const page = document.getElementById("page");

  if (!page) return;

  page.innerHTML = `
    <div class="card">
      <h2>Something went wrong</h2>
      <div class="notice error">
        ${esc(error?.message || "Unable to load this page.")}
      </div>

      <button
        class="btn btn-primary"
        onclick="route('dashboard')"
      >
        Back to Dashboard
      </button>
    </div>
  `;
}

/* =========================
   LOGIN
========================= */

function loginView() {
  app.innerHTML = `
    <div class="login-wrap">

      <div class="login-card">

        <div class="brand">
          ☀ Solar CRM
        </div>

        <div class="muted">
          V2 • Secure Lead Management
        </div>

        <br>

        <div id="login-msg"></div>

        <form id="login-form">

          <div class="field">
            <label>Login ID</label>
            <input
              id="username"
              autocomplete="username"
              required
            >
          </div>

          <div class="field">
            <label>Password</label>
            <input
              id="password"
              type="password"
              autocomplete="current-password"
              required
            >
          </div>

          <button
            class="btn btn-primary"
            style="width:100%"
            type="submit"
          >
            Login
          </button>

        </form>

      </div>

    </div>
  `;

  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();

    const msg = document.getElementById("login-msg");

    msg.innerHTML =
      `<div class="notice">Logging in...</div>`;

    try {
      const d = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username:
            document.getElementById("username").value,
          password:
            document.getElementById("password").value
        })
      });

      currentUser = d.user;

      renderShell();

    } catch (err) {
      msg.innerHTML =
        `<div class="notice error">${esc(err.message)}</div>`;
    }
  };
}

/* =========================
   MAIN SHELL
========================= */

function renderShell() {
  const role = currentUser.role;

  const isAdmin = role === "admin";
  const isQC = role === "qc_manager";
  const isAgent = role === "agent";

  let navigation = `
    <button
      data-page="dashboard"
      class="active"
    >
      📊 Dashboard
    </button>
  `;

  if (isAdmin) {
    navigation += `
      <button data-page="admin">
        📋 All Leads
      </button>

      <button data-page="users">
        👥 Users
      </button>

      <button data-page="export">
        📥 Export
      </button>
    `;
  }

  if (isQC) {
    navigation += `
      <button data-page="qc">
        ✅ QC Leads
      </button>
    `;
  }

  if (isAgent) {
    navigation += `
      <button data-page="create">
        ＋ Create Lead
      </button>

      <button data-page="myleads">
        📋 My Leads
      </button>
    `;
  }

  app.innerHTML = `
    <div class="shell">

      <aside class="sidebar">

        <div class="logo">
          ☀ Solar CRM
        </div>

        <div class="nav">
          ${navigation}
        </div>

        <div class="userbox">

          <strong>
            ${esc(currentUser.displayName)}
          </strong>

          <br>

          <span>
            ${roleLabel(role)}
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
    .forEach((button) => {
      button.onclick = () => {

        document
          .querySelectorAll(".nav button")
          .forEach((x) =>
            x.classList.remove("active")
          );

        button.classList.add("active");

        route(button.dataset.page);
      };
    });

  document.getElementById("logout").onclick =
    async () => {

      try {
        await api("/api/logout", {
          method: "POST"
        });
      } catch {}

      currentUser = null;

      loginView();
    };

  route("dashboard");
}

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "qc_manager") return "QC Manager";
  if (role === "agent") return "Agent";

  return role;
}

/* =========================
   ROUTING
========================= */

async function route(page) {

  try {

    if (page === "dashboard") {
      await dashboard();
      return;
    }

    if (page === "create") {
      createLead();
      return;
    }

    if (page === "myleads") {
      await myLeads();
      return;
    }

    if (page === "admin") {
      await adminLeads();
      return;
    }

    if (page === "users") {
      await users();
      return;
    }

    if (page === "qc") {
      await qcLeads();
      return;
    }

    if (page === "export") {
      exportPage();
      return;
    }

  } catch (err) {

    console.error(err);

    showPageError(err);
  }
}

/* =========================
   PAGE TITLE
========================= */

function pageTitle(title, sub = "") {
  return `
    <div class="top">

      <div>
        <div class="title">
          ${esc(title)}
        </div>

        <div class="muted">
          ${esc(sub)}
        </div>
      </div>

    </div>
  `;
}

/* =========================
   ADMIN DASHBOARD
========================= */

async function dashboard() {

  if (currentUser.role === "admin") {

    const d =
      await api("/api/admin/stats");

    document.getElementById("page").innerHTML =
      pageTitle(
        "Admin Dashboard",
        "Overview of your Solar CRM"
      ) +

      `
      <div class="grid">

        ${statCard(
          "Total Leads",
          d.total
        )}

        ${statCard(
          "Appointments",
          d.appointments
        )}

        ${statCard(
          "Callbacks",
          d.callbacks
        )}

        ${statCard(
          "Pending QC",
          d.pending
        )}

        ${statCard(
          "Qualified",
          d.qualified
        )}

        ${statCard(
          "Unqualified",
          d.unqualified
        )}

      </div>

      <br>

      <div class="card">

        <h3>Agent Performance</h3>

        ${
          d.agents && d.agents.length
            ? `
              <div class="table-wrap">

                <table class="table">

                  <tr>
                    <th>Agent</th>
                    <th>Login ID</th>
                    <th>Leads</th>
                    <th>Qualified</th>
                    <th>Unqualified</th>
                  </tr>

                  ${d.agents
                    .map(
                      (a) => `
                        <tr>

                          <td>
                            ${esc(a.display_name)}
                          </td>

                          <td>
                            ${esc(a.username)}
                          </td>

                          <td>
                            ${a.lead_count || 0}
                          </td>

                          <td>
                            ${a.qualified || 0}
                          </td>

                          <td>
                            ${a.unqualified || 0}
                          </td>

                        </tr>
                      `
                    )
                    .join("")}

                </table>

              </div>
            `
            : `
              <div class="muted">
                No agents yet.
              </div>
            `
        }

      </div>
      `;
  }

  else if (currentUser.role === "qc_manager") {

    const d =
      await api("/api/qc/stats");

    document.getElementById("page").innerHTML =
      pageTitle(
        "QC Dashboard",
        "Review and qualify submitted leads"
      ) +

      `
      <div class="grid">

        ${statCard(
          "Total Leads",
          d.total
        )}

        ${statCard(
          "Pending QC",
          d.pending
        )}

        ${statCard(
          "Qualified",
          d.qualified
        )}

        ${statCard(
          "Unqualified",
          d.unqualified
        )}

      </div>

      <br>

      <div class="card">

        <h3>QC Process</h3>

        <p class="muted">
          Review submitted leads, add a QC Comment,
          and mark each lead as Qualified or Unqualified.
        </p>

        <button
          class="btn btn-primary"
          onclick="route('qc')"
        >
          Open QC Leads
        </button>

      </div>
      `;
  }

  else {

    const d =
      await api("/api/my-leads");

    const leads =
      d.leads || [];

    const appointments =
      leads.filter(
        (x) =>
          x.product_type === "Appointment"
      ).length;

    const callbacks =
      leads.filter(
        (x) =>
          x.product_type === "Callback"
      ).length;

    const qualified =
      leads.filter(
        (x) =>
          x.status === "Qualified"
      ).length;

    const pending =
      leads.filter(
        (x) =>
          x.status === "Pending QC"
      ).length;

    document.getElementById("page").innerHTML =
      pageTitle(
        "Agent Dashboard",
        `Welcome, ${currentUser.displayName}`
      ) +

      `
      <div class="grid">

        ${statCard(
          "My Leads",
          leads.length
        )}

        ${statCard(
          "Appointments",
          appointments
        )}

        ${statCard(
          "Callbacks",
          callbacks
        )}

        ${statCard(
          "Pending QC",
          pending
        )}

        ${statCard(
          "Qualified",
          qualified
        )}

      </div>

      <br>

      <div class="card">

        <h3>🔒 Mobile Number Protection</h3>

        <p class="muted">
          Mobile numbers are accepted when you create
          a lead but are not returned to your account
          after submission.
        </p>

        <p class="muted">
          Only Admin users can retrieve submitted
          mobile numbers.
        </p>

      </div>

      <br>

      <button
        class="btn btn-primary"
        onclick="route('create')"
      >
        ＋ Create New Lead
      </button>
      `;
  }
}

/* =========================
   STAT CARD
========================= */

function statCard(label, value) {

  return `
    <div class="card">

      <div class="muted">
        ${esc(label)}
      </div>

      <div class="stat">
        ${value ?? 0}
      </div>

    </div>
  `;
}

/* =========================
   SELECT HELPER
========================= */

function select(
  name,
  label,
  options,
  required = true
) {

  return `
    <div class="field">

      <label>
        ${esc(label)}
        ${required ? " *" : ""}
      </label>

      <select
        name="${esc(name)}"
        ${required ? "required" : ""}
      >

        <option value="">
          Select...
        </option>

        ${options
          .map(
            (x) =>
              `<option value="${esc(x)}">
                ${esc(x)}
              </option>`
          )
          .join("")}

      </select>

    </div>
  `;
}

/* =========================
   CREATE LEAD
========================= */

function createLead() {

  document.getElementById("page").innerHTML =
    pageTitle(
      "Create New Lead",
      "Enter the customer details below"
    ) +

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
            <input
              name="first_name"
              required
            >
          </div>

          <div class="field">
            <label>Last Name *</label>
            <input
              name="last_name"
              required
            >
          </div>

          <div class="field">
            <label>Mobile Number *</label>

            <input
              name="mobile_number"
              inputmode="tel"
              required
            >

            <small class="muted">
              Hidden from agent after submission
            </small>
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

            <input
              name="street_name"
              required
            >
          </div>

          <div class="field">
            <label>Suburb *</label>

            <input
              name="suburb"
              required
            >
          </div>

          <div class="field">
            <label>Postcode *</label>

            <input
              name="postcode"
              maxlength="4"
              inputmode="numeric"
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

            <label>
              Bill *
            </label>

            <input
              name="bill"
              placeholder="e.g. $300"
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

              <input
                name="panels_age"
                placeholder="e.g. 7 years"
              >

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
              placeholder="Anything the rep should know..."
            ></textarea>

          </div>

        </div>

        <button
          class="btn btn-primary"
          type="submit"
        >
          Create Lead
        </button>

      </form>

    </div>
    `;

  const form =
    document.getElementById(
      "lead-form"
    );

  const solar =
    form.querySelector(
      '[name="solar_status"]'
    );

  const extra =
    document.getElementById(
      "solar-extra"
    );

  function toggleSolar() {

    const hasSolar =
      solar.value === "Has Solar";

    extra.classList.toggle(
      "hidden",
      !hasSolar
    );

    extra
      .querySelectorAll(
        "input, select"
      )
      .forEach(
        (x) => {
          x.required = hasSolar;
        }
      );
  }

  solar.onchange =
    toggleSolar;

  form.onsubmit =
    async (e) => {

      e.preventDefault();

      const msg =
        document.getElementById(
          "lead-msg"
        );

      const obj =
        Object.fromEntries(
          new FormData(form).entries()
        );

      msg.innerHTML =
        `<div class="notice">
          Creating lead...
        </div>`;

      try {

        const d =
          await api(
            "/api/leads",
            {
              method: "POST",
              body:
                JSON.stringify(obj)
            }
          );

        msg.innerHTML =
          `
          <div class="notice success">

            <strong>
              Lead created successfully!
            </strong>

            <br><br>

            Lead ID:
            <strong>
              ${esc(d.leadCode)}
            </strong>

            <br><br>

            The mobile number is now hidden
            from your account.

          </div>
          `;

        form.reset();

        toggleSolar();

      } catch (err) {

        msg.innerHTML =
          `
          <div class="notice error">
            ${esc(err.message)}
          </div>
          `;
      }
    };
}

/* =========================
   AGENT MY LEADS
========================= */

async function myLeads() {

  const d =
    await api("/api/my-leads");

  const rows =
    d.leads || [];

  document.getElementById("page").innerHTML =
    pageTitle(
      "My Leads",
      "Only your submitted leads are shown. Mobile numbers are protected."
    ) +

    tableHTML(
      rows,
      "agent"
    );
}

/* =========================
   ADMIN LEADS
========================= */

async function adminLeads() {

  const d =
    await api("/api/admin/leads");

  const rows =
    d.leads || [];

  document.getElementById("page").innerHTML =
    pageTitle(
      "All Leads",
      "Admin-only lead management"
    ) +

    `
    <div class="card">

      <div class="form-grid">

        <div class="field">

          <label>
            Search
          </label>

          <input
            id="admin-search"
            placeholder="Lead ID, name, suburb, mobile..."
          >

        </div>

        <div class="field">

          <label>
            Status
          </label>

          <select id="admin-status">

            <option value="">
              All Statuses
            </option>

            <option>
              Pending QC
            </option>

            <option>
              Qualified
            </option>

            <option>
              Unqualified
            </option>

          </select>

        </div>

      </div>

      <button
        class="btn btn-primary"
        onclick="loadAdminFiltered()"
      >
        Search
      </button>

    </div>

    <br>

    <div id="admin-leads-table">
      ${tableHTML(rows, "admin")}
    </div>
    `;
}

async function loadAdminFiltered() {

  const q =
    document.getElementById(
      "admin-search"
    )?.value || "";

  const status =
    document.getElementById(
      "admin-status"
    )?.value || "";

  const params =
    new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (status) {
    params.set("status", status);
  }

  try {

    const d =
      await api(
        "/api/admin/leads?" +
        params.toString()
      );

    document.getElementById(
      "admin-leads-table"
    ).innerHTML =
      tableHTML(
        d.leads || [],
        "admin"
      );

  } catch (err) {

    document.getElementById(
      "admin-leads-table"
    ).innerHTML =
      `
      <div class="notice error">
        ${esc(err.message)}
      </div>
      `;
  }
}

/* =========================
   TABLE
========================= */

function tableHTML(
  rows,
  mode
) {

  if (!rows.length) {

    return `
      <div class="card muted">
        No leads found.
      </div>
    `;
  }

  const admin =
    mode === "admin";

  const headers =
    admin
      ? [
          "Lead ID",
          "Agent",
          "Customer",
          "Mobile",
          "Solar",
          "Type",
          "Suburb",
          "Postcode",
          "Booking",
          "Status"
        ]
      : [
          "Lead ID",
          "Customer",
          "Solar",
          "Type",
          "Suburb",
          "Postcode",
          "Booking",
          "Status"
        ];

  return `
    <div class="table-wrap">

      <table class="table">

        <thead>

          <tr>

            ${headers
              .map(
                (h) =>
                  `<th>${esc(h)}</th>`
              )
              .join("")}

          </tr>

        </thead>

        <tbody>

          ${rows
            .map(
              (r) => `

              <tr>

                <td>
                  <strong>
                    ${esc(r.lead_code)}
                  </strong>
                </td>

                ${
                  admin
                    ? `
                      <td>
                        ${esc(
                          r.agent_name
                        )}

                        <br>

                        <small class="muted">
                          ${esc(
                            r.agent_username
                          )}
                        </small>
                      </td>
                    `
                    : ""
                }

                <td>
                  ${esc(
                    r.first_name
                  )}
                  ${esc(
                    r.last_name
                  )}
                </td>

                ${
                  admin
                    ? `
                      <td>
                        <strong>
                          ${esc(
                            r.mobile_number
                          )}
                        </strong>
                      </td>
                    `
                    : ""
                }

                <td>
                  ${statusPill(
                    r.solar_status
                  )}
                </td>

                <td>
                  ${esc(
                    r.product_type
                  )}
                </td>

                <td>
                  ${esc(
                    r.suburb
                  )}
                </td>

                <td>
                  ${esc(
                    r.postcode
                  )}
                </td>

                <td>
                  ${esc(
                    r.appointment_date
                  )}

                  <br>

                  <small>
                    ${esc(
                      r.appointment_time
                    )}
                  </small>
                </td>

                <td>

                  ${
                    admin
                      ? `
                        <select
                          onchange="
                            changeStatus(
                              ${r.id},
                              this.value
                            )
                          "
                        >

                          ${[
                            "Pending QC",
                            "Qualified",
                            "Unqualified"
                          ]
                            .map(
                              (s) =>
                                `
                                <option
                                  value="${esc(s)}"
                                  ${
                                    s ===
                                    r.status
                                      ? "selected"
                                      : ""
                                  }
                                >
                                  ${esc(s)}
                                </option>
                                `
                            )
                            .join("")}

                        </select>
                      `
                      : statusPill(
                          r.status
                        )
                  }

                </td>

              </tr>

            `
            )
            .join("")}

        </tbody>

      </table>

    </div>
  `;
}

/* =========================
   STATUS PILL
========================= */

function statusPill(status) {

  let cls = "";

  if (status === "Qualified") {
    cls = "qualified";
  }

  if (status === "Unqualified") {
    cls = "unqualified";
  }

  if (status === "Pending QC") {
    cls = "pending";
  }

  return `
    <span class="pill ${cls}">
      ${esc(status)}
    </span>
  `;
}

/* =========================
   ADMIN STATUS
========================= */

async function changeStatus(
  id,
  status
) {

  try {

    await api(
      "/api/admin/leads/" +
      id +
      "/status",
      {
        method: "PATCH",
        body:
          JSON.stringify({
            status
          })
      }
    );

    await adminLeads();

  } catch (e) {

    alert(e.message);
  }
}

/* =========================
   QC LEADS
========================= */

async function qcLeads() {

  const d =
    await api(
      "/api/qc/leads?status=Pending%20QC"
    );

  const rows =
    d.leads || [];

  document.getElementById("page").innerHTML =
    pageTitle(
      "QC Leads",
      "Review pending leads and mark them Qualified or Unqualified"
    ) +

    `
    <div class="card">

      <div class="field">

        <label>
          Filter
        </label>

        <select
          id="qc-filter"
          onchange="loadQCLeads(this.value)"
        >

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

    </div>

    <br>

    <div id="qc-leads">
      ${qcTable(rows)}
    </div>
    `;
}

async function loadQCLeads(
  status
) {

  try {

    const d =
      await api(
        "/api/qc/leads?status=" +
        encodeURIComponent(status)
      );

    document.getElementById(
      "qc-leads"
    ).innerHTML =
      qcTable(
        d.leads || []
      );

  } catch (err) {

    document.getElementById(
      "qc-leads"
    ).innerHTML =
      `
      <div class="notice error">
        ${esc(err.message)}
      </div>
      `;
  }
}

function qcTable(rows) {

  if (!rows.length) {

    return `
      <div class="card muted">
        No leads found for this status.
      </div>
    `;
  }

  return `
    <div class="table-wrap">

      <table class="table">

        <tr>

          <th>Lead ID</th>
          <th>Agent</th>
          <th>Customer</th>
          <th>Product</th>
          <th>Solar</th>
          <th>Suburb</th>
          <th>Booking</th>
          <th>Status</th>
          <th>QC Action</th>

        </tr>

        ${rows
          .map(
            (r) => `

            <tr>

              <td>
                <strong>
                  ${esc(r.lead_code)}
                </strong>
              </td>

              <td>
                ${esc(
                  r.agent_name
                )}
              </td>

              <td>
                ${esc(
                  r.first_name
                )}
                ${esc(
                  r.last_name
                )}
              </td>

              <td>
                ${esc(
                  r.product_type
                )}
              </td>

              <td>
                ${esc(
                  r.solar_status
                )}
              </td>

              <td>
                ${esc(
                  r.suburb
                )}
              </td>

              <td>
                ${esc(
                  r.appointment_date
                )}

                <br>

                ${esc(
                  r.appointment_time
                )}
              </td>

              <td>
                ${statusPill(
                  r.status
                )}
              </td>

              <td>

                ${
                  r.status ===
                  "Pending QC"
                    ? `
                      <button
                        class="btn btn-primary"
                        onclick="
                          openQCModal(
                            ${r.id},
                            '${esc(
                              r.lead_code
                            )}'
                          )
                        "
                      >
                        Review
                      </button>
                    `
                    : `
                      <span class="muted">
                        Reviewed
                      </span>
                    `
                }

              </td>

            </tr>
          `
          )
          .join("")}

      </table>

    </div>
  `;
}

/* =========================
   QC MODAL
========================= */

function openQCModal(
  id,
  leadCode
) {

  const existing =
    document.getElementById(
      "qc-modal"
    );

  if (existing) {
    existing.remove();
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div
      id="qc-modal"
      class="modal-overlay"
    >

      <div class="modal">

        <h2>
          QC Review
        </h2>

        <p>
          Lead:
          <strong>
            ${esc(leadCode)}
          </strong>
        </p>

        <div class="field">

          <label>
            QC Decision *
          </label>

          <select id="qc-status">

            <option value="">
              Select decision...
            </option>

            <option value="Qualified">
              Qualified
            </option>

            <option value="Unqualified">
              Unqualified
            </option>

          </select>

        </div>

        <div class="field">

          <label>
            QC Comment *
          </label>

          <textarea
            id="qc-comment"
            placeholder="Enter QC comment..."
            rows="5"
          ></textarea>

        </div>

        <div id="qc-modal-msg"></div>

        <div class="modal-actions">

          <button
            class="btn btn-secondary"
            onclick="
              document
                .getElementById('qc-modal')
                .remove()
            "
          >
            Cancel
          </button>

          <button
            class="btn btn-primary"
            onclick="
              submitQCReview(${id})
            "
          >
            Save Review
          </button>

        </div>

      </div>

    </div>
    `
  );
}

async function submitQCReview(
  id
) {

  const status =
    document.getElementById(
      "qc-status"
    ).value;

  const comment =
    document.getElementById(
      "qc-comment"
    ).value.trim();

  const msg =
    document.getElementById(
      "qc-modal-msg"
    );

  if (!status) {

    msg.innerHTML =
      `
      <div class="notice error">
        Please select Qualified or Unqualified.
      </div>
      `;

    return;
  }

  if (!comment) {

    msg.innerHTML =
      `
      <div class="notice error">
        QC Comment is required.
      </div>
      `;

    return;
  }

  try {

    await api(
      "/api/qc/leads/" +
      id +
      "/review",
      {
        method: "PATCH",
        body:
          JSON.stringify({
            status,
            qc_comment: comment
          })
      }
    );

    document
      .getElementById(
        "qc-modal"
      )
      .remove();

    await qcLeads();

  } catch (err) {

    msg.innerHTML =
      `
      <div class="notice error">
        ${esc(err.message)}
      </div>
      `;
  }
}

/* =========================
   USERS
========================= */

async function users() {

  const d =
    await api(
      "/api/admin/users"
    );

  const rows =
    d.users || [];

  document.getElementById("page").innerHTML =
    pageTitle(
      "User Management",
      "Create and manage Admin, QC Manager and Agent accounts"
    ) +

    `
    <div class="card">

      <h3>Create New User</h3>

      <form id="user-form">

        <div class="form-grid">

          <div class="field">

            <label>
              Login ID *
            </label>

            <input
              name="username"
              required
              placeholder="e.g. agent02"
            >

          </div>

          <div class="field">

            <label>
              Display Name *
            </label>

            <input
              name="display_name"
              required
              placeholder="e.g. John Smith"
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

        </div>

        <button
          class="btn btn-primary"
          type="submit"
        >
          Create User
        </button>

      </form>

      <div id="user-msg"></div>

    </div>

    <br>

    <div class="card">

      <h3>Existing Users</h3>

      <div class="table-wrap">

        <table class="table">

          <tr>
            <th>Name</th>
            <th>Login ID</th>
            <th>Role</th>
            <th>Active</th>
            <th>Created</th>
            <th>Action</th>
          </tr>

          ${rows
            .map(
              (u) => `

              <tr>

                <td>
                  ${esc(
                    u.display_name
                  )}
                </td>

                <td>
                  ${esc(
                    u.username
                  )}
                </td>

                <td>
                  ${roleLabel(
                    u.role
                  )}
                </td>

                <td>
                  ${
                    u.active
                      ? "Yes"
                      : "No"
                  }
                </td>

                <td>
                  ${esc(
                    u.created_at
                  )}
                </td>

                <td>

                  ${
                    u.id ===
                    currentUser.id
                      ? `
                        <span class="muted">
                          Current account
                        </span>
                      `
                      : `
                        <button
                          class="btn btn-secondary"
                          onclick="
                            toggleUser(
                              ${u.id},
                              ${u.active ? 0 : 1}
                            )
                          "
                        >
                          ${
                            u.active
                              ? "Deactivate"
                              : "Activate"
                          }
                        </button>

                        <button
                          class="btn btn-secondary"
                          onclick="
                            resetUserPassword(
                              ${u.id},
                              '${esc(
                                u.username
                              )}'
                            )
                          "
                        >
                          Reset Password
                        </button>
                      `
                  }

                </td>

              </tr>
            `
            )
            .join("")}

        </table>

      </div>

    </div>
    `;

  document.getElementById(
    "user-form"
  ).onsubmit =
    async (e) => {

      e.preventDefault();

      const form =
        e.target;

      const obj =
        Object.fromEntries(
          new FormData(form).entries()
        );

      const msg =
        document.getElementById(
          "user-msg"
        );

      try {

        await api(
          "/api/admin/users",
          {
            method: "POST",
            body:
              JSON.stringify(obj)
          }
        );

        msg.innerHTML =
          `
          <div class="notice success">
            User created successfully.
          </div>
          `;

        form.reset();

        await users();

      } catch (err) {

        msg.innerHTML =
          `
          <div class="notice error">
            ${esc(err.message)}
          </div>
          `;
      }
    };
}

/* =========================
   USER ACTIVE/INACTIVE
========================= */

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
        body:
          JSON.stringify({
            active:
              Boolean(active)
          })
      }
    );

    await users();

  } catch (err) {

    alert(err.message);
  }
}

/* =========================
   RESET USER PASSWORD
========================= */

async function resetUserPassword(
  id,
  username
) {

  const password =
    prompt(
      `Enter new password for ${username} (minimum 8 characters):`
    );

  if (password === null) {
    return;
  }

  if (password.length < 8) {

    alert(
      "Password must be at least 8 characters."
    );

    return;
  }

  try {

    await api(
      "/api/admin/users/" +
      id +
      "/password",
      {
        method: "PATCH",
        body:
          JSON.stringify({
            password
          })
      }
    );

    alert(
      "Password changed successfully."
    );

  } catch (err) {

    alert(err.message);
  }
}

/* =========================
   EXPORT
========================= */

function exportPage() {

  document.getElementById("page").innerHTML =
    pageTitle(
      "Export Leads",
      "Download your complete lead database as CSV"
    ) +

    `
    <div class="card">

      <h3>Lead Export</h3>

      <p class="muted">
        The export contains all lead information,
        including mobile numbers. This option is
        available to Admin users only.
      </p>

      <br>

      <a
        href="${API_URL}/api/admin/export"
        target="_blank"
        class="btn btn-primary"
        style="display:inline-block;text-decoration:none"
      >
        📥 Download CSV
      </a>

    </div>
    `;
}

/* =========================
   INITIALISE
========================= */

(async function init() {

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

  } catch (err) {

    console.error(err);

    loginView();
  }

})();
