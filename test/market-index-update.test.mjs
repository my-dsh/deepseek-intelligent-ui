// Release tooling: the market index updater the publish workflow runs after `npm publish`.
// The index format rejects a repeated version and requires integer Unix-second timestamps,
// so the rules it must satisfy are checked here rather than discovered in CI.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, describe } from 'node:test'
import {
  compareVersions,
  indexEngines,
  marketVersionEntry,
  withMarketVersion,
} from '../scripts/update-market-index.mjs'

const NAME = '@my-dsh/dsh-intelligent-ui'
const INDEX = {
  format: 1,
  title: 'my-dsh plugins',
  plugins: [{
    name: NAME,
    title: { en: 'Intelligent UI', zh: '智能 UI' },
    versions: [
      { version: '1.0.2', publishTimestamp: 1_760_000_000, source: { type: 'npm' }, engines: { dsh: '>=0.2.1-alpha.4' } },
      { version: '1.0.0', publishTimestamp: 1_759_000_000, source: { type: 'npm' }, engines: { dsh: '>=0.2.1-alpha.4' } },
    ],
  }],
}

describe('market index updater (release tooling)', () => {
  test('an entry carries the npm source and the manifest engine floor', () => {
    assert.deepEqual(marketVersionEntry('1.0.3', 1_760_100_000, { dsh: '>=0.2.1-alpha.4' }), {
      version: '1.0.3',
      publishTimestamp: 1_760_100_000,
      source: { type: 'npm' },
      engines: { dsh: '>=0.2.1-alpha.4' },
    })
    assert.deepEqual(marketVersionEntry('1.0.3', 1_760_100_000), {
      version: '1.0.3',
      publishTimestamp: 1_760_100_000,
      source: { type: 'npm' },
    })
  })

  test('rejects what the index format rejects', () => {
    assert.throws(() => marketVersionEntry('1.0', 1), /exact SemVer/)
    assert.throws(() => marketVersionEntry('^1.0.2', 1), /exact SemVer/)
    assert.throws(() => marketVersionEntry('1.0.3', 1.5), /publishTimestamp/)
    assert.throws(() => marketVersionEntry('1.0.3', -1), /publishTimestamp/)
  })

  test('adds the release in descending SemVer order and leaves the rest of the index alone', () => {
    const next = withMarketVersion(INDEX, NAME, marketVersionEntry('1.0.3', 1_760_100_000))
    assert.deepEqual(next.plugins[0].versions.map((entry) => entry.version), ['1.0.3', '1.0.2', '1.0.0'])
    assert.deepEqual(next.plugins[0].title, INDEX.plugins[0].title)
    assert.equal(next.title, INDEX.title)
    assert.deepEqual(
      INDEX.plugins[0].versions.map((entry) => entry.version),
      ['1.0.2', '1.0.0'],
      'the input index must not be mutated',
    )
  })

  test('re-running a release replaces its entry instead of repeating the version', () => {
    const once = withMarketVersion(INDEX, NAME, marketVersionEntry('1.0.3', 100))
    const twice = withMarketVersion(once, NAME, marketVersionEntry('1.0.3', 200))
    assert.equal(twice.plugins[0].versions.length, 3)
    assert.equal(twice.plugins[0].versions.find((entry) => entry.version === '1.0.3').publishTimestamp, 200)
  })

  test('prereleases sort below their release', () => {
    assert.ok(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10') < 0)
    assert.ok(compareVersions('1.0.0-alpha', '1.0.0') < 0)
    assert.ok(compareVersions('2.0.0', '1.9.9') > 0)
    assert.equal(compareVersions('1.0.2', '1.0.2'), 0)
  })

  test('an unknown plugin is an error rather than a silent no-op', () => {
    assert.throws(() => withMarketVersion(INDEX, 'other-plugin', marketVersionEntry('1.0.3', 1)), /lists no plugin named/)
    assert.throws(() => withMarketVersion({}, NAME, marketVersionEntry('1.0.3', 1)), /plugins array/)
  })

  test('engine floors come from the manifest and may be absent', () => {
    assert.deepEqual(indexEngines({ engines: { dsh: '>=0.2.1-alpha.4' } }), { dsh: '>=0.2.1-alpha.4' })
    assert.deepEqual(indexEngines({}), {})
    assert.deepEqual(indexEngines({ engines: { dsh: '   ' } }), {})
  })

  test('the shipped index lists this package with exactly SemVer npm versions', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const index = JSON.parse(readFileSync(new URL('../market/index.json', import.meta.url), 'utf8'))
    const plugin = index.plugins.find((entry) => entry.name === manifest.name)
    assert.ok(plugin, 'market/index.json must list this package by name')
    assert.ok(plugin.versions.length > 0, 'the listed plugin must carry at least one version')
    const seen = new Set()
    for (const entry of plugin.versions) {
      assert.match(entry.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'versions must be exact SemVer')
      assert.ok(!seen.has(entry.version), `version ${entry.version} must not repeat`)
      seen.add(entry.version)
      assert.ok(Number.isInteger(entry.publishTimestamp) && entry.publishTimestamp >= 0, 'publishTimestamp must be integer Unix seconds')
      assert.equal(entry.source.type, 'npm', 'published versions install from the registry')
    }
  })
})
