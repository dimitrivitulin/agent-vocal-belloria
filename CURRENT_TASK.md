# BELL-041 — Déploiement et validation réelle du SMS Tally

Statut: blocked
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

Le Worker résout désormais les identifiants d'options Tally vers leur texte et reconnaît les types réels `INPUT_DATE` / `INPUT_PHONE_NUMBER`. Trois soumissions contrôlées n'ont envoyé aucun SMS : deux ont révélé puis validé le correctif de parsing ; la troisième a atteint Brevo mais a été refusée car le compte affiche 0 crédit prépayé. Le Worker déployé trace maintenant le statut HTTP Brevo assaini ; 28 tests Worker et 78 tests Python passent.

## Blocage et reprise

Acheter des crédits SMS Brevo, puis effectuer une dernière soumission contrôlée après confirmation explicite. Vérifier `accepted` puis `delivered`, le segment unique et le rejeu idempotent, avant de supprimer les trois soumissions de test Tally/D1/CRM et de terminer le lot.
