# BELL-001 — Organisation du projet

Statut: completed
Branche: `codex/bell-001-project-organization`
Dernière mise à jour: 2026-08-03

## Objectif

Mettre en place une organisation de contexte compacte, une feuille de route, des règles Git et un format de décision permettant de reprendre le projet sans charger un historique volumineux.

## Point de départ

Le dépôt Git était vide et positionné sur `master`. Aucun fichier projet ni changement utilisateur n'était présent.

## Périmètre du lot

- Ajouter les instructions durables dans `AGENTS.md`.
- Décrire le contexte stable dans `docs/PROJECT_CONTEXT.md`.
- Créer la feuille de route dans `docs/TASKS.md`.
- Installer le modèle de décision dans `docs/decisions/`.
- Définir la tâche active et la convention de nommage Codex.

Hors périmètre : code applicatif, comptes externes, secrets, infrastructure et déploiement.

## Travail terminé

- Branche dédiée créée.
- Structure documentaire initiale créée.
- Convention de nommage des tâches Codex et des branches documentée.
- Contexte stable, feuille de route et première décision d'architecture consignés.

## Prochaine action

Sélectionner le prochain lot avec l'utilisateur. `BELL-002 — Modèle du CRM Notion` est le prochain lot proposé dans la feuille de route.

## Décisions actives

- Séparer contexte stable, feuille de route, mémoire active et décisions durables.
- Utiliser un identifiant `BELL-xxx` cohérent dans Codex, Git et les documents.
- Ne pas pousser ou engager de modification sans lot cohérent et autorisation applicable.

## Fichiers concernés

- `AGENTS.md`
- `CURRENT_TASK.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/TASKS.md`
- `docs/decisions/README.md`
- `docs/decisions/001-architecture-initiale.md`

## Validations

- Vérification documentaire : réussie ; six fichiers attendus présents.
- Vérification des espaces et fins de ligne : réussie.
- Vérification du périmètre : réussie ; uniquement des fichiers d'organisation.
- Recherche de secrets : réussie ; aucun secret détecté.

## Vigilances

- Ne pas transformer les fichiers de contexte en historique chronologique.
- Ne pas introduire de secret réel dans les prochains lots.
