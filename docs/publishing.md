# Publishing a Constellation

Studio's **Publish your constellation** panel prepares one of three destinations:

- **GitHub profile README** publishes a static SVG to the matching `owner/owner` repository.
- **Repository README** publishes a static SVG to the selected repository.
- **Portfolio website** downloads static SVG or standalone interactive HTML for manual deployment. Studio does not verify that a downloaded file is live.

## GitHub README setup

Choose a profile or repository README, keep **Static SVG** selected, enter the README repository, and copy the generated workflow into `.github/workflows/constellation.yml`. Review and commit that file, run **Daily constellation** once, then copy the Markdown image snippet into the README. The workflow has `contents: write` so it can update its output branch; it uses the repository's automatic `GITHUB_TOKEN`, with no personal access token.

The workflow checks out the repository, loads the embedded normalized configuration, fetches the evidence needed by that configuration, generates a temporary SVG, validates it, then updates the output branch. Concurrent runs are serialized per repository. Existing files on the output branch are preserved. The publisher never force-pushes.

When the validated SVG bytes match the existing artifact, the run skips the publication commit and reports **unchanged**. It does not strip dates or metadata to manufacture no-op results: any resulting byte change is published. A failed fetch, generation, validation, filesystem operation, or push stops before replacing the current output. The workflow summary reports failure; the previous output branch artifact remains available.

## Portfolio deployment

Choose **Portfolio website**, select SVG or interactive HTML, and download the artifact. Upload it to the static host yourself. The SVG is a script-free image. The standalone HTML includes the existing accessible interactive runtime, content security policy, keyboard support, and reduced-motion behavior and works offline. To link from a portfolio page, use the generated relative link snippet. HTML is not executable inside GitHub README rendering.

## Publication records

On the output branch, `.constellation/publication-manifest.json` is an internal sidecar (it is not part of Scene v1). Version 1 records source repository and commit when available, selected account, configuration and evidence digests when available, UTC reference date, artifact format/name/SHA-256/size, destination, revision, generation result, and bounded diagnostics. It contains no credentials or source contents. Missing evidence identity remains unknown; it is never interpreted as proof that the source is unchanged.

Publication comparison uses the actual artifact digest. An unchanged artifact creates no commit even if the workflow source commit or run date changed. Volatile fields are not removed from output; if they change the artifact bytes, the artifact is published. A missing or corrupt prior sidecar does not prevent a validated artifact from being published. A malformed new artifact is rejected before the output branch is touched.

## Limits

The automatic GitHub publisher currently publishes SVG only. Standalone HTML and Web Component examples are available for manual static hosting; Studio does not create a hosting account, upload files to a third-party host, or claim deployment status without verification. Publication artifact size is capped at 12 MiB and manifest size at 16 KiB.

## Measurements

Run `node scripts/benchmark-publication.mjs` for manifest validation/comparison latency and local-Git publication timing, and `node scripts/benchmark-html.mjs` for HTML bundle measurements. On the Windows development host (Node 22.12), 20,000 manifest validations averaged 0.0037 ms each and 20,000 comparisons averaged 0.0064 ms. The publication benchmark's Git child process was blocked by this host's process policy; the local Git fixture suite completed the multi-refresh case in about 4.2 seconds and its concurrent first-publish case in about 1.8 seconds, including fixture Git setup and assertions.

The current raw WASM is 670,680 bytes, unchanged from v4.4. The Core package directory is 1,973,168 bytes versus the recorded v4.4 baseline of 1,966,297 bytes (+6,871 bytes, 0.35%), within its 2 MiB budget. The Web Component entry remains 24,572 bytes. The HTML benchmark measured a 1,040,342-byte embedded runtime (8,234 bytes below its 1 MiB budget) and 1,196,237 bytes for the 45-node document. Render time was 21.5 ms on this run. Gzip measurements are not compared because the recorded v4.4 value used a different host/toolchain. Studio initial-load timing was not isolated in this change; the browser suite exercised the wizard without additional GitHub requests.
