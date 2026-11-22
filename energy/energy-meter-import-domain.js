'use strict';
/**
 * E-METER-1D1 — CSV déclaré, format strict, sans conversion ni calcul de consommation.
 * Couche pure. Aucune dépendance à Express, PostgreSQL ou aux identités Core.
 * Format v1 : registre_id,releve_le,valeur_index,observation
 */
const crypto = require('node:crypto');
const {UUID, indexManuel} = require('./energy-meter-domain');
const MODE = 'IMPORT_CSV_V1';
const ENTETES = Object.freeze(['registre_id','releve_le','valeur_index','observation']);
const LIMITE_OCTETS = 65536;
const LIMITE_LIGNES = 50;
class CsvInvalide extends Error {
 constructor(code, numero = null) {super(code); this.name='CsvInvalide'; this.code=code; this.numero=numero;}
}
const empreinte = valeur => crypto.createHash('sha256').update(valeur).digest('hex');
function lectureCellules(texte) {
 const lignes=[];let cellules=[],cellule='',entreGuillemets=false,ferme=false;
 let ligne=1;
 const pousserCellule=()=>{if(cellule.length>512)throw new CsvInvalide('CELLULE_TROP_LONGUE',ligne);cellules.push(cellule);cellule='';ferme=false;};
 const pousserLigne=()=>{pousserCellule();lignes.push(cellules);cellules=[];ligne++;if(lignes.length>LIMITE_LIGNES+1)throw new CsvInvalide('TROP_DE_LIGNES');};
 for(let i=0;i<texte.length;i++) {
  const ch=texte[i];
  if(entreGuillemets) {
   if(ch==='"' && texte[i+1]==='"'){cellule+='"';i++;}
   else if(ch==='"'){entreGuillemets=false;ferme=true;}
   else if(ch==='\n')throw new CsvInvalide('CELLULE_MULTILIGNE_NON_AUTORISEE',ligne);
   else cellule+=ch;
   continue;
  }
  if(ch==='"') {
   if(cellule.length!==0 || ferme)throw new CsvInvalide('GUILLEMET_CSV_INVALIDE',ligne);
   entreGuillemets=true;continue;
  }
  if(ch===',' || ch==='\n') {
   if(ch===',')pousserCellule();else pousserLigne();continue;
  }
  if(ferme)throw new CsvInvalide('APRES_GUILLEMET_INVALIDE',ligne);
  cellule+=ch;
 }
 if(entreGuillemets)throw new CsvInvalide('GUILLEMET_NON_FERME',ligne);
 if(cellule.length||cellules.length||ferme)pousserLigne();
 return lignes;
}
function analyserCsv(csv, now=Date.now()) {
 if(typeof csv!=='string')throw new CsvInvalide('FICHIER_TEXTE_REQUIS');
 const taille=Buffer.byteLength(csv,'utf8');
 if(taille===0||taille>LIMITE_OCTETS)throw new CsvInvalide('TAILLE_CSV_INVALIDE');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd]/.test(csv))throw new CsvInvalide('CONTROLE_OU_UTF8_INVALIDE');
 const s=csv.replace(/^\ufeff/,'').replace(/\r\n/g,'\n');
 if(s.includes('\r'))throw new CsvInvalide('FIN_DE_LIGNE_INVALIDE');
 const blocs=lectureCellules(s);
 if(blocs.length<2)throw new CsvInvalide('LIGNES_ABSENTES');
 if(blocs[0].length!==ENTETES.length||blocs[0].some((v,i)=>v!==ENTETES[i]))throw new CsvInvalide('ENTETES_CSV_V1_INVALIDES',1);
 const donnees=blocs.slice(1);
 if(!donnees.length||donnees.length>LIMITE_LIGNES)throw new CsvInvalide('NOMBRE_LIGNES_INVALIDE');
 const vus=new Set(),lignes=[];
 for(let i=0;i<donnees.length;i++) {
  const numero=i+2, cellules=donnees[i];
  if(cellules.length!==4)throw new CsvInvalide('COLONNES_INVALIDES',numero);
  const [registreId,releveLe,valeurIndex,observation]=cellules;
  if(!UUID.test(registreId))throw new CsvInvalide('REGISTRE_ID_INVALIDE',numero);
  // Le parseur canonique 1A contrôle NUMERIC(20,6), fuseaux et dates civiles.
  const v=indexManuel({valeur:valeurIndex,releveLe,observation:observation||null},now);
  if(!v)throw new CsvInvalide('RELEVE_CSV_INVALIDE',numero);
  if(observation && /^[=+\-@]/.test(observation.trimStart()))throw new CsvInvalide('FORMULE_CSV_INTERDITE',numero);
  const cle=registreId.toLowerCase()+'|'+v.releveLe;
  if(vus.has(cle))throw new CsvInvalide('DOUBLON_DANS_FICHIER',numero);
  vus.add(cle);
  lignes.push(Object.freeze({numero,registreId:registreId.toLowerCase(),releveLe:v.releveLe,valeur:v.valeur,observation:v.observation}));
 }
 const fichierSha256=empreinte(Buffer.from(csv,'utf8'));
 const hashLot=empreinte(JSON.stringify({mode:MODE,fichierSha256,lignes}));
 return Object.freeze({mode:MODE,version:1,fichierSha256,hashLot,tailleOctets:taille,lignes:Object.freeze(lignes)});
}
function cleLigne(lotKey, numero) {
 if(!UUID.test(lotKey)||!Number.isSafeInteger(numero)||numero<2||numero>51)throw new CsvInvalide('CLE_IMPORT_INVALIDE');
 const b=crypto.createHash('sha256').update('SATEER:E-METER-1D1:').update(lotKey.toLowerCase()).update(':').update(String(numero)).digest().subarray(0,16);
 b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
 return [b.toString('hex',0,4),b.toString('hex',4,6),b.toString('hex',6,8),b.toString('hex',8,10),b.toString('hex',10,16)].join('-');
}
module.exports={MODE,ENTETES,LIMITE_LIGNES,LIMITE_OCTETS,CsvInvalide,analyserCsv,empreinte,cleLigne};
