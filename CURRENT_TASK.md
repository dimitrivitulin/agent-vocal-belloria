# BELL-014 — Validation Meta avec numéro de test

Statut: blocked
Branche: `codex/bell-014-validation-meta-test`
Dernière mise à jour: 2026-08-03

## Objectif

Créer les ressources Cloudflare de test, connecter l’application Meta de test au Worker et valider les flux texte et vocal sans numéro Belloria réel ni message client.

## Critères de réussite

- Le Worker et D1 sont créés avec une configuration de test et des secrets hors Git.
- Le webhook Meta de test réussit le challenge et authentifie les notifications reçues.
- Un texte et un vocal de test traversent le flux de bout en bout avec des données fictives.
- Les doublons restent sans nouvel effet et les reçus D1 ne contiennent aucune donnée client.
- Les preuves utiles et la procédure de retour arrière sont documentées sans exposer de secret.
- Aucun numéro Belloria réel, message client, Gmail, Notion ou WhatsApp non-test n’est contacté.

## Fichiers concernés

- `wrangler.jsonc`
- `.dev.vars.example`
- `docs/whatsapp-serverless.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Ouvrir un lot distinct BELL-016 pour choisir entre la réactivation contrôlée de WAHA et le retrait de WhatsApp de la première version. Ne pas reprendre l'examen Meta.

## Résultat

La base D1 et le Worker de test ont été créés et déployés, mais aucun ID d'application Meta ni secret n'a été créé. La voie WhatsApp officielle est abandonnée par décision utilisateur avant soumission de l'examen : aucun numéro n'a été transmis et aucun code mobile n'a été envoyé. Les ressources Cloudflare restent gelées, sans connexion à Meta ni usage de production.

## Validations effectuées

- BELL-013 est propre, validé et committé avant l’ouverture de cette branche.
- Base D1 `belloria-whatsapp` migrée avec `0001_webhook_receipts.sql`.
- Worker déployé sur `belloria-whatsapp.belloria-dvitulin.workers.dev` ; `/health` répond HTTP 200.
- Schéma D1 distant confirmé avec `webhook_events` et aucun secret Worker configuré.
- 6 tests Worker et 40 tests Python réussis, puis reconfirmés après l'abandon de la voie Meta ; bundle Wrangler validé en `--dry-run`.
- Tentative Meta limitée au portefeuille Belloria et au cas WhatsApp ; refus explicite « Business is not allowed to claim App » constaté, sans création d’application.
- Portefeuille Belloria identifié (`2203851593725037`) : aucun compte publicitaire et informations d’entreprise initialement incomplètes ; l'adresse a ensuite été confirmée.
- Restriction globale rattachée au compte publicitaire Colibri `1465746710634086` : solde nul, carte par défaut vérifiée, autres cartes signalées à vérifier et assistance Meta disponible.
- Adresse Belloria confirmée avec le code reçu dans Gmail ; une nouvelle tentative de création reproduit le même refus, ce qui isole la restriction administrateur comme cause restante.
- Aucun moyen de paiement modifié, aucun débit effectué et aucune demande d’assistance envoyée.
- Motif officiel Belloria identifié : portefeuille restreint le 19 juin 2026 pour automatisation présumée non conforme ; 134 jours restaient pour demander un examen.
- reCAPTCHA Meta réussi, puis parcours annulé avant la transmission du numéro mobile et avant toute soumission de l'examen.
- Décision durable consignée dans `docs/decisions/007-abandon-whatsapp-officiel.md` ; la décision serverless 006 est remplacée.
- `git diff --check` réussi et aucun secret détecté dans les fichiers modifiés.
