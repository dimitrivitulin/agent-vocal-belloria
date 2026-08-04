# BELL-021 — Synchronisation GitHub complète

Statut: completed
Branche: `codex/bell-021-synchronisation-github`
Dernière mise à jour: 2026-08-04

## Objectif

Rendre le dépôt GitHub représentatif de l'historique local Belloria et formaliser cette exigence comme règle durable du projet.

## Critères de réussite

- Toutes les branches locales `codex/bell-*` sont publiées sur `origin` avec leur commit de tête.
- Chaque branche locale suit sa branche distante homonyme.
- Le contexte stable et les règles de travail exigent la vérification des écarts local/distant avant livraison.
- `Événementiel Pour Tous` est retiré des sources actives du contexte.
- Aucun historique n'est réécrit et aucun push forcé n'est utilisé.
- `git diff --check`, l'examen du diff et le contrôle final local/distant réussissent.

## Fichiers concernés

- `AGENTS.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/TASKS.md`
- `CURRENT_TASK.md`

## Prochaine action

Ouvrir le prochain lot fonctionnel Belloria ; maintenir ensuite la vérification local/distant à chaque livraison.

## Résultat

Toutes les branches locales Belloria sont publiées sur `origin` et suivent leur branche distante homonyme. Le contexte stable et les règles de travail imposent désormais cette synchronisation ; la source inactive Événementiel Pour Tous est retirée du contexte.

## Validations effectuées

- Dépôt propre avant ouverture du lot.
- Inventaire initial : seules BELL-001 et BELL-020 possédaient une branche distante connue localement.
- `git push -u origin --all` réussi sans force ni réécriture.
- Les 19 branches locales Belloria suivent désormais leur branche `origin` homonyme.
