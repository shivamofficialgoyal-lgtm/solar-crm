# Solar CRM V2

V2 adds:
- Admin, QC Manager and Agent roles
- Server-side mobile-number protection for Agents and QC Managers
- QC workflow: Pending QC -> Qualified / Unqualified
- Mandatory QC Comment
- Admin user management
- Agent performance dashboard
- Search/filter and CSV export
- V1 SQLite database migration support

## Deploy on Render
Build command: `npm install`
Start command: `npm start`

Recommended environment variables:
- `SESSION_SECRET` = a long random secret
- `ADMIN_USERNAME` = your chosen first admin ID
- `ADMIN_PASSWORD` = a strong first admin password
- `NODE_ENV` = `production`

For an existing V1 deployment, back up `data/crm.sqlite` before upgrading. The server migrates the users role constraint and adds QC columns automatically.

The login page intentionally does not display demo credentials.
