'use strict';
/** SATEER : stockage photo chiffré, isolé du coffre d'identité.
 * Réutilise uniquement la racine de clé Core et AES-GCM, avec sous-clé et AAD propres à Energy.
 * Pas d'URL de fichier public, pas de journalisation de secret, pas de symlinks.
 */
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {chargerCle}=require('../identity-documents-crypto');
const MAGIC=Buffer.from('S2EP');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES=3*1024*1024;
// Conversion canvas côté navigateur : rejet des images avec blocs EXIF/XMP et de tout PDF.
function formatImage(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<64||buffer.length>MAX_BYTES)return null;
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  let i=8,ihdr=false,end=false,hasImage=false;
  const authorized=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','gAMA','sRGB','cHRM']);
  while(i+12<=buffer.length){
   const n=buffer.readUInt32BE(i),name=buffer.toString('ascii',i+4,i+8);
   if(n>MAX_BYTES||i+12+n>buffer.length||!authorized.has(name))return null;
   if(name==='IHDR'){if(ihdr||n!==13)return null;ihdr=true;
    const w=buffer.readUInt32BE(i+8),h=buffer.readUInt32BE(i+12);
    if(!w||!h||w>5000||h>5000)return null;
   }
   if(name==='IDAT')hasImage=true;
   i+=12+n;
   if(name==='IEND'){if(n!==0)return null;end=true;break;}
  }
  return ihdr&&hasImage&&end&&i===buffer.length?'image/png':null;
 }
 if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'&&
    buffer.readUInt32LE(4)+8===buffer.length){
   let pos=12,seen=false,extended=false;
   while(pos+8<=buffer.length){
    const tag=buffer.toString('ascii',pos,pos+4),size=buffer.readUInt32LE(pos+4);
    if(size>MAX_BYTES||pos+8+size>buffer.length)return null;
    if(!['VP8 ','VP8L','VP8X','ALPH'].includes(tag))return null;
    if(tag==='VP8X'){
      if(extended||seen||pos!==12||size<10)return null;
      // Bits ICC/EXIF/XMP dans l'en-tête étendu : refuser les métadonnées.
      if(buffer[pos+8]&(0x20|0x08|0x04))return null;
      extended=true;
    }else if(tag==='ALPH'){
      if(!extended||seen)return null;
    }else{
      if(seen)return null;seen=true;
    }
    pos+=8+size+(size%2);
   }
   return seen&&pos===buffer.length?'image/webp':null;
 }
 return null;
}
function makeRoot(){return path.join(os.homedir(),'.sateer-energy-private','sateer_test','equipment-photos');}
function creerPhotoVault({root=makeRoot(),loadMasterKey=chargerCle}={}){
 const home=path.resolve(os.homedir());const target=path.resolve(root);
 if(!target.startsWith(home+path.sep))throw Error('DOSSIER_PHOTOS_HORS_HOME');
 const chain=[];let rel=path.relative(home,target);let curr=home;
 for(const part of rel.split(path.sep)){curr=path.join(curr,part);chain.push(curr);}
 async function folder(){
  for(const p of chain){try{await fsp.mkdir(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
   const s=await fsp.lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('DOSSIER_PHOTOS_NON_PRIVE');
  }return target;
 }
 function file(photoId){if(!UUID.test(photoId))throw Error('PHOTO_ID_INVALIDE');return path.join(target,photoId+'.enc');}
 function key(){return Buffer.from(crypto.hkdfSync('sha256',loadMasterKey(),Buffer.from('sateer_test/energy-equipment-photo-v1'),Buffer.from('SATEER-ENERGY-PHOTO-GCM'),32));}
 function aad({owner,passportId,photoId,type,mime}){return Buffer.from(['SATEER-ENERGY-PHOTO-v1',owner,passportId,photoId,type,mime].join('|'));}
 async function save({bytes,owner,passportId,photoId,type,mime}){
  if(formatImage(bytes)!==mime)throw Error('IMAGE_NON_AUTORISEE');
  await folder();const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(aad({owner,passportId,photoId,type,mime}));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  const payload=Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
  await fsp.writeFile(file(photoId),payload,{flag:'wx',mode:0o600});return file(photoId);
 }
 async function read({owner,passportId,photoId,type,mime}){
  await folder();const p=file(photoId);const s=await fsp.lstat(p);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('FICHIER_NON_PRIVE');
  const raw=await fsp.readFile(p);if(raw.length<33||!raw.subarray(0,4).equals(MAGIC))throw Error('PHOTO_CORROMPUE');
  const dec=crypto.createDecipheriv('aes-256-gcm',key(),raw.subarray(4,16));
  dec.setAAD(aad({owner,passportId,photoId,type,mime}));dec.setAuthTag(raw.subarray(16,32));
  const data=Buffer.concat([dec.update(raw.subarray(32)),dec.final()]);
  if(formatImage(data)!==mime)throw Error('PHOTO_CORROMPUE');return data;
 }
 async function erase(photoId){await folder();await fsp.unlink(file(photoId)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 return {save,read,erase,folder};
}
module.exports={creerPhotoVault,formatImage,MAX_BYTES};
