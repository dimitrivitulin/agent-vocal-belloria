# Qualification des emails Gmail

## Portée

Cette spécification décrit le routage des nouveaux messages vers l'automatisation Belloria. Elle ne crée aucun filtre dans la boîte réelle et n'envoie aucun email. Les adresses et signatures observées devront être confirmées sur des échantillons anonymisés avant activation.

## Principes

- Le filtre Gmail ne décide pas qu'un message est commercial : il constitue une file de candidats à faible bruit.
- Un message est l'unité de travail et son `messageId` l'unité d'idempotence ; le `threadId` relie les échanges à une opportunité.
- Les formulaires Tally reconnus sont parsés de façon déterministe. Les emails libres sont qualifiés en langage naturel.
- Un doute ne provoque ni suppression ni envoi : il mène à une revue humaine.
- Les newsletters, notifications sociales et factures techniques sont écartées avant tout traitement IA.

## Taxonomie des labels

Les noms visibles sont stables ; l'automatisation résout et conserve leurs identifiants Gmail au démarrage.

| Label | Producteur | Sens |
| --- | --- | --- |
| `Belloria/Candidat` | filtre Gmail | Message autorisé à entrer dans la file. |
| `Belloria/Source/Tally` | filtre Gmail | Signature Tally reconnue. |
| `Belloria/Source/Mariages.net` | filtre Gmail | Notification commerciale Mariages.net reconnue. |
| `Belloria/Source/Evenementiel-pour-tous` | filtre Gmail | Notification commerciale Événementiel Pour Tous reconnue. |
| `Belloria/Source/Email-direct` | qualification | Demande libre ou réponse d'un prospect. |
| `Belloria/Etat/En-cours` | automatisation | Verrou temporaire de visibilité, jamais preuve d'idempotence. |
| `Belloria/Etat/Traite` | automatisation | Mutation CRM terminée pour le message. |
| `Belloria/Etat/A-revoir` | automatisation | Ambiguïté métier ou format non reconnu. |
| `Belloria/Etat/Erreur` | automatisation | Échec technique rejouable. |

Un message ne porte qu'un label `Belloria/Etat/*`. `Candidat` et `Source/*` restent présents pour l'audit. Les labels sont appliqués aux **messages** ; appliquer un état au fil entier pourrait marquer par erreur des réponses arrivées plus tard.

## Filtres Gmail

### Ordre logique

1. Appliquer un label de source aux expéditeurs et signatures connus.
2. Appliquer `Belloria/Candidat` aux sources connues et aux messages reçus sur les adresses commerciales Belloria.
3. Ne jamais supprimer, archiver, transférer ni marquer comme lu automatiquement.
4. Laisser l'automatisation confirmer ou corriger la source.

Les valeurs entre chevrons sont des paramètres de configuration, pas des valeurs à copier dans Gmail.

| Filtre | Critère conceptuel | Action |
| --- | --- | --- |
| Tally | `from:(<expéditeurs-tally-validés>)` et signature de formulaire validée | `Candidat` + `Source/Tally` |
| Mariages.net | `from:(<expéditeurs-mariages-validés>)` et motif de demande validé | `Candidat` + source correspondante |
| Événementiel Pour Tous | `from:(<expéditeurs-ept-validés>)` et motif de demande validé | `Candidat` + source correspondante |
| Adresse commerciale | `deliveredto:<adresse-commerciale>` avec exclusions ci-dessous | `Candidat` |

Exclusions initiales : `category:promotions`, `category:social`, notifications automatiques validées, factures et reçus techniques validés. Les critères négatifs Gmail ne constituent toutefois qu'une optimisation : l'automatisation revalide chaque **message**, car une recherche négative peut faire apparaître une conversation lorsqu'un autre message du fil correspond.

Avant activation, chaque requête est exécutée comme recherche sur un historique représentatif. Les faux positifs et faux négatifs sont consignés ; un filtre de source n'est activé que si l'expéditeur **et** une signature stable sont confirmés. Gmail permet d'exporter les filtres : l'export XML devient la sauvegarde opérationnelle, hors de ce lot.

## Sélection de la file

À chaque passage, récupérer par pages les messages portant `Belloria/Candidat`, puis ignorer ceux portant `Traite` ou `A-revoir`. `Erreur` est repris selon la politique de retry. Le tri est du plus ancien au plus récent afin de préserver l'ordre d'un fil.

Pour chaque résultat, récupérer le message complet et conserver au minimum :

| Champ | Usage |
| --- | --- |
| `messageId` | clé d'idempotence Gmail |
| `threadId` | rapprochement d'opportunité |
| `internalDate` | ordre et audit |
| en-têtes `From`, `To`, `Delivered-To`, `Subject`, `Date`, `Message-ID`, `In-Reply-To` | source et contexte |
| corps `text/plain`, sinon texte dérivé de `text/html` | extraction ou qualification |
| noms, types MIME et tailles des pièces jointes | signalement uniquement dans ce lot |
| IDs des labels | état observé |

Les images distantes, liens et pièces jointes ne sont ni ouverts ni exécutés pendant la qualification. Le texte cité et les signatures sont séparés du nouveau contenu lorsque possible.

## Classification

La sortie interne est l'une des suivantes :

| Résultat | Condition | Suite |
| --- | --- | --- |
| `tally_structure` | source et format Tally reconnus | parseur déterministe |
| `demande_commerciale` | intention de devis, disponibilité, prestation ou suivi commercial | extraction en langage naturel |
| `reponse_fil_commercial` | réponse rattachée à une opportunité existante | mise à jour de l'opportunité |
| `hors_perimetre` | newsletter, notification, facture technique, spam évident | `Traite`, sans CRM |
| `a_revoir` | ambiguïté, conflit de source ou contenu inexploitable | `A-revoir`, sans mutation |

Pour une qualification en langage naturel, la sortie doit être structurée avec `classe`, `source`, `confiance`, `motifs[]` et `champs_extraits`. Une confiance inférieure au seuil configurable ou un conflit entre classe et source mène à `a_revoir`. Le modèle ne peut pas déclencher d'envoi.

## Contrat Tally

### Reconnaissance

Un message est traité comme Tally uniquement si ces trois contrôles réussissent :

1. expéditeur présent dans la liste validée ;
2. sujet ou en-tête stable associé au formulaire « Devis express » ;
3. corps contenant au moins deux libellés canoniques, dont un identifiant de contact (`email` ou `telephone`).

Sinon, le label de source est conservé pour l'audit et le message passe à `a_revoir`.

### Extraction

Le parseur convertit d'abord le MIME en texte Unicode normalisé, puis lit des paires `libellé: valeur` ou des cellules libellé/valeur dans leur ordre d'apparition. Casse, accents, espaces insécables et espaces répétés sont normalisés. Les alias acceptés sont versionnés :

| Champ canonique | Alias initiaux |
| --- | --- |
| `nom_complet` | `Nom`, `Nom et prénom`, `Prénom et nom` |
| `email` | `E-mail`, `Email`, `Adresse e-mail` |
| `telephone` | `Téléphone`, `Numéro de téléphone`, `Tel` |
| `type_evenement` | `Type d'événement`, `Événement`, `Type de prestation` |
| `date_evenement` | `Date`, `Date de l'événement`, `Quand ?` |
| `lieu` | `Lieu`, `Lieu de l'événement`, `Ville` |
| `nombre_invites` | `Nombre d'invités`, `Invités`, `Nombre de personnes` |
| `budget` | `Budget`, `Budget estimé` |
| `message` | `Message`, `Votre demande`, `Précisions` |

Les valeurs multilignes continuent jusqu'au prochain libellé reconnu. Un libellé inconnu est conservé dans `champs_inconnus` et provoque `A-revoir` seulement s'il ressemble à un champ essentiel. Les champs bruts ne sont jamais inventés.

Contrôles après extraction : email normalisé s'il est présent, téléphone normalisable en E.164 s'il est présent, date non ambiguë, entiers et montants plausibles. Il faut au moins un contact (`email` ou `telephone`). Une donnée essentielle absente crée une opportunité `À qualifier` si le contact est identifiable ; un contact absent mène à `A-revoir` sans mutation CRM.

Le format exact et les alias initiaux devront être figés à partir de trois échantillons anonymisés : cas complet, champ optionnel absent et réponse libre multilignes.

## États, verrou et idempotence

1. Lire le message et vérifier dans Notion si `messageId` figure déjà dans `Tech — IDs messages traités`.
2. S'il y figure, remettre le label Gmail à `Traite` sans remuter le CRM.
3. Sinon, remplacer l'état courant par `En-cours` et démarrer un verrou horodaté côté exécution.
4. Qualifier, extraire et effectuer la mutation CRM prévue.
5. Ajouter `messageId` à l'ensemble des IDs traités dans la même opération logique que la mise à jour métier.
6. Après succès Notion, remplacer `En-cours` par `Traite`.
7. Sur ambiguïté métier, retirer `En-cours`, appliquer `A-revoir` et ne pas enregistrer l'ID comme traité.
8. Sur erreur technique, retirer `En-cours`, appliquer `Erreur` et conserver l'ID non traité.

Les labels Gmail peuvent être en retard sur Notion : le registre Notion est l'autorité d'idempotence. Un `En-cours` plus vieux que la durée de verrou configurable est récupérable. Les retries techniques utilisent un nombre maximal et un délai progressif ; une fois la limite atteinte, le message reste en `Erreur` et une alerte est produite.

## Cas de validation

| Cas | Résultat attendu |
| --- | --- |
| Tally complet reconnu | extraction déterministe, CRM muté, `Traite` |
| Tally avec champ optionnel absent | extraction déterministe, champ vide, `Traite` |
| Tally avec nouveau libellé essentiel | aucune invention, `A-revoir` |
| Email libre demandant un devis | `demande_commerciale`, extraction contrôlée |
| Réponse dans un fil connu | même opportunité via `threadId` |
| Newsletter reçue sur l'adresse commerciale | `hors_perimetre`, aucun CRM |
| Facture technique connue | `hors_perimetre`, aucun CRM |
| Même `messageId` rejoué après succès Notion | aucune double mutation, état réparé à `Traite` |
| Succès Notion puis échec de label Gmail | reprise sans double mutation |
| `En-cours` expiré | récupération et reprise sûre |
| Erreur transitoire Notion | `Erreur`, retry borné |
| Contact absent dans Tally | `A-revoir`, aucun CRM |

## Préparation de l'activation

- Recueillir les adresses commerciales et expéditeurs autorisés.
- Anonymiser au moins trois messages de chaque source connue et quelques contre-exemples.
- Tester chaque requête Gmail sur l'historique sans action de filtre.
- Créer les labels puis les filtres manuellement, avec export XML de sauvegarde.
- Exécuter un passage en lecture seule et comparer les résultats à la qualification humaine.
- Activer les mutations d'abord sur une boîte ou un jeu de test.

## Références

- [Créer des règles pour filtrer les e-mails — Aide Gmail](https://support.google.com/mail/answer/6579)
- [Opérateurs de recherche Gmail — Aide Gmail](https://support.google.com/mail/answer/7190)
- [Gestion des labels — Gmail API](https://developers.google.com/workspace/gmail/api/guides/labels)
- [Lister les messages — Gmail API](https://developers.google.com/workspace/gmail/api/guides/list-messages)
