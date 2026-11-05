# Cash

Today’s screen works with no account. Its sales stay in this browser’s localStorage under `cash-today-v1` until the signed-in user clicks Import.

Signed-in sales, the daily goal, the dashboard, and reports belong to that Supabase user. Row policies on `profiles` and `sales` allow only `auth.uid()`. Do not weaken those policies, do not put a secret key in the browser, and do not import guest sales automatically.

The pure rules live in `js/domain.js`. Change them with `npm test`. The page is `index.html`, `styles.css`, and `js/app.js`. Serve it over http so the modules load. `file://` is not a valid auth origin.

A personal record is the best net total of any earlier local day. Congratulate only when today moves from at or below that number to strictly above it. A refresh of a day that is already the record stays quiet.

Keep the code small. Do not add features, dependencies, or accounts data that the current screens do not use.
