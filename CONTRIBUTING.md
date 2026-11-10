# Contributing to WorldKit

Keep changes small and offline. A map draft is not a production migration, and a pixel preview is not accepted game art. Open a Gitea issue for a new adapter, format, or dependency before implementing it.

Use a branch from `main`, preserve upstream names/notices, add focused tests, and run `npm run check`. For changes to in-game geometry, also run the Jalasmara project's `npm run check:worldkit` compatibility check in a separate checkout. Show input, output, source hash, and limitations in the pull request. Do not add private moodboards, player data, credentials, or unlicensed assets. Game screenshots in `docs/visual/` have separate rights and must not be reused as an MIT asset pack.
