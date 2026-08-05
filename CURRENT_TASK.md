# BELL-033 — Voie rapide Telegram sous deux minutes

Statut: completed
Branche: `codex/bell-033-voie-rapide-sous-deux-minutes`
Dernière mise à jour: 2026-08-05

## Objectif

Répondre automatiquement aux commandes Telegram couvertes depuis un instantané prospect minimal et temporaire dans D1, tout en conservant le passage horaire comme reprise.

## Périmètre

- Accuser réception du webhook avant le traitement avec `waitUntil`.
- Alimenter via MCP un instantané D1 sans corps d’email ni conversation durable.
- Résoudre une consultation ou proposition traçable depuis un instantané frais et non ambigu.
- Refuser sûrement les contextes absents, ambigus ou périmés sans terminer la commande.
- Mesurer la latence technique ; ne pas ajouter de Queue, de règles anti-perte ni de KPI métier.

## Critères de réussite

- Texte et vocal suivent automatiquement la voie rapide après ingestion ou transcription.
- Une réponse Telegram représentative part en moins de deux minutes sans polling manuel.
- Les données temporaires expirent et les cas refusés restent disponibles pour la reprise horaire.
- Tests Worker, suite Python et `git diff --check` réussissent.

## Validation

- 18 tests Worker et 64 tests Python réussis ; migration D1 locale et dry-run Wrangler réussis.
- Migration `0004` appliquée à D1 distant ; Worker `91e13a96-4414-4e4e-a201-2898a9e87ea5` déployé.
- `/health` répond `200`, MCP anonyme refusé en `401`, aucune migration distante restante.
- Aller-retour Telegram synthétique : webhook en 191 ms, réponse `completed/replied` dans la même seconde ; données de test nettoyées.
- Un essai sans contexte a produit le refus sûr attendu et révélé puis couvert le passage explicite du contexte `waitUntil` dans l’entrypoint.
- `git diff --check` réussi ; diff limité au lot, sans secret ni artefact suivi.

## Prochaine action

Exécuter `BELL-031 — Boucle anti-perte et suivi automatique` dans une tâche et une branche indépendantes.
