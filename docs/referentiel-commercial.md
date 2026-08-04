# Référentiel commercial Belloria

## Source de vérité

Le référentiel opérationnel est la base Notion [Référentiel commercial Belloria](https://app.notion.com/p/d44901d87e5243e78bea7cd4b17b84c6), distincte de la base historique `Prestations` liée aux événements.

Une fiche n'est une règle commerciale courante que si son statut est `Validé`, avec `Validé par` et `Dernière validation` renseignés. Une fiche `À valider` constitue une piste sourcée : l'agent peut signaler son existence, mais ne doit ni garantir son prix ni construire une proposition ferme à partir d'elle.

## Modèle d'une prestation

Chaque fiche porte les champs structurés suivants : famille, moment couvert, prix TTC, unité de calcul, minimum et maximum de convives, délai minimal, zone, dernière preuve, source, statut, validateur et date de validation.

Le corps de la fiche précise, selon les informations disponibles :

- promesse et cas d'usage ;
- composition, variantes et exclusions ;
- logistique, matériel et personnel ;
- allergènes, régimes et limites ;
- associations et ventes additionnelles pertinentes ;
- cas où la prestation ne doit pas être proposée ;
- informations encore manquantes.

## Règles d'utilisation par l'agent

1. Filtrer sur `Statut = Validé` avant toute recommandation tarifée.
2. Recalculer le montant depuis le prix et l'unité validés ; ne jamais reprendre un total historique comme règle générale.
3. Ajouter les frais logistiques uniquement lorsqu'une règle validée permet leur calcul.
4. Ne jamais déduire la disponibilité d'une fiche prestation ; consulter le planning confirmé.
5. Si un minimum, une capacité, un délai ou une contrainte nécessaire manque, répondre `information commerciale manquante` et demander une décision humaine.
6. Conserver le lien de la fiche et de sa preuve dans l'explication de la recommandation.

## Première collecte du 4 août 2026

Six fiches ont été créées avec le statut `À valider` :

| Prestation | Fait sourcé | Source |
|---|---:|---|
| Grazing Table Menu | 25 € TTC/personne, proposition du 31 juillet 2026 | Gmail, proposition mariage 130 convives |
| Grazing Table Cocktail | 18 € TTC/personne, proposition du 31 juillet 2026 | Gmail, proposition mariage 130 convives |
| Atelier saumon gravlax | 8 € TTC/personne, proposition du 31 juillet 2026 | Gmail, même proposition |
| Atelier burrata | 8 € TTC/personne, proposition du 31 juillet 2026 | Gmail, même proposition |
| Brunch grazing | Composition et installation de 45 à 90 minutes ; prix absent | [Article Belloria](https://app.notion.com/p/2e61adaf333e808581f2e5aee9feb412) |
| Plateaux à partager | Format prêt à poser sans installation ; prix absent | [Article Belloria](https://app.notion.com/p/2e61adaf333e8079b859cb4433c57f07) |

Ces montants sont des preuves historiques datées, pas encore une grille tarifaire approuvée.

## Checklist de validation Belloria

Pour chaque fiche, confirmer ou corriger :

- nom commercial, promesse et composition incluse ;
- prix TTC, unité, minimum de commande et frais possibles ;
- effectif minimal et capacité maximale réaliste ;
- délais, temps d'installation, service et reprise ;
- zone, livraison, accès, froid, électricité, matériel et personnel ;
- allergènes, adaptations possibles et limites de contamination croisée ;
- options compatibles, ventes additionnelles et incompatibilités ;
- acompte, modification, annulation, remise et escalade humaine.

Une fois la revue faite, renseigner le validateur et la date, puis passer la fiche à `Validé`. Les règles transverses non propres à une prestation devront être ajoutées dans une fiche dédiée avant l'activation du moteur de recommandation.
