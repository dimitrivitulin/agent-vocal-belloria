# Serveur MCP Belloria

Le serveur écoute localement sur `http://127.0.0.1:8000/mcp`. Chaque requête doit fournir `Authorization: Bearer <BELLORIA_MCP_TOKEN>`. Sa surface métier dépend de l'interface `WhatsAppGateway`, et non d'une API fournisseur.

Deux outils seulement sont exposés :

- `whatsapp_session_status`, en lecture seule ;
- `whatsapp_send_text`, pour un numéro de 8 à 15 chiffres sans `+`, un texte de 1 à 2 000 caractères et `confirmed: true`.

L'envoi est une action externe : l'appelant doit obtenir une confirmation explicite portant sur le message exact avant de fournir `confirmed: true`. Sans ce champ, le serveur rejette l'appel avant la passerelle. La configuration du fournisseur ne fait pas partie des arguments MCP.

## Sélection du fournisseur

Aucun fournisseur n'est actif par défaut. Le démarrage exige une sélection explicite. `WHATSAPP_PROVIDER=waha` active l'adaptateur de repli historique, qui lit `WAHA_BASE_URL`, `WAHA_API_KEY` et `WAHA_SESSION`. Les configurations Docker historiques déclarent ce choix explicitement, mais restent gelées et ne sont pas déployées. L'adaptateur WhatsApp Cloud API relève de BELL-012.

## Validation locale

```powershell
python -m unittest discover -s tests -v
python -m py_compile belloria_mcp/server.py
docker compose --env-file .env.example config --quiet
```

Les tests remplacent la passerelle par un double et testent l'adaptateur WAHA sans réseau. Ils ne contactent aucun service réel. Le prototype utilise un HTTP JSON-RPC local ; l'exposition distante, TLS et l'intégration OAuth restent hors périmètre et devront être traités avant ChatGPT Work.
