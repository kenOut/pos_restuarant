# ENYO POS

Touch-screen point of sale for restaurants in Ghana. The restaurant's main computer runs the app and keeps the data; tills, tablets, phones and the kitchen screen use it through a web browser over the restaurant's own network, so service carries on when the internet is down. One install can run several branches of a business, each with its own database, managed from a head office.

Built with Next.js 16, React 19, SQLite (Drizzle ORM), Tailwind CSS 4, GSAP and Lenis.

**What works today:** marketing website · staff sign-in with PINs · till shell for every role · order screen (menu, ticket, notes, taxes, hold and send) · kitchen display with live updates to every screen · payments (cash with change, mobile money, card, voucher, house account; split bills; tips; manager-approved discounts) and printable receipts · menu, staff and settings management (logo, receipt footer, tax setup) · first-time setup · automatic backups with restore · several branches, each with its own database, and a head office to add, open, rename and close them.
**Not built yet:** floor plan, reports (including across branches), offline phone app, silent printing straight to a receipt printer.

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
| `ENYO_DATA_DIR`          | `data`         | Folder for `control.db`, `branches/` and head office backups.              |
| `DATABASE_PATH`          | none           | Older single-restaurant setting: its database becomes the first branch, and its folder is the data folder unless `ENYO_DATA_DIR` is set. |
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
npm test            # unit tests (Vitest): taxes, sign-in, roles, orders, kitchen, payments, menu, staff, settings, branches and head office, backups
npm run test:e2e    # browser tests (builds first)
```

`npm run test:e2e` builds the app, then runs each suite against its own production server and a fresh throwaway data folder: `landing`, `login`, `shell`, `order`, `kitchen`, `payments`, `admin`, `setup` (on an empty install), `backups`, `branches` (head office, separate branch data and sessions, the `/b/` fallback, adding, renaming and closing branches) and `a11y` (axe-core WCAG 2.2 AA on every screen, plus a 44 × 44 px minimum for till controls). Run some suites only with `npm run test:e2e -- order kitchen`, or skip the build with `-- --no-build`. Screenshots go to `e2e/output/`. Set `CHROME_PATH` if Chrome or Edge isn't in the usual place.

## Project layout

```
src/proxy.ts             works out the branch from the subdomain or /b/<address>
src/app/                 website (/), choose a branch (/login)
src/app/hq/              head office: setup, sign-in, claim (upgrades), dashboard, add a branch
src/app/b/[branch]/      a branch: sign-in (/login), till (/order, /kitchen, /pay/[order], /menu, /staff, /settings), receipt (/receipt/[order]), live events (/api/events), logo (/api/logo/[file]), backup download
src/components/landing/  website sections, device mockups, scroll animations
src/components/auth/     sign-in screen
src/components/till/     till shell (sidebar, phone tabs, live connection)
src/components/order/    order screen
src/components/kitchen/  kitchen display
src/components/pay/      pay screen, discount dialog, receipt controls
src/components/hq/       head office forms and branch controls
src/components/menu/, staff/, settings/, admin/   management screens and their shared pieces
src/components/react-bits/  adapted React Bits text and reveal animations
src/db/                  branch and head office schemas, connections, migrations runner, demo seed
src/lib/tenancy/         branches: registry, request context, addresses
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

For the head office database (`src/db/control-schema.ts`) use `npx drizzle-kit generate --config drizzle.control.config.ts --name describe-the-change`.

Migrations are applied automatically when the app starts (and, in development, as soon as they appear).

## Notes

- GSAP is installed from GitHub (`github:greensock/GSAP#3.15.0`); `.npmrc` allows that one direct git dependency, so `npm install` needs access to github.com.
- Staff PINs and head office passwords are stored only as Argon2id hashes; session tokens only as SHA-256 hashes. Five wrong head office passwords lock that sign-in for 15 minutes.
- Every page is sent with headers that stop other sites framing it, stop content-type guessing and limit referrer information.
- `npm audit` reports issues only in development tools (ESLint's Next config and drizzle-kit's bundled esbuild); none of them are part of the running app.
