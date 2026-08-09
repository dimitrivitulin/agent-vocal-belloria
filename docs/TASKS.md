# Feuille de route Belloria

## Priorité active — agent commercial Telegram

Ordre recommandé : `BELL-027` → `BELL-028` → `BELL-029` → `BELL-030` → `BELL-033` → `BELL-031` → `BELL-032`.

- [x] **BELL-026 — Cadrage agent commercial Telegram** (`completed`)
  Architecture fonctionnelle, contexte prospect 360, référentiel commercial et lots de construction définis dans `docs/agent-commercial-telegram.md`.

- [x] **BELL-027 — Référentiel commercial Belloria** (`completed`)
  Construire et faire valider la source de vérité des prestations : formats, contenus, tarifs ou règles de calcul, minimums, options, logistique, capacité, délais, zones, preuves, objections, associations et ventes additionnelles pertinentes.
  **Terminé lorsque** l'agent peut recommander une prestation et expliquer son calcul sans inventer de prix, de disponibilité ni de contenu.
  Référentiel Notion de 26 fiches livré à partir du catalogue, des devis, des conversations, des factures et du CRM. Cocktail, Menu et Brunch sont validés ; winners, upsells, incompatibilité Charcu/Cocktail, écarts catalogue et règles suspendues sont tracés.

- [x] **BELL-028 — Contexte prospect 360** (`completed`)
  Réunir à la demande le formulaire, les échanges Gmail, la fiche CRM, les devis réellement envoyés, les factures `CLIENTS` 2026/2027, les événements confirmés et les conflits de date. Conserver la provenance, la fraîcheur et les incertitudes de chaque fait.
  **Terminé lorsque** un résumé unique restitue correctement identité, événement, besoin, budget, historique, engagement, situation financière et prochaine échéance sans mélanger deux soumissions Tally.
  Constructeur de faits sourcés livré avec contradictions, inconnues, chronologie et preuves financières strictes. Le cas réel de plusieurs clients Tally dans un même fil Gmail est couvert par la clé `messageId`.

- [x] **BELL-029 — Moteur de conversion et prochaine meilleure action** (`completed`)
  Évaluer adéquation, urgence, complétude, engagement et valeur ; recommander l'offre, les questions manquantes, les options utiles, la prochaine action et un brouillon personnalisé. Rendre les raisons et les incertitudes visibles.
  **Terminé lorsque** les scénarios représentatifs Belloria produisent une recommandation fondée sur le contexte et le référentiel, persuasive mais exacte, avec escalade humaine en cas de doute.
  Moteur déterministe livré avec diagnostic multi-dimensionnel, offres validées uniquement, options contextuelles limitées, questions bloquantes, actions, brouillons sûrs et escalade humaine explicite.

- [x] **BELL-030 — Agent conversationnel Telegram** (`completed`)
  Permettre en texte ou vocal : « mes priorités », « résume ce prospect », « que lui proposer ? », « prépare une réponse », « prépare le devis », « relance-le », « mon planning du jour » et « où en est le CA ? ». Conserver le passage horaire comme reprise de secours ; la voie rapide sous deux minutes relève de BELL-033.
  **Terminé lorsque** une conversation Telegram peut charger le bon contexte, proposer une action, obtenir la confirmation et exécuter uniquement l'action approuvée avec un compte rendu traçable.
  Cœur conversationnel, approbations D1, déploiement, aller-retour Telegram réel et six outils MCP validés. Le déclenchement interactif et la cible de latence sont isolés dans BELL-033 pour ne pas mêler contrat conversationnel et transport temps réel.

- [x] **BELL-033 — Voie rapide Telegram sous deux minutes** (`completed`)
  Répondre immédiatement au webhook, puis traiter les commandes couvertes depuis un instantané prospect minimal et temporaire dans D1. Utiliser `waitUntil` tant que le traitement reste sous 30 secondes, conserver le passage horaire comme reprise et n’ajouter une Queue qu’après mesure démontrant sa nécessité.
  **Terminé lorsque** une commande texte ou vocale représentative reçoit automatiquement une consultation ou une proposition traçable en moins de deux minutes, sans polling manuel, avec refus sûr si le contexte est absent, ambigu ou périmé.
  **Frontières** : BELL-030 reste propriétaire des intentions et confirmations ; BELL-031 des règles anti-perte et priorités métier ; BELL-032 des KPI commerciaux. BELL-033 mesure seulement les latences techniques et ne conserve ni corps d’email ni conversation client durable dans D1.
  Instantanés D1 temporaires, traitement `waitUntil`, tests texte/vocal et garde-fous déployés. L’aller-retour Telegram synthétique a répondu dans la même seconde après un webhook accusé en 191 ms ; les données de test ont été nettoyées.

- [x] **BELL-031 — Boucle anti-perte et suivi automatique** (`completed`)
  Détecter demandes sans réponse, relances échues, devis silencieux, acomptes attendus, événements proches ou passés et collisions avec une prestation confirmée. Générer le briefing Telegram et mettre à jour le CRM de façon idempotente.
  **Terminé lorsque** aucun prospect actif ne peut rester sans prochaine action datée et que les anomalies sont remontées sans doublon.
  Moteur déterministe et orchestrateur d'adaptation livrés avec priorités, corrections CRM atomiques, clés d'alertes stables et briefing Telegram dédupliqué. Les seuils sont documentés et 71 tests Python valident notamment le rejeu identique le lendemain.

- [x] **BELL-032 — Mesure et amélioration de la conversion** (`completed`)
  Mesurer délai de première réponse, passage demande→devis, devis→confirmation, montant moyen, relances nécessaires, motifs de perte et fiabilité des recommandations. Constituer un jeu de cas de référence pour comparer les évolutions de l'agent.
  **Terminé lorsque** Telegram et Notion montrent les indicateurs utiles et qu'une modification de prompt, règle ou référentiel peut être évaluée avant activation.
  Calcul déterministe livré avec populations explicites, preuves financières strictes, qualité des données, rendus Telegram/Notion sans effet externe et banc de non-régression avant activation.

## Principes non négociables

- Un montant Tally est une estimation, pas un devis.
- Le CA potentiel provient uniquement d'un devis réellement envoyé par email.
- Le CA effectif provient des factures présentes dans `CLIENTS` 2026/2027.
- Un email de présentation, un catalogue ou des photos ne valent pas devis.
- L'agent ne promet jamais une disponibilité sans contrôler le planning confirmé.
- L'agent ne modifie aucun autre dossier Notion que le CRM Belloria.
- Aucun email client n'est envoyé sans validation explicite du texte et du destinataire.
- La conversion recherchée repose sur la pertinence et la rapidité, pas sur des affirmations non prouvées ou des relances excessives.

## Fondations existantes

- [x] **BELL-046 — Registre d’actions externes et approbation durable** (`completed`)
  Créer le registre D1 immuable, la déduplication depuis une intention Telegram persistée, la présentation et la confirmation Telegram, le claim atomique et la consultation d'état, sans adaptateur fournisseur.
  **Terminé lorsque** une action passe de `pending` à `approved` puis `claimed`, expire sans approbation et conserve la preuve locale du contenu présenté et de la confirmation.
  Migration `external_actions`, source générique limitée à `telegram_command`, contenu canonique immuable, token, preuves Telegram et tests de rejeu/concurrence livrés. Les routes Actions GPT existantes restent inchangées.

- [x] **BELL-047.1 — Envoi Gmail durable** (`completed`)
  Remplacer l'envoi direct par une proposition `gmail_send` issue d'une commande Telegram persistée, approuvée dans Telegram et exécutée avec le seul `action_id`.
  **Terminé lorsque** `confirmed: true` ne peut plus envoyer Gmail directement, un dispatch est réservé avant l'appel fournisseur et les résultats `succeeded`, `failed` ou `unknown` sont persistés sans rejeu ambigu.
  Migration d'exécution, `Message-ID` de corrélation candidat, états terminaux immuables et tests de concurrence/rejeu livrés. BELL-047.2 reste nécessaire avant toute réconciliation Gmail.

- [ ] **BELL-047.2 — Réconciliation Gmail** (`pending`)
  Valider d'abord en conditions contrôlées la conservation et la recherche du `Message-ID`, puis seulement concevoir la résolution des actions Gmail `unknown`, sans capacité de renvoi automatique.

- [ ] **BELL-048 — Intégration Notion au registre d’actions** (`pending`)
  Raccorder les créations, mises à jour et archivages Notion au registre BELL-046, avec vérification de concurrence et traitement explicite des résultats incertains.
  **Terminé lorsque** aucune mutation Notion ne dépend plus seulement de `confirmed: true` et que les replays respectent l'état réellement lu dans Notion.

- [x] **BELL-045 — Transitions SMS Brevo monotones** (`completed`)
  Empêcher les callbacks Brevo tardifs ou répétés de faire régresser l'état SMS D1, en conservant les rapprochements par `messageId` et tag Tally.
  **Terminé lorsque** `delivered` est terminal, les échecs suivent une politique explicite, les transitions refusées sont des no-op SQL et tous les scénarios de rejeu sont couverts par les tests Worker.
  Les requêtes D1 imposent désormais la progression `pending → accepted → failed/delivered`, autorisent une preuve `failed → delivered` et refusent toute régression ou répétition sans toucher l'horodatage ; 36 tests Worker sont validés.

- [x] **BELL-044 — Groupe de notifications Telegram** (`completed`)
  Publier les résumés Tally dans un groupe Telegram interne facultatif tout en conservant le chat privé comme unique origine des commandes et confirmations.
  **Terminé lorsque** les membres du groupe reçoivent la notification Tally, sans que leurs messages puissent déclencher une commande du bot.
  Secret de groupe configuré dans Cloudflare, Worker déployé (version `a935c766-cf0e-463b-92d8-aea17daee302`) et webhook rétabli ; les 31 tests Worker valident le routage sans ouvrir les commandes au groupe.

- [x] **BELL-043 — Détails Tally dans Telegram** (`completed`)
  Remplacer l'accusé Telegram générique par un résumé immédiat des champs métier du formulaire Tally, sans coordonnées du prospect et sans doublon au rejeu.
  **Terminé lorsque** une soumission contrôlée affiche dans le chat privé les détails non sensibles attendus, une seule fois.
  Worker déployé (version `43590b58-fa74-48a9-ae76-e096466fae05`), résumé et masquage des coordonnées validés par 30 tests et une soumission réelle ; l'email de test a été placé dans la corbeille, sans ligne correspondante dans Notion ou D1.

- [x] **BELL-042 — Chargement du contexte à la demande** (`completed`)
  Formaliser dans les règles du dépôt un manifeste par lot, un skill initial au maximum et des MCP ou connecteurs utilisés uniquement lorsqu'une dépendance concrète l'exige.
  **Terminé lorsque** chaque tâche commence avec le contexte local minimal, déclare ses fichiers, skills, MCP et hors-périmètre, puis charge progressivement les ressources selon une matrice de déclenchement explicite.
  Politique, matrice de déclenchement et manifeste `Contexte autorisé` ajoutés ; aucun code applicatif, service externe ou paramètre global Codex n'a été modifié.

- [x] **BELL-041 — Déploiement et validation réelle du SMS Tally** (`completed`)
  Déployer en production le modèle SMS chaleureux préparé dans BELL-037, puis réaliser une soumission Tally contrôlée vers un numéro Belloria. Vérifier les valeurs `{prenom}`, `{evenement}` et `{date}`, la livraison Brevo, le coût d'un seul segment, le callback D1 et l'absence de second SMS au rejeu.
  **Terminé lorsque** le parcours Tally→Worker→Brevo est validé de bout en bout avec un SMS reçu conforme, un état `delivered`, aucun doublon et aucune donnée ou clé de test résiduelle.
  Deux SMS contrôlés ont atteint `Délivré` dans Brevo et D1 `delivered`. La course de callback est couverte par le tag Tally ; le rejeu exact est validé par les tests Worker. Les six soumissions BELL-041 et les trois essais BELL-037 ont été retirés de Tally et D1 après contrôle, sans toucher aux demandes réelles.

- [ ] **BELL-040 — Réduction du passage planifié Work** (`pending`)
  Après validation des déclenchements événementiels, retirer au passage horaire le traitement commercial nominal et réduire progressivement sa fréquence : quatre heures, puis contrôle quotidien selon les mesures. Le conserver pour reprendre les soumissions, analyses, SMS ou commandes bloqués et produire le briefing anti-perte.
  **Terminé lorsque** les demandes nominales sont traitées par événement, que les événements abandonnés sont repris automatiquement et que la baisse de fréquence réduit la consommation sans régression de délai ni perte.

- [ ] **BELL-039 — GPT Belloria, assistant commercial** (`in_progress`)
  Créer un GPT privé utilisable dans ChatGPT sur téléphone, nourri du contexte commercial Belloria, capable de qualifier un prospect, recommander une action, préparer un email et guider la mise à jour du CRM. Les actions externes restent explicitement confirmées.
  GPT privé et passerelle d'Actions publiés ; Gmail est activé et testé. La connexion Notion est créée et le CRM partagé, mais l'API Notion n'expose pas encore la source de données nécessaire aux créations CRM.
  **Terminé lorsque** le GPT applique les offres et règles validées, ne fabrique aucune promesse et peut accompagner une action commerciale contrôlée à partir du contexte fourni, avec les connexions Gmail/Notion activées.

- [ ] **BELL-038 — Analyse ChatGPT Work déclenchée depuis Telegram** (`pending`)
  Déclencher à la demande l'analyse d'une soumission Tally ou d'un prospect depuis Telegram, sans attendre le passage planifié, puis restituer le résultat dans le même canal. Utiliser un identifiant technique et conserver le passage planifié uniquement comme reprise anti-perte.
  **Terminé lorsque** `ANALYSE DERNIÈRE DEMANDE` lance une analyse Tally→contexte 360→recommandation et répond sur Telegram, avec déduplication, suivi d'échec et continuité du contexte prospect.

- [x] **BELL-037 — Accusé SMS transactionnel immédiat** (`completed`)
  Envoyer après une nouvelle soumission Tally un SMS déterministe, personnalisé uniquement avec les faits structurés du formulaire, sans prix, disponibilité ni contenu inventé. Prévoir information du prospect, validation du numéro, statut de livraison, idempotence et modèle générique en cas d'ambiguïté.
  **Terminé lorsque** un prospect reçoit en quelques secondes un accusé d'un seul segment, qu'un rejeu ne renvoie rien et qu'un échec SMS reste visible sans perdre la demande.
  Le modèle court `{prenom}` / `{evenement}` / `{date}` est déployé dans la version Worker `977401bc-8f53-4e7d-ac4d-165e031e22a6`. Les soumissions contrôlées ont été livrées en un segment, les callbacks D1 validés et les essais supprimés après vérification.

- [x] **BELL-036 — Notification Telegram immédiate des demandes Tally** (`completed`)
  Envoyer sans coût supplémentaire un accusé Telegram dès l'ingestion du webhook, avec D1 comme file anti-perte et le passage horaire comme traitement CRM.
  **Terminé lorsque** une soumission contrôlée est signalée en moins d'une minute, qu'un rejeu ne renvoie pas de seconde notification et que le traitement horaire reste intact.
  Worker déployé, 22 tests validés et soumission `ArA1Dzk` signalée, synchronisée puis acquittée. Le second acquittement est resté sans effet, la confirmation finale Telegram a été envoyée et la fiche CRM de test retirée.

- [x] **BELL-035 — Intégration du plugin Tally dans ChatGPT Work** (`completed`)
  Utiliser le connecteur Tally pour lire une soumission ciblée, avec le webhook/D1 comme déclencheur, registre anti-perte et repli. Réduire l'exposition du payload D1 par défaut et empêcher toute modification de formulaire depuis la tâche automatisée.
  **Terminé lorsque** une soumission contrôlée traverse Tally→Work→Notion→acquittement D1, que le rejeu reste sans doublon et que l'indisponibilité du connecteur utilise le repli ciblé sans repasser par Gmail.
  Contrat Worker déployé, tâche Work actualisée et connecteur Belloria rafraîchi. `DqAg2Yl` a été lu par Tally, synchronisé puis acquitté ; le rejeu n'a produit aucune nouvelle mutation.

- [x] **BELL-034 — Réception directe des formulaires Tally** (`completed`)
  Recevoir le JSON signé de Tally dans le Worker, le dédupliquer dans D1 et l'exposer au passage ChatGPT Work par MCP. Gmail reste la source des emails directs et de Mariages.net, mais n'est plus la voie d'entrée des formulaires Tally.
  **Terminé lorsque** la migration et le Worker sont déployés, le webhook Tally réel est connecté et une soumission contrôlée traverse la file jusqu'au CRM sans notification Gmail.
  Route signée déployée, migration D1 appliquée et soumission réelle `DqAg2Yl` reçue en attente sans Gmail.

- [x] **BELL-016 — Bot Telegram privé sur Cloudflare** (`completed`)
  Transport privé, commandes texte/vocales, D1, MCP et transcription déployés puis validés par l’aller-retour réel de BELL-030.
- [x] **BELL-025 — Séparation clients actifs et anciens** (`completed`)
  Dates passées non honorées classées en perdu ; vues `Clients en cours` et `Clients anciens` créées et vérifiées.
- [x] **BELL-024 — Reprise CRM des formulaires récents** (`completed`)
  88 formulaires dédupliqués et tracés dans 78 demandes ; clients confirmés et prestations prouvées ajoutés au CRM opérationnel.
- [x] **BELL-023 — Validation du premier passage réel** (`completed`)
  Premier candidat Tally réel traité sans doublon ; labels Gmail, fiche Notion de test et identifiants techniques concordants.
- [x] **BELL-022 — Passage planifié Gmail vers Notion** (`completed`)
  Filtres Gmail, passage Notion et rejeu validés ; tâche ChatGPT Work active toutes les heures.
- [x] **BELL-021 — Synchronisation GitHub complète** (`completed`)
  Publication des branches locales et règle durable de représentativité local/GitHub.
- [x] **BELL-020 — CRM Belloria opérationnel** (`completed`)
  CRM Notion séparé, conçu d'après les demandes Gmail réelles et centré sur les actions commerciales.
- [x] **BELL-018 — Connexion MCP à ChatGPT Work** (`completed`)
  Authentification OAuth MCP, découverte par ChatGPT et premier passage fictif sans mutation réelle.

## Voies abandonnées ou gelées

Les lots Meta, WhatsApp Cloud API, WAHA et VM restent uniquement dans l'historique Git. Ils ne font plus partie du backlog actif et ne doivent pas être réouverts sans nouvelle décision d'architecture.

## Lots terminés antérieurs

- [x] **BELL-017 — Activation du bot Telegram de test**
- [x] **BELL-012 — Adaptateur WhatsApp Cloud API**
- [x] **BELL-011 — Abstraction de la passerelle WhatsApp**
- [x] **BELL-010 — Architecture WhatsApp sans serveur**
- [x] **BELL-007 — Automatisation ChatGPT Work**
- [x] **BELL-006 — Synchronisation du CRM Notion**
- [x] **BELL-003 — Qualification des emails Gmail**
- [x] **BELL-002 — Modèle du CRM Notion**
- [x] **BELL-009 — Autonomie Codex sécurisée**
- [x] **BELL-001 — Organisation du projet**
