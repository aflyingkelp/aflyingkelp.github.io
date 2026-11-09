# Source and attribution

The default online player embeds https://touhouonline.com/en.html?game=th10. That external service provides its own program and game resources; they are not copied into this repository. A direct-link fallback is provided.

The separate local-import mode adapts the public EAGLER TOUHOU launcher and TH10 WebAssembly runtime from https://touhou.vip/. Original game data and music are not distributed here.

Upstream source: https://github.com/Ritosa2333/eagler-touhou

Published local-import runtime: 3.5.1-sdl3 (2026-10-28). The upstream release records launcher revision 9ed28346d54b6a99da740637aa04f7db546a2263, TH10 normal revision f8874ee7ad8b52857de3ea3b7a66e110decfa29b, and TH10 multiplayer revision 88afed7fbe80c534fb4d73eddac1426a38a4eec0. Launcher metadata records local upstream modifications. Runtime file hashes are preserved in runtime-manifest.json.

Local changes: Online-player wrapper and direct fallback; Import-only TH10 manifest; English entry; original text-only cover; local package-preparation tool; removal of the old official-site migration gate and analytics injection; regenerated App Shell cache identities.

GNU Unifont 16.0.04 is available under SIL Open Font License 1.1; see licenses/OFL-Unifont.txt and https://unifoundry.com/pub/unifont/unifont-16.0.04/.
