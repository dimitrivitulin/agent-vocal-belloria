# BELL-012 — Adaptateur WhatsApp Cloud API

Statut: completed
Branche: `codex/bell-012-adaptateur-whatsapp-cloud-api`
Dernière mise à jour: 2026-08-03

## Objectif

Implémenter l'adaptateur Meta sans appel réel : envoi texte, récupération bornée des médias et normalisation des événements webhook.

## Critères de réussite

- `WHATSAPP_PROVIDER=meta` exige uniquement des secrets/configurations explicites.
- L'envoi texte et le téléchargement média sont couverts par des doubles HTTP.
- Les médias dépassant la taille ou le type autorisé sont rejetés.
- Messages et statuts Meta sont normalisés sans données implicites.
- Le MCP public conserve ses deux outils et aucun service réel n'est contacté.

## Fichiers concernés

- `belloria_mcp/gateway.py`
- `belloria_cloud/webhook.py`
- `tests/test_mcp_server.py`
- `tests/test_meta_webhook.py`
- `.env.example`
- `docs/mcp-server.md`
- `docs/whatsapp-serverless.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Implémenter ensuite **BELL-013 — Webhook et MCP serverless Belloria** sur Cloudflare Workers avec D1.

## Résultat

L'adaptateur Meta envoie le texte, récupère les médias HTTPS avec limite de taille/type et normalise les messages et statuts utiles derrière des doubles HTTP.

## Validations effectuées

- 40 tests unitaires et compilation Python réussis ; aucun service réel contacté.
- `git diff --check` réussi et diff limité au lot BELL-012.
