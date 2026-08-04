# Feuille de route Belloria

## Priorité active — agent commercial Telegram

Ordre recommandé : `BELL-027` → `BELL-028` → `BELL-029` → `BELL-030` → `BELL-031` → `BELL-032`.

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

- [ ] **BELL-030 — Agent conversationnel Telegram** (`pending`)
  Permettre en texte ou vocal : « mes priorités », « résume ce prospect », « que lui proposer ? », « prépare une réponse », « prépare le devis », « relance-le », « mon planning du jour » et « où en est le CA ? ». Réduire la latence cible à moins de deux minutes ; conserver le passage horaire comme reprise de secours.
  **Terminé lorsque** une conversation Telegram peut charger le bon contexte, proposer une action, obtenir la confirmation et exécuter uniquement l'action approuvée avec un compte rendu traçable.

- [ ] **BELL-031 — Boucle anti-perte et suivi automatique** (`pending`)
  Détecter demandes sans réponse, relances échues, devis silencieux, acomptes attendus, événements proches ou passés et collisions avec une prestation confirmée. Générer le briefing Telegram et mettre à jour le CRM de façon idempotente.
  **Terminé lorsque** aucun prospect actif ne peut rester sans prochaine action datée et que les anomalies sont remontées sans doublon.

- [ ] **BELL-032 — Mesure et amélioration de la conversion** (`pending`)
  Mesurer délai de première réponse, passage demande→devis, devis→confirmation, montant moyen, relances nécessaires, motifs de perte et fiabilité des recommandations. Constituer un jeu de cas de référence pour comparer les évolutions de l'agent.
  **Terminé lorsque** Telegram et Notion montrent les indicateurs utiles et qu'une modification de prompt, règle ou référentiel peut être évaluée avant activation.

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

- [ ] **BELL-016 — Bot Telegram privé sur Cloudflare** (`ready_for_review`)
  Transport privé, commandes texte/vocales, D1, MCP et transcription déjà déployés. À clôturer comme fondation technique avant la validation de `BELL-030`.
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
