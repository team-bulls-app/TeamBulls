import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const fail=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const has=(text,needle,message)=>{if(!text.includes(needle))fail.push(message);};
const assert=(value,message)=>{if(!value)fail.push(message);};

const modulePath='modules/photo-quality-download-v10_10_9.js';
const conversionPath='modules/heic-report-conversion-v10_10_12.js';
assert(fs.existsSync(path.join(root,modulePath)),'Módulo de qualidade/download de fotos ausente.');
assert(fs.existsSync(path.join(root,conversionPath)),'Módulo de conversão/preparo de fotos ausente.');
const source=read(modulePath);
const conversion=read(conversionPath);
const config=read('config_v10_7.js');
const firebaseConfig=JSON.parse(read('firebase.json'));
const storagePath=String(firebaseConfig?.storage?.rules||'');
assert(storagePath==='firebase/storage_6.rules','firebase.json não aponta para Storage 6.');
assert(fs.existsSync(path.join(root,storagePath)),`Regras Storage ativas ausentes: ${storagePath}`);
const rules=fs.existsSync(path.join(root,storagePath))?read(storagePath):'';

has(source,"const VERSION='10.10.9-photoquality2'",'Revisão móvel photoquality2 não está ativa.');
has(source,"const ORIGINAL_KIND='progressPhotoOriginals'",'Arquivo original não é preservado em caminho separado.');
has(source,'MAX_ORIGINAL_BYTES=25*1024*1024','Limite de original de 25 MiB ausente.');
has(source,'buildProgressPhotoVariants.__tbOriginalArchive','Captura da foto fonte antes da otimização ausente.');
has(source,"kind==='progressPhotos'?pendingOriginals.get(dataUrl):null",'Original não acompanha o upload da foto de progresso.');
has(source,"contentDisposition:`attachment; filename=",'Original não preserva nome para download.');
has(source,"button.textContent='↓ BAIXAR FOTO ORIGINAL'",'Botão de download do treinador ausente.');
has(source,"CURRENT_USER?.role==='trainer'",'Download não está restrito à interface do treinador.');
has(source,'safePhotoDataUrl(record?.dataUrl)','Compatibilidade de download com fotos antigas em Firestore ausente.');
has(source,'service.ref(original).delete()','Exclusão não remove o original associado.');
has(source,"if(raw==='image/jpg'||raw==='image/pjpeg')return'image/jpeg'",'MIME JPEG móvel alternativo não é normalizado.');
has(source,"createImageBitmap(file,{imageOrientation:'from-image'})",'Primeira tentativa de decode móvel com orientação está ausente.');
has(source,'createImageBitmap(file);','Fallback Android/WebView sem opções está ausente.');
has(source,'releaseLegacyReportPreviewSurfaces()','Previews pesados não são liberados antes da compressão.');
has(source,'encodeImageVariant(decoded,520,.68,240000)','Preview leve de relatório não está limitado a 520 px.');
has(source,"type==='image/heic'||type==='image/heif'",'HEIC/HEIF não possui diagnóstico específico de incompatibilidade.');

has(conversion,'const preparedJpegInputs=new WeakMap()','JPG preparado na prévia não é reaproveitado no envio.');
has(conversion,'reportPreviewDepth>0&&isJpeg(file)','Preparação antecipada de JPG não está limitada ao fluxo de prévia do relatório.');
has(conversion,'encodeImageVariant(decoded,1280,.78,850000)','JPG não é reduzido para a mesma variante canônica antes de liberar a superfície original.');
has(conversion,'preparedJpegInputs.delete(file);return baseDecode(prepared);','Envio ainda tenta decodificar novamente o JPG original em alta resolução.');
has(conversion,"await withReportPreview(()=>base(slot,syntheticEvent(selected[slot])))",'Seleção em lote de seis fotos não ativa a preparação antecipada de JPG.');
has(conversion,"return withReportPreview(()=>base.apply(context,args))",'Seleção individual de foto não ativa a preparação antecipada de JPG.');

has(config,"./modules/photo-quality-download-v10_10_9.js?v=10.10.9-photoquality2",'Loader não inclui a revisão móvel de qualidade/download.');
has(config,"./modules/heic-report-conversion-v10_10_12.js?v=10.10.12-heic4",'Loader não inclui o runtime mutável de conversão/preparo de fotos.');
has(rules,'match /progressPhotoOriginals/{uid}/{photoId}','Regras do Storage não cobrem originais.');
has(rules,"request.resource.contentType.matches('image/(jpeg|png|webp|gif|avif|heic|heif)')",'Tipos de imagem originais permitidos estão incorretos.');
has(rules,'validOriginalProgressPhoto(25 * 1024 * 1024)','Limite do Storage para original não é 25 MiB.');
has(rules,'function trainerOwns(uid)','Regras do Storage não validam o vínculo treinador → aluno.');
has(rules,'allow read: if trainerOwns(uid) || activeOwner(uid);','Treinador vinculado/aluno não têm leitura compatível com fotos existentes.');
assert(!rules.includes('allow read: if isTrainer() || activeOwner(uid);'),'Qualquer treinador voltou a ter acesso às fotos de qualquer aluno.');

if(fail.length){console.error('\nFalhas de qualidade/download de fotos:\n- '+fail.join('\n- '));process.exit(1);}
console.log('Photo quality/download check OK — decode móvel, JPG preparado uma vez, original preservado e download restrito ao treinador vinculado.');
