# Excel to Zoho ERP - Auth module

Backend: Node + Express | Frontend: React 19 + Vite

## Folder structure
backend/
  server.js                  entry point
  .env                       secrets (git mein mat daalo)
  src/
    app.js                   express setup + routes jodna
    config/env.js            .env padhna
    auth/                    AUTH (sab alag)
      auth.routes.js         /auth/login, /callback, /status, /logout
      auth.controller.js
      auth.service.js        OAuth: code->token, auto refresh, revoke
      state.store.js         CSRF state
      token.store.js         tokens.json read/write
    zoho/                    Zoho API calls (auth se alag)
      zoho.routes.js         /api/zoho/*
      zoho.service.js        token laga ke Zoho ko call
  data/tokens.json           auto banta hai

frontend/src/
  main.jsx, App.jsx
  services/http.js           common fetch helper
  components/Notice.jsx
  styles/global.css
  pages/                     HomePage (connect), DashboardPage (organizations)
  features/
    auth/                    AUTH (sab alag)
      authApi.js, useAuth.js, ConnectCard.jsx
    organizations/           test connection (auth se alag)
      organizationsApi.js, OrganizationsCard.jsx, useOrganizations.js (sidebar org selector)

## Deposit import (Excel -> Zoho)
backend/src/import/   excel.js (Excel padhna), accounts.js (account naam -> ID),
                      deposit.service.js (validate + Zoho me banana), import.routes.js
frontend/src/features/import/   ImportCard.jsx (Validate -> Import), useImport.js, importApi.js
POST /api/import/deposits?organization_id=..&dryRun=true|false  (form-data: file)
dryRun default true. Template: frontend/public/deposit-template.xlsx
Setup: backend/.env bharo.

## Bank transactions delete (select karke)
backend/src/delete/   delete.service.js (list + delete), delete.routes.js
frontend/src/features/delete/   DeleteCard.jsx (Type select -> chuno -> Delete), useDelete.js, deleteApi.js
GET  /api/delete/bank-transactions?organization_id=..&type=deposit|transfer_fund  (list)
POST /api/delete/bank-transactions?organization_id=..  body { transaction_ids: [...] }  (sirf chuni hui)
UI: Type (Deposit/Transfer) chuno -> list aati hai -> entries chuno -> Delete. Max 500 ek baar me, sirf deposit/transfer_fund.
Scope ERP.banking.DELETE chahiye: ZOHO_SCOPES badalne ke baad Zoho ko Disconnect karke dobara Connect karna padega.

## Zoho console
https://api-console.zoho.in -> Server-based client
Redirect URI: http://localhost:5000/auth/callback

## Run
backend:   cd backend && npm install && npm run dev
frontend:  cd frontend && npm install && npm run dev   (http://localhost:5173)

## Production (NODE_ENV=production)
Local setup code me hai ([backend/src/config/env.js](backend/src/config/env.js)): har value `.env || local default`.
Jaise `.env` me `PORT=4402` hai to 4402, nahi to 5000. Zoho client ID/secret code me nahi — sirf `.env` me.
`backend/.env` me local ke liye sirf test client hai; neeche production wali lines `#` ke saath likhi hain.

Setup (server par):
1. `backend/.env` ki production lines ke aage se `#` hatao aur apni values bharo (ye upar wali test values ko override karti hain)
2. Zoho console me production client ka Redirect URI: `https://your-domain.com/auth/callback`
3. Root folder me: `npm run build` (frontend build + backend install), phir `npm start` (backend 4402 par, frontend build ke saath)
4. Domain ko `localhost:4402` par proxy karo (HTTPS zaroori — password cookie sirf https par chalti hai)
5. Optional: `npm run preview` frontend ko 4412 par chalata hai (API 4402 par proxy hoti hai)

Upload mat karna: `backend/data/`, `node_modules/`.
