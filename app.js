const app = document.getElementById("app");
let currentUser = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const API_URL = "https://solar-crm-uudg.onrender.com";

async function api(url, options={}) {
  const r = await fetch(API_URL + url, {
    credentials: "include",
    headers: {"Content-Type":"application/json"},
    ...options
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function loginView() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand">Solar CRM</div>
        <div class="muted">V1 • Secure lead management</div>
        <div id="login-msg"></div>
        <form id="login-form">
          <div class="field"><label>Agent / Admin ID</label><input id="username" autocomplete="username" required></div>
          <div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary" style="width:100%">Login</button>
        </form>
        <div class="admin-note">Demo: admin / ChangeMe123! &nbsp;•&nbsp; agent01 / Agent123!</div>
      </div>
    </div>`;
  document.getElementById("login-form").onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById("login-msg");
    try {
      const d = await api("/api/login", {method:"POST", body:JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })});
      currentUser = d.user; renderShell();
    } catch(err) { msg.innerHTML = `<div class="notice error">${esc(err.message)}</div>`; }
  };
}
function renderShell() {
  const isAdmin = currentUser.role === "admin";
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="logo">☀ Solar CRM</div>
      <div class="nav">
        <button data-page="dashboard" class="active">Dashboard</button>
        ${isAdmin ? `<button data-page="admin">Admin Leads</button><button data-page="users">Users</button>` : `<button data-page="create">＋ Create Lead</button><button data-page="myleads">My Leads</button>`}
      </div>
      <div class="userbox"><strong>${esc(currentUser.displayName)}</strong><br>${esc(currentUser.role)}<br><br><button id="logout" class="btn btn-secondary">Logout</button></div>
    </aside>
    <main class="main"><div id="page"></div></main>
  </div>`;
  document.querySelectorAll(".nav button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); route(b.dataset.page);
  });
  document.getElementById("logout").onclick = async () => { await api("/api/logout",{method:"POST"}); currentUser=null; loginView(); };
  route("dashboard");
}
async function route(page) {
  if (page === "dashboard") return dashboard();
  if (page === "create") return createLead();
  if (page === "myleads") return myLeads();
  if (page === "admin") return adminLeads();
  if (page === "users") return users();
}
function pageTitle(title, sub="") {
  return `<div class="top"><div><div class="title">${title}</div><div class="muted">${sub}</div></div></div>`;
}
async function dashboard() {
  if (currentUser.role === "admin") {
    const d = await api("/api/admin/stats");
    document.getElementById("page").innerHTML = pageTitle("Admin Dashboard","Overview of the CRM") + `
      <div class="grid">
        <div class="card"><div class="muted">Total leads</div><div class="stat">${d.total}</div></div>
        <div class="card"><div class="muted">Appointments</div><div class="stat">${d.appointments}</div></div>
        <div class="card"><div class="muted">Callbacks</div><div class="stat">${d.callbacks}</div></div>
        <div class="card"><div class="muted">No Solar</div><div class="stat">${d.noSolar}</div></div>
        <div class="card"><div class="muted">Has Solar</div><div class="stat">${d.hasSolar}</div></div>
      </div>
      <br><div class="card"><h3>Agent performance</h3>${d.agents.length ? `<table class="table"><tr><th>Agent</th><th>ID</th><th>Leads</th></tr>${d.agents.map(a=>`<tr><td>${esc(a.display_name)}</td><td>${esc(a.username)}</td><td>${a.lead_count}</td></tr>`).join("")}</table>` : '<div class="muted">No agents yet.</div>'}</div>`;
  } else {
    const d = await api("/api/my-leads");
    document.getElementById("page").innerHTML = pageTitle("Agent Dashboard",`Welcome, ${esc(currentUser.displayName)}`) + `
      <div class="grid">
        <div class="card"><div class="muted">My leads</div><div class="stat">${d.leads.length}</div></div>
        <div class="card"><div class="muted">Appointments</div><div class="stat">${d.leads.filter(x=>x.product_type==="Appointment").length}</div></div>
        <div class="card"><div class="muted">Callbacks</div><div class="stat">${d.leads.filter(x=>x.product_type==="Callback").length}</div></div>
      </div>
      <br><div class="card"><h3>Phone number protection</h3><div class="muted">Mobile numbers are accepted during lead creation but are not returned to the agent after submission. Only Admin users can retrieve them.</div></div>`;
  }
}
function select(name, label, options, required=true) {
  return `<div class="field"><label>${label}${required?" *":""}</label><select name="${name}" ${required?"required":""}><option value="">Select...</option>${options.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>`;
}
function createLead() {
  document.getElementById("page").innerHTML = pageTitle("Create New Lead","Mobile number is write-only for agents after submission.") + `
  <div class="card form-card">
    <div id="lead-msg"></div>
    <form id="lead-form">
      <div class="section-title">Lead Type</div>
      <div class="form-grid">
        ${select("product_type","Product Type",["Callback","Appointment"])}
        ${select("solar_status","Solar Status",["No Solar","Has Solar"])}
      </div>
      <div class="section-title">Customer Details</div>
      <div class="form-grid">
        <div class="field"><label>First Name *</label><input name="first_name" required></div>
        <div class="field"><label>Last Name *</label><input name="last_name" required></div>
        <div class="field"><label>Mobile Number * <span class="muted">(hidden after save)</span></label><input name="mobile_number" inputmode="tel" required></div>
        <div class="field"><label>Email</label><input name="email" type="email"></div>
        <div class="field"><label>Street Name *</label><input name="street_name" required></div>
        <div class="field"><label>Suburb *</label><input name="suburb" required></div>
        <div class="field"><label>Postcode *</label><input name="postcode" maxlength="4" required></div>
        ${select("free_standing","Free Standing",["Yes","No"])}
        ${select("roof_type","Roof Type",["Tile","Metal","Colorbond","Terracotta","Other"])}
        <div class="field"><label>Bill *</label><input name="bill" placeholder="e.g. $300" required></div>
        ${select("under_75","Under 75",["Yes","No"])}
      </div>
      <div id="solar-extra" class="hidden">
        <div class="section-title">Existing Solar Details</div>
        <div class="form-grid">
          <div class="field"><label>Number of Panels *</label><input name="number_of_panels" type="number" min="0"></div>
          <div class="field"><label>Panels Age *</label><input name="panels_age" placeholder="e.g. 7 years"></div>
          ${select("battery","Battery",["Yes","No"])}
        </div>
      </div>
      <div class="section-title">Qualification & Booking</div>
      <div class="form-grid">
        ${select("sunlight","Sunlight",["Good","Average","Poor","Unknown"])}
        ${select("quote","Quote",["Yes","No","Not Yet"])}
        <div class="field"><label>Callback / Appointment Date *</label><input name="appointment_date" type="date" required></div>
        <div class="field"><label>Callback / Appointment Time *</label><input name="appointment_time" type="time" required></div>
        <div class="field full"><label>Additional Comments</label><textarea name="additional_comment" placeholder="Anything the rep should know..."></textarea></div>
      </div>
      <button class="btn btn-primary">Create Lead</button>
    </form>
  </div>`;
  const form = document.getElementById("lead-form");
  const solar = form.querySelector('[name="solar_status"]');
  const extra = document.getElementById("solar-extra");
  function toggleSolar() {
    extra.classList.toggle("hidden", solar.value !== "Has Solar");
    extra.querySelectorAll("input,select").forEach(x => x.required = solar.value === "Has Solar");
  }
  solar.onchange = toggleSolar;
  form.onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById("lead-msg");
    const obj = Object.fromEntries(new FormData(form).entries());
    try {
      const d = await api("/api/leads",{method:"POST",body:JSON.stringify(obj)});
      msg.innerHTML = `<div class="notice success">Lead created successfully. Lead ID: <strong>${esc(d.leadCode)}</strong>. The mobile number is now hidden from your account.</div>`;
      form.reset(); toggleSolar();
    } catch(err) { msg.innerHTML = `<div class="notice error">${esc(err.message)}</div>`; }
  };
}
async function myLeads() {
  const d = await api("/api/my-leads");
  document.getElementById("page").innerHTML = pageTitle("My Leads","Phone numbers are deliberately excluded from this list.") + tableHTML(d.leads, false);
}
async function adminLeads() {
  const d = await api("/api/admin/leads");
  document.getElementById("page").innerHTML = pageTitle("All Leads","Admin-only view. Mobile numbers are visible here.") + tableHTML(d.leads, true);
}
function tableHTML(rows, admin) {
  if (!rows.length) return `<div class="card muted">No leads found.</div>`;
  const headers = admin ? ["Lead ID","Agent","Customer","Mobile","Solar","Type","Suburb","Postcode","Date","Time","Status"] : ["Lead ID","Customer","Solar","Type","Suburb","Postcode","Date","Time","Status"];
  return `<div class="table-wrap"><table class="table"><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>${
    rows.map(r=>`<tr>
      <td>${esc(r.lead_code)}</td>
      ${admin?`<td>${esc(r.agent_name)}<br><span class="muted">${esc(r.agent_username)}</span></td>`:""}
      <td>${esc(r.first_name)} ${esc(r.last_name)}</td>
      ${admin?`<td>${esc(r.mobile_number)}</td>`:""}
      <td><span class="pill">${esc(r.solar_status)}</span></td>
      <td>${esc(r.product_type)}</td>
      <td>${esc(r.suburb)}</td><td>${esc(r.postcode)}</td>
      <td>${esc(r.appointment_date)}</td><td>${esc(r.appointment_time)}</td>
      <td>${admin ? `<select onchange="changeStatus(${r.id},this.value)">${["New","Contacted","Confirmed","Completed","Cancelled","Replacement"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select>` : esc(r.status)}</td>
    </tr>`).join("")}</table></div>`;
}
async function changeStatus(id,status) {
  try { await api("/api/admin/leads/"+id+"/status",{method:"PATCH",body:JSON.stringify({status})}); }
  catch(e){ alert(e.message); }
}
async function users() {
  const d = await api("/api/admin/users");
  document.getElementById("page").innerHTML = pageTitle("Users","V1 user list. Account creation can be added next.") + `
    <div class="table-wrap"><table class="table"><tr><th>Name</th><th>Login ID</th><th>Role</th><th>Active</th><th>Created</th></tr>
    ${d.users.map(u=>`<tr><td>${esc(u.display_name)}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${u.active?"Yes":"No"}</td><td>${esc(u.created_at)}</td></tr>`).join("")}</table></div>`;
}
(async function init(){
  try { const d=await api("/api/me"); if(d.user){currentUser=d.user;renderShell()} else loginView(); }
  catch { loginView(); }
})();
