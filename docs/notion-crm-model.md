# Modèle du CRM Notion Belloria

Ce document définit le modèle fonctionnel cible du prototype. Il ne crée ni ne modifie aucune base Notion réelle.

## Principes

- Deux bases reliées suffisent au prototype : `Contacts` et `Opportunités`.
- Un contact représente une personne ; une opportunité représente une demande commerciale ou un événement potentiel.
- Les propriétés dont le nom commence par `Tech —` sont réservées à l'automatisation et ne doivent pas être modifiées manuellement.
- Les valeurs brutes utiles à l'audit restent dans Gmail. Notion conserve uniquement les données métier et les références nécessaires au traitement.
- Les numéros de téléphone sont stockés au format E.164 et les emails en minuscules après normalisation.

## Base Contacts

| Propriété | Type Notion | Obligatoire | Usage |
|---|---|---:|---|
| Nom complet | Titre | oui | Nom d'affichage ; utiliser l'email ou le téléphone si le nom est inconnu. |
| Prénom | Texte | non | Prénom normalisé. |
| Nom | Texte | non | Nom de famille normalisé. |
| Email | Email | conditionnel | Email principal normalisé en minuscules. |
| Téléphone | Téléphone | conditionnel | Numéro principal au format E.164. |
| Société | Texte | non | Entreprise ou organisation. |
| Canal préféré | Sélection | non | `Email`, `Téléphone`, `WhatsApp`, `Inconnu`. |
| Opportunités | Relation | non | Relation réciproque vers `Opportunités.Contact`. |
| Dernier contact | Date | non | Dernier échange commercial observé. |
| Notes | Texte | non | Informations métier concises. |
| Tech — Clé contact | Texte | oui | Clé de rapprochement stable calculée par l'automatisation. |
| Tech — Créé le | Date de création | oui | Audit Notion. |
| Tech — Modifié le | Date de modification | oui | Audit Notion. |

Au moins un email ou un téléphone est requis. `Tech — Clé contact` vaut, par priorité, `email:<email_normalisé>` puis `tel:<téléphone_e164>`. Si les deux sont absents, le contact n'est pas créé automatiquement et la demande passe en revue manuelle.

## Base Opportunités

| Propriété | Type Notion | Obligatoire | Usage |
|---|---|---:|---|
| Opportunité | Titre | oui | Libellé lisible : type, client et date si connus. |
| Contact | Relation | oui | Contact principal ; relation réciproque vers `Contacts.Opportunités`. |
| Statut | Statut | oui | Cycle de vie commercial défini ci-dessous. |
| Source | Sélection | oui | `Tally`, `Email direct`, `Mariages.net`, `Événementiel Pour Tous`, `Autre`. |
| Type d'événement | Sélection | non | `Mariage`, `Entreprise`, `Anniversaire`, `Privé`, `Autre`, `Inconnu`. |
| Date de l'événement | Date | non | Date ou intervalle demandé. |
| Lieu | Texte | non | Lieu brut utile commercialement. |
| Nombre d'invités | Nombre | non | Entier positif. |
| Budget estimé | Nombre (euro) | non | Budget annoncé ou estimé. |
| Besoin | Texte | non | Résumé factuel de la demande. |
| Prochaine action | Texte | non | Action humaine ou automatisée attendue. |
| Échéance | Date | non | Date de relance ou de prochaine action. |
| Responsable | Personne | non | Propriétaire commercial dans Notion. |
| Gmail — URL du fil | URL | non | Accès au fil source. |
| Gmail — ID du fil | Texte | conditionnel | Identifiant stable du fil Gmail. |
| Tech — Clé opportunité | Texte | oui | Clé métier de rapprochement. |
| Tech — IDs messages traités | Texte | non | Ensemble sérialisé des IDs Gmail déjà intégrés. |
| Tech — Dernière synchronisation | Date | oui | Horodatage du dernier traitement réussi. |
| Tech — Créée le | Date de création | oui | Audit Notion. |
| Tech — Modifiée le | Date de modification | oui | Audit Notion. |

`Gmail — ID du fil` est obligatoire pour une opportunité issue de Gmail. Une opportunité créée manuellement peut ne pas en avoir.

## Cycle de vie d'une opportunité

| Statut | Signification | Sorties habituelles |
|---|---|---|
| Nouveau | Demande enregistrée, pas encore examinée. | `À qualifier`, `Qualifié`, `Perdu`. |
| À qualifier | Informations essentielles manquantes ou douteuses. | `Qualifié`, `Perdu`. |
| Qualifié | Demande pertinente et suffisamment renseignée. | `Devis à préparer`, `Perdu`. |
| Devis à préparer | Préparation commerciale requise. | `Devis envoyé`, `Perdu`. |
| Devis envoyé | Proposition transmise au prospect. | `Relance`, `Gagné`, `Perdu`. |
| Relance | Réponse ou relance attendue. | `Devis envoyé`, `Gagné`, `Perdu`. |
| Gagné | Opportunité acceptée. | Terminal. |
| Perdu | Refus, indisponibilité, doublon ou demande non pertinente. | Terminal, réouverture manuelle possible. |

Toute création automatique commence à `Nouveau`, sauf si la qualification établit explicitement qu'une information essentielle manque ; elle commence alors à `À qualifier`. Une automatisation ne passe jamais seule une opportunité à `Gagné`.

## Déduplication et idempotence

### Normalisation

- Email : retirer les espaces périphériques et convertir en minuscules ; ne pas modifier la partie locale au-delà de cette règle.
- Téléphone : retirer la mise en forme et convertir en E.164 avec le pays connu ; sans pays fiable, conserver la valeur pour revue sans l'utiliser comme clé forte.
- Date : format ISO `YYYY-MM-DD` dans le fuseau `Europe/Paris`.
- Type d'événement : utiliser la valeur canonique de la sélection.
- Texte : normaliser les espaces uniquement ; conserver accents et ponctuation dans les champs visibles.

### Rapprochement d'un contact

1. Correspondance exacte sur l'email normalisé.
2. À défaut, correspondance exacte sur le téléphone E.164.
3. Si email et téléphone désignent deux contacts différents, ne rien fusionner et créer une revue manuelle.
4. Le nom seul n'est jamais une clé de déduplication automatique.

### Rapprochement d'une opportunité

1. Pour Gmail, rechercher d'abord `Gmail — ID du fil` : un fil correspond à une opportunité active.
2. Sinon, construire `Tech — Clé opportunité` avec `contact_key|date_iso_ou_inconnue|type_evenement`.
3. Une clé identique rapproche une opportunité non terminale ou clôturée depuis moins de 30 jours.
4. Plusieurs correspondances, une date inconnue avec informations contradictoires, ou une opportunité terminale plus ancienne déclenchent une revue manuelle.
5. Une nouvelle demande clairement distincte crée une nouvelle opportunité, même pour le même contact.

### Traitement idempotent

- Avant toute mutation, vérifier si l'ID Gmail figure dans `Tech — IDs messages traités`.
- Ajouter l'ID uniquement après la réussite de toutes les mises à jour prévues.
- Rejouer un message déjà enregistré ne modifie aucune donnée métier.
- Une erreur partielle ne marque jamais le message comme traité.

## Règles de mise à jour

- Une valeur structurée nouvelle complète un champ vide.
- Une valeur structurée plus récente peut remplacer une valeur existante si la source est le même prospect.
- Une valeur incertaine ne remplace jamais une valeur confirmée ; elle est signalée pour revue.
- Les notes ajoutées manuellement et les statuts commerciaux ne sont jamais écrasés par la synchronisation.
- Un message ultérieur enrichit l'opportunité existante ; il ne duplique pas le texte complet de l'email dans Notion.
- Toute mutation réussie actualise `Tech — Dernière synchronisation`.

## Vues minimales recommandées

### Contacts

- `Tous les contacts` : table complète, tri par modification décroissante.
- `À vérifier` : email et téléphone tous deux absents, ou clé technique incohérente.

### Opportunités

- `Pipeline` : tableau groupé par statut, hors `Gagné` et `Perdu`.
- `À traiter` : statuts `Nouveau`, `À qualifier` ou `Devis à préparer`, tri par échéance.
- `Relances` : statut `Relance` ou échéance arrivée.
- `Clôturées` : statuts `Gagné` et `Perdu`.
- `Erreurs de données` : contact absent, clé technique absente ou source Gmail sans ID de fil.

## Critères d'implémentation pour BELL-006

- Créer les deux bases et leur relation réciproque avec les noms et types définis ici.
- Conserver les options de sélection et de statut exactement telles qu'énumérées.
- Implémenter la normalisation et les priorités de rapprochement avant toute création.
- Tester les cas : email identique, téléphone identique, conflit email/téléphone, fil Gmail rejoué, deux événements distincts et correspondance ambiguë.
- Vérifier qu'un échec peut être rejoué sans doublon et sans message faussement marqué comme traité.
