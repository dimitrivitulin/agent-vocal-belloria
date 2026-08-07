# BELL-041 — Déploiement et validation réelle du SMS Tally

Statut: ready_for_review
Branche: `codex/bell-041-sms-tally-validation`
Dernière mise à jour: 2026-08-06

## Objectif

Déployer le modèle SMS chaleureux de BELL-037 et valider le parcours Tally→Worker→Brevo sur un numéro appartenant à Belloria.

## Périmètre

- Valider localement le Worker, la migration et le modèle d'un segment.
- Contrôler la configuration distante sans exposer de secret, appliquer la migration et déployer le Worker.
- Après confirmation explicite, effectuer une soumission Tally contrôlée vers un numéro Belloria.
- Vérifier la personnalisation, la livraison, le callback D1, l'idempotence au rejeu et nettoyer les données de test.

## Critères de réussite

- Le SMS reçu contient les bonnes valeurs `{prenom}`, `{evenement}` et `{date}` dans un seul segment.
- D1 atteint `delivered`, la soumission reste disponible pour le flux CRM et le rejeu ne renvoie aucun SMS.
- Aucun secret, numéro, payload ou artefact de test ne subsiste dans Git ou les services après validation.
- Tests, `git diff --check`, examen du diff, commit et publication de la branche réussissent.

## Autorisation externe

Le déploiement et les contrôles distants non communicants sont dans le lot. La soumission Tally et le SMS réel exigent une confirmation explicite juste avant l'envoi.

## Résultat au 2026-08-06

Brevo dispose de crédits, d'une clé API valide et d'un webhook authentifié par un secret dédié. Deux SMS contrôlés vers le numéro Belloria sont marqués `Délivré` dans les logs Brevo ; le dernier utilise les valeurs Cyndy / anniversaire / 16 mars 2027 et D1 est réconcilié à `delivered`.

Le Worker résout les libellés Tally réels, trace les erreurs HTTP assainies et ajoute désormais l'identifiant Tally comme `tag` Brevo. Le callback peut ainsi rattacher un statut reçu avant l'enregistrement du `messageId`, sans être perdu par cette course réseau. La version `fc395a4c-abc9-4f6c-b468-e7d050afb528` est déployée et 29 tests Worker passent.

## Reprise

Après confirmation destructive, rejouer une soumission pour confirmer l'absence de second SMS, puis supprimer les six soumissions contrôlées de Tally, D1 et du CRM. Finaliser ensuite les validations, le commit et le push.
