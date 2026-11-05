---
description: "Publish the qilin release family to npm through the manual workflows, in the order the registry gate requires."
---

# Cookbook: publishing a release to npm

English | [中文](releasing-to-npm.zh.md)

## Summary

Use this tutorial after a release commit lands on `main`. Publication is two independent sequences: the vendored framework publishes first whenever the release manifests reference vendor versions the registry lacks, and the product family publishes second, where its last step refuses to pass until every declared `@qilin-agent` range resolves on the registry. Both workflows are manual dispatches; nothing publishes on a push.

## Table of Contents

- [1. Check what the release references](#check)
- [2. Publish the vendor family first](#vendor)
- [3. Publish the product family](#product)
- [4. Read the gate's failure](#diagnose)
- [Dev Note](#dev-note)

-----

<a id="check"></a>
## 1. Check what the release references

List the product family's vendor-facing ranges and compare them with the registry:

```sh
pnpm run release:verify --family qilin
npm view @qilin-agent/kylin versions --json
npm view @qilin-agent/schemastery versions --json
```

Reference the registry directly rather than `npm view <package> version`: the `latest` dist-tag is a cached read, so a freshly published version can be missing there while the registry already carries it.

When every referenced range resolves, publish the product family directly. When a range names a version the registry does not carry, cut the vendor release first.

<a id="vendor"></a>
## 2. Publish the vendor family first

Bump only the packages that changed since their last `vendor-<package>-v*` tag; the command writes the manifest versions and the lockfile, then commits:

```sh
pnpm run release:vendor
```

Tag every member the bump printed, using the exact tag it names, and push `main` with the tags:

```sh
git push origin main
git tag vendor-cordis-v4.0.7 && git push origin vendor-cordis-v4.0.7
```

The bump prints the exact tag for each member it raised; repeat the tag and push line for every one of them.

Dispatch publication from any one of those tags. The fork disables this workflow by default, so enable it for the run and disable it again afterwards:

```sh
gh workflow enable "Release publish (vendor)"
gh workflow run "Release publish (vendor)" --ref vendor-cordis-v4.0.7
gh run watch
gh workflow disable "Release publish (vendor)"
```

<a id="product"></a>
## 3. Publish the product family

```sh
gh workflow run "Release publish (qilin)" --ref v3.1.8
gh run watch
```

The run packs the tree, publishes in dependency order, and ends with `release:verify-published` over the uploaded tarballs. Re-run the same gate locally from the run's artifact when the registry needs independent evidence:

```sh
gh run download <run-id> -n qilin-npm-tarballs -D dist/npm
pnpm run release:verify-published --family qilin --from dist/npm
```

Re-dispatching is safe: the publish step skips versions the registry already carries, so a run that failed after publishing resumes at the remaining members.

<a id="diagnose"></a>
## 4. Read the gate's failure

```
release verify-published: UNRESOLVED @qilin-agent/session-snapshot@3.1.8 peerDependencies @qilin-agent/kylin@~4.0.6-alpha.2 — no satisfying registry version; publish the referenced family or fix the range
```

The product tarballs published; a family they reference is missing from the registry. Read the range: `@qilin-agent/kylin*` and `@qilin-agent/kylin-plugin-*` name the vendored framework, `@qilin-agent/schemastery` is a vendored package, and both publish through `Release publish (vendor)`. A vendor version bump that never got its own tags and publication surfaces here and nowhere earlier, because the bump changes only manifests.

After publishing the missing family, dispatch the product workflow again. Fixing the range instead is a manifest change and belongs in a new release commit.

<a id="dev-note"></a>
## Dev Note

None.
