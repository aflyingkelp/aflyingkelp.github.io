# Touhou 10 · Mountain of Faith

Browser launcher: https://aflyingkelp.github.io/

This GitHub Pages site hosts the EAGLER TOUHOU launcher and verified Touhou 10 WebAssembly runtime in Import mode. Original game data is stored locally in each player's browser.

## Play

1. Open [Prepare your game](https://aflyingkelp.github.io/prepare.html) and choose `th10.dat` from your own Touhou 10 installation.
2. Create and download the import ZIP.
3. Open the launcher, choose **Import**, and select that ZIP.
4. Choose **Music: Off** and start the game. This helper prepares a package without background music; the launcher also accepts full existing EAGLER TOUHOU packages with music.

Arrow keys move, Z shoots, X uses a bomb, Shift focuses, and Escape pauses.

## Hosting

GitHub Pages publishes `main` at the repository root. `.nojekyll` preserves the static build. Both launcher and runtime assets are served from this site. No account service or multiplayer Relay is configured.

The browser helper performs ZIP creation and hashing locally; game bytes are never sent to GitHub or another server. It supplies GNU Unifont under the SIL Open Font License. No original game data or music is present in this repository.

## Sources and licenses

See [SOURCE.md](SOURCE.md), [LICENSE](LICENSE), [THIRD_PARTY.md](THIRD_PARTY.md), [ASSETS.md](ASSETS.md), and [licenses](licenses/). Upstream source: https://github.com/Ritosa2333/eagler-touhou.
