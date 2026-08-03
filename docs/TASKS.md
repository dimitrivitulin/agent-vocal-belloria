# Feuille de route Belloria

## À faire — migration sans VM

- [ ] **BELL-013 — Webhook et MCP serverless Belloria** (`ready_for_review`)
  Worker, D1, reprises, MCP authentifié et runbook validés localement ; création des ressources distantes reportée à BELL-014 après confirmation.
- [ ] **BELL-014 — Validation Meta avec numéro de test** (`pending`)
  Configurer l'application Meta de test, valider texte et vocal de bout en bout et vérifier qu'aucun numéro Belloria réel ni message client n'est utilisé.
- [ ] **BELL-015 — Préparation du passage en production WhatsApp** (`pending`)
  Documenter la vérification Meta, le numéro cible, les modèles, les coûts, le consentement et le retour arrière, sans migrer le numéro avant confirmation.

## Voie historique gelée

- [ ] **BELL-008 — Déploiement cloud du prototype** (`ready_for_review`)
  Configuration VM/Docker validée localement et conservée comme solution de repli ; déploiement distant suspendu au profit de BELL-010.
- [ ] **BELL-005 — Serveur MCP Belloria** (`ready_for_review`)
  Deux outils WhatsApp limités derrière une entrée MCP authentifiée, à adapter à l'exécution serverless dans BELL-013.
- [ ] **BELL-004 — Passerelle WhatsApp WAHA** (`ready_for_review`)
  Prototype local conservé comme adaptateur de repli ; aucune activation prévue.

## Terminé

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
