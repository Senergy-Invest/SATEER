#!/usr/bin/env python3
"""Contrôles reproductibles SATEER Bordeaux, statiques et non destructifs.
N'exécute ni server.js ni SQL ni HTTP ; les tests d'intégration restent à lancer en recette.
"""
from pathlib import Path
import argparse
import subprocess
import sys

p=argparse.ArgumentParser();p.add_argument('--root',default=str(Path.home()/'SATEER'));a=p.parse_args()
root=Path(a.root).expanduser().resolve()
checks={
 'workflow':('server.js','services-database.js','public/unit-workspace.js','pilot-procedures-http.js'),
 'courrier':('bordeaux-email-demo-http.js','sateer-mail-guidance-core.js','public/sateer-mail-intent-core.js'),
 'supervision':('public/sateer-vice-layout.js','public/sateer-vice-cases.js','public/registre-demandes-vice-consul.html'),
 'catalogue':('public/p7-admin.js','public/catalogue-demarches.html'),
 'migration':('database/042_procedure_catalogue_validation_explicite.sql','database/043_permission_manage_procedures.sql')}
failed=False
for group,items in checks.items():
 missing=[name for name in items if not (root/name).is_file()]
 print('P335Y_STRUCTURE_'+group.upper()+(': PASS' if not missing else ': ABSENT '+', '.join(missing)))
 failed|=bool(missing)
for rel,expected in {
 'database/042_procedure_catalogue_validation_explicite.sql':['validation_explicite','date_validation','date_publication','DEFAULT FALSE'],
 'database/043_permission_manage_procedures.sql':['MANAGE_PROCEDURES','NOT EXISTS'],
 'docs/architecture/email-ingestion.md':['qualification d’intention','FAQ_RÉPONDUE','aucun dossier']}.items():
 path=root/rel
 if not path.is_file():failed=True;continue
 txt=path.read_text()
 absent=[x for x in expected if x not in txt]
 print('P335Y_CONTRAT',rel, 'PASS' if not absent else 'MANQUE '+str(absent))
 failed|=bool(absent)
js=[
 'server.js','services-database.js','pilot-procedures-http.js',
 'bordeaux-email-demo-http.js','sateer-mail-guidance-core.js','pilot-module-registry.js',
 'public/p7-admin.js','public/email-secretariat-demo.js','public/unit-workspace.js',
 'public/sateer-mail-intent-core.js','public/sateer-vice-cases.js',
 'public/sateer-vice-layout.js','public/sateer-document-status.js'
]
for name in js:
 if not (root/name).is_file():continue
 try:
  r=subprocess.run(['node','--check',str(root/name)],capture_output=True,text=True,timeout=20)
 except (OSError,subprocess.TimeoutExpired):
  print('P335Y_SYNTAXE_NODE_INDISPONIBLE');failed=True;break
 if r.returncode:
  print('P335Y_SYNTAXE_ERREUR',name,r.stderr[-300:]);failed=True
print('P335Y_SYNTAXE_JS:', 'PASS' if not failed else 'VOIR_MESSAGES')
r=subprocess.run(['git','-C',str(root),'diff','--check'],capture_output=True,text=True)
print('P335Y_DIFF_CHECK:', 'PASS' if r.returncode==0 else r.stderr[:500])
failed|=r.returncode!=0
r=subprocess.run(['git','-C',str(root),'diff','--cached','--name-only'],capture_output=True,text=True)
print('P335Y_INDEX:', 'VIDE' if not r.stdout.strip() else 'CONTIENT_DES_MODIFICATIONS (pas modifié par ce lot)')
ignore=[str(root/'.sateer-backups'/'test-sauvegarde'),str(root/'sateer-server.pid')]
r=subprocess.run(['git','-C',str(root),'check-ignore','--no-index','--',*ignore],capture_output=True,text=True)
print('P335Y_EXCLUSIONS_GIT:', 'PASS' if r.returncode==0 and len(r.stdout.splitlines())==2 else 'A_VERIFIER')
failed|=r.returncode!=0 or len(r.stdout.splitlines())!=2
print('P335Y_FIN:','VALIDATION_STATIQUE_OK' if not failed else 'CONTROLE_A_CORRIGER')
print('P335Y_LIMITES: ni tests HTTP/auth, ni tests de migrations PostgreSQL, ni tests de charge, ni commit')
sys.exit(1 if failed else 0)
