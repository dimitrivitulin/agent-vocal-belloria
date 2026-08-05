# BELL-033 — Voie rapide Telegram sous deux minutes

Statut: completed
Branche: `codex/bell-033-voie-rapide-telegram`
Dernière mise à jour: 2026-08-05

## Objectif

Traiter automatiquement les commandes Telegram texte ou vocales depuis un instantané D1 frais, avec une réponse traçable en moins de deux minutes et le passage horaire comme reprise.

## Périmètre

- Instantanés D1 minimaux, sourcés, horodatés, expirables et sans corps de message.
- Outil MCP strict de rafraîchissement depuis le passage horaire.
- Voie rapide Worker via `ctx.waitUntil`, sans Queue tant qu'aucune mesure ne l'exige.
- Intentions BELL-030 déterministes, refus sûr et confirmations/idempotence conservées.
- Mesure technique `created_at`, `started_at`, `replied_at`, `latency_ms` sans donnée personnelle dans les journaux.
- Tests texte, vocal, fraîcheur, ambiguïté, erreur Telegram, rejeu et reprise horaire.

## Critères de réussite

- Une commande couverte déclenche automatiquement une consultation ou proposition depuis un instantané frais.
- Un contexte absent, ambigu, contradictoire ou périmé produit un refus sûr.
- Une erreur de traitement ou Telegram laisse la commande récupérable par le passage horaire.
- Les confirmations restent à usage unique et aucune donnée client durable non structurée n'est ajoutée.

## Fichiers concernés

- `worker/src/index.js`
- `worker/test/worker.test.js`
- `worker/migrations/0004_telegram_fast_path.sql`
- `tests/test_d1_migrations.py`
- `docs/telegram-cloudflare.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Résultat livré

- Cache D1 remplacé atomiquement à chaque passage, expiré après 90 minutes et limité aux faits préparés et sources.
- Outil MCP `belloria_refresh_prospect_snapshots` et voie rapide `ctx.waitUntil` texte/vocal.
- Refus sûrs récupérables, propositions BELL-030 à usage unique et rejeu webhook idempotent.
- Latence technique horodatée sans contenu personnel dans les journaux.

## Validation

- 19 tests Worker et 64 tests Python réussis.
- Migration D1 locale, texte, vocal, fraîcheur, ambiguïté, contradiction, erreur Telegram, rejeu et reprise couverts.
- `git diff --check`, revue du périmètre, des secrets et des artefacts réussis.
- Aucun déploiement Cloudflare ni message Telegram réel effectué.

## Prochaine action

Appliquer la migration et déployer le Worker dans un lot d'activation explicitement autorisé.
