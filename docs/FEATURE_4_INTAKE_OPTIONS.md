# Feature 4 — "Google Form-style intake": the options

Your goal: an easy way to collect a known group's details at scale, then turn approved
people into code-holding voters. Here are the three ways to do it, with honest tradeoffs.
The DB already supports Option A today (the `intake_responses` table + `submit_intake` +
`admin_convert_intake`). Pick a direction before I build the UI.

## Option A — In-app public "Request access" form (RECOMMENDED)

A public page at `/e/:code/request`. Anyone with the link fills name/email/grade/batch/
admission no (+ any custom fields). Submissions land in an admin "Requests" queue. Admin
approves → it becomes a registration and a code is issued; reject → dismissed.

- **Pros:** zero external setup, lives in your app, feeds the same approval+code flow you
  already have, you control the fields and styling, works on mobile, no API keys.
- **Cons:** you host the form (but that's the point — it's your product). Spam needs a
  basic guard (rate-limit / simple captcha), which I'd add.
- **Effort:** low. DB is done; just needs the public form page + the admin Requests tab.

## Option B — Real Google Forms integration

Admin builds a Google Form; responses sync into Live Ballot (via a Google Sheet the app
reads, or an Apps Script webhook posting to an edge function).

- **Pros:** people already trust/know Google Forms; admin may already have one.
- **Cons:** real integration burden — Google OAuth or service account, Sheets API or Apps
  Script, mapping arbitrary columns to our fields, and ongoing breakage when the form
  changes. Heavier to maintain; another external dependency you'd set up.
- **Effort:** high, and partly untestable on my side (needs your Google account).

## Option C — CSV import of responses (ALREADY HALF-BUILT)

Admin collects responses however they like (existing Google Form, paper, spreadsheet),
exports a CSV, and bulk-imports. `admin_import_voters` already does this — it creates
registrations and issues codes in one shot, returning the list for distribution.

- **Pros:** simplest possible; works with ANY collection method including a Google Form
  you already run; no integration to maintain. Already tested.
- **Cons:** not real-time; admin does the export/import step manually.
- **Effort:** trivial — just a CSV upload UI on top of the function that already exists.

## My recommendation

Do **A + C together**: the in-app request form for the "send a link, people reply"
flow, and CSV import for "I already have a list/sheet." That covers your underlying goal
from both directions with no fragile Google integration. Add Option B only later if a
specific client demands native Google Forms.

**Tell me: A only, C only, A+C, or B — and I'll scope the UI for it.**
