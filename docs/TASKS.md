# Feuille de route Belloria

## À faire — canal Telegram

- [x] **BELL-024 — Reprise CRM des formulaires récents** (`completed`)
  88 formulaires dédupliqués et tracés dans 78 demandes ; clients confirmés et prestations prouvées ajoutés au CRM opérationnel.
- [x] **BELL-023 — Validation du premier passage réel** (`completed`)
  Premier candidat Tally réel traité sans doublon ; labels Gmail, fiche Notion de test et identifiants techniques concordants.
- [x] **BELL-022 — Passage planifié Gmail vers Notion** (`completed`)
  Filtres Gmail, passage Notion et rejeu validés ; tâche ChatGPT Work active toutes les heures, cadence minimale supportée.
- [x] **BELL-021 — Synchronisation GitHub complète** (`completed`)
  Publication de toutes les branches locales et règle durable imposant la représentativité local/GitHub.
- [x] **BELL-020 — CRM Belloria opérationnel** (`completed`)
  Nouveau CRM Notion séparé, conçu d'après les demandes Gmail réelles et centré sur les actions commerciales.
- [x] **BELL-018 — Connexion MCP à ChatGPT Work** (`completed`)
  Authentification OAuth MCP, découverte par ChatGPT et premier passage fictif sans mutation Gmail/Notion réelle.
- [ ] **BELL-016 — Bot Telegram privé sur Cloudflare** (`ready_for_review`)
  Worker, D1, MCP et transcription vocale déployés sans secrets ; tests locaux réussis et endpoint de santé confirmé.

## Voie Meta abandonnée

- [ ] **BELL-013 — Webhook et MCP serverless Belloria** (`ready_for_review`)
  Prototype Meta/Cloudflare validé puis remplacé par le canal Telegram dans BELL-016.
- [ ] **BELL-014 — Validation Meta avec numéro de test** (`blocked`)
  Arrêté avant soumission de l'examen Meta : aucun numéro transmis, aucun code mobile envoyé et aucune application créée.
- [ ] **BELL-015 — Préparation du passage en production WhatsApp** (`blocked`)
  Bloqué par l'abandon de la voie WhatsApp Cloud API officielle.

## Voie historique gelée

- [ ] **BELL-008 — Déploiement cloud du prototype** (`ready_for_review`)
  Configuration VM/Docker validée localement et conservée comme solution de repli ; déploiement distant suspendu au profit de BELL-010.
- [ ] **BELL-005 — Serveur MCP Belloria** (`ready_for_review`)
  Deux outils WhatsApp limités derrière une entrée MCP authentifiée, à adapter à l'exécution serverless dans BELL-013.
- [ ] **BELL-004 — Passerelle WhatsApp WAHA** (`ready_for_review`)
  Prototype local conservé comme adaptateur de repli ; aucune activation prévue.

## Terminé

- [x] **BELL-017 — Activation du bot Telegram de test**
  Bot privé activé, secrets et webhook configurés ; texte, idempotence, vocaux, quarantaine et nettoyage validés de bout en bout.
- [x] **BELL-012 — Adaptateur WhatsApp Cloud API**
  Envoi texte, récupération bornée des médias et normalisation des messages/statuts validés avec des doubles HTTP, sans secret ni appel réel.
- [x] **BELL-011 — Abstraction de la passerelle WhatsApp**
  Le MCP dépend d'une interface fournisseur neutre ; WAHA reste un adaptateur de repli testé et désactivé sans sélection explicite.
- [x] **BELL-010 — Architecture WhatsApp sans serveur**
  Cloudflare Workers et D1 retenus pour le webhook/MCP et l'idempotence ; contrat Meta vérifié localement sans compte ni déploiement réel.
- [x] **BELL-007 — Automatisation ChatGPT Work**
  Passage périodique testé localement et compte rendu soumis à confirmation.
- [x] **BELL-006 — Synchronisation du CRM Notion**
  Moteur local de rapprochement et d'idempotence validé, sans mutation du CRM réel.
- [x] **BELL-003 — Qualification des emails Gmail**
  File de candidats, sources, contrat Tally et reprise idempotente définis.
- [x] **BELL-002 — Modèle du CRM Notion**
  Deux bases reliées, cycle commercial, normalisation, déduplication et idempotence définis.
- [x] **BELL-009 — Autonomie Codex sécurisée**
  Écriture workspace, réseau et recherche web activés avec confirmations sensibles conservées.
- [x] **BELL-001 — Organisation du projet**
  Règles de travail, mémoire de contexte minimale et suivi des décisions installés.
