// MPC V29: finite multilingual engineering vocabulary and Unicode methods.
// Locale-aware *controlled* semantic messages with versioned source identity.
import {createHash} from 'node:crypto';
const fail=s=>{throw Error(s)};
const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u;
const COMMIT=/^[a-f0-9]{40}$/u;
const PLAIN=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(o,fields,label)=>{if(!PLAIN(o)||Object.keys(o).some(k=>!fields.includes(k)))fail('INVALID_'+label+'_FIELDS')};
const valid=x=>typeof x==='string'&&ID.test(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const messages=['MESSAGE_RECEIVED','FRAME_REJECTED','SOURCE_REQUIRED',
 'VERIFICATION_PENDING','VERIFICATION_PASSED','COUNTER_GAP','METHOD_READY',
 'RECORD_CONTRADICTED'];
const dictionary=Object.freeze({
 en:{
  SHORT:['received','rejected','source needed','pending','passed','counter gap','ready','contradicted'],
  ENGINEERING:['Message received','Frame rejected','Source record required',
   'Verification pending','Verification passed','Counter discontinuity detected',
   'Method ready for review','Source records contradict']
 },
 es:{
  SHORT:['recibido','rechazado','fuente necesaria','pendiente','prueba superada',
   'salto de contador','preparado','contradicho'],
  ENGINEERING:['Mensaje recibido','Trama rechazada','Se requiere registro fuente',
   'Verificación pendiente','Prueba de verificación superada','Discontinuidad del contador detectada',
   'Método listo para revisión','Los registros fuente se contradicen']
 },
 fr:{
  SHORT:['reçu','rejeté','source requise','en attente','test réussi',
   'saut de compteur','prêt','contradictoire'],
  ENGINEERING:['Message reçu','Trame rejetée','Document source requis',
   'Vérification en attente','Test de vérification réussi','Discontinuité du compteur détectée',
   'Méthode prête pour examen','Les sources se contredisent']
 },
 de:{
  SHORT:['empfangen','abgewiesen','Quelle nötig','ausstehend','bestätigt',
   'Zählerlücke','bereit','widersprüchlich'],
  ENGINEERING:['Nachricht empfangen','Frame abgewiesen','Quelldatensatz erforderlich',
   'Prüfung ausstehend','Prüfung bestanden','Zählerunterbrechung erkannt',
   'Methode zur Prüfung bereit','Quelldatensätze widersprechen sich']
 }
});
export const v29LanguageContract=Object.freeze({
 version:'MPC_V29_CONTROLLED_TRANSLATION_1',
 languages:['en','es','fr','de'],registers:['SHORT','ENGINEERING'],
 semantic_codes:messages,
 original_v28_output_replaced:false,native_evaluators_added:0,
 human_text_processing:false,source_promotion:false
});
export function localeProfileV29(localeTag){
 if(typeof localeTag!=='string'||localeTag.length>48)fail('INVALID_LOCALE_TAG');
 let canonical;
 try{canonical=Intl.getCanonicalLocales(localeTag)[0];}catch{fail('INVALID_LOCALE_TAG')}
 if(!canonical)fail('INVALID_LOCALE_TAG');
 const parsed=new Intl.Locale(canonical);
 if(!Object.hasOwn(dictionary,parsed.language))fail('UNSUPPORTED_TRANSLATION_LANGUAGE');
 return {canonical_tag:canonical,language:parsed.language,
  region:parsed.region??null,script:parsed.script??null,
  locale_tag_canonicalized:canonical!==localeTag};
}
export function emitControlledTranslationV29(input){
 exact(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'source_owner','message_code','locale_tag','register'],'TRANSLATION_INPUT');
 if(!COMMIT.test(input.source_commit||'')||
  !['scope_id','subject_id','source_ref','source_version','source_owner'].every(k=>valid(input[k]))||
  !messages.includes(input.message_code)||!['SHORT','ENGINEERING'].includes(input.register))
  fail('INVALID_TRANSLATION_CONTEXT');
 const locale=localeProfileV29(input.locale_tag);
 const index=messages.indexOf(input.message_code);
 const surface=dictionary[locale.language][input.register][index];
 const originalKey=JSON.stringify([input.source_commit,input.scope_id,input.subject_id,
  input.source_ref,input.source_version,input.source_owner,input.message_code,
  locale.canonical_tag,input.register]);
 return {version:v29LanguageContract.version,
  semantic_code:input.message_code,canonical_locale:locale.canonical_tag,
  register:input.register,output_text:surface,
  source_ref:input.source_ref,source_version:input.source_version,source_owner:input.source_owner,
  input_fingerprint:sha(originalKey),output_utf8_sha256:sha(surface),
  translation_state:'CONTROLLED_VOCABULARY_REALIZED',
  methods_executed:['BCP47_LOCALE_ROUTE','FINITE_GLOSSARY_LOOKUP'],
  authoritative_source_verified:false,transmitted:false,canonical_promotion:false};
}
export function inspectUnicodeNormalFormsV29(input){
 exact(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'text'],'UNICODE_INPUT');
 if(!COMMIT.test(input.source_commit||'')||!['scope_id','subject_id','source_ref','source_version'].every(k=>valid(input[k]))||
 typeof input.text!=='string'||input.text.length>8192)fail('INVALID_UNICODE_TEXT');
 const a=input.text,b=a.normalize('NFC'),k=a.normalize('NFKC');
 return {version:'MPC_V29_UNICODE_NORMALIZATION_AUDIT_1',source_ref:input.source_ref,
  source_version:input.source_version,utf16_units:a.length,codepoint_count:[...a].length,
  input_hash:sha(a),nfc_hash:sha(b),nfkc_hash:sha(k),
  nfc_changed:a!==b,nfkc_changed:a!==k,compatibility_difference:b!==k,
  nfc_idempotent:b.normalize('NFC')===b,nfkc_idempotent:k.normalize('NFKC')===k,
  state:b!==k?'COMPATIBILITY_TRANSFORMATION_CHANGES_REPRESENTATION':
    a!==b?'CANONICAL_NORMALIZATION_CHANGES_REPRESENTATION':'ALREADY_CANONICAL_NFC',
  input_text_retained:false};
}
