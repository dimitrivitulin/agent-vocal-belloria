# BELL-049 — Envoi SMS interne depuis Codex

Statut: completed
Branche: `codex/bell-049-internal-sms`
Dernière mise à jour: 2026-08-15

## Objectif

Permettre à Codex de préparer puis d'envoyer un SMS commercial ponctuel via le Worker et Brevo, après validation explicite dans la conversation, sans réutiliser le flux transactionnel automatique Tally.

## Contexte autorisé

- Domaine : Worker Cloudflare, D1, Brevo et outil local interne.
- Fichiers initiaux : route Worker, registre `external_actions`, migrations D1, tests Worker/D1, contrat OpenAPI, configuration Wrangler et scripts npm proches.
- Skill requis : Cloudflare.
- MCP ou connecteur requis : Cloudflare/Wrangler pour la migration et le déploiement ; documentation officielle Brevo uniquement pour vérifier le champ SMS marketing. Aucun accès Gmail, Notion, Tally ou Brevo direct.
- Hors périmètre : modification du flux SMS transactionnel Tally, envoi réel pendant les tests, CRM, email, Telegram, WhatsApp/Meta et refactor général.

## Critères de sortie

- Un outil local Codex permet de créer une proposition SMS marketing avec consentement déclaré, puis de l'exécuter explicitement.
- Le Worker protège cette voie par un secret distinct, conserve l'action et son résultat de façon idempotente, puis utilise Brevo avec le type marketing.
- Le code, les tests, la migration et le contrat sont validés ; aucun client réel n'est contacté pendant ce lot.

## Garde de sécurité

- La validation humaine du texte, du destinataire et du consentement précède l'exécution ; l'outil exige une confirmation explicite.
- Les secrets restent dans les secrets Worker et dans une configuration locale ignorée par Git.
- Une erreur ou un résultat fournisseur incertain ne doit jamais déclencher un renvoi automatique.

## Résultat

- La route interne protégée `/internal/codex-sms` permet de proposer, relire, puis exécuter un SMS marketing Brevo depuis Codex avec le secret Worker distinct `CODEX_SMS_TOKEN`.
- Chaque action garde son texte, destinataire, référence de consentement et résultat ; les rejoues sont idempotents et tout résultat ambigu reste `unknown` sans nouvel envoi.
- Le script `npm run sms:codex -- propose|send|status` est prêt ; `send` exige `--confirm` après validation humaine du message exact.
- La migration D1 `0010_codex_sms_actions.sql` est appliquée en production et le Worker est déployé (version `d5e5f1f4-6536-45e7-951d-6c5df4070a7e`).
- Aucun SMS client ni aucune proposition réelle n'ont été envoyés pendant le lot.

## Validation

- `npm.cmd run test:worker` : 50 tests réussis.
- Runtime Python Codex : 80 tests de migrations réussis.
- `npm.cmd run sms:codex -- help` réussi ; sonde distante volontairement invalide rejetée avec `invalid_content`, sans appel Brevo.
- `git diff --check` réussi.

## Prochaine action

- Lors d'une relance, présenter d'abord le SMS exact, vérifier le consentement, puis utiliser la commande `propose` et attendre l'accord avant `send --confirm`.
