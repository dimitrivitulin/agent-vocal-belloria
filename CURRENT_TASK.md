# BELL-029 — Moteur de conversion et prochaine meilleure action

Statut: completed
Branche: `codex/bell-029-moteur-conversion`
Dernière mise à jour: 2026-08-05

## Objectif

Produire une recommandation commerciale déterministe, explicable et sûre à partir du contexte prospect 360 et des seules offres validées.

## Résultat livré

- Diagnostic séparé de l'adéquation, l'urgence, la complétude, l'engagement, la valeur et le risque de planning.
- Offre cœur validée, options contextuelles limitées, questions bloquantes, prochaine action et brouillon sûr.
- Escalade humaine sur contradiction, conflit de planning, offre inconnue ou information non validée.
- Limite anti-relance et absence de promesse de disponibilité, remise, acompte ou logistique.
- Contrat documenté dans `docs/moteur-conversion.md`.

## Validation

- 54 tests Python réussis, dont 7 scénarios dédiés au moteur de conversion.
- 11 tests Worker réussis ; `git diff --check` réussi.
- Diff, périmètre, secrets et artefacts contrôlés.

## Prochaine action

Exécuter `BELL-030 — Agent conversationnel Telegram` en branchant ce moteur au contexte 360 et au transport existant, avec validation avant toute mutation.
