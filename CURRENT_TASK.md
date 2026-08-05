# BELL-035 — Intégration du plugin Tally dans ChatGPT Work

Statut: pending
Branche: `codex/bell-035-tally-plugin-work`
Dernière mise à jour: 2026-08-06

## Objectif

Utiliser le connecteur Tally pour lire plus simplement une soumission dans ChatGPT Work, tout en conservant le webhook Cloudflare et D1 comme file anti-perte et autorité d'idempotence.

## Périmètre prévu

- Inventorier les outils réellement exposés par le connecteur Tally installé dans ChatGPT Work.
- Faire retourner par la liste D1 uniquement les métadonnées techniques, sans payload personnel par défaut.
- Ajouter une lecture ciblée du payload D1 réservée au repli si Tally est indisponible.
- Adapter la tâche Work : D1 détecte, Tally lit, Notion synchronise, D1 acquitte après succès.
- Exclure les notifications Tally de la recherche Gmail sans désactiver leur éventuelle réception humaine.
- Interdire à la tâche toute création ou modification de formulaire Tally.

## Critères de réussite

- Une soumission contrôlée est retrouvée par son `submission_id` via Tally et concorde avec l'événement D1.
- Le CRM n'est muté qu'une fois et l'acquittement D1 intervient après succès Notion.
- Une indisponibilité ou une évolution du connecteur Tally déclenche le repli D1 sans perte ni doublon.
- La tâche ne peut ni créer, ni éditer un formulaire et ne charge pas en masse les réponses historiques.
- Tests Worker, passage Work contrôlé, `git diff --check` et examen du diff réussissent.

## Décision préparée

Le plugin Tally simplifie la lecture mais ne remplace ni le webhook temps réel ni D1. Le serveur MCP Tally est encore annoncé en bêta ; la file locale reste donc nécessaire.

## Prochaine action

Au démarrage du lot, relever les noms et schémas exacts des outils Tally visibles dans ChatGPT Work, puis implémenter le contrat minimal décrit dans `docs/tally-plugin-work.md`.
