# BELL-008 — Déploiement cloud du prototype

Statut: ready_for_review
Branche: `codex/bell-008-deploiement-cloud-prototype`
Dernière mise à jour: 2026-08-03

## Objectif

Préparer un déploiement reproductible et sécurisé de WAHA et du MCP Belloria sur une VM persistante, sans activer de service réel.

## Critères de réussite

- Seuls HTTP/HTTPS sont exposés par le proxy ; WAHA et les services internes restent privés.
- TLS, persistance, secrets et image WAHA versionnée sont configurés.
- Un contrôle local rejette les secrets d'exemple et les tags WAHA flottants.
- Le runbook couvre installation, vérification, sauvegarde et reprise.
- Aucun déploiement distant ni compte WhatsApp réel n'est activé.

## Périmètre

- Configuration Docker Compose cloud et proxy TLS.
- Image reproductible du serveur MCP et volumes persistants.
- Validation de configuration et documentation opératoire.
- Aucun changement OCI, DNS ou WhatsApp réel sans confirmation.

## Fichiers concernés

- `compose.cloud.yaml`
- `Dockerfile.mcp`
- `deploy/Caddyfile`
- `.env.cloud.example`
- `tools/check_cloud_config.py`
- `tests/test_cloud_config.py`
- `docs/cloud-deployment.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Démarrer une nouvelle tâche Codex **BELL-010 — Architecture WhatsApp sans serveur**.
Ne pas créer de VM ni activer WAHA : la voie Docker reste une solution de repli.

## Décision de sortie

- Oracle Always Free est indisponible dans la région testée faute de capacité.
- Le compte Hostinger existant ne contient aucun VPS ; un VPS serait payant.
- L'architecture cible à évaluer remplace WAHA par WhatsApp Cloud API hébergée par Meta et exécute le webhook/MCP sur un service serverless gratuit.
- Aucun compte WhatsApp réel ni service distant n'a été activé.

## Validations effectuées

- 29 tests unitaires réussis, dont 4 contrôles de configuration cloud.
- Compilation Python et `git diff --check` réussis.
- Le fichier d'exemple est correctement rejeté tant que ses secrets ne sont pas remplacés.
- La clé API WAHA exige 64 caractères alphanumériques et l'image est figée sur `2026.7.1`.
- Rendu Docker Compose différé : aucun moteur Docker n'est installé sur ce poste.
