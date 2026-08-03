# 002 — Modèle du CRM Notion

Date: 2026-08-03
Statut: acceptée

## Contexte

Belloria doit suivre quelques demandes par jour avec un modèle simple, lisible par l'équipe et suffisamment déterministe pour une synchronisation automatisée. Une même personne peut formuler plusieurs demandes et un même échange Gmail peut être retraité après une erreur.

## Décision

Le CRM repose sur deux bases Notion reliées : `Contacts` pour les personnes et `Opportunités` pour les demandes commerciales. Les contacts sont rapprochés par email normalisé puis téléphone E.164. Les opportunités sont rapprochées d'abord par fil Gmail, puis par une clé combinant contact, date et type d'événement.

Des propriétés techniques dédiées conservent les clés de rapprochement, les identifiants de messages traités et la date de synchronisation. Les statuts commerciaux et notes manuelles restent sous contrôle humain ; l'automatisation enrichit les données sans les écraser aveuglément.

## Conséquences

- Plusieurs opportunités peuvent être reliées au même contact sans dupliquer la personne.
- Le retraitement d'un message Gmail est idempotent.
- Les conflits d'identité et correspondances ambiguës exigent une revue manuelle.
- Le modèle reste volontairement limité ; les prestations, devis et contrats pourront devenir des bases séparées si le prototype le justifie.
- L'implémentation détaillée doit respecter `docs/notion-crm-model.md`.
