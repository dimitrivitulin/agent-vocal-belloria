# Serveur MCP Belloria

Le serveur écoute localement sur `http://127.0.0.1:8000/mcp`. Chaque requête doit fournir `Authorization: Bearer <BELLORIA_MCP_TOKEN>`. Il transmet la clé WAHA dans `X-Api-Key`, sans jamais la révéler dans les réponses.

Deux outils seulement sont exposés :

- `whatsapp_session_status`, en lecture seule ;
- `whatsapp_send_text`, pour un numéro de 8 à 15 chiffres sans `+`, un texte de 1 à 2 000 caractères et `confirmed: true`.

L'envoi est une action externe : l'appelant doit obtenir une confirmation explicite portant sur le message exact avant de fournir `confirmed: true`. Sans ce champ, le serveur rejette l'appel avant WAHA. La session WAHA et son URL sont définies par l'environnement du serveur et ne font pas partie des arguments MCP.

## Validation locale

```powershell
python -m unittest discover -s tests -v
python -m py_compile belloria_mcp/server.py
docker compose --env-file .env.example config --quiet
```

Les tests remplacent le transport WAHA par un mock et ne contactent aucun service réel. Le prototype utilise un HTTP JSON-RPC local ; l'exposition distante, TLS et l'intégration OAuth restent hors périmètre et devront être traités avant ChatGPT Work.
