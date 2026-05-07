# Metal Docs EigenPal Patch Notes

This directory documents the Metal Docs EigenPal fork work. It is intentionally scoped to the isolated EigenPal source patch and does not integrate the package into Metal Docs product code.

## Documents

- [Header/Footer Table Lab Dossier](./header-footer-table-lab-dossier.md): investigation log and implementation rationale from the isolated lab.
- [Maintainer Change Summary](./maintainer-change-summary.md): maintainer-facing explanation of the bugs, root causes, files changed, and why the fork patch exists.
- [Upstream PR Series Design](./upstream-pr-series-design.md): approved plan for validating current upstream and splitting the fork work into maintainer-friendly PRs.
- [Upstream PR Readiness](./upstream-pr-readiness.md): concise PR-ready summary, validation notes, residual follow-ups, and PR body draft.
- [PR Splitting Plan](./pr-splitting-plan.md): recommended structure if this fork patch is converted into public upstream PRs.

## Branching Model

- `origin`: upstream EigenPal repository.
- `fork`: Metal Docs controlled GitHub fork.
- `main`: stable Metal Docs EigenPal fork branch.
- `metaldocs-eigenpal-v0.2.0`: release tag for the first stable Metal Docs EigenPal patch package.
- `codex/eigenpal-professional-patch`: historical implementation branch that produced the first professional patch.

Keep this fork as the controlled source of the EigenPal changes. Product integration should consume a versioned package artifact or release tag, not an ad hoc local lab path.
