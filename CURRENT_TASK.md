# BELL-005 — Serveur MCP Belloria

Statut: ready_for_review
Branche: `codex/bell-005-serveur-mcp-belloria`
Dernière mise à jour: 2026-08-03

## Objectif

Masquer WAHA derrière un serveur MCP authentifié qui n'expose que l'état de session et l'envoi de texte strictement validé.

## Critères de réussite

- L'entrée MCP exige un jeton Bearer comparé en temps constant.
- Seuls `whatsapp_session_status` et `whatsapp_send_text` sont publiés.
- L'URL, la clé et la session WAHA ne sont jamais pilotables par l'appelant.
- Le téléphone et le texte sont validés avant toute requête WAHA.
- Les tests n'accèdent ni à WAHA ni à WhatsApp réels.

## Périmètre

- Serveur HTTP JSON-RPC MCP minimal et client WAHA interne.
- Authentification, schémas d'outils et tests unitaires.
- Intégration Compose locale et documentation d'exploitation.
- Aucun compte connecté, envoi réel ou déploiement distant.

## Fichiers concernés

- `compose.yaml`
- `.env.example`
- `.gitignore`
- `belloria_mcp/server.py`
- `tests/test_mcp_server.py`
- `docs/mcp-server.md`
- `docs/decisions/005-serveur-mcp-belloria.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Validations effectuées

- 10 tests HTTP/HMAC/MCP réussis, sans accès à WAHA ou WhatsApp.
- Compilation Python et `git diff --check` réussis.
- Examen du périmètre et recherche de secrets réussis (placeholders et clés de test uniquement).
- Validation Docker Compose non exécutée, Docker absent de l'environnement.

## Prochaine action

Sur un hôte Docker, valider Compose et le démarrage local sans connecter de compte WhatsApp.
