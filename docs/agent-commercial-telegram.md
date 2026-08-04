# Agent commercial Belloria piloté par Telegram

## Résultat attendu

Le bot Telegram devient l'interface privée d'un agent commercial Belloria. À partir d'un nom, d'un message texte ou d'un vocal, l'agent doit comprendre de quel prospect il s'agit, reconstruire sa situation, recommander l'action la plus utile et préparer son exécution.

L'objectif n'est pas de produire davantage de messages génériques. Il est de répondre plus vite, avec la bonne offre, au bon niveau de précision et au bon moment, tout en conservant une validation humaine avant toute communication client.

## Architecture fonctionnelle

```text
Telegram texte/vocal
        ↓
Compréhension de la commande et résolution du prospect
        ↓
Contexte prospect 360  ←  Référentiel commercial Belloria
        ↓
Diagnostic commercial et prochaine meilleure action
        ↓
Proposition dans Telegram
        ↓
Validation humaine
        ↓
Mise à jour CRM / brouillon Gmail / envoi approuvé / compte rendu
```

Telegram reste un canal d'administration privé. Les prospects ne conversent jamais directement avec le bot.

## Contexte prospect 360

Avant toute recommandation, l'agent doit produire un dossier de travail court et sourcé.

### Identité et événement

- nom, email, téléphone et source ;
- type, date, lieu, horaires et nombre de convives ;
- prestations demandées et objectif exprimé ;
- contraintes alimentaires, logistiques ou esthétiques connues ;
- événements Belloria confirmés le même jour et impact possible sur la capacité.

### Situation commerciale

- étape CRM actuelle et personne qui doit agir ;
- formulaire initial et date de réception ;
- chronologie des échanges Gmail avec auteur et date ;
- questions déjà posées et informations encore manquantes ;
- dernier engagement du prospect, objections, urgence et prochaine échéance ;
- relances déjà effectuées afin d'éviter les répétitions.

### Situation financière

- `Montant estimé (€)` : calcul indicatif du formulaire ou estimation interne ;
- `Montant devis (€)` et `CA potentiel (€)` : uniquement si un devis a réellement été envoyé par email ;
- `CA effectif (€)` : uniquement à partir d'une facture retrouvée dans `CLIENTS` 2026/2027 ;
- acompte reçu, solde éventuel et statut de confirmation ;
- écarts entre estimation, proposition écrite, devis et facture.

### Sortie opérationnelle

- potentiel et priorité expliqués ;
- niveau de confiance et données à vérifier ;
- prochaine meilleure action ;
- offre principale recommandée ;
- option ou vente additionnelle réellement pertinente ;
- questions de qualification restantes ;
- brouillon adapté au canal et au stade commercial.

## Règles de preuve et de priorité des sources

1. Une correction humaine récente dans le CRM prévaut tant qu'elle n'est pas contredite par une preuve plus récente explicitement vérifiée.
2. Une facture ou un devis joint à un email constitue une preuve financière ; le texte d'un email, un catalogue ou des photos ne suffisent pas.
3. Un échange explicite avec le prospect prévaut sur le formulaire initial pour les besoins modifiés.
4. Le formulaire fournit les faits déclarés et une estimation, jamais une confirmation commerciale.
5. Une inférence de l'agent reste signalée comme telle et ne remplace pas une donnée factuelle.

Pour Tally, chaque `messageId` représente une soumission distincte. Le `threadId` Gmail ne doit pas être utilisé pour fusionner les clients, car Gmail regroupe parfois des notifications sans rapport sous le même sujet.

Chaque fait important conserve au minimum sa source, sa date de collecte et un lien quand il existe. Les contradictions sont montrées à l'utilisateur au lieu d'être arbitrairement effacées.

## Référentiel commercial Belloria

L'agent ne peut pas maximiser la conversion sans une connaissance explicite, maintenue et validée des prestations.

### Pour chaque prestation

- nom commercial et promesse client ;
- type de moment couvert : cocktail, repas, brunch, dessert ou animation ;
- composition standard, variantes et éléments exclus ;
- prix, unité de calcul, minimum de commande et frais possibles ;
- fourchettes de convives adaptées ;
- temps de préparation, installation, service et reprise ;
- matériel, espace, accès, froid, électricité et personnel nécessaires ;
- zone géographique, livraison et contraintes de déplacement ;
- allergènes, régimes compatibles et limites ;
- délai minimal de réservation et capacité maximale réaliste ;
- photos, exemples et prestations réalisées pouvant servir de preuve ;
- options compatibles et ventes additionnelles utiles ;
- cas où la prestation ne doit pas être proposée.

### Connaissance commerciale transverse

- positionnement et ton Belloria ;
- questions de qualification par type d'événement ;
- objections fréquentes et réponses validées ;
- règles de remise, acompte, annulation et modification ;
- signaux d'intention et signaux de faible adéquation ;
- séquences de relance par urgence et stade ;
- formulations à éviter et promesses interdites ;
- critères d'escalade vers Cyndy ou Dimitri.

Le référentiel doit être versionné et validé par Belloria. L'agent signale « information commerciale manquante » au lieu de compléter par supposition.

## Moteur de conversion

La recommandation ne repose pas sur un score opaque unique. Elle évalue séparément :

- adéquation entre le besoin et les prestations ;
- valeur estimée et potentiel de vente additionnelle ;
- proximité de la date et faisabilité opérationnelle ;
- complétude des informations nécessaires au devis ;
- engagement observé dans les échanges ;
- concurrence de planning avec les événements confirmés ;
- nombre et ancienneté des tentatives sans réponse.

L'agent choisit ensuite une action parmi : répondre, qualifier, appeler, préparer un devis, demander une modification, relancer, attendre l'acompte, confirmer, classer perdu ou demander une décision humaine.

Une recommandation de réponse suit ce principe : rappeler précisément le projet, montrer que la demande a été comprise, proposer une solution principale claire, poser seulement les questions bloquantes et conclure par une action simple. Les options additionnelles sont proposées uniquement lorsqu'elles améliorent réellement l'expérience décrite.

## Expérience Telegram cible

Exemples de demandes naturelles :

- « Donne-moi mes cinq priorités du jour. »
- « Résume le dossier Granarolo et dis-moi ce qui bloque. »
- « Quelle formule proposer à ce mariage de 80 personnes ? »
- « Prépare une réponse courte pour Elodie. »
- « Qui dois-je relancer aujourd'hui et pourquoi ? »
- « Est-ce que j'ai déjà un événement confirmé le 3 octobre ? »
- « Quel est le total des devis réellement envoyés ce mois-ci ? »
- « Mets Lydie en devis à préparer et rappelle-moi demain. »

Pour une consultation, l'agent répond directement. Pour une mutation ou un envoi, il affiche : prospect résolu, sources utilisées, changement proposé, texte exact éventuel et conséquence. Il exécute seulement après confirmation explicite.

La cible de réponse est inférieure à deux minutes. Le passage ChatGPT Work horaire reste utile pour la synchronisation, les briefings et la reprise après erreur, mais ne constitue pas l'expérience conversationnelle finale.

## Mémoire et limites

- Notion reste la source de vérité du CRM métier.
- L'agent peut lire Gmail et les sources commerciales autorisées pour construire son contexte.
- Il écrit uniquement dans le CRM Belloria ; les autres dossiers Notion ne sont pas modifiés.
- D1 conserve la file technique et l'idempotence, pas une copie durable des conversations clients.
- Le contexte est reconstruit depuis les sources à chaque action importante afin d'éviter une mémoire obsolète.
- Les données personnelles inutiles ne figurent ni dans les journaux ni dans les comptes rendus généraux.

## Mesure de la performance

Les indicateurs utiles sont :

- délai médian de première réponse ;
- demandes sans prochaine action datée ;
- taux demande → devis ;
- taux devis → acompte ou confirmation ;
- valeur moyenne des devis et du CA effectif ;
- nombre de relances avant réponse ;
- motifs de perte ;
- recommandations corrigées par l'humain ;
- erreurs de rapprochement, de prix ou de statut ;
- opportunités détectées grâce à une option pertinente.

La qualité prime sur le volume : une hausse de conversion ne doit pas s'accompagner d'une hausse des promesses erronées, des relances excessives ou des erreurs de prix.
