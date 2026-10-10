// MPC V29: independent controlled-translation replay oracle.
// Separate literal reverse dictionary to catch polarity/false-friend drift.
import {createHash} from 'node:crypto';
const keys=['MESSAGE_RECEIVED','FRAME_REJECTED','SOURCE_REQUIRED',
 'VERIFICATION_PENDING','VERIFICATION_PASSED','COUNTER_GAP','METHOD_READY','RECORD_CONTRADICTED'];
const reverse={
 en:{
 SHORT:['received','rejected','source needed','pending','passed','counter gap','ready','contradicted'],
 ENGINEERING:['Message received','Frame rejected','Source record required','Verification pending',
  'Verification passed','Counter discontinuity detected','Method ready for review','Source records contradict']
 },
 es:{
 SHORT:['recibido','rechazado','fuente necesaria','pendiente','prueba superada',
  'salto de contador','preparado','contradicho'],
 ENGINEERING:['Mensaje recibido','Trama rechazada','Se requiere registro fuente',
  'Verificación pendiente','Prueba de verificación superada',
  'Discontinuidad del contador detectada','Método listo para revisión',
  'Los registros fuente se contradicen']
 },
 fr:{
 SHORT:['reçu','rejeté','source requise','en attente','test réussi',
  'saut de compteur','prêt','contradictoire'],
 ENGINEERING:['Message reçu','Trame rejetée','Document source requis','Vérification en attente',
  'Test de vérification réussi','Discontinuité du compteur détectée',
  'Méthode prête pour examen','Les sources se contredisent']
 },
 de:{
 SHORT:['empfangen','abgewiesen','Quelle nötig','ausstehend','bestätigt',
  'Zählerlücke','bereit','widersprüchlich'],
 ENGINEERING:['Nachricht empfangen','Frame abgewiesen','Quelldatensatz erforderlich',
  'Prüfung ausstehend','Prüfung bestanden','Zählerunterbrechung erkannt',
  'Methode zur Prüfung bereit','Quelldatensätze widersprechen sich']
 }
};
const sha=x=>createHash('sha256').update(x).digest('hex');
const valid=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
export function replayControlledTranslationV29(input,output){
 if(!valid(input)||!valid(output)||typeof input.locale_tag!=='string')
  throw Error('INVALID_TRANSLATION_AUDIT_INPUT');
 let locale;
 try{locale=Intl.getCanonicalLocales(input.locale_tag)[0];}catch{throw Error('INVALID_LOCALE_TAG')}
 if(!locale)throw Error('INVALID_LOCALE_TAG');
 const language=new Intl.Locale(locale).language;
 if(!Object.hasOwn(reverse,language)||!Object.hasOwn(reverse[language],input.register))
  throw Error('UNSUPPORTED_TRANSLATION_AUDIT_LANGUAGE');
 const words=reverse[language][input.register],
  idx=words.indexOf(output.output_text);
 const expected=keys.indexOf(input.message_code);
 if(expected<0)throw Error('UNKNOWN_SEMANTIC_MESSAGE');
 const origin=JSON.stringify([input.source_commit,input.scope_id,input.subject_id,
  input.source_ref,input.source_version,input.source_owner,input.message_code,
  locale,input.register]);
 const problems=[];
 if(idx!==expected)problems.push('MESSAGE_CODE_OR_LEXICON_DRIFT');
 if(output.version!=='MPC_V29_CONTROLLED_TRANSLATION_1'||
    output.canonical_locale!==locale||output.register!==input.register||
    output.semantic_code!==input.message_code)problems.push('LOCALE_OR_MESSAGE_METADATA_CHANGED');
 if(output.source_ref!==input.source_ref||output.source_version!==input.source_version||
    output.source_owner!==input.source_owner)
   problems.push('SOURCE_IDENTITY_CHANGED');
 if(output.input_fingerprint!==sha(origin)||output.output_utf8_sha256!==sha(output.output_text))
   problems.push('SOURCE_OR_OUTPUT_DIGEST_CHANGED');
 if(output.authoritative_source_verified!==false||output.transmitted!==false||
  output.canonical_promotion!==false||output.translation_state!=='CONTROLLED_VOCABULARY_REALIZED')
   problems.push('OUTPUT_STATUS_ESCALATED');
 return {version:'MPC_V29_TRANSLATION_REPLAY_1',
  state:problems.length?'TRANSLATION_REPLAY_REJECTED':'CONTROLLED_TRANSLATION_REPLAY_PASS',
  problems,language,canonical_locale:locale,expected_semantic_message:input.message_code,
  actual_decoded_message:idx>=0?keys[idx]:'UNKNOWN_LEXEME',
  independent_decoding_performed:true,source_authentication:false};
}
