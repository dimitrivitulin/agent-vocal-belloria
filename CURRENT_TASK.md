# BELL-004 — Passerelle WhatsApp WAHA

Statut: ready_for_review
Branche: `codex/bell-004-passerelle-whatsapp-waha`
Dernière mise à jour: 2026-08-03

## Objectif

Fournir un prototype local WAHA Core avec moteur NOWEB, stockage persistant et réception vérifiable de webhooks simulés, sans connecter de compte WhatsApp réel.

## Critères de réussite

- Compose lance WAHA NOWEB avec API uniquement sur la boucle locale et secrets injectés hors Git.
- Les données de session utilisent un volume persistant distinct des fichiers suivis.
- Le récepteur local vérifie la signature HMAC et journalise les événements valides.
- Une simulation déterministe couvre succès, signature absente/invalide et disponibilité.
- La procédure d'exploitation locale et les limites avant BELL-005 sont documentées.

## Périmètre

- Configuration Docker Compose et exemple d'environnement.
- Récepteur de webhooks local minimal et tests automatisés.
- Guide de démarrage, simulation, arrêt, reprise et sécurité.
- Aucune connexion WhatsApp, aucun message réel et aucun déploiement cloud.

## Fichiers concernés

- `compose.yaml`
- `.env.example`
- `.gitignore`
- `tools/webhook_receiver.py`
- `tools/simulate_webhook.py`
- `tests/test_webhook_receiver.py`
- `docs/waha-local.md`
- `docs/decisions/004-passerelle-whatsapp-waha.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Validations effectuées

- Tests HTTP/HMAC : 4 réussis.
- Compilation Python : réussie.
- `git diff --check`, examen du périmètre et recherche de secrets : réussis.
- Validation Docker Compose : non exécutée, Docker absent de l'environnement.

## Prochaine action

Sur un hôte Docker, exécuter `docker compose --env-file .env.example config --quiet`, démarrer les services et lancer la simulation avant de marquer le lot `completed`.
