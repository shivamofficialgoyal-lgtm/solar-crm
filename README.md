# Solar CRM V1

A working starter CRM for an Australian solar lead-generation team.

## Included
- Agent/admin login
- Role-based access
- Agent dashboard
- Dynamic Create Lead form for No Solar / Has Solar
- SQLite lead database
- Admin dashboard
- Agents can submit phone numbers but cannot retrieve/view them after submission
- Admin can view phone numbers
- Agents can only see their own leads
- Admin can see all leads
- Automatic lead IDs
- Audit log for lead creation/login events

## Requirements
- Node.js 18+ recommended
- npm

## Run locally

```bash
npm install
npm start
```

Then open:

http://localhost:3000

## Demo accounts

Admin:
- ID: admin
- Password: ChangeMe123!

Agent:
- ID: agent01
- Password: Agent123!

IMPORTANT: Change these credentials before production.

## Security notes

The phone number is stored in SQLite but is deliberately excluded from all agent-facing lead/API responses. The server checks the logged-in role before returning lead data. Do not rely on CSS/JavaScript hiding alone.

For production deployment, add:
- HTTPS
- Strong random session secret in environment variables
- Secure cookies
- Rate limiting / brute-force protection
- Backups
- Database encryption or encrypted storage where appropriate
- Password reset and account management
- CSRF protection
- Input validation and logging/monitoring
- A production database if the team becomes large

## Project structure

- server.js — Express server, authentication, API and database
- public/ — browser UI
- data/ — generated SQLite database (created automatically)
