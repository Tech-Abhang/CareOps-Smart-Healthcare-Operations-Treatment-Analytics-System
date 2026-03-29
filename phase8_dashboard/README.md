# CareOps React Dashboard

Minimalist React analytics frontend connected to live MySQL warehouse data.

## Theme and Typography

- Color palette uses the exact lime-blue tokens provided.
- Primary font is Geist, loaded from Google Fonts.
- Secondary heading accent font is Sigmar.
- Layout is compact: smaller text, reduced card density, and ellipsis collapsing for long labels.

## Data Source

- MySQL host: localhost
- MySQL port: 3306
- Default password configured in API fallback: Thane@01
- Warehouse database: careops_dw
- OLTP database: careops_oltp

## Project Structure

```text
phase8_dashboard/
	src/              # React app
	server/           # Express + mysql2 API
```

## Run

Install dependencies once:

```bash
npm install
cd server && npm install
```

Start API (terminal 1):

```bash
npm run server
```

Start React app (terminal 2):

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

The frontend calls `/api/*` routes and Vite proxies them to `http://localhost:4000`.
