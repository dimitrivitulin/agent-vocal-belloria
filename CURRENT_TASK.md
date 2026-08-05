# BELL-036 — Notification Telegram immédiate des demandes Tally

Statut: in_progress
Branche: `codex/bell-036-tally-trigger-telegram`
Dernière mise à jour: 2026-08-06

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

Après accord explicite de mise en production, déployer l'accusé Telegram et effectuer une soumission Tally contrôlée.

## Résultat intermédiaire

L'accusé Telegram minimal est planifié par `waitUntil` uniquement après une nouvelle insertion D1 ; un rejeu ne renvoie rien et une erreur Telegram ne remet pas en cause la file anti-perte. 22 tests Worker passent. La suite Python n'a pas pu démarrer faute d'interpréteur disponible.
