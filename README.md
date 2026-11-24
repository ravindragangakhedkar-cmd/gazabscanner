# GazabPaisa Awesome Scanner

React/Vite frontend with an Express/TypeScript API and scanner services.

## Local setup

1. Install Node.js 22.12 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and enter the required credentials and Firebase web configuration.
4. Run `npm run dev`.
5. Run `npm run build` to create the Vite production bundle.

## Deploy to Vercel

This repository includes Vercel routing and build configuration:

- `vercel.json` runs `npm run build`, publishes `public/`, sends `/api/*` requests to the Express function, and sends frontend routes to `index.html`.
- `api/index.ts` exports the Express application as the Vercel API function.
- `server.ts` exports the Express app and starts its own listener only for local development.
- The Vite build keeps its normal `dist/` output and copies the completed frontend bundle into `public/` for Vercel's static hosting.

In Vercel, import this GitHub repository and use the committed settings. Set the Node.js version to 22.x if the project settings offer a runtime selector. Do not set a second custom output directory or override the build command unless you have a specific reason.

## Environment variables and secrets

No live API tokens, SMTP credentials, Twilio credentials, Gemini keys, or Firebase project configuration are included in this source bundle. Configure values from `.env.example` in Vercel's encrypted Environment Variables settings for the environments where you will deploy. Never commit `.env.local`.

Firebase web configuration is read from `VITE_FIREBASE_*` variables at build time. Because Vite-prefixed values are exposed to browsers, only use Firebase web configuration values here; never put service-account JSON or private server credentials in `VITE_*` variables. Protect Firebase resources with restrictive Authentication and Firestore Security Rules.

## Production limitations to resolve before relying on live trading or payments

Vercel functions can be restarted or scaled across instances. The current broker login/session and alert services keep some state in process memory, so broker sessions, OTP challenges, alert history, and long-lived SSE connections are not guaranteed to persist or be shared reliably in a serverless deployment. Move that state to a durable shared service before relying on those workflows in production.

The current Google Play order endpoint returns a positive verification response without validating a purchase with Google Play. Do not use it to grant paid access until real server-side purchase verification is implemented. The contact endpoint currently acknowledges a message but does not deliver an email; configure a real mail provider and implement sending before relying on it.

## Build verification

A successful GitHub commit does not itself prove that Vercel's build or runtime succeeds. Confirm the first Vercel deployment's build log and test the frontend plus each API workflow before using it in production.
