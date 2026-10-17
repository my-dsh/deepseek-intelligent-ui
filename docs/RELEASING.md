# Releasing

A release does two things: the version goes to npm, and the plugin market index
learns about it. `.github/workflows/publish.yml` does both when a `vX.Y.Z` tag is
pushed.

## One-time setup

### 1. Bind the package to this workflow (npm trusted publishing)

The workflow holds **no npm token**. npm accepts the publish because the OIDC
token GitHub mints identifies this repository and this workflow file.

On <https://www.npmjs.com/package/@my-dsh/dsh-intelligent-ui> → *Settings* →
*Trusted Publisher* → *GitHub Actions*:

| Field | Value |
|---|---|
| Organization | `my-dsh` |
| Repository | `deepseek-intelligent-ui` |
| Workflow filename | `publish.yml` — the file name only, no path |
| Environment | leave empty |
| Allowed actions | `npm publish` |

The workflow filename is matched exactly and case-sensitively, so renaming
`.github/workflows/publish.yml` stops publishing until the setting is updated.

### 2. Nothing else, usually

The workflow's own `permissions: contents: write` overrides the repository's
default workflow permissions, which are read-only here, so the index commit does
not depend on *Settings* → *Actions* → *General*. Only an organization policy that
pins those defaults, or branch protection on main, can block that push.

### 3. Optional: drop the local token

Once CI publishes, the granular access token in `~/.npmrc` is no longer needed for
releases. Publishing by hand still works without it.

## Releasing

```bash
git pull --rebase        # CI commits the market index to main after every release
npm run check            # the gate the release job will re-run: build, probe, tests
git status --short       # expect clean; the build is a no-op on an unchanged tree
npm version patch        # or minor / major: bumps, commits and tags
git push --follow-tags   # pushes main and the tag
```

`npm run check` is the local copy of the release gate (strict `client.js` build,
`node --check`, `probe-client`, then `node --test`). A stale `client.js` is the one
thing the release job cannot repair, so the rebuilt artifact belongs in the release
commit. The same gate runs on every push to main and every pull request
(`.github/workflows/ci.yml`), so by the time a tag is pushed the tree is already known
to pass it.

The tag must equal `v<package.json version>` and sit on the main line — an ancestor
of main. Everything the run publishes is the tree the tag points at, never the tip
of main, and the workflow refuses anything else.

The workflow then:

1. runs `node --test`;
2. rebuilds `client.js` with `node scripts/build-client.mjs` and fails if the committed
   artifact differs. The build is strict and reuses the committed stamp, so an unchanged
   tree rebuilds byte-identically, and a diff can only mean a stale artifact;
3. runs `node --check client.js && node scripts/probe-client.mjs`, which executes the
   built bundle outside the browser and asserts the slot registration plus the bundled
   48-component / 73-@function surface — a syntactically valid but broken bundle cannot
   be published;
4. runs `npm publish --tag <latest|next>` — OIDC, public access, and a provenance
   attestation generated automatically because both the repository and the package are
   public (verify with `npm audit signatures`, or `npm view @my-dsh/dsh-intelligent-ui dist.attestations`).
   A version that is already on the registry is skipped, so re-running a release that
   failed later still reaches the index step. A version with a prerelease suffix
   (`1.1.0-rc.1`) is published under the `next` dist-tag so it never moves `latest`, and
   the workflow checks the dist-tag after publishing;
5. checks out main and adds the version to `market/index.json` there with
   `scripts/update-market-index.mjs <version>` — the script asks the registry when the
   version was published and writes
   `{ version, publishTimestamp, source: { type: 'npm' }, engines }`. `engines` comes from
   the **tagged** `package.json` (passed as `IUI_MARKET_ENGINES_JSON`), because main's
   manifest may already name the next release. A version already listed is left exactly
   as recorded, because the registry keeps refining that timestamp for a while;
   re-running a release therefore changes nothing at all;
6. commits that file to main, which redeploys GitHub Pages.

Because the index lands on main and not on the tag, main is one commit ahead after
every release, and a run that fails can be re-run at any later time.

Discover then offers the new version once Pages finishes deploying.

## Publishing by hand

When the workflow is unavailable:

```bash
npm login                              # two-hour session, or keep a granular token (90-day maximum)
npm run check                          # the same gate the workflow runs: build, probe, tests
npm publish                            # add --tag next when the version has a prerelease suffix
node scripts/update-market-index.mjs
git add market/index.json && git commit -m "market: list @my-dsh/dsh-intelligent-ui@x.y.z" && git push
```

`scripts/update-market-index.mjs` is dependency-free on purpose: the reference
generator (`@deepseek-ai/dsh-plugin-market-generator`) lives in the DeepSeek
Harness monorepo and is not published to npm, so this repository's CI cannot call
it. Regenerating from `market/plugins.txt` with that generator is still the way to
pick up metadata changes — title, icon, description, keywords — and needs a Harness
checkout.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `tag vX.Y.Z does not match the package.json version` | the tag was not created by `npm version` |
| `is not an ancestor of main` | the tag sits on a branch that never reached main |
| `client.js is stale` | run `node scripts/build-client.mjs` (strict, no flag) and commit the artifact |
| `npm publish` fails with an OIDC or 404 error | the trusted publisher is missing, or its workflow filename differs from `publish.yml` |
| `dist-tag latest points at ...` after a publish | the version was published by hand without `--tag`; a newer release already owns `latest`. Prereleases belong on `next` |
| a prerelease moved the `latest` dist-tag | `npm dist-tag add @my-dsh/dsh-intelligent-ui@<version> next` and point `latest` back at the newest stable version |
| the index commit is rejected | an organization policy pins read-only workflow permissions, or main is protected |
| the new version is missing from the index | `update-market-index` polls the registry for up to two minutes, then warns and uses the current time; re-run it locally to correct the timestamp |
| an index entry records the wrong `engines` | the updater ran from main's manifest instead of the tag's; re-run the release (the workflow passes `IUI_MARKET_ENGINES_JSON`) |
| installation is refused as incompatible | `engines.dsh` is a gate — an older DSH blocks activation and the plugin manager offers an exact-version exemption |

## 2027

npm retires direct publishing with bypass-2FA tokens in January 2027 in favour of
OIDC trusted publishing and staged publishing. This repository already publishes
over OIDC, so nothing changes here; only a switch back to token-based publishing
would need the staged workflow.
