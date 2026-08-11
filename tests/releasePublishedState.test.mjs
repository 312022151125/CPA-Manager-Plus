import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildExpectedReleaseAssets,
  expectedReleaseAssetNames,
  verifyPublishedRelease,
  verifyPublishedReleaseMetadata,
} from '../bin/release/verify-published-release.mjs';

const tag = 'v1.2.3-beta1';
const temporaryDirectories = [];

const makeReleaseFixture = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cpamp-published-release-'));
  temporaryDirectories.push(directory);
  const nativeDirectory = path.join(directory, 'native');
  mkdirSync(nativeDirectory);

  for (const assetName of expectedReleaseAssetNames(tag)) {
    const assetPath =
      assetName === 'management.html'
        ? path.join(directory, assetName)
        : path.join(nativeDirectory, assetName);
    writeFileSync(assetPath, `${assetName}\n`);
  }
  return directory;
};

const publishedAsset = ({ name, size, digest }) => ({
  name,
  size,
  digest,
  state: 'uploaded',
});

const makePublishedRelease = ({ assets, overrides = {} }) => ({
  tag_name: tag,
  draft: false,
  prerelease: true,
  immutable: true,
  published_at: '2026-08-12T00:00:00Z',
  body: '# Release\n',
  assets: assets.map(publishedAsset),
  ...overrides,
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('published release verification', () => {
  it('builds the complete deterministic asset manifest and accepts an exact Release', () => {
    const assets = buildExpectedReleaseAssets(makeReleaseFixture(), tag);
    expect(assets.map((asset) => asset.name)).toEqual(expectedReleaseAssetNames(tag));

    expect(
      verifyPublishedRelease({
        release: makePublishedRelease({ assets }),
        tag,
        prerelease: true,
        body: '# Release\n',
        assets,
      })
    ).toEqual({
      expectedAssets: 8,
      publishedAssets: 8,
      missingAssets: [],
      complete: true,
      immutable: true,
    });
  });

  it('allows only a matching missing-asset subset during an approved rerun', () => {
    const assets = buildExpectedReleaseAssets(makeReleaseFixture(), tag);
    const release = makePublishedRelease({
      assets: assets.slice(1),
      overrides: { immutable: false },
    });

    expect(() =>
      verifyPublishedRelease({
        release,
        tag,
        prerelease: true,
        body: '# Release',
        assets,
      })
    ).toThrow('asset count mismatch');

    expect(
      verifyPublishedRelease({
        release,
        tag,
        prerelease: true,
        body: '# Release',
        assets,
        allowMissingAssets: true,
      })
    ).toMatchObject({
      expectedAssets: 8,
      publishedAssets: 7,
      missingAssets: [{ name: assets[0].name, filePath: assets[0].filePath }],
      complete: false,
    });

    expect(() =>
      verifyPublishedRelease({
        release: makePublishedRelease({ assets: assets.slice(1) }),
        tag,
        prerelease: true,
        body: '# Release',
        assets,
        allowMissingAssets: true,
      })
    ).toThrow('is immutable and cannot resume');
  });

  it('rejects unexpected, digest-mismatched, or size-mismatched existing assets', () => {
    const assets = buildExpectedReleaseAssets(makeReleaseFixture(), tag);
    const assertRejected = (release, message) =>
      expect(() =>
        verifyPublishedRelease({
          release,
          tag,
          prerelease: true,
          body: '# Release',
          assets,
          allowMissingAssets: true,
        })
      ).toThrow(message);

    assertRejected(
      makePublishedRelease({
        assets: [...assets.slice(1), { ...assets[0], name: 'unexpected.tar.gz' }],
      }),
      'unexpected asset'
    );
    assertRejected(
      makePublishedRelease({
        assets: assets.map((asset, index) =>
          index === 0 ? { ...asset, digest: `sha256:${'0'.repeat(64)}` } : asset
        ),
      }),
      'digest mismatch'
    );
    assertRejected(
      makePublishedRelease({
        assets: assets.map((asset, index) =>
          index === 0 ? { ...asset, size: asset.size + 1 } : asset
        ),
      }),
      'size mismatch'
    );
  });

  it('rejects body and published-state drift', () => {
    const assets = buildExpectedReleaseAssets(makeReleaseFixture(), tag);
    const assertRejected = (release, message) =>
      expect(() =>
        verifyPublishedRelease({
          release,
          tag,
          prerelease: true,
          body: '# Release',
          assets,
        })
      ).toThrow(message);

    assertRejected(
      makePublishedRelease({ assets, overrides: { body: '# Other' } }),
      'body differs'
    );
    assertRejected(makePublishedRelease({ assets, overrides: { draft: true } }), 'still a draft');
    assertRejected(
      makePublishedRelease({ assets, overrides: { prerelease: false } }),
      'prerelease mismatch'
    );
    assertRejected(
      makePublishedRelease({ assets, overrides: { published_at: null } }),
      'is not published'
    );
  });

  it('requires a complete healthy asset set for Telegram recovery', () => {
    const assets = buildExpectedReleaseAssets(makeReleaseFixture(), tag);
    expect(
      verifyPublishedReleaseMetadata({
        release: makePublishedRelease({ assets }),
        tag,
        prerelease: true,
        body: '# Release',
      })
    ).toMatchObject({ complete: true, expectedAssets: 8, publishedAssets: 8 });

    expect(() =>
      verifyPublishedReleaseMetadata({
        release: makePublishedRelease({ assets: assets.slice(1) }),
        tag,
        prerelease: true,
        body: '# Release',
      })
    ).toThrow('asset count mismatch');

    const invalidAssets = assets.map(publishedAsset);
    invalidAssets[0] = { ...invalidAssets[0], state: 'new' };
    expect(() =>
      verifyPublishedReleaseMetadata({
        release: makePublishedRelease({ assets, overrides: { assets: invalidAssets } }),
        tag,
        prerelease: true,
        body: '# Release',
      })
    ).toThrow('is not uploaded');
  });
});
