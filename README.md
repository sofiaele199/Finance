# Ledger

A small personal app for tracking credit cards, what you owe, and when you'll be clear of it.

Five screens: Overview, Cards, Accounts, Payoff, Budget. It works offline, installs to your home screen with its own icon, and syncs across your devices once you connect a database.

---

## The short version

You can deploy this to Vercel right now, before touching Supabase. It will work immediately and save data in whatever browser you're using. Sync is an upgrade you switch on afterward by pasting two values into `config.js`.

If you'd rather do it in one pass, do Part 1 first and paste the keys before deploying.

---

## Part 1: Supabase, for sync across devices

About ten minutes. Free tier is far more than enough.

### 1. Create the project
Go to supabase.com, sign up, and create a new project. Pick a region near you. It takes a couple of minutes to spin up.

### 2. Create the table
In the left sidebar open **SQL Editor**, click **New query**, paste the entire contents of `schema.sql`, and press **Run**.

This creates one table with one row per user and turns on row-level security. The three policies all compare the row's `user_id` to the id of whoever is signed in, which is what stops one account from reading another's data. Don't skip this step. Without row-level security the table is readable by anyone with the public key.

### 3. Allow your site to sign people in
Go to **Authentication → URL Configuration**. Set **Site URL** to your Vercel address, for example `https://ledger-elena.vercel.app`. Add the same address under **Redirect URLs**.

If you skip this, the sign-in email will arrive but the link will bounce you somewhere unhelpful.

Email sign-in is on by default. There's no password: you enter your email, Supabase sends a link, tapping it signs you in on that device and keeps you signed in.

### 4. Copy your two values
Go to **Project Settings → API** and copy:
- **Project URL**
- the **anon public** key

Open `config.js` and paste them in, replacing the placeholders.

Both values are meant to be public and will be visible in the page source. That's how Supabase is designed to work. Your data is protected by the row-level security policies from step 2, not by hiding the key. This is why step 2 matters.

---

## Part 2: Deploy to Vercel

### The simple way, no command line

1. Go to vercel.com and sign in
2. Look for the drag-and-drop deploy option on the dashboard
3. Drag the whole `ledger-app` folder in

Vercel will give you a URL in under a minute. There's nothing to build or configure; these are plain files.

### If you'd rather use GitHub

Push the folder to a repository, then in Vercel choose **Add New → Project** and import it. Framework preset: **Other**. Leave the build command empty and set the output directory to the project root. Every push will redeploy.

### After deploying

If you set up Supabase, go back and confirm the Site URL in step 3 matches the address Vercel actually gave you.

---

## Part 3: Put it on your home screen

**iPhone.** Open the URL in Safari, not Chrome. Only Safari can install to the home screen on iOS. Tap Share, then **Add to Home Screen**.

**Android.** Open in Chrome, tap the three-dot menu, then **Install app** or **Add to Home screen**.

It will open fullscreen with no browser bar, like any other app.

---

## Using it

**Cards.** Tap + to add one. Name, balance, credit limit, APR and minimum payment. The APR is on your statement, usually as "purchase APR." Due day is optional.

**Overview.** Total owed, credit utilization, and your projected payoff date. Utilization matters for your credit score. Under 30% is the usual guidance, and it turns amber at 40% and red at 75%.

**Payoff.** Choose a method and enter any extra you can pay each month.

- *Avalanche* targets your highest-APR card first. Mathematically it always costs the least.
- *Snowball* targets your smallest balance first. It costs a little more but clears whole cards sooner, which some people need in order to keep going.

The screen tells you what switching would cost or save, so you can decide with the real number in front of you rather than on principle.

If your minimums don't cover the interest, it says so plainly and tells you how much more per month is needed just to stop the balance climbing.

**Accounts.** Add checking, savings, and cash accounts with current balances so you can see your available cash and net position against debt.

**Budget.** Add your monthly income, recurring expenses, and other fixed costs. It works out what's genuinely free after your fixed costs and debt payments, and can send that straight to your payoff plan.

---

## Your data

Every change writes to your device first, then to the server. If you're offline it saves locally and says "Offline, saved on this phone," and pushes when you're back. Nothing you type is lost to a bad connection.

On the Budget screen there's **Download a backup**, which gives you a JSON file, and **Restore from a backup**. Worth doing occasionally regardless of sync.

If you never connect Supabase, everything stays in one browser. Clearing your website data would erase it, so back up if you go that route.

---

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell and all styling |
| `app.js` | Screens and interactions |
| `store.js` | Saving, loading, sync, backups |
| `payoff.js` | The payoff simulation |
| `config.js` | Your two Supabase values |
| `manifest.json` | Home screen name and icon |
| `sw.js` | Offline caching |
| `schema.sql` | Database table and security policies |
| `test.mjs` | Test suite, `node test.mjs` |

---

## If something goes wrong

**Sign-in link doesn't work.** Site URL and Redirect URLs in Supabase almost certainly don't match your live Vercel address.

**Data isn't syncing.** Check the sync line under the date in the header. "Offline" means it's saved on your phone but can't reach the server. If it says nothing at all, `config.js` still has the placeholders in it.

**Changes don't show after redeploying.** The service worker cached the old version. Close the app fully and reopen, or remove it from your home screen and re-add it.

**Signed in but no data.** Confirm you used the same email address. Each email is a separate account.

---

## A note on the numbers

This projects forward assuming your APR and minimum payment stay as entered. Real cards recalculate the minimum as the balance drops, and promotional rates expire. Treat the payoff date as a good estimate for deciding between options, not a guarantee.

If the debt has moved past what a spreadsheet can help with, the National Foundation for Credit Counseling (nfcc.org) offers free and low-cost sessions with accredited counselors, and they can negotiate rates in ways an app cannot.
