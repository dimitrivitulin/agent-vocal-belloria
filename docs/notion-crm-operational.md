# CRM Belloria opérationnel

## Cible Notion

- Page : [CRM Belloria — Pilotage commercial](https://app.notion.com/p/3b21adaf333e81c0afd2fb42b18934b5)
- Base : [Demandes & événements](https://app.notion.com/p/96ac04f235b44259a85a4e89be75ab49)
- Source de données : `collection://5057a261-a7c5-4ea9-991e-598976ded170`

Cette cible est séparée du CRM historique `Prospects & Clients`. Aucun enregistrement réel n'y est importé dans BELL-020.

## Besoin observé dans Gmail

Les demandes Tally fournissent généralement le client, le type et la date de l'événement, les convives, la formule, un montant indicatif, l'email et le téléphone. Mariages.net fournit surtout un nom, une date, des convives et une demande générale. Les emails directs nécessitent souvent une première réponse pour préciser la formule et le budget.

Après le premier échange, le travail réel consiste à préparer ou envoyer un devis, intégrer une modification, relancer, attendre un acompte, confirmer l'événement ou enregistrer une perte. Le CRM doit donc répondre d'abord à la question « quelle action faut-il faire maintenant ? ».

## Unité de suivi

Une ligne représente une demande ou un événement. Plusieurs messages du même fil Gmail enrichissent cette ligne ; ils ne créent pas plusieurs fiches. `Tech — ID fil Gmail` rapproche le fil et `Tech — IDs messages traités` empêche le rejeu d'un même message.

## Pipeline

| Étape | Usage opérationnel |
| --- | --- |
| `Nouveau` | Demande reçue mais pas encore analysée. |
| `Réponse à faire` | Première réponse ou question au prospect nécessaire. |
| `À qualifier` | Informations essentielles manquantes ou ambiguës. |
| `Devis à préparer` | Besoin suffisamment clair pour chiffrer. |
| `Devis envoyé` | Proposition transmise, attente de réponse. |
| `Modification demandée` | Convives, formule, composition ou montant à réviser. |
| `Relance à faire` | Prospect silencieux ou échéance de suivi atteinte. |
| `Acompte attendu` | Accord obtenu, confirmation conditionnée au paiement. |
| `Confirmé` | Acompte ou confirmation métier reçue. |
| `Perdu` | Refus, indisponibilité, silence prolongé ou projet annulé. |
| `Terminé` | Prestation réalisée et suivi commercial clos. |

## Champs utiles

La fiche conserve les coordonnées, la source, les dates de réception et d'événement, le type d'événement, les convives, le lieu, les prestations souhaitées, le besoin résumé, les montants estimé/devis/acompte, les dates de devis et de relance, la prochaine action, le motif de perte et le lien Gmail.

Les propriétés `Tech — *` sont réservées à l'automatisation et masquées des vues de travail. Elles ne doivent jamais contenir le corps complet d'un email.

## Vues

- `Pipeline commercial` : tableau par étape pour visualiser la charge.
- `Actions à faire` : uniquement les fiches nécessitant une réponse, un devis, une modification, une relance ou un acompte.
- `Calendrier des événements` : planning par date d'événement.
- `Confirmés à préparer` : prestations confirmées triées chronologiquement.

## Règles d'automatisation

- Une nouvelle demande claire commence à `Réponse à faire` ou `Devis à préparer` selon les informations disponibles.
- Une réponse client après devis peut passer à `Modification demandée`, `Acompte attendu`, `Confirmé` ou `Perdu` selon son contenu.
- L'automatisation complète les champs factuels mais n'écrase jamais une modification humaine ni un statut commercial plus avancé.
- Aucun email n'est envoyé automatiquement ; tout texte sortant reste un brouillon soumis à confirmation.
- L'ancien CRM reste la référence historique jusqu'à validation explicite d'une migration.
