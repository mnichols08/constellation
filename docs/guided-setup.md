# Guided setup

On your first visit, enter your GitHub username. Constellation loads your public profile and projects, then asks four to six short questions. The live editor stays out of the way until you choose **Customize**.

1. **Projects:** Recommended balances recent work, popularity, descriptions, languages and topics, with lower weight for forks and archived projects. Ties use repository names, so recommendations are reproducible. Recently active and Most popular are alternatives. Select or clear the shown results, search names, descriptions, languages and topics, or change individual checkboxes. Up to 100 projects can be selected.
2. **Technologies:** Keep all detected languages or choose specific ones. Recommended retains the selected projects’ technologies. None is the existing empty language filter; if that leaves no visible projects, generation asks you to revise your answers.
3. **Topics:** Choose specific topics, keep all, or skip. This question is omitted when the chosen projects have no topics. Language and topic choices use the same filters as Studio and the CLI.
4. **Activity:** Choose no activity, commit asteroids, contribution orbit, recent activity, subtle glow, or a weighted surprise. Only the selected feature’s public data is requested. Asteroids automatically load the existing bounded batch: up to 12 repositories and 24 commits per repository. Other choices reuse the public activity cache. Empty or failed activity data produces a design without that optional effect, with an explanation and **Retry activity**.
5. **History:** Current projects, project eras, a 3D Temporal Universe, or surprise. This question appears for at least six projects spanning at least three creation years, using the v6 temporal eligibility rule. The year range comes from those projects. These retrospective views use current metadata and creation dates, not historical star counts or complete archived snapshots.
6. **Feel:** Cosmic, Clean, Technical, Classic, or Surprise me. Choose Automatic or Still motion here as well.

The shared project picker also finds public repositories you contributed to. By default, its bounded pull request and commit search covers all organizations and owners, including organizations you do not belong to. Choose Only one organization to explicitly narrow the search. GitHub search can omit contributions, especially outside default branches; add a public `owner/repository` or GitHub URL directly when needed. Private repositories are excluded.

## Keep, regenerate, or customize

The preview toolbar includes **View full screen**, with zoom, pan and an Escape/Close action. Replace the generic chart number with your own **Title**, then choose **Save constellation**. **Saved constellations** in the page header opens your local library, including on a later visit. Save different titles to keep different designs; saving the same title updates that design. The library reuses Studio presets, supports up to 30 named designs per account, and can open or delete them. These saves live only in this browser's localStorage, so export config JSON for backup or another device.

**Generate another** changes the seed and visual interpretation while retaining the selected projects, language/topic filters, activity preference, history preference and motion policy. Surprise answers permit variation within that preference. A fixed seed, year, repository snapshot and answers produce the same ordinary config.

**Use this design** opens the existing Save controls and SVG download without opening the customization tabs. Download SVG, PNG, interactive HTML or JSON; create a share link; or open Daily GitHub workflow to install it in your README repository. **Customize** reveals all seven Studio tabs, including layers, history, temporal geometry, story editing and advanced settings. The project credit remains visible even when annotations are hidden.

**Edit answers** returns to the questions. From Studio, **Guided setup** reruns them for the current account. Starting the questions does not replace a saved draft; generating a new design does. Returning to the full Studio before generation restores the previous draft.

## Returning and shared views

The existing `constellation:visited` flag records returning visits, but every ordinary visit starts at the guided entry. Entering an account with a saved draft restores its preview with Customize available on demand. An unfinished guided setup with saved answers can be resumed by entering the same account. The sample Studio remains an explicit shortcut. Shared configs, presets and design links open their previews without showing the customization screen; imports, timelines and stories retain their existing content.

Answers live in a separate validated, versioned local browser record for each account (`constellation-intent-v1`). They are not added to Scene JSON, config exports, workflows or renderer inputs. Designs continue to use the existing draft and preset store. Clearing browser storage removes local drafts and answers; blocked storage does not prevent generation, but download JSON to keep your work.

Public GitHub data is partial and may be delayed or rate limited. Account or repository load failures block generation; optional activity failures do not. No sample activity is substituted for a real account. Customization itself continues to use cached data.
