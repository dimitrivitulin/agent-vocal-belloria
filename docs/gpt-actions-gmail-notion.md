# Actions GPT Belloria — Gmail et Notion

Le GPT privé Belloria ne récupère pas les connecteurs personnels Gmail et Notion de ChatGPT. Cette passerelle Cloudflare lui donne donc une surface REST distincte, strictement limitée et protégée par un jeton propre au GPT.

## Ce que le GPT peut faire

- lire les métadonnées et extraits de messages Gmail via `searchRecentGmail` ;
- préparer une proposition Gmail durable avec `proposeGmailSend`, puis exécuter uniquement son `action_id` avec `executeApprovedGmailAction` après approbation Telegram ;
- chercher, lire, créer, mettre à jour et archiver les fiches CRM Notion.

Le schéma OpenAPI public est servi par `GET /gpt-actions/openapi.json`. Toutes les autres routes exigent `Authorization: Bearer <GPT_ACTIONS_TOKEN>`.

## Secrets Cloudflare requis

Ne jamais écrire ces valeurs dans Git ni dans une conversation. Les créer dans Cloudflare Workers pour `belloria-assistant` :

- `GPT_ACTIONS_TOKEN` : jeton aléatoire dédié au GPT, différent de `BELLORIA_MCP_TOKEN` ;
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` : identifiants OAuth Google avec les scopes `https://www.googleapis.com/auth/gmail.readonly` et `https://www.googleapis.com/auth/gmail.send` ;
- `NOTION_TOKEN` et `NOTION_DATA_SOURCE_ID` : connexion Notion et source de données du CRM Belloria.

Google nécessite un projet Google Cloud, l'API Gmail activée et une première autorisation OAuth hors ligne afin d'obtenir le refresh token. Notion doit autoriser la connexion uniquement sur les pages ou la source CRM concernées. Les jetons existants des plugins ChatGPT ne sont ni visibles ni réutilisables pour cette passerelle.

## Branchement dans le GPT

Après le déploiement et la configuration des secrets :

1. Ouvrir le GPT `Belloria — Assistant commercial` puis **Configurer > Actions**.
2. Importer `https://belloria-assistant.belloria-dvitulin.workers.dev/gpt-actions/openapi.json`.
3. Choisir une clé API `Bearer` et saisir `GPT_ACTIONS_TOKEN`.
4. Garder les confirmations d'actions activées dans ChatGPT.
5. Tester d'abord `getIntegrationStatus`, puis une recherche Gmail et une recherche Notion sans mutation.

L'ajout d'une Action fait fonctionner ce GPT dans un mode compatible Actions plutôt qu'en mode Pro. L'abonnement ChatGPT Pro est conservé ; aucune clé API OpenAI facturée à l'usage n'est utilisée.

## Validation de sécurité

Pour Gmail, le GPT ne crée une proposition que depuis un `source_id` de commande Telegram déjà persisté ; il n'invente jamais cette identité. Le Worker présente ensuite le contenu immuable dans le chat Telegram allowlisté. La confirmation Telegram, et non `confirmed: true`, autorise l'exécution Gmail avec le seul `action_id`. Les actions Notion conservent provisoirement leur contrat `confirmed: true` jusqu'à BELL-048.
