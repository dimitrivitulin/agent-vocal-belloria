# BELL-036 — Notification Telegram immédiate des demandes Tally

Statut: completed
Branche: `codex/bell-036-tally-trigger-telegram`
Dernière mise à jour: 2026-08-06 02:31 CEST

## Objectif

Après une soumission Tally, prévenir Belloria immédiatement sur Telegram sans ajouter de service ni d'API payante.

## Périmètre

- Envoyer depuis le Worker une notification Telegram technique, concise et sans payload personnel inutile après ingestion D1 réussie.
- Conserver D1 comme file anti-perte et le passage horaire comme reprise.
- Faire produire par l'agent la notification Telegram finale après succès Notion, sans envoi client.
- Ne jamais journaliser le payload Tally.

## Critères de réussite

- Une soumission réelle reçoit un accusé Telegram en moins d'une minute.
- Un rejeu du même événement ne produit pas une seconde notification.
- La notification finale confirme le succès CRM ; une erreur reste visible et l'événement demeure `pending`.
- Tests Worker, passage réel contrôlé, `git diff --check` et examen du diff réussissent.

## Décision

Ne pas utiliser Workspace Agents API afin de ne pas ajouter de coût. Le webhook assure l'alerte immédiate ; la tâche ChatGPT Work horaire reste responsable du traitement Tally→Notion et de la confirmation finale.

## Résultat

L'accusé Telegram minimal est déployé sur la version Worker `031755de-3195-4c20-b6d1-2489a69e87dd`. Les 22 tests Worker passent et `/health` répond correctement. La soumission contrôlée `ArA1Dzk` a été signalée à l'ingestion, retrouvée via Tally, synchronisée dans Notion puis acquittée ; le second acquittement a retourné `completed: false`. La file D1 est vide, la confirmation finale Telegram a été envoyée (`message_id: 16`) et la fiche CRM de test a été mise à la corbeille.
