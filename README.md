# Codebook · AI Annotation Lab

A static, GitHub Pages-friendly annotation workflow for independent Agency and Inevitability coding, balanced sampling from `AI_label_second_round_golden_label.xlsx`, live reliability estimates, and two-coder consensus review.

## Features

- Email/password accounts and shared project invite codes.
- Browser-side `.xlsx` import; the workbook itself is not committed or uploaded to GitHub.
- Seeded, without-replacement sampling of `a` items in each stratum: Agency non-presence / low / high and Inevitability non-presence / low / high. Each draw is saved as a separate sample run; total assignment count per run is `6 × a`.
- Independent labeling with presence followed by conditional High/Low, plus optional reasoning.
- Blind phase: other coder's submissions stay hidden. Discussion phase unlocks original labels, Cohen's κ, percent agreement, confusion matrices, comments, and consensus proposals.
- Excel export with source fields, independent labels, and consensus status.

## Required workbook columns

The first worksheet needs these columns:

```text
sentence
golden_agency_presence
golden_agency_high_low
golden_inevitability_presence
golden_inevitability_high_low
```

Presence and High/Low labels should use `0` and `1`. High/Low values are sampled only among rows where the corresponding golden Presence is `1`; non-presence rows are sampled from Presence `0`.

## Supabase setup

1. Create a Supabase project and open **SQL Editor**.
2. Run [`schema.sql`](./schema.sql). It creates the tables, blind-phase row policies, project join-code RPC, and Realtime publication entries.
3. In Supabase Auth settings, enable email/password sign-in. For a closed study, disable public sign-up after both coder accounts have been created.
4. Open the app and paste the Supabase Project URL and anon/publishable key. The app stores these in the local browser only. Never use a service-role key in the browser.
5. Create a project. The project owner gets an invite code. The second coder signs up separately and joins with that code.
6. Upload the golden-label workbook, choose a seed and `a`, then draw the sample. Both coders label independently. The owner opens review after both have submitted.

The Supabase anon/publishable key is meant for browser use; the RLS policies in `schema.sql` are what restrict row access. Project owners can access the golden workbook rows in the database; do not use owner credentials for a coder account if strict server-enforced blinding from the gold labels is required.

## Local preview

Serve this folder over HTTP (ES modules do not work reliably from `file://`):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` from this directory. The page loads Supabase JS and SheetJS from their official CDNs.

## GitHub Pages

The included workflow publishes this directory on pushes to `main`. In the repository, choose **Settings → Pages → Build and deployment → GitHub Actions**. The app URL will be `https://moeee08-cyber.github.io/codebook_label/` after the first successful deployment.

No workbook, Supabase URL, or key is stored in this repository. The browser asks for connection details after opening the page.

## Method notes

- Sampling is deterministic for a given workbook row order, seed, and `a` value. It is without replacement inside each stratum. A sentence can appear in both constructs because Agency and Inevitability are separate coding assignments. Choose a sample run in the top bar to label it or view its reliability separately.
- Cohen's κ and raw agreement are calculated only for assignments with labels from both coders. High/Low statistics include cases both coders marked Presence=1 and both supplied High/Low.
- Consensus decisions and comments are kept separate from independent annotations and do not alter reliability statistics.
- Static page dependencies and auth/session management use Supabase's JavaScript client; `.xlsx` files are parsed in-browser using the SheetJS standalone build.
