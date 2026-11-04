# Règles permanentes du pilote SATEER

- SATEER Core reste générique et configurable. Bordeaux est uniquement une configuration du pilote, jamais une règle codée en dur dans le cœur.
- Ne jamais modifier la base PostgreSQL `sateer`, le serveur du port 3000, les secrets ou les sauvegardes.
- Pour les tests autorisés qui utilisent PostgreSQL, utiliser exclusivement `sateer_test` et des comptes/données synthétiques isolés, avec nettoyage garanti.
- Préserver l’instance du port 3100 et les dashboards existants ; ne pas les redémarrer ni en changer le comportement sans demande explicite.
- Vérifier et imposer les permissions côté backend. Une protection dans l’interface seule ne suffit pas.
- Ne faire aucun push, aucune migration et aucune opération destructive sans accord explicite.
