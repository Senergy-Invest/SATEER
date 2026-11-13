# A3b — Socle d'accès aux relations institutionnelles

**Branche** : `work/ambassade-mvp`, sur A3a `20c1a286200a15fccc4710d3e5e86ac376fd8750`.

Nouveaux composants :

- `institution-network-database.js` : lecture du sous-réseau `organisation_relationships` et mutations transactionnelles **non raccordées à HTTP** ; aucun droit hérité.
- `scripts/test-institution-network-database.js` : tests sans réseau, sans PostgreSQL, sans création de dossier ni e-mail.
- `scripts/a3b-audit-schema-readonly.js` : introspection de la base autorisée et détection de liens tenant incohérents ; `BEGIN READ ONLY`.

L'architecture prépare la vision Ministère → Ambassades → Consulats avec des organisations indépendantes. Le graphe n'accorde aucun accès aux publications, dossiers et identités ; la diffusion conserve ses propres relations et contrôles introduits en A3a.

Le ministère mondial nécessitera un mécanisme d'annuaire et de reporting agrégeable **inter-tenants**, sans accès SQL global aux données privées. Ne pas inventer de relation automatique sur la base des pays ou de la géographie.

**Attention** : A3b n'enregistre aucune tutelle en PostgreSQL. Pour le faire, il faudra un contrôle métier réel des habilitations, l'approbation institutionnelle, une route sécurisée et des tests dynamiques ; ces validations ne sont pas incluses dans A3b.
