# Deploy to Render

This app is a single Node web service that builds a Vite React client into `dist/public` and serves it from an Express server in production.

## One-time setup

1) Fork or push this repo to GitHub.

2) Provision your database (required)
- Use Neon (recommended) and copy the Postgres connection string (must include `sslmode=require`).
- Alternatively, set up your preferred Postgres that works with the Neon serverless driver.

3) Create a Web Service on Render
- New > Web Service > Connect your repo
- Name: `fta-app`
- Runtime: Node
- Build Command: `npm run build`
- Start Command: `npm start`
- Auto deploy: On

4) Environment variables
Add these in Render (Settings > Environment):
- NODE_ENV=production (already in `render.yaml`)
- SESSION_SECRET=<generate a long random string> (auto-generated if you use the blueprint)
- DATABASE_URL=<your Neon connection string>
- (optional) GEMINI_API_KEY=<your Gemini key>
- (optional) FantasyProsApiKey=<your FantasyPros key>

5) Deploy
- Hit Deploy. Render will run `npm run build` (client and server) then `npm start`.

## How it serves in production
- Vite outputs the frontend to `dist/public`.
- The server starts from `dist/index.js` and serves static files from `dist/public`, with an SPA fallback to `index.html`.
- The server listens on `process.env.PORT` as required by Render.

## Troubleshooting
- Unstyled page: Ensure `npm run build` runs in the Build Command and the server uses `serveStatic` (already configured). Check that `dist/public/assets/index-*.css` exists in the deploy logs.
- 500 errors on boot: Ensure `DATABASE_URL` is set; the app requires it. If using Neon, make sure `sslmode=require` is present.
- Session errors: Ensure `SESSION_SECRET` is set. Cookies are `secure` in production; confirm that your Render service uses HTTPS.
- API calls fail in dev but not prod: In dev, Vite proxies `/api` to `http://localhost:5000`. In prod, both API and client share the same origin.

## Local validation (optional)
- Build: `npm run build`
- Start (requires DATABASE_URL and SESSION_SECRET): `npm start`
- Open http://localhost:5000

