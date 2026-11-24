# GazabPaisa Awesome Scanner

React/Vite frontend with an Express/TypeScript API and scanner services.

## Local setup

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and enter the required credentials and Firebase web configuration.
4. Run `npm run dev`.
5. Run `npm run build` to create the Vite production bundle.

## Secrets and deployment configuration

No live API tokens, SMTP credentials, Twilio credentials, Gemini keys, or Firebase project configuration are included in this source bundle. Configure values from `.env.example` in the hosting provider's encrypted environment-variable settings. Never commit `.env.local`.

Firebase web configuration is read from `VITE_FIREBASE_*` variables at build time. Because Vite-prefixed values are exposed to browsers, only use Firebase web configuration values here; never put service-account JSON or private server credentials in `VITE_*` variables. Protect Firebase resources with restrictive Authentication and Firestore Security Rules.

## Vercel note

This project has both a Vite frontend and an Express API. The current `server.ts` starts a listener and serves `dist` through `express.static`; this must be adapted and tested against Vercel's Express function/static asset behavior before claiming a working production deployment. In-memory broker sessions and alert/SSE state also need a durable store for reliable multi-instance operation.
