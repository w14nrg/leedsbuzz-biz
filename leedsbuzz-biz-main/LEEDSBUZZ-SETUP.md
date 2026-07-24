# LeedsBuzz.biz deployment setup

This is an independent Leeds football supporter build built from the supplied fan-platform application structure. It uses original LeedsBuzz branding and does not include an official club crest.

## Before first deployment

1. Create a **new** Cloudflare D1 database, for example `leedsbuzz-white-archive`.
2. Replace the all-zero `database_id` in `wrangler.jsonc` with that new database ID. Do **not** reuse any existing production database ID.
3. Create a new rate-limit namespace and replace `000000`, or remove the `ratelimits` block until configured.
4. Apply the SQL files in `migrations/` to the new database in numerical order.
5. Set `FOOTBALL_DATA_TEAM_ID` to the Leeds United team ID used by your football-data.org account, then configure any secrets used by the worker (admin token, X/API credentials and email provider) in the new Cloudflare project.
6. Deploy the project and attach `leedsbuzz.biz`.

## Brand

- Site: **LEEDS BUZZ**
- Domain: **leedsbuzz.biz**
- Tagline: **All the Buzz. All the Biz.**
- Assistant: **BizBot**
- Player archive: **The White Vault**

## Independent-site notice

LeedsBuzz.biz is an independent supporter project. It is not affiliated with, authorised by or endorsed by Leeds United Football Club. Club names and third-party material remain the property of their respective owners.

## Data status

The White Vault contains 95 launch profiles: 78 players in the bundled 50+ appearance snapshot and 22 current first-team players (with overlap between those groups). For 17 current players outside the verified historical snapshot, appearance totals are intentionally left blank rather than shown as zero. The data model, D1 seeding and 3D profile system are ready for continued verification and expansion.
