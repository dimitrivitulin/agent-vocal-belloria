# 004 — Frontière locale de la passerelle WhatsApp

Date: 2026-08-03
Statut: acceptée

## Contexte

WAHA gère une session WhatsApp sensible et expose une API beaucoup plus large que les besoins de Belloria. Le prototype doit vérifier la persistance et les webhooks sans faire dépendre le futur agent de cette API ni exposer WAHA sur le réseau.

## Décision

Le prototype exécute WAHA Core avec le moteur NOWEB dans Docker Compose. L'API et le récepteur de test sont publiés uniquement sur la boucle locale. Les sessions sont persistées hors Git, les secrets viennent de `.env` et chaque webhook est authentifié par HMAC-SHA512 avant journalisation.

WAHA reste une dépendance interne. Le futur serveur MCP Belloria sera l'unique frontière métier exposée et n'offrira qu'un sous-ensemble d'actions WhatsApp.

## Conséquences

- Un redémarrage de conteneur ne requiert pas nécessairement un nouveau QR code.
- Les webhooks falsifiés ou altérés sont rejetés avant traitement.
- La surface WAHA n'est pas directement accessible depuis Internet.
- Les données de session et d'événements exigent sauvegarde, contrôle d'accès et suppression explicite.
- Le tag d'image flottant est toléré pour l'essai local mais devra être figé avant le déploiement cloud.

