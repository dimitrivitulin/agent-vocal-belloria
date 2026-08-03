# BELL-010 — Architecture WhatsApp sans serveur

Statut: completed
Branche: `codex/bell-010-architecture-whatsapp-serverless`
Dernière mise à jour: 2026-08-03

## Objectif

Valider par un prototype local minimal que WhatsApp Cloud API et un hébergement serverless peuvent remplacer WAHA, puis figer les contrats, le stockage et la cible d’hébergement.

## Critères de réussite

- Le contrat webhook Meta couvre le challenge GET et la signature HMAC SHA-256 du corps brut.
- Un événement synthétique permet de démontrer l’identifiant d’idempotence sans compte Meta réel.
- La cible serverless et son stockage sont comparés à une alternative et consignés dans une décision.
- Les limites, secrets, reprise et responsabilités des lots suivants sont explicites.
- Aucun compte, numéro, message ou service distant réel n’est activé.

## Périmètre

- Cœur Python sans dépendance pour vérifier et extraire les événements Meta synthétiques.
- Tests unitaires du contrat et documentation d’architecture.
- Choix de la cible d’hébergement, sans déploiement.
- Aucun adaptateur d’envoi complet, média réel, webhook public ou configuration Meta.

## Fichiers concernés

- `belloria_cloud/__init__.py`
- `belloria_cloud/webhook.py`
- `tests/test_meta_webhook.py`
- `docs/whatsapp-serverless.md`
- `docs/decisions/006-architecture-whatsapp-serverless.md`
- `docs/PROJECT_CONTEXT.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Démarrer **BELL-011 — Abstraction de la passerelle WhatsApp** sans modifier encore le protocole MCP public.

## Résultat

Cloudflare Workers avec D1 est retenu ; le contrat Meta minimal est couvert par quatre tests synthétiques. Aucun compte, numéro, message ou service distant n'a été activé.

## Validations effectuées

- 33 tests unitaires réussis, dont 4 dédiés au webhook Meta.
- Challenge, signature SHA-256 sur corps brut et clés d'idempotence validés.
