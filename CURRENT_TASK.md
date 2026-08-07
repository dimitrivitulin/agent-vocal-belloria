# BELL-042 — Chargement du contexte à la demande

Statut: completed
Branche: `codex/bell-042-contexte-a-la-demande`
Dernière mise à jour: 2026-08-07

## Objectif

Formaliser une méthode qui limite chaque tâche Codex aux fichiers, skills et MCP réellement nécessaires à sa feature.

## Contexte autorisé

- Domaine : règles de travail et gestion du contexte Codex.
- Fichiers initiaux : `AGENTS.md`, `CURRENT_TASK.md`, `docs/TASKS.md`.
- Skill requis : aucun pour l'implémentation locale.
- MCP requis : aucun.
- Hors périmètre : code applicatif, services externes et configuration globale Codex.

## Périmètre

- Ajouter à `AGENTS.md` une politique de chargement progressif et une matrice de déclenchement par domaine.
- Rendre obligatoire un manifeste de contexte dans `CURRENT_TASK.md`.
- Conserver le contexte initial minimal déjà défini et éviter tout connecteur « au cas où ».
- Inscrire le lot dans la feuille de route sans modifier le lot SMS BELL-041.

## Critères de réussite

- Les règles indiquent quoi charger, quand déclencher un skill ou MCP et quand créer une nouvelle tâche.
- Le lot actif déclare fichiers, skills, MCP et hors-périmètre.
- `CURRENT_TASK.md` reste sous 100 lignes.
- Le diff est documentaire, ciblé et passe `git diff --check`.

## Reprise

Pour tout nouveau lot, remplir `Contexte autorisé` avant de charger une ressource spécialisée ; reprendre BELL-041 dans sa tâche dédiée si la validation SMS est poursuivie.
