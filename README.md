# ENYO POS

Touch-screen point of sale for restaurants in Ghana. The restaurant's main computer runs the app and keeps the data; tills, tablets, phones and the kitchen screen use it through a web browser over the restaurant's own network, so service carries on when the internet is down. One install can run several branches of a business, each with its own database, managed from a head office.

Built with Next.js 16, React 19, SQLite (Drizzle ORM), Tailwind CSS 4, GSAP and Lenis.

**What works today:** marketing website · staff sign-in with PINs · till shell for every role · live floor plan with table statuses, reservations and arrange mode · order screen (menu, ticket, notes, taxes, hold and send) · kitchen display with live updates to every screen · payments (cash with change, mobile money, card, voucher, house account; split bills; tips; manager-approved discounts) and printable receipts · menu, staff and settings management (logo, receipt footer, tax setup) · first-time setup · automatic backups with restore · back office for owners and managers (dashboard with live order tracking, orders, payments, reports, CSV downloads) · read-only data API with keys · several branches, each with its own database, and a head office to add, open, rename and close them.
**Not built yet:** the full Bookings screen, reports (including across branches), offline phone app, silent printing straight to a receipt printer.

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
- Head office: http://localhost:3000/hq (owner@chezaccra.test, password `enyo-demo-2026`)
- Branches: http://localhost:3000/b/osu and http://localhost:3000/b/accra-mall, or, with `ENYO_BASE_DOMAIN=localhost` in `.env.local`, http://osu.localhost:3000 and http://accra-mall.localhost:3000

On first run `data/` is filled with a demonstration business, "Chez Accra Group", with two branches (Osu and Accra Mall), each with the staff and menu below. A `data/enyo.db` from before branches existed is used as the only branch instead; delete `data/` to get the demo business. Database changes are applied automatically, even while the dev server is running.

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

4. **On every till, tablet, phone and kitchen screen** open the branch's sign-in, `http://192.168.1.20:3000/b/<branch address>/login` (use your address; head office shows each branch's link), in Chrome, Edge or Safari, and bookmark it or add it to the home screen. With only one branch, `http://192.168.1.20:3000/login` goes straight to it.

5. **Keep it running.** The main computer must stay on during service. To start ENYO POS automatically when Windows starts, create a Task Scheduler task that runs `npm start` in this folder at log-on.

Notes:

- **Data** lives in `data/`: `control.db` for head office (the business, its branches and head office sign-ins), and one folder per branch in `data/branches/` holding that branch's `enyo.db` (plus `-wal` and `-shm` files while running), its logo and its backups. Every change is written to disk before it's confirmed.
- **Backups:** automatic — see [Backups](#backups) below. Set a second copy folder on a USB drive or another disk (Settings → Server and backups) so a backup survives if the main computer fails.
- **Keep the project out of OneDrive/Dropbox folders.** Sync tools lock files in `.next` and `data` while the app writes to them, which breaks builds and can corrupt a live database copy. `C:\enyo-pos` is a good place.
- **First run:** a new install starts empty and opens setup at `/hq/setup`: the business name; your head office sign-in (email and a password of at least 10 characters); and the first branch, with its name, its address and your PIN there, plus the 16-dish sample menu if you want it. You become that branch's owner. Setup only works while nothing exists. Demo data is not loaded in production unless `ENYO_SEED_DEMO=1` (for trials only).
- **Upgrading from a single restaurant:** the existing database becomes the first branch where it is (no files move). The first visit to `/hq` asks one of its owners for their PIN, then creates the head office sign-in.
- The browser address is plain `http://` on the local network. Session cookies are therefore not marked *Secure*; set `ENYO_SECURE_COOKIES=1` if you put the app behind https.

## Back office

Each branch has a back office at `…/b/<branch>/office` (or `osu.yourdomain.com/office`), for **owners and managers**. Sign in on the same screen as the till, with the same PIN. The session is separate from the till's (a till sign-in never opens it) and ends after 30 minutes without use. Head office shows a **Back office** link for each branch, and the till's Settings links to it.

- **Dashboard:** total orders, sales, payments (by method) and the average order for today, yesterday, this week, this month or your own dates, plus **live orders**: every order open now with its table or customer, server, time open, kitchen progress (sent, cooking, ready, served) and total, updating as the tills and kitchen work. Orders open 45 minutes or more are outlined in red.
- **Orders:** filter by date, status, type and server, or search by order number, table or customer; open an order for its items, bill and payments, and view or reprint its receipt. Download as CSV.
- **Payments:** filter by date, method, mobile money network and who took it, with totals per method for cashing up. Download as CSV.
- **Reports:** sales by day, by dish, by category and by server; payment methods; taxes (VAT, NHIL and GETFund, as charged, for returns); busiest hours. Printable, and each one downloads as CSV.
- **Settings:** the branch's settings (as on the till), plus **API access**.

## ENYO Online (many clients on one server)

The same app can run as **ENYO Online**: one internet server holding many client restaurant businesses, each with its own head office, branches and data. A restaurant's own main computer stays as it is (local mode), and can be kept in step with its business on ENYO Online: see [Sync with ENYO Online](#sync-with-enyo-online).

- **Turn it on** with `ENYO_MODE=online` and `ENYO_ADMIN_SETUP_CODE=<a long secret of your choosing>`. Keep `ENYO_DATA_DIR` (or `DATABASE_PATH`) on the volume, and set `ENYO_SECURE_COOKIES=1` behind https.
- **Data:** `data/platform.db` lists the clients and the seller's sign-ins; each client has its own folder, `data/businesses/<id>/`, with its own head office database and branch databases. No client can reach another's data, sign-ins or API keys.
- **Addresses:** `/c/<client>/hq` for a client's head office, `/c/<client>/b/<branch>` for its branches (tills, back office, data API), `/c/<client>/login` to sign in. The website's **Sign in** asks for the restaurant's address name. With your own domain and `ENYO_BASE_DOMAIN`, `<client>.yourdomain.com` works too.
- **The seller's page** (`/admin`): the first visit asks for `ENYO_ADMIN_SETUP_CODE` to create your seller account (email and a password of at least 12 characters). It lists every client with its status (waiting for setup, set up, suspended) and branch names, never their sales.
  - **Add a client:** name and address name. ENYO shows a one-time **setup link**, valid for 14 days; send it to the client. It opens their setup (business, head office sign-in, first branch) and stops working once used. **New setup link** replaces an unused one.
  - **Suspend** stops a client's tills, back office and API at once; **Reactivate** brings everything back. Nothing is deleted.
- **On ENYO Online,** clients can't choose a second backup folder (that would mean folders on your server); their backups are taken and kept on the server as usual.

## Sync with ENYO Online

A restaurant's main computer and its business on ENYO Online keep **the same data**: every order, kitchen ticket, payment, table, menu change, member of staff and setting, for every branch, plus head office's branches and sign-ins. Each side keeps a full copy, so **either one carries on when the other is down** and they catch up when they can reach each other.

- **Connecting** (the restaurant computer is already in use): the seller adds the client on ENYO Online and sends the setup link. On it, the client chooses **Connect our restaurant computer**, which shows an address and a key. On the restaurant computer, Head office › **ENYO Online**: enter both and **Connect**. Everything is sent up, and head office signs in online with the same email and password; staff use the same PINs.
- **The other way round** (business set up on ENYO Online first, new restaurant computer): ENYO Online's head office › **Restaurant computer** › Connect shows the address and key; on the new computer's first-time setup, **Already on ENYO Online?** takes everything from there.
- **How it runs:** the restaurant computer starts every exchange (restaurant networks usually can't be reached from the internet), every 5 seconds: it sends its changes and collects ENYO Online's. While either side is unreachable, changes wait and are sent in order once it's back. The status (last contact, changes waiting, the reason if it can't connect) is in head office on both sides, with **Sync now**, **Sync everything again** and **Disconnect**.
- **Order numbers:** orders taken on ENYO Online are numbered **W1001, W1002…** so they never clash with the restaurant's 1001, 1002…
- **When both sides changed the same thing while apart:** the later change wins (by a clock that only moves forward, so a computer with the wrong time can't make old changes win); new items added to an order on both sides are all kept; a paid order stays paid; if both opened an order on the same table, the one opened first keeps the table and the other keeps its table name but leaves the floor plan; an order paid on both sides is flagged. Flags are kept for the conflicts screen (Phase 13d).
- **Not synced:** sign-ins (each side has its own), API keys and their websites, the backup copy folder, and backups themselves (each side backs up its own data). After restoring a backup on either side, both send and collect everything again by themselves.
- **One restaurant computer per business.** A new key (ENYO Online's head office › Restaurant computer › Make a new key) disconnects the old one, for moving to a new computer.

## Data API

A read-only JSON API per branch, for your central system to collect each branch's records. It can't change anything.

- **Keys:** an owner creates them in the back office, Settings → API access. Name each after what uses it. The key is shown once; only a hash is stored. Keys can be revoked at once and show when they were last used. Send it as `Authorization: Bearer <key>`.
- **Address:** `https://<branch address>/api/v1`, e.g. `https://osu.yourdomain.com/api/v1` or `http://192.168.1.20:3000/b/osu/api/v1`.
- **Format:** money in pesewas (GH₵ 1 = 100), times in ISO 8601 (UTC). Errors are `{ "error": { "code", "message" } }` with status 400, 401, 404 or 429.
- **Limits:** 120 requests a minute per key (then 429 with `Retry-After`). Browsers may only call it from websites listed in API access; servers don't need listing.

| Request | Returns |
| --- | --- |
| `GET /api/v1` | The branch the key reads, and the API version |
| `GET /api/v1/orders` | Orders with lines, taxes and payments, oldest change first. Filters: `updated_since`, `from`, `to` (when opened), `status` (`held`, `open`, `paid`), `limit` (1–200, default 50), `cursor` |
| `GET /api/v1/orders/{id}` | One order |
| `GET /api/v1/payments` | Payments, oldest first. Filters: `since`, `from`, `to`, `method`, `limit`, `cursor` |
| `GET /api/v1/receipts/{orderId}` | The receipt (or bill, before payment) as printed; `?format=html` for a printable 80 mm page |
| `GET /api/v1/summary` | The dashboard totals. `period` = `today`, `yesterday`, `week`, `month` or `custom` with `from`/`to` as `YYYY-MM-DD` |
| `GET /api/v1/active-orders` | Orders open now, with kitchen progress |

**Keeping a central copy up to date:** fetch `/orders` page by page (follow `next_cursor` until it's null), remember the newest `updated_at`, then next time ask for `/orders?updated_since=<that time>`. Every change to an order (items, sending, discount, tip, payment, moving table, printing the bill) moves its `updated_at` on. For this the central system must be able to reach the branch's address, for example a branch on Railway or behind your own secure tunnel. A branch on a local network that the internet can't reach will need the later "send to head office" step.

## Branches and head office

- **Head office** (`/hq`, or `hq.yourdomain.com`) signs in with email and password. It shows today's sales, paid orders, open orders and staff for each branch, and can **add**, **rename**, **close** and **reopen** branches. Nothing is deleted: a closed branch's tills can't be reached until it's reopened.
- **A new branch** gets its own database, its first person (the branch lead, with owner rights in that branch only, signing in with the PIN you choose) and a menu: copied from another branch, the sample, or empty.
- **Working in a branch:** **Open** goes to its sign-in, where you use your PIN there like everyone else. Staff, PINs, orders, menu, settings and backups belong to one branch. A session only works at the branch that issued it, and the head office sign-in doesn't open any branch.
- **Branch addresses:** each branch has a short address such as `osu`. It works as a path on any address (`http://192.168.1.20:3000/b/osu`, or the Railway address), and as its own subdomain (`osu.yourdomain.com`) once `ENYO_BASE_DOMAIN` is set.
- **Subdomains on Railway:** in the service's **Settings → Networking**, add the custom domain `yourdomain.com` and the wildcard custom domain `*.yourdomain.com`, then add the DNS records Railway shows at your domain provider. Set `ENYO_BASE_DOMAIN=yourdomain.com` and `ENYO_SECURE_COOKIES=1` in **Variables**. Head office is then at `hq.yourdomain.com` and each branch at `<address>.yourdomain.com`. Keep `DATABASE_PATH` (or set `ENYO_DATA_DIR`) pointing into the volume, so `control.db` and `branches/` are kept there too.

## Backups

- **When:** every night at the time set in Settings (23:30 unless changed), and shortly after the app starts if there's no backup from today yet. Taken while the till keeps working, then checked for damage.
- **Where:** each branch has its own, in a `backups` folder next to its database (or in `ENYO_BACKUP_DIR`, one folder per branch), one folder per backup holding the database, the logo and a record of the check. Each one is also copied to that branch's second folder if one is set, inside a folder named after the branch's address. The head office database is backed up once a day to `data/hq-backups/`.
- **Kept:** the last 7 days, 12 months and 5 years, and always the 3 newest.
- **In the app (a branch's owners):** Settings → Server and backups lists that branch's backups with their check results, and has **Back up now**, **Download** and **Restore**. Restoring first backs up the current data (so it can be undone), then everyone at that branch signs in again. Other branches aren't touched.
- **From the command line** (for when the app won't start):

  ```bash
  npm run backup              # take a backup now
  npm run backup -- --list    # list backups
  npm run restore             # list backups you can restore
  npm run restore -- latest   # restore the newest (stop the app first)
  npm run restore -- <id>     # restore a particular one
  ```

  With several branches, add `--branch <address>`, e.g. `npm run backup -- --branch osu`; run without it to see the list.

## Demonstration staff

For local testing only. Never use the demo data on a real till. Head office: owner@chezaccra.test, password `enyo-demo-2026`. Both demo branches have these staff:

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

- **Floor plan (Tables):** every table in its area (Main hall, Terrace and Bar to start), coloured by status: **free**, **ordering** (an order is open, nothing sent yet), **eating** (food has gone to the kitchen), **waiting to pay** (the bill has been printed) or **reserved** (with a time). Tables show their guests and how long they've been seated, and change on every till within a second. Tap a table for its panel: **Start an order** (or **Seat guests** at a reserved table), **Reserve** with a time and name, and for an occupied table its order and total, **Add items**, **Print bill**, **Move** to a free table, **Change server** and **Take payment**. Phones show the tables as a list.
- **Arrange (owners and managers):** add, rename and remove areas; add tables with a name, seats and a round or square shape; drag them into place on the grid, or select one and use the arrow keys. A table with an order open can't be removed; past orders keep its name.
- **Orders:** tap dishes to build a ticket, choose dine-in (pick a table from the floor plan, and the number of guests; a table can only have one open order), takeaway or delivery (name and phone required), add notes, then **Hold** (save without sending) or **Send to kitchen**. Reopen an order from **Open orders** to add more; lines already sent are locked and new ones go to the kitchen as a separate ticket (hold and fire).
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
| `ENYO_DATA_DIR`          | `data`         | Folder for `control.db`, `branches/` and head office backups.              |
| `DATABASE_PATH`          | none           | Older single-restaurant setting: its database becomes the first branch, and its folder is the data folder unless `ENYO_DATA_DIR` is set. |
| `ENYO_MODE`              | local          | `online` runs ENYO Online: many client businesses on one server. |
| `ENYO_SYNC`              | on             | `0` stops this computer syncing with ENYO Online (the link is kept). |
| `ENYO_ADMIN_SETUP_CODE`  | none           | ENYO Online: the code that creates the first seller account at `/admin`. |
| `ENYO_BASE_DOMAIN`       | none           | e.g. `yourdomain.com`: turns on branch subdomains and `hq.` for head office. |
| `ENYO_SEED_DEMO`         | on in dev      | `1` loads the demo data in production too; `0` never loads it.             |
| `ENYO_SECURE_COOKIES`    | off            | `1` marks the session cookie Secure. Only turn on when serving over https. |
| `NEXT_PUBLIC_DEMO_EMAIL` | none           | Address for the website's "Book a demonstration" button.                   |
| `ENYO_BACKUP_DIR`        | next to each branch | Where backups are kept (one folder per branch).                       |
| `ENYO_BACKUPS`           | on             | `0` turns automatic backups off (manual and command-line backups still work). |

## Checks

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # unit tests (Vitest): taxes, sign-in, roles, orders, tables, kitchen, payments, menu, staff, settings, branches and head office, back office figures and reports, API keys and data, backups
npm run test:e2e    # browser tests (builds first)
```

`npm run test:e2e` builds the app, then runs each suite against its own production server and a fresh throwaway data folder: `landing`, `login`, `shell`, `order`, `kitchen`, `payments`, `admin`, `setup` (on an empty install), `backups`, `tables` (floor plan statuses live on two tills, the table panel, reservations, one order per table, arrange mode with drag and keys), `sync` (a restaurant computer and ENYO Online on their own servers: pairing, trading on both, each side offline in turn, then identical data on both), `online` (ENYO Online: seller setup, adding clients, one-time setup links, two clients with the same branch name kept apart, suspending), `office` (back office sign-in, live tracking, lists, CSV, API keys and every API request, key checks, paging, the request limit and browser access), `branches` (head office, separate branch data and sessions, the `/b/` fallback, adding, renaming and closing branches) and `a11y` (axe-core WCAG 2.2 AA on every screen, plus a 44 × 44 px minimum for till controls). Run some suites only with `npm run test:e2e -- order kitchen`, or skip the build with `-- --no-build`. Screenshots go to `e2e/output/`. Set `CHROME_PATH` if Chrome or Edge isn't in the usual place.

## Project layout

```
src/proxy.ts             works out the branch from the subdomain or /b/<address>
src/app/                 website (/), choose a branch (/login)
src/app/admin/           ENYO Online: the seller's page (clients, setup links, suspend)
src/app/hq/              head office: setup, sign-in, claim (upgrades), dashboard, add a branch
src/app/b/[branch]/office/  a branch's back office (dashboard, orders, payments, reports, settings, CSV downloads)
src/app/b/[branch]/api/v1/  the data API
src/app/b/[branch]/      a branch: sign-in (/login), till (/tables, /order, /kitchen, /pay/[order], /menu, /staff, /settings), receipt (/receipt/[order]), live events (/api/events), logo (/api/logo/[file]), backup download
src/components/landing/  website sections, device mockups, scroll animations
src/components/auth/     sign-in screen
src/components/till/     till shell (sidebar, phone tabs, live connection)
src/components/office/   back office screens and API access
src/components/tables/   floor plan, table panel and arrange mode
src/components/order/    order screen
src/components/kitchen/  kitchen display
src/components/pay/      pay screen, discount dialog, receipt controls
src/components/hq/       head office forms and branch controls
src/components/menu/, staff/, settings/, admin/   management screens and their shared pieces
src/components/react-bits/  adapted React Bits text and reveal animations
src/db/                  branch and head office schemas, connections, migrations runner, demo seed
src/lib/office/, api/    back office figures and reports; API keys, data and HTTP handling
src/lib/sync/            two-way sync: change recording, the engine and its rules, both sides' ends
src/lib/platform/        ENYO Online: client businesses, setup links, seller sign-in
src/lib/tenancy/         businesses and branches: registry, request context, addresses
src/lib/                 business rules (auth, orders, kitchen, tax, money) with unit tests
drizzle/                 SQL migrations for branch databases
drizzle-control/         SQL migrations for the head office database
e2e/                     browser tests and their runner
scripts/                 command-line backup and restore
```

## Database changes

The schema is in `src/db/schema.ts`. After changing it, generate a migration and commit it:

```bash
npx drizzle-kit generate --name describe-the-change
```

For the ENYO Online platform database (`src/db/platform-schema.ts`) use `npx drizzle-kit generate --config drizzle.platform.config.ts --name describe-the-change`. For the head office database (`src/db/control-schema.ts`) use `npx drizzle-kit generate --config drizzle.control.config.ts --name describe-the-change`.

Tables kept in step with ENYO Online are listed in `src/lib/sync/tables.ts`; each needs change-recording triggers (see `scripts/gen-sync-triggers.cjs`), and a unit test checks every listed table has them.

Migrations are applied automatically when the app starts (and, in development, as soon as they appear).

## Notes

- GSAP is installed from GitHub (`github:greensock/GSAP#3.15.0`); `.npmrc` allows that one direct git dependency, so `npm install` needs access to github.com.
- Staff PINs and head office passwords are stored only as Argon2id hashes; session tokens and API keys only as SHA-256 hashes. Five wrong head office passwords lock that sign-in for 15 minutes.
- Every page is sent with headers that stop other sites framing it, stop content-type guessing and limit referrer information.
- `npm audit` reports issues only in development tools (ESLint's Next config and drizzle-kit's bundled esbuild); none of them are part of the running app.
