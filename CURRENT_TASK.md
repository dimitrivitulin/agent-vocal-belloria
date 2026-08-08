# BELL-039 — GPT Belloria, assistant commercial

Statut: in_progress
Branche: `codex/bell-039-gpt-commercial`
Dernière mise à jour: 2026-08-08

## Objectif

Créer un GPT personnalisé accessible dans ChatGPT sur téléphone, avec le contexte commercial Belloria et les règles nécessaires pour qualifier un prospect, recommander une action, envoyer un email confirmé et gérer le CRM.

## Contexte autorisé

- Domaine : configuration d’un GPT ChatGPT, Worker Cloudflare, contrat d’actions sécurisé et accès Gmail/Notion.
- Fichiers initiaux : `CURRENT_TASK.md`, `docs/TASKS.md`, `docs/PROJECT_CONTEXT.md`, `worker/src/index.js`, `wrangler.jsonc`, contrat MCP et documentation commerciale/CRM directement référencée.
- Skill requis : `openai-docs` pour vérifier les capacités et limites actuelles des GPT personnalisés et de leurs actions.
- MCP requis : Chrome Colibri pour la configuration du GPT ; aucun accès Gmail/Notion réel pendant les tests locaux.
- Hors périmètre : déclenchement automatique d’un GPT depuis un webhook, envoi automatique sans confirmation explicite, secrets réels dans Git, API OpenAI payante.

## Périmètre

- Constituer le contexte et les instructions du GPT Belloria : rôle, ton, offres validées, qualification, CRM, préparation d’email et garde-fous.
- Créer le GPT privé dans ChatGPT et y charger la base de connaissance adaptée.
- Préparer le contrat d’actions futur pour la lecture du dernier formulaire et les mutations explicitement confirmées.
- Exposer des Actions GPT sécurisées permettant la lecture et l’envoi d’emails confirmés, ainsi que la création, mise à jour et archivage confirmés des fiches CRM Notion.

## Critères de réussite

- Le GPT répond comme un assistant commercial Belloria, sans inventer de prix, disponibilité ni promesse.
- Il peut conduire une analyse complète à partir d’informations fournies, envoyer un email confirmé et gérer le CRM après confirmation.
- Le GPT reste privé et exploitable sur téléphone ; les actions externes sont explicitement confirmées.

## Résultat intermédiaire

- GPT privé `Belloria — Assistant commercial` créé, avec les référentiels commercial, conversion, prospect 360 et CRM chargés ; accès téléphone prêt.
- Passerelle d'Actions ajoutée et déployée au Worker (version `50dce58f-e0b7-4d09-8221-a49c8c1d65ec`) : recherche Gmail en lecture seule, recherche/lecture Notion, mise à jour Notion avec confirmation explicite et jeton dédié.
- Gmail OAuth est configuré et testé en lecture depuis le Worker ; l'Action GPT privée est publiée avec une clé Bearer dédiée. L'envoi reste conditionné à la confirmation explicite.
- La connexion Notion `Belloria GPT — CRM` est créée, avec lecture, insertion et mise à jour activées et le CRM partagé. L'API Notion ne retourne pas encore la base partagée, donc la création CRM reste désactivée tant que son identifiant de source n'est pas exposé.

## Validation

- Tests Worker : 35 réussis le 2026-08-08 ; la surface OpenAPI, l'authentification, la lecture Gmail sans envoi et le refus de mutation CRM sans confirmation sont couverts.
- `git diff --check` est valide.
