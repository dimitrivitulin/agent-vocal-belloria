# BELL-025 — Séparation clients actifs et anciens

Statut: completed
Branche: `codex/bell-025-separation-clients-actifs-anciens`
Dernière mise à jour: 2026-08-04

## Objectif

Rendre le CRM Notion immédiatement lisible en classant comme perdu tout événement passé non honoré et en séparant les clients en cours des clients anciens.

## Critères de réussite

- Toute fiche dont la date est antérieure au 2026-08-04 est `Perdu`, sauf preuve de prestation réalisée (`Terminé`).
- Les prestations réalisées restent `Terminé` et ne sont pas mélangées aux pertes.
- Une vue `Clients en cours` affiche uniquement les événements futurs non perdus et non terminés.
- Une vue `Clients anciens` affiche les fiches `Perdu` ou `Terminé`.
- Les prochaines actions et indicateurs de revue sont cohérents avec le nouveau classement.
- Le résultat est vérifié dans Notion et le suivi local est validé puis publié.

## Fichiers concernés

- `CURRENT_TASK.md`
- `docs/TASKS.md`
- `docs/PROJECT_CONTEXT.md` uniquement si l'état stable évolue

## Prochaine action

Traiter les clients en cours depuis la vue dédiée, par date d'événement et priorité.

## État vérifié

- 20 événements passés non honorés ont été reclassés de `À qualifier` ou `Devis envoyé` vers `Perdu`.
- Le CRM contient 57 clients en cours, 23 fiches perdues et 4 prestations terminées.
- Aucun événement antérieur au 2026-08-04 ne reste actif : le contrôle retourne zéro anomalie.
- La vue `Clients en cours` exclut `Perdu` et `Terminé`, filtre les dates à partir du 2026-08-04 et trie par date croissante.
- La vue `Clients anciens` regroupe `Perdu` et `Terminé` et trie par date décroissante.
