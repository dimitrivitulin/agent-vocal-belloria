# Référentiel commercial Belloria

## Source de vérité

Le référentiel opérationnel est la base Notion [Référentiel commercial Belloria](https://app.notion.com/p/d44901d87e5243e78bea7cd4b17b84c6). L'analyse détaillée est consignée dans [Analyse catalogue et ventes réelles — 2026](https://app.notion.com/p/3b21adaf333e814e9f7ee3c4a5bea3ab).

La base contient 26 fiches et trois vues : offres validées, upsells terrain, éléments à corriger ou valider. Une fiche n'est utilisable pour une recommandation chiffrée que si son statut est `Validé`. Une fiche `À valider` peut être citée comme possibilité, sans garantie de prix ou de contenu. Une fiche `Suspendu` ne doit pas être proposée.

## Hiérarchie des preuves

1. Validation explicite Belloria.
2. Facture payée ou prestation terminée.
3. Devis réellement envoyé et conversation client.
4. Catalogue Belloria 2025-2026.
5. Texte marketing ou estimation issue d'un formulaire.

Le catalogue n'écrase jamais un prix confirmé par Belloria et répété dans les dossiers réels.

## Offres cœur validées

| Offre | Prix TTC | Preuves terrain | Règle commerciale |
|---|---:|---|---|
| Grazing Table Cocktail | 18 €/personne | factures payées pour 15, 50 et 80 convives | ne jamais cumuler avec Bar Charcu'Bello |
| Grazing Table Menu | 25 €/personne | facture payée pour 35 ; devis à 33 et 100 | le prix catalogue de 55 € est faux |
| Brunch grazing | 25 €/personne | facture payée pour 15 ; devis pour 70 | l'offre seule peut suffire ; ne pas surcharger le devis |

Des prix personnalisés ont été observés, notamment un Menu anniversaire à 24 €/personne. Ils restent propres au dossier et ne deviennent pas une règle générale.

## Winners et upsells prouvés

| Upsell | Prix validé | Preuve | Recommandation |
|---|---:|---|---|
| Mignardises sucrées | 5 €/personne | choisies à la place du fromage et de la burrata, puis payées avec le Cocktail | premier upsell sucré à tester avec Cocktail ou Menu |
| Salad'Bello | 6 € observés par convive | payée avec un Cocktail de 80 convives | proposer si le client veut renforcer la partie fraîche ; unité contractuelle encore à confirmer |
| Bar de bienvenue | 3 €/personne | payé avec Cocktail, Cookie et donuts | proposer comme accueil, jamais comme ajout obligatoire |
| Cookie'Bello | 5 €/unité | payé avec Cocktail et Bar de bienvenue | dessert simple et lisible |
| Bar à donuts | 3 €/unité | payé dans le même dossier | animation sucrée contextuelle |

Les ateliers, Cheese'Bello et la planche burrata ne sont pas des upsells automatiques : ils ont été retirés ou n'ont pas encore de facture payée isolée dans l'échantillon. Sur un dossier Brunch, Cookie, saumon et burrata ont été retirés de la facture finale ; le Brunch seul a gagné.

## Incompatibilité bloquante

`Bar Charcu'Bello` et `Grazing Table Cocktail` couvrent le même besoin apéritif et ne peuvent pas être pris ensemble. Cette règle figure sur les deux fiches. L'agent doit proposer l'un comme alternative à l'autre, jamais comme upsell.

## Écarts et ambiguïtés du catalogue

- Grazing Table Menu : **55 € affichés, 25 € réels**.
- Téléphone : plusieurs pieds de page affichent `06 26 28 04 22`, alors que les devis et la page contact utilisent `06 25 28 04 22`.
- Charcu'Bello et Dolce'Bello : une page indique 9 € pour les deux cornets, la grille finale semble afficher 9 € pour chacun.
- Atelier burrata et atelier magret : unité incohérente entre les pages et la grille finale.
- Minimum générique de 30 personnes : non appliqué automatiquement, car un Cocktail payé existe pour 15 convives.
- Logistique à partir de 90 € : non appliquée automatiquement, car le catalogue parle aussi d'une inclusion dans un rayon de 30 km et plusieurs devis indiquent les frais inclus.
- Acompte : 40 % fréquent, mais 60 % observé sur un Brunch ; aucune règle universelle n'est activée.

## Prestations et options encore à valider

Restent notamment `À valider` : Mini Grazi'Bello, Charcu'Bello, Dolce'Bello, Salad'Bello comme unité contractuelle, Cheese'Bello, ateliers saumon, burrata, foie gras et magret, plateaux, vaisselle, nappes, débarrassage et frais logistiques.

Deux packs sont `Suspendu` :

- `Cocktail + atelier = 25 €`, dont le contenu et le calcul ne sont pas cohérents avec les prix unitaires ;
- `Menu + Bar Nomade + Cookie = 60 €`, calculé à partir du Menu catalogue erroné à 55 €.

## Règles d'utilisation par l'agent

1. Choisir une seule offre cœur validée selon le moment : Cocktail, Menu ou Brunch.
2. Contrôler l'effectif, le besoin, le lieu et le budget avant de chiffrer.
3. Proposer au plus un ou deux upsells prouvés et pertinents ; ne pas empiler les options.
4. Bloquer immédiatement la combinaison Charcu'Bello + Cocktail.
5. Recalculer le total depuis les prix validés ; ne jamais reprendre un total historique comme règle.
6. Ne jamais appliquer automatiquement minimum, logistique, vaisselle, acompte ou remise tant que la règle dédiée n'est pas validée.
7. Ne jamais déduire la disponibilité d'une fiche prestation ; consulter le planning confirmé.
8. En cas de champ nécessaire manquant, répondre `information commerciale manquante` et demander une décision humaine.

## Modèle de données

Chaque fiche trace famille, rôle commercial, prix courant, prix catalogue, unité, effectif, preuve, sources, signal terrain, associations gagnantes, incompatibilités, statut, validateur et date de validation. Le corps précise composition, logistique, exclusions, contexte de vente et inconnues restantes.
