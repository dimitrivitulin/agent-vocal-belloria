# BELL-036 — Notification Telegram immédiate des demandes Tally

Statut: in_progress
Branche: `codex/bell-036-tally-trigger-telegram`
Dernière mise à jour: 2026-08-06 01:38 CEST

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

## Prochaine action

Après le prochain passage horaire, vérifier que `ArA1Dzk` est synchronisée puis acquittée, que la confirmation Telegram finale est reçue et que le rejeu reste sans doublon. Retirer la fiche CRM de test si le passage l'a créée.

## Résultat intermédiaire

L'accusé Telegram minimal est déployé sur la version Worker `031755de-3195-4c20-b6d1-2489a69e87dd`. Les 22 tests Worker passent et `/health` répond correctement. La soumission réelle contrôlée `ArA1Dzk` a été reçue dans D1 à la même seconde que Tally et reste `pending` avant le passage horaire ; le secret de signature n'étant pas stocké localement, le rejeu réel reste à constater côté fournisseur. La suite Python n'a pas pu démarrer faute d'interpréteur disponible.
