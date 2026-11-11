-- P335BR : permission strictement limitée au courrier SYNTHETIQUE de recette.
-- Ne donne aucun accès à une boîte e-mail institutionnelle ni aux dashboards.
INSERT INTO permissions (code, nom, description, actif)
VALUES (
  'VIEW_CONSULAR_MAIL_DEMO',
  'Consulter les courriers fictifs du pilote',
  'Autorise uniquement la consultation et la préqualification des courriers synthétiques de recette.',
  TRUE
)
ON CONFLICT (code) DO NOTHING;
