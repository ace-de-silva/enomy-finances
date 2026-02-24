# Enomy-Finances Web Application

A professional-grade, fully functional financial advisory platform built with pure HTML5, CSS3, and Vanilla JavaScript. Developed for Phonyt Digital Solutions (PDS) as part of the Enomy-Finances client project.

---

## Business Overview

Enomy-Finances is a UK-based financial advisory organisation providing services in:
- **Currency Exchange** – Multi-currency conversion with real-time rates
- **Investment Planning** – Personalised quote generation with compound interest projections
- **Mortgage Advisory** – Full amortization schedule and repayment calculations
- **Secure Client Management** – Role-based portals for Customers, Advisors, and Administrators

This web application modernises Enomy-Finances' legacy networked client application into a scalable, cloud-compatible web platform.

---

## Demo Credentials

| Role     | Email                  | Password     | OTP (Demo)              |
|----------|------------------------|--------------|-------------------------|
| Customer | customer@enomy.uk      | Customer123! | Check browser console   |
| Advisor  | advisor@enomy.uk       | Advisor123!  | Check browser console   |
| Admin    | admin@enomy.uk         | Admin123!    | Check browser console   |

> **OTP Note:** In demo mode, the 6-digit OTP code is printed to the browser console as:
> `[DEMO MODE] Your verification code is: XXXXXX`

---

## Features

### 🔐 Multi-Factor Authentication (MFA)
- Two-step login: credentials → 6-digit OTP
- 3-minute OTP expiry with visible countdown
- Max 3 failed attempts → 15-minute account lockout
- 15-minute session timeout with 60-second warning
- Role-based access control (Customer / Advisor / Admin)

### 💱 Currency Conversion Module
- Supports: GBP, USD, EUR, BRL, JPY, TRY
- Simulated live exchange rates with ±0.5% fluctuation
- Tiered fee structure:
  - Up to £500 → 3.5%
  - £501–£1,500 → 2.7%
  - £1,501–£2,500 → 2.0%
  - Over £2,500 → 1.5%
- Transaction limits: Min £300 / Max £5,000
- Full conversion history with CSV export

### 📈 Investment Quote Generator (EFSM)
Implemented as an **Extended Finite State Machine** with states:
`INITIAL → VALIDATING → CALCULATING → RISK_ASSESSMENT → DISPLAY → SAVED`

Three investment plans:
| Plan | Monthly Fee | Annual Return | Min Monthly | Min Lump Sum |
|------|-------------|---------------|-------------|--------------|
| Basic Savings Plan | 0.25% | 1.2–2.4% | £50 | N/A |
| Savings Plan Plus | 0.30% | 3.0–5.5% | £50 | £300 |
| Managed Stock Investments | 1.30% | 4.0–23.0% | £150 | £1,000 |

Projections for 1, 5, and 10 years showing: Total Invested, Projected Value (min/max), Gross Profit, Management Fees, Net Profit, Tax Liability, Final Amount.

### 🏠 Mortgage Calculator
- Standard annuity formula calculations
- Full amortization schedule (month-by-month)
- LTV indicator with colour coding
- Visual breakdown charts

### 👤 Customer Portal
- Dashboard with stats, widgets, quick actions
- Complete profile management
- Saved quotes management
- Transaction history with filters and CSV export

### 👨‍💼 Advisor Portal
- CRM dashboard with client list
- Client profile view with conversion/quote history
- Advisor notes timeline
- Pending quote reviews (approve/request changes)

### 🔧 Admin Portal
- System dashboard with real-time stats
- User management (create/edit/deactivate/role changes)
- Transaction monitoring (compliance flags for >£10,000)
- Fee policy management with impact preview
- Analytics charts (Chart.js)
- Full audit log with filters

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 (semantic, ARIA accessible) |
| Styling | CSS3 (Grid, Flexbox, Custom Properties, BEM) |
| Logic | Vanilla JavaScript ES6+ (Classes, async/await, Modules) |
| Charts | Chart.js v4.4.0 (CDN) |
| Persistence | localStorage (simulates cloud database) |
| Security | Web Crypto API (SHA-256 hashing) |
| Fonts | Google Fonts (Playfair Display, Inter, Roboto Mono) |

---

## File Structure

```
enomy-finances/
│
├── index.html                    # Public landing page + MFA login
├── customer-portal.html          # Customer dashboard SPA
├── advisor-portal.html           # Advisor CRM SPA
├── admin-portal.html             # Admin management SPA
│
├── css/
│   ├── global.css                # CSS variables, reset, utilities
│   ├── components.css            # Reusable UI components
│   ├── customer.css              # Customer portal styles
│   ├── advisor.css               # Advisor portal styles
│   └── admin.css                 # Admin portal styles
│
├── js/
│   ├── utils.js                  # Formatters, validators, helpers
│   ├── security.js               # Password hashing, XSS prevention
│   ├── database.js               # localStorage CRUD layer
│   ├── auth.js                   # MFA authentication & session management
│   ├── currency-converter.js     # Currency conversion logic & UI
│   ├── investment-efsm.js        # EFSM investment quote generator
│   ├── mortgage-calculator.js    # Mortgage calculation & UI
│   ├── charts.js                 # Chart.js wrappers
│   └── admin.js                  # Admin & Advisor portal controllers
│
├── data/
│   └── seed-data.js              # 20 users, 50 conversions, 30 quotes
│
└── assets/
    └── images/
        └── logo.svg
```

---

## Requirements Traceability Matrix (RTM)

| Req ID | Requirement | Module | Status |
|--------|-------------|--------|--------|
| REQ-01 | MFA two-step login | auth.js | ✅ |
| REQ-02 | 6-digit OTP with 3-min expiry | auth.js | ✅ |
| REQ-03 | 3 failed attempts → 15-min lockout | auth.js | ✅ |
| REQ-04 | 15-min session timeout | auth.js | ✅ |
| REQ-05 | Role-based access control | auth.js, database.js | ✅ |
| REQ-06 | GBP/USD/EUR/BRL/JPY/TRY conversion | currency-converter.js | ✅ |
| REQ-07 | Real-time exchange rates (simulated) | currency-converter.js | ✅ |
| REQ-08 | Min transaction 300 units | currency-converter.js | ✅ |
| REQ-09 | Max transaction 5000 units | currency-converter.js | ✅ |
| REQ-10 | Tiered fee structure (4 tiers) | currency-converter.js | ✅ |
| REQ-11 | Conversion result receipt display | currency-converter.js | ✅ |
| REQ-12 | Conversion history with CSV export | currency-converter.js | ✅ |
| REQ-13 | Investment lump sum input | investment-efsm.js | ✅ |
| REQ-14 | Monthly contribution input | investment-efsm.js | ✅ |
| REQ-15 | 3 investment plan types | investment-efsm.js | ✅ |
| REQ-16 | 1/5/10 year projections | investment-efsm.js | ✅ |
| REQ-17 | Gross profit display | investment-efsm.js | ✅ |
| REQ-18 | Fee deduction per plan | investment-efsm.js | ✅ |
| REQ-19 | Tax calculation (UK bands) | investment-efsm.js | ✅ |
| REQ-20 | All values in GBP 2 d.p. | utils.js | ✅ |
| REQ-21 | EFSM state machine implementation | investment-efsm.js | ✅ |
| REQ-22 | Save investment quotes | investment-efsm.js | ✅ |
| REQ-23 | Investment chart (Chart.js) | charts.js | ✅ |
| REQ-24 | Mortgage monthly payment calc | mortgage-calculator.js | ✅ |
| REQ-25 | Amortization schedule | mortgage-calculator.js | ✅ |
| REQ-26 | LTV indicator | mortgage-calculator.js | ✅ |
| REQ-27 | AES-256 equivalent (SHA-256 hash) | security.js | ✅ |
| REQ-28 | Password strength meter | security.js, auth.js | ✅ |
| REQ-29 | Input validation & XSS prevention | security.js, utils.js | ✅ |
| REQ-30 | Error logging (console + localStorage) | database.js | ✅ |
| REQ-31 | Data caching on failure | database.js | ✅ |
| REQ-32 | Customer dashboard | customer-portal.html | ✅ |
| REQ-33 | Profile management | customer-portal.html | ✅ |
| REQ-34 | Transaction history | customer-portal.html | ✅ |
| REQ-35 | Advisor CRM dashboard | advisor-portal.html | ✅ |
| REQ-36 | Client profile management | advisor-portal.html | ✅ |
| REQ-37 | Advisor notes timeline | advisor-portal.html | ✅ |
| REQ-38 | Admin user management | admin-portal.html | ✅ |
| REQ-39 | Fee policy management | admin-portal.html | ✅ |
| REQ-40 | Transaction compliance monitoring | admin-portal.html | ✅ |
| REQ-41 | Analytics charts | admin-portal.html, charts.js | ✅ |
| REQ-42 | Audit log | database.js, admin-portal.html | ✅ |

---

## Security Measures Implemented

| Measure | Implementation |
|---------|---------------|
| Password Hashing | SHA-256 via Web Crypto API with salt |
| MFA | TOTP-style 6-digit OTP with 3-min expiry |
| Session Management | sessionStorage tokens, auto-expire 15min |
| Rate Limiting | Max 3 login attempts, 15-min lockout |
| XSS Prevention | HTML entity escaping on all user inputs |
| RBAC | Role-checked on every portal page load |
| Data Encryption | localStorage data structured (simulated AES-256) |
| Audit Logging | All security events logged with timestamps |
| Input Validation | Client-side validation on all forms |
| CSRF Protection | CSRF token simulation |

---

## Database Schema (localStorage)

### `ef_users` — User accounts
```json
{
  "userID": "USR001",
  "email": "customer@enomy.uk",
  "passwordHash": "...",
  "passwordSalt": "...",
  "role": "Customer",
  "phone": "+447123456789",
  "mfaEnabled": true,
  "name": "Sarah Johnson",
  "failedLoginAttempts": 0,
  "accountLocked": false
}
```

### `ef_currencyConversions` — Conversion records
```json
{
  "conversionID": "CONV001",
  "userID": "USR001",
  "fromCurrency": "GBP",
  "toCurrency": "USD",
  "amount": 1000.00,
  "exchangeRate": 1.27,
  "fee": 27.00,
  "finalAmount": 1235.71
}
```

### `ef_investmentQuotes` — Quote records
```json
{
  "quoteID": "QUOTE001",
  "userID": "USR001",
  "investmentType": "Balanced Portfolio",
  "lumpSum": 10000,
  "monthlyContribution": 250,
  "projections": { "1": {...}, "5": {...}, "10": {...} }
}
```

### `ef_sessions` — Active sessions
### `ef_auditLogs` — Security & activity logs
### `ef_feePolicies` — Configurable fee tiers

---

## Setup Instructions

1. **Clone / Download** the project files
2. **Open** `index.html` in a modern browser (Chrome, Firefox, Edge, Safari)
3. The database initialises automatically on first load with 20 demo users
4. **Login** using the demo credentials above
5. Check the browser **console** for the OTP code when prompted

> No server required. Works fully offline after first load.

---

## GitHub Pages Deployment

```bash
git init
git add .
git commit -m "Initial commit: Enomy-Finances Web Application"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/enomy-finances.git
git push -u origin main
```

Then enable GitHub Pages in repository Settings → Pages → Source: `main` branch.

Live URL: `https://YOUR_USERNAME.github.io/enomy-finances/`

---

## Testing Checklist

### MFA Flow
- [ ] Login with correct credentials → OTP step shown
- [ ] OTP displayed in console
- [ ] Correct OTP → redirect to role portal
- [ ] Wrong OTP → error message
- [ ] Expired OTP (wait 3 min) → expiry message
- [ ] 3 wrong passwords → account locked message
- [ ] Wait 15 min (or clear lockout) → can login again

### Currency Conversion
- [ ] Amount below 300 → validation error
- [ ] Amount above 5000 → validation error
- [ ] GBP→USD at 1000 → fee is 2.7% (£27.00)
- [ ] GBP→USD at 500 → fee is 3.5% (£17.50)
- [ ] Same currency → rate = 1.0
- [ ] Swap currencies → recalculates
- [ ] Save transaction → appears in history
- [ ] Export CSV → downloads file

### Investment Calculations
- [ ] Basic Savings Plan: 0% tax on any profit
- [ ] Savings Plan Plus: 10% tax on profit above £12,000
- [ ] Managed Stock: 10% below £40k profit, 20% above
- [ ] EFSM state transitions logged correctly
- [ ] Save quote → appears in Saved Quotes section
- [ ] Chart renders for all 3 plans

### Session Management
- [ ] Session timer visible in portal header
- [ ] Warning modal appears at 14 minutes
- [ ] "Continue Session" resets timer
- [ ] 15-minute timeout → auto logout
- [ ] Logout clears all session data
- [ ] Direct URL access without login → redirect to index.html

### Role-Based Access
- [ ] Customer → customer-portal.html only
- [ ] Advisor → advisor-portal.html only
- [ ] Admin → admin-portal.html only
- [ ] Wrong role → redirected appropriately

---

## Known Limitations

| Limitation | Production Solution |
|------------|-------------------|
| localStorage only | Cloud database (PostgreSQL/MongoDB) |
| Simulated SMS OTP | Real SMS gateway (Twilio, AWS SNS) |
| Hardcoded exchange rates | Live FX API (Open Exchange Rates, Frankfurter) |
| No real encryption at rest | Server-side AES-256 encryption |
| SHA-256 password hashing | bcrypt with work factor ≥ 12 |
| Single-browser sessions | Centralised session store (Redis) |
| No real email/notifications | SMTP service (SendGrid, AWS SES) |

---

## Future Roadmap

1. **Backend Integration** — Node.js/Express REST API with PostgreSQL
2. **Real FX Rates** — Integration with Open Exchange Rates API
3. **Mobile App** — React Native companion app
4. **Document Upload** — ID verification with AWS S3
5. **AI Advisory** — ML-powered investment recommendations
6. **Regulatory Reporting** — Automated FCA compliance reports
7. **Real-Time Notifications** — WebSocket push notifications
8. **Multi-Language** — i18n support (English, Spanish, French)

---

## Portfolio Summary

This project demonstrates enterprise-grade Business Analysis and full-stack development competencies:

- **Requirements Traceability** — 42-requirement RTM mapped from specification to implementation
- **Security Architecture** — MFA, RBAC, session management, password hashing, XSS prevention
- **Financial Domain Knowledge** — Accurate compound interest, tax band calculations, fee structures
- **Behavioral Modelling** — EFSM implementation for investment quote state management
- **System Design** — SOA architecture, modular JavaScript, localStorage data layer
- **Feasibility Analysis** — Economic, technical, and operational viability demonstrated through working prototype
- **Accessibility** — WCAG 2.1 compliant, ARIA landmarks, keyboard navigation, screen reader support

---

*Developed by Phonyt Digital Solutions (PDS) for Enomy-Finances*
*Academic project — BTEC Higher National in Computing*
