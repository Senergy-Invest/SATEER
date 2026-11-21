'use strict';
/** Adaptateur Energy du stockage privé SATEER : AES-256-GCM, clé Core dérivée HKDF,
 * AAD rattaché au site/tenant/déclaration ; aucun fichier en dossier public.
 * Contrairement au coffre citoyen, pas de mélange de catégories ni de droits. */
const fs=require('node:fs'), fsp=fs.promises, path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chargerCle}=require('../identity-documents-crypto');
const {formatEvidence}=require('./energy-billing-evidence-domain');
const MAGIC=Buffer.from('S2B2');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function creerBillingEvidenceVault({root=path.join(os.homedir(),'.sateer-energy-private','sateer_test','billing-evidence'),loadMasterKey=chargerCle}={}){
 const home=path.resolve(os.homedir()),target=path.resolve(root);
 if(!target.startsWith(home+path.sep))throw Error('COFFRE_ENERGY_HORS_HOME');
 const parts=path.relative(home,target).split(path.sep);if(parts.some(p=>p==='..'||!p))throw Error('COFFRE_INVALIDE');
 async function folder(){let current=home;
  for(const part of parts){current=path.join(current,part);
   try{await fsp.mkdir(current,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
   const st=await fsp.lstat(current);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('COFFRE_NON_PRIVE');
  }
  return target;
 }
 function key(){return Buffer.from(crypto.hkdfSync('sha256',loadMasterKey(),Buffer.from('sateer_test/energy-billing-evidence-v1'),Buffer.from('SATEER-ENERGY-BILLING-GCM'),32));}
 function aad(x){return Buffer.from(['SATEER-ENERGY-BILLING-v1',x.tenant,x.owner,x.site,x.declarationId,x.fileId,x.mime].join('|'));}
 function file(fileId){if(!UUID.test(fileId))throw Error('FICHIER_ID_INVALIDE');return path.join(target,fileId+'.enc');}
 async function save(x){if(formatEvidence(x.bytes)!==x.mime)throw Error('PREUVE_FORMAT_REFUSE');
  await folder();const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(aad(x));
  const body=Buffer.concat([cipher.update(x.bytes),cipher.final()]);
  const payload=Buffer.concat([MAGIC,iv,cipher.getAuthTag(),body]);
  await fsp.writeFile(file(x.fileId),payload,{flag:'wx',mode:0o600});
 }
 async function read(x){await folder();const p=file(x.fileId),st=await fsp.lstat(p);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw Error('FICHIER_NON_PRIVE');
  const blob=await fsp.readFile(p);if(blob.length<33||!blob.subarray(0,4).equals(MAGIC))throw Error('PREUVE_CORROMPUE');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),blob.subarray(4,16));decipher.setAAD(aad(x));decipher.setAuthTag(blob.subarray(16,32));
  const bytes=Buffer.concat([decipher.update(blob.subarray(32)),decipher.final()]);
  if(formatEvidence(bytes)!==x.mime||bytes.length!==Number(x.size)||crypto.createHash('sha256').update(bytes).digest('hex')!==x.sha256)throw Error('PREUVE_CORROMPUE');
  return bytes;
 }
 async function erase(fileId){await folder();await fsp.unlink(file(fileId)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 return {save,read,erase,folder};
}
module.exports={creerBillingEvidenceVault};
