# Contributing

English | [中文](CONTRIBUTING.zh.md)

Thank you for your interest in contributing to QiLin!

We deeply believe in the power of open source communities, and that belief has shaped this project from the very beginning.

QiLin is still at an early stage and under active development. We are sorry that we cannot accept external pull requests at the moment. However, contributing code to this repository is far from the only way to help. There are many other ways to get involved:

- Identify and report issues or bugs in GitHub Discussions:
  - Upvote discussions that you would like to bring to the team's attention. We are a very small team and may not be able to reply to every post, but we monitor them and consider them when allocating resources.
- Contribute to the ecosystem:
  - Create a plugin that excites you and share it with others:
    - Associate your GitHub project with the `qilin-plugin` topic to help others discover your plugin.
  - Write blog posts and how-to guides about QiLin.
  - Answer questions and help other members of the community.

QiLin is designed to be deeply customizable. We do not believe that packages in the official repository are inherently more important than packages created by the community. You may consider this repository an idea, an official showcase, and a source of inspiration, but not a mandate from us.

We have already seen exciting projects emerge from the community, and we hope to see the ecosystem continue to grow in its own directions.

## Reading CI on a pull request

Every check a pull request runs should be explainable by the pull request's own content. The prerequisite-sensitive workflows degrade as follows (details in the workflow headers):

- `E2E (real DeepSeek API)` skips with a notice when this repository has no `DEEPSEEK_API_KEY_EXTERNAL` secret, and always skips for fork and Dependabot pull requests (secrets are withheld there by GitHub).
- The governance bots (`Issue policy`, `Issue lifecycle`) skip when the issue-management app is not configured for this deployment.
- The release rehearsals and the Cloudflare preview run only when build inputs change (`apps/**`, `packages/**`, `vendor/**`, `native/**`, `scripts/**`, manifests, lockfile, their own workflow files).
- `CI` computes on the maintainer's private runner pool by default; the repository variables `QILIN_CI_FAILOVER_LINUX` and `QILIN_CI_PUBLIC_RUNNER` select the fallback runner tiers documented in `.github/workflows/ci.yml`.

If a check fails for a missing-infrastructure reason, file an issue — that is a repository configuration bug, not a review signal.

Into the unknown.
