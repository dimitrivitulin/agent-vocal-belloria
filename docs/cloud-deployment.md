# Déploiement cloud du prototype

Ce runbook prépare une VM Ubuntu ARM64 persistante (par exemple OCI Ampere A1) sans activer de compte WhatsApp réel. Seuls SSH, HTTP et HTTPS sont ouverts dans le pare-feu cloud. WAHA reste inaccessible depuis Internet ; seul le MCP traverse Caddy en HTTPS et exige son jeton Bearer.

## Prérequis

- une VM ARM64 avec au moins 2 vCPU et 4 Go de RAM, Docker Engine et le plugin Compose ;
- une IP publique réservée et un nom DNS `A` pointant vers elle ;
- règles entrantes TCP 22 limitées aux adresses d'administration, puis 80 et 443 publiques ;
- le dépôt copié dans un répertoire réservé à l'utilisateur de service.

Ne jamais ouvrir 3000, 8000 ou 8080 dans OCI ou le pare-feu de la VM. Le port 3000 est lié à `127.0.0.1` uniquement pour l'administration par tunnel SSH.

## Préparer et vérifier

```bash
cp .env.cloud.example .env.cloud
chmod 600 .env.cloud
# Remplacer le domaine, l'email et tous les secrets change-me.
python3 tools/check_cloud_config.py .env.cloud
docker compose --env-file .env.cloud -f compose.cloud.yaml config --quiet
```

Générer séparément chaque secret avec un générateur cryptographique. La clé `WAHA_API_KEY` doit contenir au moins 64 caractères alphanumériques ; les autres secrets doivent représenter au moins 32 octets d'entropie. Le tag ARM64 WAHA est figé sur `noweb-arm-2026.7.1`; sur x86_64, utiliser `noweb-2026.7.1`. Tester toute montée de version avant de modifier ce tag.

## Démarrer sans session réelle

```bash
docker compose --env-file .env.cloud -f compose.cloud.yaml build
docker compose --env-file .env.cloud -f compose.cloud.yaml up -d
docker compose --env-file .env.cloud -f compose.cloud.yaml ps
curl -fsS https://mcp.example.com/health
```

Remplacer le domaine dans la dernière commande. Vérifier qu'une requête `/mcp` sans jeton renvoie `401`, que les ports 3000, 8000 et 8080 ne sont pas joignables depuis Internet et que les quatre conteneurs restent stables après redémarrage de la VM.

Pour ouvrir temporairement le tableau de bord WAHA depuis le poste d'administration :

```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@adresse-de-la-vm
```

Visiter ensuite `http://127.0.0.1:3000`. L'association du numéro de test par QR code constitue une activation externe et exige une confirmation explicite.

## Exploitation et reprise

- Sauvegarder hors VM les volumes `belloria-cloud_waha_sessions` et `belloria-cloud_caddy_data`, chiffrés et avec accès restreint.
- Ne jamais copier `.env.cloud`, les sessions ou les événements dans Git ou dans un journal de support.
- Consulter les journaux avec `docker compose --env-file .env.cloud -f compose.cloud.yaml logs --since 15m`, sans les publier tels quels.
- Pour revenir à la version précédente, restaurer le tag testé dans `.env.cloud`, exécuter `pull` puis `up -d`; ne pas supprimer le volume de sessions.
- Tester trimestriellement la restauration sur une VM isolée et renouveler immédiatement les secrets suspectés compromis.

## Critères avant activation

L'activation reste bloquée tant que le DNS/TLS, le redémarrage, la sauvegarde-restauration et le refus d'accès direct aux ports internes ne sont pas validés. Utiliser exclusivement un numéro de test lors de la première association et conserver l'envoi de texte derrière la confirmation explicite du MCP.

Références : [déploiement Docker WAHA](https://waha.devlike.pro/blog/waha-on-docker/), [images et moteur NOWEB](https://waha.devlike.pro/docs/how-to/engines/), [configuration HTTPS WAHA](https://waha.devlike.pro/docs/how-to/config/) et [pare-feu OCI](https://docs.oracle.com/en/learn/java_app_ampere_oci/).
