# BELL-048 — Intégration Notion au registre d’actions

Statut: blocked
Branche: `codex/bell-048-notion-action-registry`
Dernière mise à jour: 2026-08-12

## Objectif

Raccorder les créations, mises à jour et archivages Notion des Actions GPT au registre BELL-046, afin qu’aucune mutation ne repose uniquement sur `confirmed: true`.

## Contexte autorisé

- Domaine : code local Worker, migration D1, contrat OpenAPI et tests Worker/D1.
- Fichiers initiaux : routes Actions GPT, registre `external_actions`, migrations D1 et tests associés.
- Skill requis : aucun au démarrage.
- MCP ou connecteur requis : configuration Cloudflare et CLI Wrangler pour appliquer la migration D1 et déployer ; les tests doublent Notion et Telegram. Un accès Notion en lecture ne sera envisagé que pour une validation ultérieure nécessaire.
- Hors périmètre : BELL-047.2/047.3, OAuth Google, envoi Gmail, modifications réelles du CRM Notion, Brevo, Tally, WAHA/Meta et refactor général.

## Critères de sortie

- Les mutations Notion produisent une proposition durable issue d’une commande Telegram, approuvée avant exécution.
- L’exécution relit le contenu immuable du registre, le réserve atomiquement et persiste un résultat terminal sans rejeu ambigu.
- Les tests Worker/D1, le contrôle du diff et l’examen de périmètre réussissent.

## Garde de sécurité

- L’autorisation explicite du 2026-08-12 couvre l’application de la migration D1 et le déploiement Worker ; aucune mutation CRM Notion réelle ne sera exécutée.
- Les contenus de mutation validés restent immuables entre leur présentation Telegram et leur exécution.

## État initial

- BELL-046 fournit le registre `external_actions`, l’approbation Telegram et le claim atomique.
- BELL-047.1 applique déjà ce modèle à l’envoi Gmail ; les mutations Notion restent directes sur `confirmed: true`.
- BELL-039 a une connexion Notion créée, mais sa source CRM n’est pas encore exposée par l’API pour les créations ; ce lot doit conserver un comportement sûr en cas d’indisponibilité fournisseur.

## Prochaine action

- Rétablir une authentification Cloudflare utilisable par Wrangler (jeton API local non versionné ou connexion CLI explicitement autorisée), puis appliquer `0009` et déployer sans exécuter de mutation CRM Notion réelle.

## Résultat

- Les routes Notion `POST`, `PATCH` et `DELETE /gpt-actions/notion/page` créent désormais des propositions immuables liées à une commande Telegram persistée ; `confirmed: true` n’est plus accepté.
- `POST /gpt-actions/notion/execute` ne reçoit que `action_id`, relit la cible et le contenu depuis D1, réserve le dispatch et conserve les états `succeeded`, `failed` ou `unknown` sans rejeu ambigu.
- La migration `0009_notion_external_action_execution.sql` ajoute la ressource fournisseur Notion au résultat immuable et étend les transitions D1 aux succès Notion.

## Validation

- `npm.cmd run test:worker` : 47 tests réussis.
- Runtime Python fourni par Codex : 79 tests réussis, dont les migrations D1.
- Aucun appel Notion réel, aucune mutation CRM et aucun déploiement effectués.
- Wrangler ne reçoit aucun `CLOUDFLARE_API_TOKEN` dans son environnement non interactif ; aucune migration D1 ni aucun déploiement n’a donc démarré.
