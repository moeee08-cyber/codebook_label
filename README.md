# Codebook · AI Annotation Lab

A static, GitHub Pages-friendly workflow for independent Agency and Inevitability coding, balanced sampling from a preloaded Supabase copy of `AI_label_second_round_golden_label.xlsx`, live reliability estimates, and two-coder consensus review.

## Features

- Passwordless anonymous coder identities with display names and shared project invite codes.
- The golden-label workbook is seeded into the database once. Coders never upload the workbook in the app or browse its labels.
- Seeded, without-replacement sampling of `a` items in each stratum: Agency non-presence / low / high and Inevitability non-presence / low / high. Every sampled sentence receives both an Inevitability and an Agency assignment. Code all sampled sentences for Inevitability first, then all of those same sentences for Agency. A run contains up to `12 × a` assignments; duplicate sentences selected across dimensions are assigned once per construct.
- Independent labeling in the order Inevitability (I), then Agency (A), with one direct code choice (2, 1, or 0) and optional reasoning.
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

The existing workbook at `/Users/wumengmeng/Desktop/AI_label_second_round_golden_label.xlsx` has these columns. Source gold labels remain encoded as presence and high/low bits; coder labels are presented and exported as `2`, `1`, or `0`.

## Human coding codebook

Code each assignment in this order: **Inevitability (I)** first, then **Agency (A)**. For each construct, choose exactly one code in the order **2, 1, 0**.

### Inevitability (I)

**2– High inevitability.** The sentence discusses AI’s trajectory and portrays it as unavoidable or as occurring regardless of meaningful human choice. This includes portraying it as:

- unstoppable
- the next stage of progress
- something humans, organizations, or society must adopt or adapt to
- a development where nonparticipation means being left behind

**1– Low inevitability.** The sentence discusses AI’s trajectory and portrays it as contingent on human decisions, institutions, regulation, investment, or collective choices. AI may or may not develop or diffuse in a particular way, and alternative trajectories are possible.

**0 – Not present.** An explicit reference to the future (such as future tense, modal verbs) is required for a 1 or 2. If the sentence does not discuss AI’s development, adoption, diffusion, or consequences as a trajectory, meaning how AI was or is now compared to a point in the future. Sentences that only describe the current state or past development are coded 0.

### Agency (A)

Actor scope: Only public or **public-serving actors count (e.g., employees, people in general, government organizations). Private-serving actors (e.g., managers, individual companies) do not count.**

**2 – High agency.** The sentence portrays public or public-serving actors as having meaningful capacity to shape whether or how AI develops, is deployed, or affects society. Examples are regulation, organizational adoption decisions, public influence, or individual choices. This includes sentences where AI is impacting actors and those actors are also shown shaping or directing that impact.

**1 – Low agency.** Code 2 if either of these applies:

- The sentence portrays public or public-serving actors as mainly reacting or adapting to forces already set in motion, with little meaningful capacity to shape whether or how AI develops or affects society.
- The sentence describes AI impacting actors without indicating that those actors can shape that impact. These sentences count as agency-present because they have implications for how humans can act on AI, and they are coded low because the humans are only being affected.

**0 – Not present.** Code 0 if either of these applies:

- The sentence does not describe how human or institutional actors can act in relation to AI’s development, adoption, diffusion, or consequences, and does not describe AI impacting humans.
- The only actors in the sentence are private-serving.

In the current workbook the six eligible pool sizes are Agency non-presence 48, low 29, high 43; Inevitability non-presence 43, low 35, high 39. Therefore the largest equal count for all six strata is `a = 29`.

## Supabase setup

1. Create a Supabase project and run [`schema.sql`](./schema.sql) in its SQL Editor. This creates tables, row access policies, project join-code and creation functions, sampling functions, and Realtime publication entries. If the database was set up with an earlier version, rerun the updated `schema.sql`; it keeps existing labels and data. For a latest run that already has labels, the script creates a fresh run on the same sentences so coders can follow the two-round order. Other existing latest runs get the missing counterpart assignments in place.
2. Generate a private SQL seed from the workbook:

   ```bash
   python3 scripts/build_source_seed.py /Users/wumengmeng/Desktop/AI_label_second_round_golden_label.xlsx
   ```

   This creates `seed_source_dataset.sql` locally. Open it, paste it into Supabase SQL Editor, and run it once to preload the source dataset. `.gitignore` excludes the generated SQL and workbook files; do not commit either.
3. In Supabase Dashboard, open **Authentication → Sign In / Providers → Anonymous Sign-Ins** and enable anonymous sign-ins. No email registration, password, or email redirect URL is needed. Anonymous users are saved in their current browser; use a different browser or browser profile for each coder. Clearing browser data or switching devices creates a new identity, so the old coder's projects and labels will not follow automatically.
4. Open the app and enter the Supabase Project URL and anon/publishable key. These are stored in the local browser. Never use a service-role key in the browser.
5. Create a project and share its invite code with the second coder. Choose a seed and count `a`; the database samples all six strata and assigns both constructs to every sampled sentence. Code the full Inevitability set first, then the full Agency set. Each run remains separate. After both coders submit all assignments, reliability and discussion open automatically.

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
- Reliability is computed per selected sample run from assignments both coders completed. The app stores code 0 as absence, code 1 as present/low, and code 2 as present/high. Presence agreement compares 0 vs. 1/2; High/Low agreement compares 1 vs. 2 only when both coders marked the construct present.
- Discussion notes and confirmed consensus do not modify original labels or reliability statistics.
