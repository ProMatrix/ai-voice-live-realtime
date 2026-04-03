# Shared Profiles

This directory is the single source of truth for profile assets used by the host applications.

- `common/` contains files that are copied into both hosts at build time.
- `host-azure-voice/` contains Azure-specific profile files and overrides.
- `host-gemini-voice/` contains Gemini-specific profile files and overrides.

Both Angular apps still serve profiles from `/assets/profiles`, but the files are now sourced from this central directory through the workspace asset configuration in `angular.json`.
