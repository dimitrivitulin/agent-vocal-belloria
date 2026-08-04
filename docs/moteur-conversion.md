# Moteur de conversion Belloria

Le moteur transforme un `ProspectContext` sourcé en recommandation explicable. Il ne contacte aucun client et ne modifie aucune source distante.

## Décision

Six dimensions restent séparées : adéquation, urgence, complétude, engagement, valeur et risque de planning. Elles ne sont pas agrégées en score opaque. La sortie expose l'action, les raisons, les incertitudes, l'offre cœur, au plus deux options pertinentes, les questions bloquantes et un brouillon éventuel.

Les actions couvertes sont : qualifier, préparer un devis, relancer, attendre l'acompte, confirmer ou demander une décision humaine.

## Garde-fous

- Seules les fiches `Validé` sont recommandables et chiffrables.
- Cocktail, Menu et Brunch sont les seules offres cœur activées.
- Une option n'est proposée que si le besoin contient un signal correspondant ; aucun empilement automatique.
- Une contradiction, une fiche non validée demandée, une offre inconnue ou un événement confirmé le même jour déclenche une décision humaine.
- Date, lieu, effectif et besoin sont bloquants avant préparation du devis.
- Après deux relances tracées sans réponse, le moteur n'en propose pas une troisième automatiquement.
- Aucun brouillon ne promet une disponibilité, un acompte, une remise, des frais ou une règle logistique.

Le prix attaché à une offre est une règle commerciale validée permettant de préparer le calcul ; le total final reste à construire et valider dans le devis. Une estimation Tally ne devient jamais un devis.
