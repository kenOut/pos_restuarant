# ENYO POS

Touch-screen point of sale for restaurants in Ghana. The restaurant's main computer runs the app and keeps the data; tills, tablets, phones and the kitchen screen use it through a web browser over the restaurant's own network, so service carries on when the internet is down.

Built with Next.js 16, React 19, SQLite (Drizzle ORM), Tailwind CSS 4, GSAP and Lenis.

**What works today:** marketing website · staff sign-in with PINs · till shell for every role · order screen (menu, ticket, notes, taxes, hold and send) · kitchen display with live updates to every screen · payments (cash with change, mobile money, card, voucher, house account; split bills; tips; manager-approved discounts) and printable receipts · menu, staff and settings management (logo, receipt footer, tax setup) · first-time setup · automatic backups with restore.
**Not built yet:** floor plan, reports, head office, offline phone app, silent printing straight to a receipt printer.

## Requirements

- Node.js 22.12 or newer (developed on Node 24)
- npm 11 or newer
- For the browser tests: Google Chrome or Microsoft Edge installed

## Run it for development

```bash
npm install
npm run dev
```

- Website: http://localhost:3000
- Till sign-in: http://localhost:3000/login

The database is created at `data/enyo.db` on first run and filled with the demonstration restaurant, staff and menu below. Database changes are applied automatically, even while the dev server is running.

## Run it in a restaurant (main computer)

1. **Build and start** on the computer that will be the main computer:

   ```bash
   npm install
   npm run build
   npm start
   ```

   `npm start` listens on port 3000 on every network connection of this computer. To use another port: `npm start -- -p 8080`.

2. **Find the main computer's address on the restaurant network.** On Windows run `ipconfig` and note the *IPv4 Address* of the Wi-Fi or Ethernet adapter, for example `192.168.1.20`. Give the main computer a fixed address (a DHCP reservation in the router) so it doesn't change.

3. **Allow it through the firewall.** The first time, Windows asks whether Node.js may accept connections: allow it on **private** networks only.

4. **On every till, tablet, phone and kitchen screen** open `http://192.168.1.20:3000/login` (use your address) in Chrome, Edge or Safari, and bookmark it or add it to the home screen.

5. **Keep it running.** The main computer must stay on during service. To start ENYO POS automatically when Windows starts, create a Task Scheduler task that runs `npm start` in this folder at log-on.

Notes:

- **Data** lives in `data/enyo.db` (plus `enyo.db-wal` and `enyo.db-shm` while running), and the uploaded logo in `data/uploads/`. Every change is written to disk before it's confirmed.
- **Backups:** automatic — see [Backups](#backups) below. Set a second copy folder on a USB drive or another disk (Settings → Server and backups) so a backup survives if the main computer fails.
- **Keep the project out of OneDrive/Dropbox folders.** Sync tools lock files in `.next` and `data` while the app writes to them, which breaks builds and can corrupt a live database copy. `C:\enyo-pos` is a good place.
- **First run:** a new production database starts empty, and the till opens a short setup — restaurant name, your name and PIN (you become the owner), and optionally the 16-dish sample menu. Setup only works while the database is empty. Demo staff are not loaded in production unless `ENYO_SEED_DEMO=1` (for trials only).
- The browser address is plain `http://` on the local network. Session cookies are therefore not marked *Secure*; set `ENYO_SECURE_COOKIES=1` if you put the app behind https.

## Backups

- **When:** every night at the time set in Settings (23:30 unless changed), and shortly after the app starts if there's no backup from today yet. Taken while the till keeps working, then checked for damage.
- **Where:** `data/backups/` (or `ENYO_BACKUP_DIR`), one folder per backup holding the database, the logo and a record of the check. Each one is also copied to the second folder if you set one.
- **Kept:** the last 7 days, 12 months and 5 years, and always the 3 newest.
- **In the app (owners):** Settings → Server and backups lists every backup with its check result, and has **Back up now**, **Download** and **Restore**. Restoring first backs up the current data (so it can be undone), then everyone signs in again.
- **From the command line** (for when the app won't start):

  ```bash
  npm run backup              # take a backup now
  npm run backup -- --list    # list backups
  npm run restore             # list backups you can restore
  npm run restore -- latest   # restore the newest (stop the app first)
  npm run restore -- <id>     # restore a particular one
  ```

## Demonstration staff

For local testing only. Never use the demo data on a real till.

| Name      | Role             | PIN  | Lands on |
| --------- | ---------------- | ---- | -------- |
| Ama Owner | Owner            | 1111 | Order    |
| Kwame B.  | Manager          | 2222 | Order    |
| Kofi A.   | Server           | 3333 | Order    |
| Efua M.   | Cashier          | 4444 | Order    |
| Abena O.  | Bartender        | 5555 | Order    |
| Yaw D.    | Kitchen (Grill)  | 6666 | Kitchen  |
| Akosua T. | Kitchen (Line)   | 7777 | Kitchen  |

Five wrong PINs in a row lock that person out for 5 minutes. **Lock** (bottom of the sidebar, or More on a phone) ends the session. Kitchen staff only see the kitchen display; menu, stock, staff, reports, reviews and settings are for owners and managers.

## How it works

- **Orders:** tap dishes to build a ticket, choose dine-in (table required), takeaway or delivery (name and phone required), add notes, then **Hold** (save without sending) or **Send to kitchen**. Reopen an order from **Open orders** to add more; lines already sent are locked and new ones go to the kitchen as a separate ticket (hold and fire).
- **Prices and taxes** always come from the database. VAT 15%, NHIL 2.5% and GETFund 2.5% are each rounded to the pesewa and the total is the sum of the rounded lines, so a receipt always adds up (GH₵ 145.00 → 174.01). Each order line keeps the name and price it was sold at.
- **Kitchen display:** tickets oldest first with a timer that turns amber at 10 minutes and red at 15. **Start** → cooking, **Bump** → ready-to-serve strip, tap the chip once served, **Recall last** to bring back the last bumped ticket. Filter by station.
- **Payments:** **Pay** holds any changes and opens the pay screen. Take cash (with change), mobile money (MTN MoMo, Telecel Cash, AT Money, with the customer's number), card, voucher or house account, in one go or split (½, ⅓, ¼ or any amount, mixing methods). A discount comes off before tax and needs a reason; cashiers and servers need an owner or manager to enter their PIN. Tips are added after tax and aren't taxed. Any items not yet sent go to the kitchen with the first payment. Once money is taken the order, discount and tip are locked; when the balance reaches zero the order closes and its subtotal, taxes and total are frozen. ENYO POS records payments taken on your own terminals and phones; it doesn't process them.
- **Menu (owners and managers):** add, edit, reorder and remove dishes and categories; mark dishes sold out (also from the order screen with **Mark sold out**). A dish that has been ordered is archived rather than deleted, and can be put back. Orders already taken keep the names and prices they were sold at.
- **Staff (owners and managers):** add people with a role, job title and PIN; reset PINs (which also clears a lockout); unlock; deactivate (signs them out on every till at once). Managers manage cashiers, servers, bartenders and kitchen staff; owners manage everyone. The last owner can't be removed or demoted.
- **Settings:** restaurant name, logo (PNG, JPEG or WebP up to 512 KB) and receipt footer; whether discounts need a manager; and, for owners only, taxes — VAT registered or not, each tax's rate, whether it's charged, whether it has its own receipt line or is folded into one combined line, and tax-inclusive menu prices. A receipt preview updates as you change them. New orders use the current settings; paid orders keep exactly what they were charged.
- **Receipts:** 80 mm receipts (or a bill before payment) print through the browser's print dialog — choose the receipt printer there.
- **Live updates:** every till and kitchen screen holds a Server-Sent Events connection to the main computer (`/api/events`, signed-in staff only). Any send, start, bump, serve or recall refreshes every screen in about a second and shows "Order #… is ready" on the tills. If the connection drops, a banner shows until it reconnects.
- **Two tills, one order:** saves carry a version number; a till with an out-of-date copy is told to reopen the order instead of overwriting.

## Settings

Put these in `.env.local` (ignored by git) or set them in the environment:

| Variable                 | Default        | Purpose                                                                    |
| ------------------------ | -------------- | -------------------------------------------------------------------------- |
| `DATABASE_PATH`          | `data/enyo.db` | Where the SQLite database lives.                                           |
| `ENYO_SEED_DEMO`         | on in dev      | `1` loads the demo data in production too; `0` never loads it.             |
| `ENYO_SECURE_COOKIES`    | off            | `1` marks the session cookie Secure. Only turn on when serving over https. |
| `NEXT_PUBLIC_DEMO_EMAIL` | none           | Address for the website's "Book a demonstration" button.                   |
| `ENYO_BACKUP_DIR`        | `data/backups` | Where backups are kept.                                                    |
| `ENYO_BACKUPS`           | on             | `0` turns automatic backups off (manual and command-line backups still work). |

## Checks

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # unit tests (Vitest): taxes, sign-in, roles, orders, kitchen, payments, menu, staff, settings, setup, backups
npm run test:e2e    # browser tests (builds first)
```

`npm run test:e2e` builds the app, then runs each suite against its own production server and a fresh throwaway database: `landing`, `login`, `shell`, `order`, `kitchen`, `payments`, `admin`, `setup` (on an empty database), `backups` and `a11y` (axe-core WCAG 2.2 AA on every screen, plus a 44 × 44 px minimum for till controls). Run some suites only with `npm run test:e2e -- order kitchen`, or skip the build with `-- --no-build`. Screenshots go to `e2e/output/`. Set `CHROME_PATH` if Chrome or Edge isn't in the usual place.

## Project layout

```
src/app/                 pages: website (/), setup (/setup), sign-in (/login), till (/order, /kitchen, /pay/[order], /menu, /staff, /settings), receipt (/receipt/[order]), live events (/api/events), logo (/api/logo/[file])
src/components/landing/  website sections, device mockups, scroll animations
src/components/auth/     sign-in screen
src/components/till/     till shell (sidebar, phone tabs, live connection)
src/components/order/    order screen
src/components/kitchen/  kitchen display
src/components/pay/      pay screen, discount dialog, receipt controls
src/components/menu/, staff/, settings/, setup/, admin/   management screens and their shared pieces
src/components/react-bits/  adapted React Bits text and reveal animations
src/db/                  schema, connection, migrations runner, demo seed
src/lib/                 business rules (auth, orders, kitchen, tax, money) with unit tests
drizzle/                 SQL migrations
e2e/                     browser tests and their runner
scripts/                 command-line backup and restore
```

## Database changes

The schema is in `src/db/schema.ts`. After changing it, generate a migration and commit it:

```bash
npx drizzle-kit generate --name describe-the-change
```

Migrations in `drizzle/` are applied automatically when the app starts (and, in development, as soon as they appear).

## Notes

- GSAP is installed from GitHub (`github:greensock/GSAP#3.15.0`); `.npmrc` allows that one direct git dependency, so `npm install` needs access to github.com.
- Staff PINs are stored only as Argon2id hashes; session tokens only as SHA-256 hashes.
- Every page is sent with headers that stop other sites framing it, stop content-type guessing and limit referrer information.
- `npm audit` reports issues only in development tools (ESLint's Next config and drizzle-kit's bundled esbuild); none of them are part of the running app.
