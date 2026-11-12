# Codebook · AI Annotation Lab

A static, GitHub Pages-friendly workflow for independent Agency and Inevitability coding, balanced sampling from a preloaded Supabase copy of `AI_label_second_round_golden_label.xlsx`, live reliability estimates, and two-coder consensus review.

## Features

- Passwordless anonymous coder identities with display names and shared project invite codes.
- The golden-label workbook is seeded into the database once. Coders never upload the workbook in the app or browse its labels.
- Seeded, without-replacement sampling of `a` items in each stratum: Agency non-presence / low / high and Inevitability non-presence / low / high. Each draw is saved as a separate run; total assignments per run are `6 × a`.
- Independent labeling with Presence followed by conditional High/Low, plus optional reasoning.
- Blind phase hides the other coder's submissions. After both coders finish all assignments, the database automatically opens discussion and unlocks original labels, Cohen's κ, percent agreement, confusion matrices, comments, and consensus proposals.
- Excel export with source fields, independent labels, and consensus status.

## Dataset columns

The source workbook's first worksheet must contain:

```text
sentence
golden_inevitability_presence
golden_inevitability_high_low
golden_agency_presence
golden_agency_high_low
```

The existing workbook at `/Users/wumengmeng/Desktop/AI_label_second_round_golden_label.xlsx` has these columns. Presence and High/Low labels use `0` and `1`; High/Low is sampled only where the matching Presence label is `1`.

In the current workbook the six eligible pool sizes are Agency non-presence 48, low 29, high 43; Inevitability non-presence 43, low 35, high 39. Therefore the largest equal count for all six strata is `a = 29`.

## Supabase setup

1. Create a Supabase project and run [`schema.sql`](./schema.sql) in its SQL Editor. This creates tables, row access policies, project join-code functions, sampling functions, and Realtime publication entries.
2. Generate a private SQL seed from the workbook:

   ```bash
   python3 scripts/build_source_seed.py /Users/wumengmeng/Desktop/AI_label_second_round_golden_label.xlsx
   ```

   This creates `seed_source_dataset.sql` locally. Open it, paste it into Supabase SQL Editor, and run it once to preload the source dataset. `.gitignore` excludes the generated SQL and workbook files; do not commit either.
3. In Supabase Dashboard, open **Authentication → Sign In / Providers → Anonymous Sign-Ins** and enable anonymous sign-ins. No email registration, password, or email redirect URL is needed. Anonymous users are saved in their current browser; use a different browser or browser profile for each coder. Clearing browser data or switching devices creates a new identity, so the old coder's projects and labels will not follow automatically.
4. Open the app and enter the Supabase Project URL and anon/publishable key. These are stored in the local browser. Never use a service-role key in the browser.
5. Create a project and share its invite code with the second coder. Choose a seed and count `a`; the database creates six sample strata and keeps each run separate. After both coders submit all assignments, reliability and discussion open automatically.

The browser cannot read the global source dataset. Project gold labels are readable only by the owner after the project enters discussion. Blind independent annotations are immutable and separate from consensus labels.

## Local preview

Serve this folder over HTTP (ES modules do not work reliably from `file://`):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` from this directory. The page loads Supabase JS and SheetJS from their official CDNs.

## GitHub Pages

The included workflow publishes this directory on pushes to `main`. In the repository, choose **Settings → Pages → Build and deployment → GitHub Actions**. The expected app URL is `https://moeee08-cyber.github.io/codebook_label/`.

No workbook, generated SQL seed, Supabase URL, or key is stored in this repository. The app asks for the Supabase connection details after opening.

## Method notes

- Sampling is deterministic for a given workbook row order, seed, and `a`; it is without replacement within each stratum. A sentence can appear under both constructs because Agency and Inevitability are distinct assignments.
- Reliability is computed per selected sample run from assignments both coders completed. High/Low agreement includes only cases both coders marked Presence=1 and both supplied a High/Low label.
- Discussion notes and confirmed consensus do not modify original labels or reliability statistics.
