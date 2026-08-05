# Intégration de l’agent conversationnel Telegram

## Contrat

`TelegramSalesAgent` orchestre une commande déjà extraite ou transcrite par le Worker. Il ne connaît aucun jeton et n’appelle directement ni Gmail, ni Notion, ni Telegram. Les adaptateurs injectés assurent quatre responsabilités :

- `resolve_prospect` recherche par nom, email ou événement et retourne zéro, un ou plusieurs dossiers ;
- `load_context` reconstruit le `ProspectContext` sourcé de BELL-028 ;
- `general_query` calcule priorités, planning ou CA selon les règles de preuve ;
- `execute_action` applique uniquement une `ProposedAction` approuvée et retourne un identifiant traçable.

Le texte et le vocal suivent exactement le même chemin après transcription. Une consultation est terminée immédiatement. Une préparation d’action crée une proposition contenant le prospect résolu, les sources, le contenu exact, la conséquence et un jeton valable dix minutes.

## Confirmation

La seule syntaxe d’approbation est `CONFIRMER <jeton>`. Le stockage d’approbation supprime la proposition avant exécution : le jeton est donc à usage unique, y compris en cas de rejeu. Une confirmation inconnue, déjà utilisée ou périmée ne produit aucune mutation.

`MemoryApprovalStore` sert aux tests du cœur Python. Le Worker persiste les propositions dans D1 avec `belloria_propose_action`, puis `belloria_consume_approved_action` vérifie une commande Telegram distincte et consomme atomiquement le jeton. Il ne faut pas marquer la commande Telegram initiale comme terminée avant d’avoir envoyé la proposition ; la commande de confirmation est terminée par la consommation, avant l’exécution, pour empêcher tout rejeu.

## Commandes couvertes

- consultations : priorités, résumé prospect, recommandation, planning du jour et CA prouvé ;
- actions préparées : réponse, devis et relance ;
- sécurité : résolution ambiguë, offre non validée, contradiction ou conflit de planning arrêtent la préparation et demandent une décision humaine.

La préparation d’un brouillon ne vaut jamais envoi. Le CA est fourni par l’adaptateur de requête générale et doit conserver la séparation entre devis réellement envoyés et factures prouvées.

## Latence et reprise

Le cœur ne réalise aucun polling. Le Worker accuse réception du webhook puis utilise `waitUntil` pour traiter les commandes couvertes. Après transcription, un vocal suit la même voie qu’un texte.

Le passage ChatGPT Work rafraîchit avec `belloria_refresh_fast_snapshots` au plus 100 instantanés minimaux, valables de 5 à 120 minutes à partir de leur date de génération. Chaque instantané contient uniquement identifiant, libellé, alias de résolution, résumé, recommandation, actions déjà validées et références de sources. Il ne contient ni corps d’email ni transcription de conversation client. Le remplacement D1 est atomique.

La voie rapide couvre résumé, recommandation, préparation de réponse, préparation de devis et relance. Une consultation réussie efface la commande ; une action crée seulement la proposition traçable de BELL-030 et exige toujours `CONFIRMER <jeton>`. Si le contexte est absent, ambigu, périmé ou incomplet, le bot le signale sans terminer la commande : le passage horaire reste la reprise de secours.

Les colonnes `fast_path_started_at` et `fast_path_finished_at` mesurent la latence technique. Aucun KPI commercial n’est calculé et aucune Queue n’est nécessaire tant que le traitement reste sous 30 secondes. La migration D1 `0004_telegram_fast_path.sql` et le Worker doivent être déployés avant un essai réel.
