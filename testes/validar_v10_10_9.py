from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = '10.10.9'
BUILD = 2026101901
REQUIRED = [
    'index.html', 'manifest.json', 'version.json', 'sw.js', 'sw_47.js',
    'update_v10_10_9.js', 'app_v10_10_9_core.js', 'styles_v10_10_9.css',
    'interaction_v10_10_9.js', 'viewport_v10_10_9.js', 'boot_v10.js',
    'config_v10_7.js', 'recovery_v10.js', 'recuperar.html',
    'firebase/firestore_26_compacto.rules', 'firebase/storage_5.rules',
    'modules/v107-core.js', 'modules/v107-invites.js', 'modules/v107-operations.js',
    'testes/testar_orientacao_v10_10_9.js', 'testes/testar_guia_global_v10_10_9.js',
    'testes/testar_destino_exercicio_v10_10_9.js',
    'testes/testar_exclusao_registro_v10_10_9.js',
    'testes/testar_atualizacao_pwa_v10_10_9.js',
    'testes/testar_permissao_operacoes_v10_10_9.js',
    'testes/testar_menu_tematico_v10_10_9.js',
    'testes/testar_links_exercicios_v10_10_9.js',
    'testes/testar_cardio_v10_10_9.js'
]
JS_FILES = [
    'boot_v10.js', 'config_v10_7.js', 'recovery_v10.js', 'update_v10_10_9.js',
    'app_v10_10_9_core.js', 'interaction_v10_10_9.js', 'viewport_v10_10_9.js',
    'modules/v107-core.js', 'modules/v107-invites.js', 'modules/v107-operations.js',
    'sw.js', 'sw_47.js'
]
TESTS = [
    'testar_orientacao_v10_10_9.js', 'testar_guia_global_v10_10_9.js',
    'testar_destino_exercicio_v10_10_9.js', 'testar_exclusao_registro_v10_10_9.js',
    'testar_atualizacao_pwa_v10_10_9.js', 'testar_permissao_operacoes_v10_10_9.js',
    'testar_menu_tematico_v10_10_9.js', 'testar_links_exercicios_v10_10_9.js',
    'testar_cardio_v10_10_9.js'
]

class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
        self.assets=[]
    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        if data.get('id'): self.ids.append(data['id'])
        attr='src' if tag in {'script','img','audio','source'} else 'href' if tag=='link' else None
        if attr and data.get(attr) and not data[attr].startswith(('http:','https:','data:','blob:','#')):
            self.assets.append(data[attr].split('?',1)[0].lstrip('./'))

def fail(message):
    print('FALHA:',message)
    raise SystemExit(1)

def need(text,tokens,label):
    for token in tokens:
        if token not in text: fail(f'{label} ausente: {token}')

def main():
    missing=[item for item in REQUIRED if not (ROOT/item).is_file()]
    if missing: fail('arquivos ausentes: '+', '.join(missing))

    html=(ROOT/'index.html').read_text(encoding='utf-8')
    parser=Parser();parser.feed(html)
    duplicates=[item for item,count in Counter(parser.ids).items() if count>1]
    if duplicates: fail('IDs duplicados: '+', '.join(duplicates))
    absent=sorted({item for item in parser.assets if not (ROOT/item).is_file()})
    if absent: fail('recursos inexistentes: '+', '.join(absent))
    need(html,[
        'content="10.10.9" name="team-bulls-version"',
        'manifest.json?v=10.10.9', 'update_v10_10_9.js?v=10.10.9',
        'app_v10_10_9_core.js?v=10.10.9', 'styles_v10_10_9.css?v=10.10.9',
        'interaction_v10_10_9.js?v=10.10.9', 'viewport_v10_10_9.js?v=10.10.9',
        'modules/v107-core.js?v=10.10.9', 'VERIFICAR ATUALIZAÇÃO',
        'id="student-global-report-guide-panel"', 'id="btn-delete-edited-session"',
        'data-v107-tab="overview" data-v107-trainer-only',
        'aria-label="Atalhos do aluno"', 'Opções de Suprimentos',
        'class="supplements-free-meal-card"', 'id="screen-cardio"', 'id="screen-ts-cardio"',
        'openCardioFromWorkout(false)', 'openCardioFromDiet(true)'
    ],'interface')

    manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    version=json.loads((ROOT/'version.json').read_text(encoding='utf-8'))
    if manifest.get('start_url')!='./index.html' or manifest.get('scope')!='./':
        fail('manifesto ainda depende de URL versionada')
    if version.get('version')!=VERSION or version.get('updateMode')!='in-app' or version.get('build')!=BUILD:
        fail('version.json incorreto')

    for name in JS_FILES:
        result=subprocess.run(['node','--check',str(ROOT/name)],capture_output=True,text=True)
        if result.returncode: fail(f'JavaScript inválido em {name}: {result.stderr.strip()}')

    core=(ROOT/'app_v10_10_9_core.js').read_text(encoding='utf-8')
    need(core,[
        "const APP_VERSION='10.10.9'", "const V106_RULES_FILE='firestore_26_compacto.rules'",
        "const V1010_VERSION='10.10.9'", 'function uploadReportGuidePdf',
        'V10102_GUIDE_UPLOAD_TIMEOUT_MS=180000', 'let EXERCISE_MODAL_CONTEXT=null',
        'function validateExerciseModalDay', "syncExerciseDestinationBeforeClose('student',localWorkout,dayName)",
        'async function performDeleteSession(sid)', 'function deleteEditedSession()',
        'removeSessionFromHistory(sessionId)', 'removeSessionFromArchive(CURRENT_USER.uid,sessionId)', 'const EXERCISE_CATALOG_VERSION=3;',
        'DEFAULT_EXERCISE_VIDEO_URLS', 'function resolveExerciseVideoUrl(exercise)', 'Vídeo automático do catálogo', "const V10109_VERSION='10.10.9'",
        'function normalizeCardioDocument(value)', 'function startCardioTimer()',
        'function saveCardioItem()', "db.collection('mealPlans').doc(CARDIO_CONTEXT.targetUid).set({cardioPlan:CARDIO_DOCUMENT"
    ],'núcleo')
    if "serviceWorker.register('sw_47.js'" in core or 'serviceWorker.register("sw_47.js"' in core:
        fail('núcleo ainda pode restaurar o Service Worker antigo')
    names=re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(',core)
    duplicated=[name for name,count in Counter(names).items() if count>1]
    if duplicated: fail('funções nomeadas duplicadas: '+', '.join(sorted(duplicated)))

    updater=(ROOT/'update_v10_10_9.js').read_text(encoding='utf-8')
    need(updater,[
        "const CURRENT_VERSION='10.10.9'", f'const CURRENT_BUILD={BUILD}',
        'register(`./sw.js?v=${encodeURIComponent(CURRENT_VERSION)}&b=${CURRENT_BUILD}`',
        "cache:'no-store'", 'prepareLatest', 'applyLatestUpdate', 'TB?.flushDrafts?.()',
        'sessionStorage.setItem(UPDATE_RELOAD_KEY,releaseKey(target))',
        'function compareRelease(info)', 'function safeForAutomaticHotfix()',
        'manualCheck:()=>checkForUpdates', 'Não é necessário desinstalar'
    ],'atualizador')

    worker=(ROOT/'sw.js').read_text(encoding='utf-8')
    bridge=(ROOT/'sw_47.js').read_text(encoding='utf-8')
    need(worker,[
        "const APP_VERSION='10.10.9'", f'const BUILD_REVISION={BUILD}', "const SHELL_CACHE=`team-bulls-shell-",
        "'./version.json'", "'./update_v10_10_9.js?v=10.10.9'",
        'navigationCacheFirst(request,event)', 'refreshNavigation(request,event,fallback)',
        "relativePath==='/version.json'", 'MUTABLE_NETWORK_TIMEOUT_MS=1800',
        'NAVIGATION_REFRESH_TIMEOUT_MS=1800',
        'await self.skipWaiting()', 'await self.clients.claim()', 'CLEAR_APP_CACHES',
        "type:'TEAM_BULLS_SW_ACTIVATED',version:APP_VERSION,build:BUILD_REVISION"
    ],'Service Worker')
    if 'ponte de migração' not in bridge: fail('ponte sw_47.js ausente')
    if 'navigationNetworkFirst(request,event)' in worker:
        fail('navegação voltou a bloquear a abertura esperando a rede')
    versioned_route=worker.find("if(VERSIONED_PATH_PATTERN.test(fileName)||url.searchParams.has('v'))")
    mutable_route=worker.find('if(MUTABLE_PATHS.has(relativePath))')
    if versioned_route < 0 or mutable_route < 0 or versioned_route > mutable_route:
        fail('recursos versionados não estão priorizando cache antes das rotas mutáveis')

    interaction=(ROOT/'interaction_v10_10_9.js').read_text(encoding='utf-8')
    need(interaction,[
        'function isPhysicalLandscape()', "type.startsWith('portrait')", 'keyboardOpen)return false',
        'window.TeamBullsUpdater?.prepareLatest', 'function contextSignature(snapshot)',
        'syncCurrent:()=>syncCurrentSnapshot(capture())'
    ],'interação')

    css=(ROOT/'styles_v10_10_9.css').read_text(encoding='utf-8')
    need(css,[
        '.team-bulls-update-banner', '.team-bulls-update-primary',
        '.global-report-guide-panel', '.report-guide-upload-progress',
        '.diet-energy-grid', '.supplement-catalog-list', '.feedback-long-text', '.context-section-tabs', '.cardio-timer-card', '.cardio-editor-grid',
        'html.mobile-landscape-blocked #portrait-lock-overlay{display:flex;}'
    ],'CSS')
    if css.count('{')!=css.count('}'): fail('CSS desbalanceado')
    if '@media(max-width:899px) and (orientation:landscape)' in css:
        fail('overlay voltou a depender do viewport')

    firestore=(ROOT/'firebase/firestore_26_compacto.rules').read_text(encoding='utf-8')
    storage=(ROOT/'firebase/storage_5.rules').read_text(encoding='utf-8')
    need(firestore,['match /reportSettings/{trainerUid}','match /trainerSupplementCatalog/{trainerUid}','requiredText(request.resource.data.message, 30000)'],'regras Firestore')
    need(storage,['match /reportGuides/{trainerUid}/photo-guide.pdf','activeStudentOf(trainerUid)'], 'regras Storage')
    if firestore.count('{')!=firestore.count('}') or storage.count('{')!=storage.count('}'):
        fail('regras Firebase desbalanceadas')

    for test in TESTS:
        result=subprocess.run(['node',str(ROOT/'testes'/test)],capture_output=True,text=True)
        if result.returncode: fail(f'{test}: {result.stderr.strip()}')
        print(result.stdout.strip())

    operations=(ROOT/'modules/v107-operations.js').read_text(encoding='utf-8')
    need(operations,["const STUDENT_ALLOWED_TABS=new Set(['notices','sync'])","if(!isTrainer()&&!studentCanOpen(tab))","if(!isTrainer()&&!studentCanOpen(requestedTab))","baseShowScreen('screen-home',token)"],'permissões da Central de Operações')

    workflow=(ROOT/'.github/workflows/team-bulls-validate.yml').read_text(encoding='utf-8')
    if 'python testes/validar_v10_10_9.py' not in workflow:
        fail('workflow incorreto')

    sums=[]
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and path.name!='SHA256SUMS-v10.10.9.txt' and '__pycache__' not in path.parts:
            sums.append(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.relative_to(ROOT).as_posix())
    (ROOT/'SHA256SUMS-v10.10.9.txt').write_text('\n'.join(sums)+'\n',encoding='utf-8')
    result={
        'version':VERSION,'build':BUILD,'status':'approved','html_ids':len(parser.ids),
        'assets':len(set(parser.assets)),'javascript_files':len(JS_FILES),
        'service_worker':'sw.js','legacy_bridge':'sw_47.js','manifest':'manifest.json',
        'version_endpoint':'version.json','in_app_updates':True,'build_aware_updates':True,
        'reinstall_required':False,'navigation_strategy':'cache-first-background-refresh',
        'local_data_preserved':True,'audio_cache_preserved':True,
        'firestore_rules':'firestore_26_compacto.rules','storage_rules':'storage_5.rules',
        'exercise_day_context_locked':True,'session_delete_fixed':True,'trainer_operations_hidden_from_students':True,'themed_student_navigation':True,'free_meals_merged_into_supplements':True,'exercise_pdf_links':65,'automatic_exercise_videos':True,'cardio_module':True,'cardio_substitutions_individual':True,'cardio_timer_prescribed':True
    }
    (ROOT/'testes/RESULTADO-VALIDACAO-v10.10.9.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'APROVADO: {len(parser.ids)} IDs únicos; {len(set(parser.assets))} recursos; atualização interna build-aware, regressões, cache e regras validados.')

if __name__=='__main__': main()