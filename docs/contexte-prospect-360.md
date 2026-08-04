# Contexte prospect 360

Le dossier 360 est reconstruit à la demande. Il ne constitue pas une seconde base CRM et ne conserve aucune copie durable des corps d'emails.

## Clé de résolution

- Tally : `message:<messageId>`, même lorsque Gmail regroupe plusieurs notifications dans un même fil.
- Autres emails : `thread:<threadId>` si le fil existe, sinon `message:<messageId>`.
- Un rapprochement par identité doit combiner email ou téléphone normalisé avec la date et le type d'événement. Une ambiguïté reste à vérifier.

## Contrat d'un fait

Chaque fait porte un champ, une valeur, une nature de preuve, une date d'observation, un identifiant de source et, si possible, un lien. La valeur retenue n'efface jamais les valeurs différentes : elles restent attachées comme contradictions.

Ordre de décision : correction humaine CRM, facture, devis PDF envoyé, message explicite du prospect, soumission Tally, donnée CRM automatisée, inférence signalée. À niveau égal, la preuve la plus récente prévaut.

## Preuves financières

- `estimated_amount` accepte Tally ou le CRM, mais reste une estimation.
- `quote_amount` exige le PDF d'un devis réellement envoyé par Gmail.
- `actual_revenue` exige une facture valide de `CLIENTS` 2026/2027.
- `deposit_amount` exige une facture ou une correction humaine CRM.

Une valeur présente sans la preuve requise est ignorée dans la synthèse financière et produit un avertissement.

## Sortie

Le constructeur expose les faits résolus, leurs contradictions, la chronologie sourcée, les inconnues, les avertissements et quatre montants distincts : estimation, devis, CA effectif et acompte. Les événements confirmés le même jour sont un fait commercial obligatoire ; leur présence ne vaut pas automatiquement indisponibilité et appelle une vérification humaine de capacité.

## Validation réelle en lecture seule

Le 5 août 2026, le schéma `Demandes & événements` contient les champs nécessaires au dossier, dont les quatre valeurs financières, les identifiants Gmail, la provenance, les échéances et les conflits de date. Gmail montre plusieurs notifications Tally récentes partageant le fil `19fc764f1e53f945` tout en représentant Elisabeth Tressens, Elodie Querol et Lydie : ce cas confirme que `messageId` doit être la frontière de soumission.
