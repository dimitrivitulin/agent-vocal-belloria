# BELL-024 — Reprise CRM des formulaires récents

Statut: completed
Branche: `codex/bell-024-reprise-crm-formulaires-recents`
Dernière mise à jour: 2026-08-04

## Objectif

Recenser les formulaires commerciaux reçus sur Gmail sur les deux derniers mois et mettre à jour le CRM Notion opérationnel pour les événements à venir comme pour les prestations déjà réalisées.

## Critères de réussite

- Tous les formulaires Tally des deux derniers mois sont recensés et lus.
- Chaque demande est rapprochée d'une fiche existante ou créée sans doublon dans `Demandes & événements`.
- Les événements futurs portent une étape et une prochaine action cohérentes avec les échanges Gmail disponibles.
- Les prestations passées et effectivement réalisées sont identifiées comme terminées ; les demandes perdues ou annulées ne sont pas assimilées à des prestations réalisées.
- Les identifiants techniques et liens Gmail permettent de retracer chaque mise à jour.
- Aucun email, message Telegram ou mutation du CRM historique n'est effectué.
- Le résultat est contrôlé dans Notion et le suivi local est validé puis publié.

## Fichiers concernés

- `CURRENT_TASK.md`
- `docs/TASKS.md`
- `docs/PROJECT_CONTEXT.md` uniquement si l'état stable évolue

## État vérifié

- Le CRM cible est la base Notion opérationnelle `Demandes & événements`.
- La recherche Gmail couvre les formulaires Tally reçus après le 2026-06-03 et jusqu'au 2026-08-04 inclus.
- 88 formulaires Tally ont été lus et regroupés en 78 demandes dédupliquées par email et date d'événement.
- Les 88 identifiants de message sont présents exactement une fois dans le CRM, sans manque ni doublon.
- 75 fiches Tally ont été créées, deux existaient déjà et la fiche Anaëlle a été consolidée avec sa demande Tally.
- Six fiches clients hors formulaires ont été ajoutées d'après des factures, paiements ou échanges opérationnels vérifiables.
- Le CRM contient désormais 84 événements : 4 terminés, 3 confirmés, 22 avec devis envoyé, 3 perdus et 20 marqués pour revue humaine.
- Les événements passés sans preuve d'exécution restent `À qualifier` ; ils ne sont pas classés arbitrairement comme réalisés.
- Aucun email, message Telegram ou changement du CRM historique n'a été effectué.

## Prochaine action

Traiter les actions urgentes du CRM, en commençant par les événements proches et les fiches marquées pour revue humaine.
