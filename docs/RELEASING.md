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
npm version patch        # or minor / major: bumps, commits and tags
git push --follow-tags   # pushes main and the tag
```

The tag must equal `v<package.json version>` and point at the tip of main; the
workflow refuses anything else.

The workflow then:

1. runs `node --test`;
2. rebuilds `client.js` with the stamp already inside the committed artifact and
   fails if the result differs, so a release cannot ship a bundle that no longer
   matches `src/**`;
3. runs `npm publish` — OIDC, public access, and a provenance attestation
   generated automatically because both the repository and the package are public
   (verify with `npm audit signatures`, or `npm view @my-dsh/dsh-intelligent-ui dist.attestations`);
   a version that is already on the registry is skipped, so re-running a release
   that failed later still reaches the index step;
4. runs `scripts/update-market-index.mjs`, which asks the registry when the version
   was published and adds `{ version, publishTimestamp, source: { type: 'npm' } }`
   to `market/index.json`;
5. commits that file and pushes it to main, which redeploys GitHub Pages.

Discover then offers the new version once Pages finishes deploying.

## Publishing by hand

When the workflow is unavailable:

```bash
npm login                              # two-hour session, or keep a granular token (90-day maximum)
npm publish                            # publishConfig pins the official registry and public access
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
| `does not point at the tip of main` | the tag sits on an older commit; push main first |
| `client.js is stale` | run `node scripts/build-client.mjs --strict` and commit the artifact |
| `npm publish` fails with an OIDC or 404 error | the trusted publisher is missing, or its workflow filename differs from `publish.yml` |
| the index commit is rejected | an organization policy pins read-only workflow permissions, or main is protected |
| the new version is missing from the index | `update-market-index` polls the registry for up to two minutes, then warns and uses the current time; re-run it locally to correct the timestamp |
| installation is refused as incompatible | `engines.dsh` is a gate — an older DSH blocks activation and the plugin manager offers an exact-version exemption |

## 2027

npm retires direct publishing with bypass-2FA tokens in January 2027 in favour of
OIDC trusted publishing and staged publishing. This repository already publishes
over OIDC, so nothing changes here; only a switch back to token-based publishing
would need the staged workflow.
