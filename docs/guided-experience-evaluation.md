# Guided experience evaluation

## Automated measurements

The deterministic Chromium fixture uses 16 public projects, a mobile 390px
viewport, reduced motion, real keyboard activation, and two intercepted GitHub
responses. It records time from account submission to meaningful preview and
the mean of 200 mode transitions. This excludes real GitHub network latency
and is not proof of the 90-second target under normal network conditions.

Run:

```sh
node --test test/guided-experience-browser.test.mjs
node scripts/benchmark-guided-experience.mjs
```

The second command measures recommendation, both SVG target widths, workflow
generation, and Studio module bytes using fixed offline evidence. Existing HTML,
WASM, package, and Web Component budgets remain independently enforced.

### Windows / Node 22.12 fixture results

| Measurement | Observed |
|---|---:|
| Public mobile first meaningful preview, including keyboard acceptance | 342.6 ms |
| Required decisions before preview | 2 |
| Mean Simple/Advanced transition, 200 transitions | 0.0625 ms |
| Recommendation with 100 fixture repositories | 12.313 ms |
| 480px SVG generation | 1.843 ms |
| 900px SVG generation | 2.319 ms |
| Publishing workflow generation | 0.863 ms |
| Loaded browser resource bodies, including scripts/styles/images | 2,922,992 bytes |
| Top-level Studio source modules (not a bundled/transitive size) | 1,263,256 bytes |
| Raw WASM, unchanged | 670,680 bytes |
| Standalone HTML runtime, unchanged | 1,040,342 / 1,048,576 bytes |
| Core package, unchanged size | 1,973,168 / 2,097,152 bytes |
| Web Component entry, unchanged | 24,572 / 24,576 bytes |

Measurements are fixture-based local samples, not guarantees about GitHub
network performance or all devices. An isolated comparative cold-start
measurement against main was not performed; no measured startup-regression
claim is made. Mode switches preserve the SVG URL and make zero GitHub requests.
Publishing field changes reuse the already rendered scene rather than rebuilding
graph/layout. The full existing runtime/package budgets remain intact.

## Manual first-time participant procedure

Use 3–5 participants unfamiliar with Constellation. Ask permission to record
observations; do not capture credentials. Give each participant a public account
with known evidence and the same browser viewport. Do not explain controls
before the task. Record elapsed time, completion, prompts for help, confusion,
and errors for each task:

1. Generate a constellation from the public account.
2. Identify its featured projects, including the absence of authored roles.
3. Select a different available story and explain why an unavailable one is
   unavailable.
4. Change appearance, then switch Advanced → Simple and confirm the choice.
5. Prepare a profile README publication; explain what remains to be installed
   and how refresh works.

Repeat with a sparse account and a saved manually customized design. Check
keyboard-only Back navigation, focus visibility, unavailable-story descriptions,
mobile scrolling, and return from publishing to editing.

Use this record per participant/task:

| Participant | Task | Completed | Time | Help requested | Confusion | Observed error |
|---|---|---|---|---|---|---|
| Not yet evaluated | — | — | — | — | — | — |

No real participants have completed this procedure as part of this change.
Automated fixtures are regression evidence, not human usability evaluation.
