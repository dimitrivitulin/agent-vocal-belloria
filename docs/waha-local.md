# Prototype local WAHA NOWEB

Ce prototype valide le démarrage local de WAHA Core, la persistance de sa session et la livraison de webhooks signés. Il ne connecte aucun compte WhatsApp et n'envoie aucun message réel.

## Prérequis et secrets

- Docker Desktop avec Docker Compose ;
- Python 3.11 ou ultérieur pour les tests et la simulation ;
- un numéro WhatsApp de test distinct, uniquement lors d'un futur essai explicitement autorisé.

Copier `.env.example` vers `.env`, puis remplacer chaque valeur `change-me` par une chaîne aléatoire longue. `.env`, `.sessions/` et `.webhook-events/` sont ignorés par Git.

## Démarrage local

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up -d
docker compose ps
```

WAHA écoute sur `http://127.0.0.1:3000` et le récepteur sur `http://127.0.0.1:8080`. Les deux ports restent inaccessibles depuis les autres machines. WAHA utilise l'image sans navigateur et force `WHATSAPP_DEFAULT_ENGINE=NOWEB`. La session est montée dans `.sessions/` et survit à la recréation du conteneur.

Avant un usage durable, remplacer l'étiquette flottante `devlikeapro/waha:noweb` par une version validée et sauvegarder `.sessions/` de manière chiffrée.

## Simulation sans WhatsApp

Dans PowerShell, charger la clé du fichier local puis envoyer l'événement fictif :

```powershell
$env:WAHA_WEBHOOK_HMAC_KEY = (Get-Content .env | Where-Object { $_ -like 'WAHA_WEBHOOK_HMAC_KEY=*' }).Split('=', 2)[1]
python tools/simulate_webhook.py
Get-Content .webhook-events/events.ndjson
```

La réponse attendue est `{"status": "accepted"}` et une ligne JSON apparaît dans le journal. Le récepteur calcule HMAC-SHA512 sur le corps HTTP brut et compare `X-Webhook-Hmac` en temps constant. Une signature absente ou invalide renvoie `401` et n'écrit rien.

## Vérifications et reprise

```powershell
python -m unittest discover -s tests -v
docker compose --env-file .env.example config --quiet
docker compose restart
docker compose ps
```

Après redémarrage, `.sessions/` et `.webhook-events/events.ndjson` doivent être conservés. Consulter les erreurs avec `docker compose logs --tail 100 waha webhook-receiver`.

Pour arrêter sans effacer les données :

```powershell
docker compose down
```

Ne pas utiliser `docker compose down --volumes` comme procédure de nettoyage : la session WhatsApp est un secret critique et sa suppression doit être explicite.

## Limites et passage à BELL-005

- Le récepteur est un banc de test local, pas le serveur MCP ni un service de production.
- Le fichier NDJSON n'assure ni déduplication, ni rotation, ni confidentialité durable.
- L'API WAHA ne devra pas être exposée à Internet ; BELL-005 placera une API métier authentifiée devant elle.
- Un déploiement distant exigera HTTPS au reverse proxy, filtrage réseau, sauvegardes chiffrées, version d'image figée et rotation des secrets.
- `message.any` inclut les messages émis ; le futur traitement devra distinguer la source et rester idempotent.

Références officielles : [installation Docker](https://waha.devlike.pro/docs/how-to/install/), [moteurs et image NOWEB](https://waha.devlike.pro/docs/how-to/engines/), [configuration et webhooks globaux](https://waha.devlike.pro/docs/how-to/config/), [événements et signature HMAC](https://waha.devlike.pro/docs/how-to/events/), [sécurité](https://waha.devlike.pro/docs/how-to/security/).

