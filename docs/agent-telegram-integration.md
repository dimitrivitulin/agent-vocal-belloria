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

`MemoryApprovalStore` sert aux tests et au développement. En production, l’adaptateur doit persister les propositions dans D1 avec expiration et consommation atomique. Il ne faut pas marquer la commande Telegram initiale comme terminée avant d’avoir envoyé la proposition ; la commande de confirmation est terminée seulement après le compte rendu d’exécution.

## Commandes couvertes

- consultations : priorités, résumé prospect, recommandation, planning du jour et CA prouvé ;
- actions préparées : réponse, devis et relance ;
- sécurité : résolution ambiguë, offre non validée, contradiction ou conflit de planning arrêtent la préparation et demandent une décision humaine.

La préparation d’un brouillon ne vaut jamais envoi. Le CA est fourni par l’adaptateur de requête générale et doit conserver la séparation entre devis réellement envoyés et factures prouvées.

## Latence et reprise

Le cœur ne réalise aucun polling et peut être invoqué dès qu’une commande est disponible. L’adaptateur d’exécution interactive doit viser moins de deux minutes entre la réception du webhook et la réponse Telegram. Le passage ChatGPT Work horaire continue de lister les commandes non terminées et constitue la reprise de secours.
