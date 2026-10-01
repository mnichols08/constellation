# Account systems and stewardship

Constellation 3.8 adds the `account-system` arrangement. Its sun is an explicitly chosen GitHub person or organization, planets are the already selected public repositories, and optional moons are identities observed in loaded contributor or authored-public-PR evidence. Choosing a sun is a viewpoint: it does not assert ownership, authority, leadership, employment, membership, or contribution.

The repository source, chosen center, and optional `organizationUser` focus are independent. Switching among loaded centers retains selected repositories and snapshots, including projects owned by other accounts. The existing identity ring, `profile`, and `solar-system` arrangements keep their meanings.

```json
{
  "version": 7,
  "account": "example",
  "arrangement": "account-system",
  "accountSystem": {
    "enabled": true,
    "center": { "type": "user", "login": "example" },
    "grouping": "technical",
    "moons": { "enabled": true, "types": ["contributors"], "maxPerPlanet": 4, "maxScanRepositories": 25 }
  },
  "stewardship": { "enabled": true, "tier": "basic", "maxScanRepositories": 25 }
}
```

`arrangement` is authoritative. `accountSystem.enabled` must agree with it; another arrangement deactivates geometry while a Studio draft may retain center settings. Stewardship is independently opt-in and never moves repositories. Manual planet positions win. Moon offsets are local to their compiled parent, and moon evidence does not move planet anchors.

## Evidence and bounds

One canonical moon is shown per identity. Its primary orbit parent is chosen from comparable contributor evidence, with deterministic repository-ID tie-breaking; secondary observed relations remain inspectable. The chosen center is not repeated as its own moon. `User`, `Bot`, `Organization`, and `Unknown` stay distinct; only a GitHub `User` is a verified human. Old untyped contributor cache records are invalidated rather than guessed.

One explicit load or refresh scans at most 25 selected repositories, schedules three concurrent requests, and allows 100 additional enrichment requests. The overview shows at most four moons per planet, 120 identities, 256 account-system entities including the sun, and 2,048 relations. Repository planets take priority. Observed, displayed and suppressed counts describe loaded evidence only, not the total contributor population.

## Stewardship grammar

Seven fixed bezel slots represent README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, issue templates, pull-request template, and Discussions enabled. Solid accent means present, faint solid means known absent, and a broken mark means unknown. Presence says only that GitHub reported an effective artifact. An inherited bit distinguishes a default file returned from an owner `.github` repository; it is not claimed as locally maintained.

The community-profile endpoint supplies the first six effective fields. Repository metadata supplies `has_discussions`; it does not prove observed Discussion activity. Failures, unsupported shapes, authentication limits, rate limits, and omissions remain unknown. Behavior counts are separately named bounded observations; zero and missing are distinct. Recurrence is fixed-point `present / known`, excluding unknown repositories. No score, grade, ranking, or leadership claim is produced.

Current contributor and stewardship snapshots are not historical evidence. Use a current static scene; do not relabel them as historical membership or infrastructure.

The [person-centered](../examples/account-system-person.json) and [organization-centered dense](../examples/account-system-organization.json) examples are explicitly synthetic settings. They contain no claims about the named accounts and load current public evidence only when explicitly requested.
