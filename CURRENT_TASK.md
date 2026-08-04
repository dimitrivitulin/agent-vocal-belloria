# BELL-028 — Contexte prospect 360

Statut: completed
Branche: `codex/bell-028-contexte-prospect-360`
Dernière mise à jour: 2026-08-05

## Objectif

Construire un dossier prospect court, sourcé et déterministe à partir du CRM, des soumissions Gmail, des échanges, des devis, des factures et du planning confirmé, sans fusionner deux soumissions Tally.

## Résultat livré

- Constructeur déterministe de faits sourcés avec fraîcheur, autorité et contradictions conservées.
- Séparation stricte des soumissions Tally par `messageId` ; les autres emails utilisent le fil lorsqu'il existe.
- Synthèse des faits, chronologie, inconnues, avertissements et quatre niveaux financiers distincts.
- Contrat documenté dans `docs/contexte-prospect-360.md`.
- Cas réel Gmail multi-soumissions et schéma CRM contrôlés en lecture seule.

## Validation

- 47 tests unitaires réussis, dont 7 dédiés au contexte prospect.
- `git diff --check` réussi ; périmètre et secrets contrôlés.
- Le fil Gmail réel `19fc764f1e53f945` contient plusieurs clients Tally distincts, correctement séparables par message.

## Prochaine action

Exécuter `BELL-029 — Moteur de conversion et prochaine meilleure action` sur ce contrat de contexte et les seules fiches commerciales `Validé`.
