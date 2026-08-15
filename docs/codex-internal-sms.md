# SMS commercial interne depuis Codex

Cette voie est distincte de l'accuse transactionnel Tally. Elle envoie un SMS Brevo de type `marketing` seulement apres que Codex a presente le texte, le numero et la reference de consentement, puis que l'utilisateur a donne son accord explicite dans la conversation.

## Configuration unique

1. Creer un secret Worker aleatoire `CODEX_SMS_TOKEN` pour `belloria-assistant`.
2. Copier `.env.codex-sms.example` vers `.env.codex-sms` et renseigner `BELLORIA_CODEX_SMS_TOKEN` avec la meme valeur. Ce fichier est ignore par Git.
3. Conserver l'URL par defaut ou renseigner `BELLORIA_CODEX_SMS_URL` si le Worker utilise une autre adresse.

Le jeton local ne doit jamais etre ajoute au depot, a un ticket ou a une conversation.

## Utilisation depuis Codex

1. Codex présente le texte exact au client et vérifie qu'une référence de consentement SMS existe.
2. Après validation humaine de ce texte, créer l'action sans l'envoyer :

```powershell
npm run sms:codex -- propose --to +33612345678 --text "Bonjour Damien, Belloria vous accompagne. Repondez OUI pour recevoir notre proposition. STOP au [STOP_CODE]" --consent "Tally opt-in SMS 2026-08-15" --key "damien-follow-up-20260815"
```

3. Codex relit l'action retournée, vérifie qu'elle correspond exactement au texte validé, puis l'exécute avec `--confirm` dans le même traitement :

```powershell
npm run sms:codex -- send --action <action_id> --confirm
```

4. Verifier l'etat si necessaire :

```powershell
npm run sms:codex -- status --action <action_id>
```

L'action est expiree au bout de 30 minutes par defaut. La cle `--key` rend une proposition idempotente : la meme commande ne cree ni n'envoie un second SMS. Toute reponse fournisseur ambiguë devient `unknown` et le programme ne rejoue jamais l'envoi.

## Contraintes du message

- numero mobile francais uniquement ;
- texte ASCII d'au plus 160 caracteres ;
- message commercial incluant `[STOP_CODE]`, que Brevo remplace par le code de desinscription ;
- reference de consentement obligatoire ;
- Brevo applique les restrictions horaires francaises aux SMS marketing.
