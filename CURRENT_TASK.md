# BELL-013 — Webhook et MCP serverless Belloria

Statut: ready_for_review
Branche: `codex/bell-013-webhook-mcp-serverless`
Dernière mise à jour: 2026-08-03

## Objectif

Porter le webhook Meta et les deux outils MCP dans un Cloudflare Worker, avec ingestion idempotente et reprise durable dans D1, sans déploiement ni appel réel.

## Critères de réussite

- `GET/POST /webhooks/meta` vérifie le challenge et la signature du corps brut.
- D1 enregistre atomiquement les reçus minimisés et les doublons n'entraînent aucun nouvel effet.
- Les reprises bornées passent les échecs persistants en quarantaine sans journaliser de données personnelles.
- `POST /mcp` conserve les deux outils, exige un Bearer secret et confirme explicitement les envois.
- La configuration, les migrations, les secrets, les journaux et la restauration sont documentés.
- Les tests locaux n'appellent ni Meta, ni Gmail, ni Notion, ni WhatsApp réels.

## Fichiers concernés

- `worker/`
- `wrangler.jsonc`
- `package.json`
- `.dev.vars.example`
- `.gitignore`
- `docs/whatsapp-serverless.md`
- `docs/mcp-server.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Faire relire le lot, puis utiliser BELL-014 pour créer les ressources distantes et valider avec le numéro Meta de test après confirmation.

## Résultat

Le Worker porte le webhook et le MCP, dédoublonne dans D1 et reprend les erreurs jusqu'à la quarantaine sans conserver le contenu client.

## Validations effectuées

- 6 tests Worker et 40 tests Python réussis ; compilation Python et audit production réussis.
- Bundle Wrangler validé en `--dry-run`, `git diff --check` réussi et aucun secret détecté.
