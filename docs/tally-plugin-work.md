# Intégration du connecteur Tally dans ChatGPT Work

## Décision proposée

Le connecteur Tally devient le chemin de lecture privilégié des réponses dans ChatGPT Work. Il ne devient pas le déclencheur et ne porte pas l'idempotence : le webhook signé Cloudflare et la table D1 `tally_submissions` conservent ces responsabilités.

Le serveur MCP officiel Tally sait lister les formulaires et récupérer leurs soumissions via OAuth. Tally le présente comme gratuit sur tous les plans, mais sa documentation développeur le signale encore en bêta. L'automatisation Belloria ne doit donc pas dépendre exclusivement de sa disponibilité ou de la stabilité de ses outils.

## Flux cible

1. Tally envoie `FORM_RESPONSE` au webhook signé.
2. Le Worker déduplique `event_id` et `submission_id`, puis conserve le payload brut en D1.
3. Le passage Work liste dans D1 uniquement les métadonnées `pending`.
4. Pour chaque élément, il demande au connecteur Tally la soumission exacte par `form_id=44JdrA` et `submission_id`.
5. Il vérifie la concordance des deux identifiants avant toute mutation.
6. Il synchronise le contact et l'opportunité dans Notion de façon idempotente.
7. Après succès seulement, il acquitte l'événement D1 ; le payload brut est effacé.
8. Si le connecteur Tally est indisponible ou ne retrouve pas l'identifiant, il lit uniquement le payload D1 de cet événement et signale l'utilisation du repli.

## Changements de code prévus

### Worker et MCP Belloria

- Modifier `belloria_list_tally_submissions` pour retourner les métadonnées sans `payload`.
- Ajouter `belloria_get_tally_submission_fallback(event_id)` pour lire un seul payload `pending`.
- Conserver `belloria_complete_tally_submission(event_id, confirmed=true)` et l'effacement après succès.
- Ne jamais exposer une liste de payloads bruts ni les événements déjà traités.

### Tâche ChatGPT Work

- Commencer par la file D1, puis appeler Tally uniquement pour les `submission_id` reçus.
- Ne jamais parcourir ou analyser l'historique complet des réponses lors d'un passage normal.
- Ne jamais appeler les outils Tally de création ou d'édition de formulaire.
- Exclure de Gmail les notifications `notifications@tally.so` et le sujet du formulaire « Devis express ».
- Conserver Gmail pour les réponses de prospects, Mariages.net, les devis envoyés et la reconstruction du contexte.

### Documentation et exploitation

- Documenter les noms et schémas exacts des outils Tally réellement visibles dans ChatGPT Work.
- Ajouter au rapport Telegram les compteurs `tally_plugin`, `tally_fallback`, `tally_error` sans donnée personnelle.
- Documenter la procédure de déconnexion du connecteur sans interrompre le webhook.

## Garde-fous

- D1 reste l'autorité de réception ; Notion reste l'autorité CRM.
- `submission_id` remplace l'ancien `messageId` Gmail comme clé technique d'une soumission directe.
- Un montant déclaré dans Tally reste une estimation et ne devient jamais un devis.
- Aucun formulaire, champ ou réglage Tally n'est modifié par l'automatisation.
- Aucun acquittement n'est effectué avant le succès CRM.
- Une divergence entre Tally et D1 est mise en revue humaine ; aucune donnée n'est inventée ou fusionnée.

## Validation prévue

- Cas nominal avec la soumission contrôlée reçue après BELL-034.
- Rejeu du même `event_id` et du même `submission_id`.
- Connecteur Tally indisponible, réponse absente et schéma d'outil modifié.
- Divergence `form_id` ou `submission_id` entre Tally et D1.
- Succès Notion suivi d'une reprise, sans double mutation.
- Vérification qu'aucun outil d'écriture Tally n'est invoqué.
