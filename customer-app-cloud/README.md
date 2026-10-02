# Mr K Customer App Cloud — Phase 1 Foundation

This directory contains the first cloud-side foundation for the Mr K Customer App.

## Environment variables

- `PORT` — optional, defaults to 8080.
- `MRK_POS_SYNC_TOKEN` — required shared secret used only for POS-to-cloud heartbeat authentication.

Never commit a real sync token to Git.

## Endpoints

- `GET /health` — cloud service health check.
- `POST /api/pos/heartbeat` — authenticated POS heartbeat.

The production database, customer accounts, menu publishing, Orange Money, orders and notifications are intentionally not implemented in this foundation step.
