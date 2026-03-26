const fs = require('fs');
const path = require('path');

/**
 * Lê o arquivo de eventos por linha CSV (JSONL) e agrupa por rowId.
 * 
 * @param {string} projectRoot Caminho raiz do projeto
 * @returns {Object} { byRow: { [rowId]: Event[] }, allEvents: Event[] }
 */
function readRowEvents(projectRoot) {
    const jsonlPath = path.join(projectRoot, 'target', 'karate-row-events.jsonl');
    const result = { byRow: {}, allEvents: [] };

    if (!fs.existsSync(jsonlPath)) {
        // Fallback: tenta o .log antigo
        const logPath = path.join(projectRoot, 'target', 'karate-row-events.log');
        if (!fs.existsSync(logPath)) return result;
        try {
            const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
            lines.forEach(line => {
                try {
                    const evt = JSON.parse(line);
                    result.allEvents.push(evt);
                    const key = evt.rowId != null ? String(evt.rowId) : 'unknown';
                    if (!result.byRow[key]) result.byRow[key] = [];
                    result.byRow[key].push(evt);
                } catch(e) { /* skip malformed */ }
            });
        } catch(e) { console.error('Erro ao ler log antigo:', e); }
        return result;
    }

    try {
        const lines = fs.readFileSync(jsonlPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
        lines.forEach(line => {
            try {
                const evt = JSON.parse(line);
                result.allEvents.push(evt);
                const key = evt.rowId != null ? String(evt.rowId) : 'unknown';
                if (!result.byRow[key]) result.byRow[key] = [];
                result.byRow[key].push(evt);
            } catch(e) { /* skip malformed */ }
        });
    } catch(e) {
        console.error('❌ Erro ao ler karate-row-events.jsonl:', e);
    }

    return result;
}

/**
 * Mapeia os screenshots de um feature no diretório do Karate.
 * 
 * @param {string} reportsDir Diretório onde estão os relatórios (target/karate-reports)
 * @param {string} packageQualifiedName O nome qualificado do pacote (e.g., Faturamento.criacaoNF.karateTests.UITests.peopleSoft)
 * @returns {Array} Retorna a lista de screenshots parseadas e ordenadas cronologicamente
 */
function mapScreenshots(reportsDir) {
    if (!fs.existsSync(reportsDir)) return [];
    
    const screenshots = [];
    const files = fs.readdirSync(reportsDir);

    files.forEach(file => {
        if (file.endsWith('.png') && !file.includes('karate-logo')) {
            const parts = file.replace('.png', '').split('_');
            // Formato esperado: package.Name_N_timestamp.png
            if (parts.length >= 3) {
                const timestamp = parseInt(parts[parts.length - 1], 10);
                const scenarioIndex = parseInt(parts[parts.length - 2], 10);
                const featureName = parts.slice(0, parts.length - 2).join('_');
                
                screenshots.push({
                    filename: file,
                    featureName: featureName,
                    filepath: path.join(reportsDir, file),
                    timestamp: timestamp,
                    scenarioIndex: scenarioIndex
                });
            }
        }
    });

    // Ordenar por timestamp
    return screenshots.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Lê uma imagem e codifica em base64.
 * 
 * @param {string} filepath Caminho para a imagem
 * @returns {string} String com Data URI base64
 */
function getImageBase64(filepath) {
    try {
        const fileData = fs.readFileSync(filepath);
        const base64Str = Buffer.from(fileData).toString('base64');
        return `data:image/png;base64,${base64Str}`;
    } catch (e) {
        console.error('❌ Erro ao ler imagem base64:', filepath, e);
        return null;
    }
}

/**
 * Constrói o HTML do relatório embutindo dados e imagens.
 */
// Paleta de 10 cores vibrantes para regiões
const REGION_COLORS = [
    { border: '#2563eb', bg: '#eff6ff', text: '#1e40af' }, // azul
    { border: '#7c3aed', bg: '#f5f3ff', text: '#5b21b6' }, // roxo
    { border: '#059669', bg: '#ecfdf5', text: '#065f46' }, // verde
    { border: '#d97706', bg: '#fffbeb', text: '#92400e' }, // amarelo
    { border: '#e11d48', bg: '#fff1f2', text: '#9f1239' }, // rosa
    { border: '#0891b2', bg: '#ecfeff', text: '#155e75' }, // ciano
    { border: '#ea580c', bg: '#fff7ed', text: '#9a3412' }, // laranja
    { border: '#4f46e5', bg: '#eef2ff', text: '#3730a3' }, // indigo
    { border: '#0d9488', bg: '#f0fdfa', text: '#134e4a' }, // teal
    { border: '#c026d3', bg: '#fdf4ff', text: '#86198f' }, // fúcsia
];

function hashLabelToColorIndex(label) {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = ((hash << 5) - hash) + label.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % REGION_COLORS.length;
}

function buildHtmlReport(summary, featureDetails, screenshotsContent, envInfo, rowEvents, stdoutRowEvents) {
    // Calculo de cor base no status
    let statusClass = summary.failed ? 'text-red-500 bg-red-100 border-red-500' : 'text-green-500 bg-green-100 border-green-500';
    let statusIcon = summary.failed ? '❌ Falhou' : '✅ Sucesso';

    // Construção dos Steps HTML
    let stepsHtml = '';

    // Regex para detectar marcadores de etapa nos stepLogs
    const ETAPA_INICIO_RE = /➡️\s*Etapa\s*Inicio\s*:\s*(.*)/i;
    const ETAPA_FIM_RE    = /➡️\s*Etapa\s*Fim\s*:/i;
    const ETAPA_SIMPLES_RE = /➡️\s*Etapa\s*:\s*(.*)/i;
    // Regex para detectar marcadores @@STEP nos logs ou no texto do step
    const AT_STEP_LOG_RE = /@@STEP:\d+:(.*)/;
    const AT_STEP_TEXT_RE = /print\s+['"]@@STEP:/;

    /**
     * Classifica um stepResult como marcador de etapa ou step técnico.
     * Retorna: { type: 'etapa_inicio'|'etapa_fim'|'etapa'|'step', label?: string, stepResult }
     *
     * Detecta tanto os marcadores ➡️ Etapa quanto os @@STEP: usados nos features Karate.
     */
    function classifyStep(stepResult) {
        const log = stepResult.stepLog ? String(stepResult.stepLog).trim() : null;
        const doc = stepResult.doc ? String(stepResult.doc).trim() : null;
        const stepText = (stepResult.step && stepResult.step.text) ? String(stepResult.step.text).trim() : '';

        // Tentar extrair etapa do stepLog (saída avaliada do print)
        if (log) {
            let m;
            if ((m = log.match(ETAPA_INICIO_RE))) {
                return { type: 'etapa_inicio', label: m[1].trim(), stepResult };
            }
            if (ETAPA_FIM_RE.test(log)) {
                return { type: 'etapa_fim', label: '', stepResult };
            }
            if ((m = log.match(ETAPA_SIMPLES_RE))) {
                return { type: 'etapa', label: m[1].trim(), stepResult };
            }
            // Detectar @@STEP no log (saída avaliada, ex: "@@STEP:0:Buscando Unidade...")
            if ((m = log.match(AT_STEP_LOG_RE))) {
                return { type: 'etapa', label: m[1].trim(), stepResult };
            }
        }

        // Tentar extrair @@STEP do doc (algumas versões do Karate colocam print output aqui)
        if (doc) {
            let m;
            if ((m = doc.match(AT_STEP_LOG_RE))) {
                return { type: 'etapa', label: m[1].trim(), stepResult };
            }
        }

        // Fallback: detectar @@STEP no texto bruto do step (ex: "print '@@STEP:' + __loop + ':Label'")
        // Extraímos o rótulo estático da string (a parte após o segundo ':' no literal de string)
        if (AT_STEP_TEXT_RE.test(stepText)) {
            const labelMatch = stepText.match(/@@STEP:[^:]*:([^'"]+)/);
            if (labelMatch) {
                // Limpa possíveis concatenações de variáveis Karate (ex: "' + VAR" → remove)
                let rawLabel = labelMatch[1].replace(/['"]\s*\+.*$/, '').trim();
                if (rawLabel) {
                    return { type: 'etapa', label: rawLabel, stepResult };
                }
            }
        }

        return { type: 'step', stepResult };
    }

    /**
     * Agrupa os steps de um cenário em blocos de etapa.
     * Cada bloco: { label: string, steps: [stepResult], hasError: boolean }
     * Steps fora de uma etapa ficam em um bloco com label vazio.
     */
    function groupStepsByEtapa(stepResults) {
        const groups = [];
        let currentGroup = null;

        stepResults.forEach(stepResult => {
            const classified = classifyStep(stepResult);

            switch (classified.type) {
                case 'etapa_inicio':
                    // Fecha grupo anterior se existir
                    if (currentGroup) groups.push(currentGroup);
                    currentGroup = { label: classified.label, steps: [], hasError: false };
                    break;

                case 'etapa':
                    // Fecha grupo anterior se existir
                    if (currentGroup) groups.push(currentGroup);
                    currentGroup = { label: classified.label, steps: [], hasError: false };
                    break;

                case 'etapa_fim':
                    // Fecha o grupo atual
                    if (currentGroup) {
                        groups.push(currentGroup);
                        currentGroup = null;
                    }
                    break;

                case 'step':
                default:
                    // Se não estamos dentro de um grupo, cria um grupo "solto"
                    if (!currentGroup) {
                        currentGroup = { label: '', steps: [], hasError: false };
                    }
                    currentGroup.steps.push(stepResult);
                    if (stepResult.result && stepResult.result.status === 'failed') {
                        currentGroup.hasError = true;
                    }
                    break;
            }
        });

        // Fecha último grupo pendente
        if (currentGroup) groups.push(currentGroup);
        return groups;
    }



    // ═══ Reatribuir screenshots às linhas CSV corretas usando eventos @@SCREENSHOT do stdout ═══
    // O Karate gera PNGs com scenarioIndex fixo (índice do cenário, não do __loop).
    // Usamos mapeamento por ROW (não posicional puro) para lidar com screenshots extras de falha.
    //
    // Quando uma linha falha, o Karate automaticamente captura um PNG extra de falha que NÃO tem
    // evento @@SCREENSHOT correspondente. O mapeamento posicional simples deslocaria todos os PNGs
    // subsequentes, atribuindo o screenshot de falha à linha errada.
    //
    // Algoritmo: processar linha por linha em ordem. Para cada linha:
    //   1) Atribuir PNGs aos eventos @@SCREENSHOT dessa linha (na ordem)
    //   2) Se a linha FALHOU, consumir 1 PNG extra como screenshot de falha
    const screenshotEvents = (stdoutRowEvents || []).filter(e => e.type === 'SCREENSHOT');
    console.log(`📸 Reatribuição: ${screenshotEvents.length} eventos SCREENSHOT, ${screenshotsContent.length} arquivos PNG`);

    if (screenshotEvents.length > 0 && screenshotsContent.length > 0) {
        // Ordenar PNGs por timestamp
        screenshotsContent.sort((a, b) => a.timestamp - b.timestamp);

        // Agrupar eventos SCREENSHOT por rowIndex (preservando ordem de aparição)
        const eventsByRow = {};
        screenshotEvents.forEach(evt => {
            if (!eventsByRow[evt.rowIndex]) eventsByRow[evt.rowIndex] = [];
            eventsByRow[evt.rowIndex].push(evt);
        });

        // Precisamos do status de cada linha para detectar falhas — construir um mapa rápido
        // (rowExecSummaries ainda não existe neste ponto, então usamos stdoutRowEvents direto)
        const rowStatusForMapping = {};
        (stdoutRowEvents || []).forEach(evt => {
            if (evt.type === 'ROW_END' && evt.rowIndex !== undefined) {
                rowStatusForMapping[evt.rowIndex] = evt.status;
            }
        });

        // Todas as linhas que tiveram screenshots OU que falharam (podem ter failure PNG)
        const allRowsForMapping = [...new Set([
            ...Object.keys(eventsByRow).map(Number),
            ...Object.keys(rowStatusForMapping).map(Number)
        ])].sort((a, b) => a - b);

        let pngIdx = 0;
        allRowsForMapping.forEach(rowIdx => {
            const eventsForRow = eventsByRow[rowIdx] || [];
            const rowFailed = rowStatusForMapping[rowIdx] === 'FAILED';

            // 1) Atribuir PNGs planejados (@@SCREENSHOT events)
            eventsForRow.forEach(evt => {
                if (pngIdx < screenshotsContent.length) {
                    console.log(`   📸 [${pngIdx}] PNG → row ${evt.rowIndex} (${evt.name}) [planejado]`);
                    screenshotsContent[pngIdx].scenarioIndex = evt.rowIndex;
                    screenshotsContent[pngIdx].screenshotName = evt.name || '';
                    pngIdx++;
                }
            });

            // 2) Se a linha falhou, consumir 1 PNG extra como screenshot de falha do Karate
            if (rowFailed && pngIdx < screenshotsContent.length) {
                console.log(`   📸 [${pngIdx}] PNG → row ${rowIdx} [failure screenshot auto-capturado pelo Karate]`);
                screenshotsContent[pngIdx].scenarioIndex = rowIdx;
                screenshotsContent[pngIdx].screenshotName = '';
                screenshotsContent[pngIdx].isFail = true;
                pngIdx++;
            }
        });

        // PNGs restantes (se houver) mantêm o scenarioIndex original
        if (pngIdx < screenshotsContent.length) {
            console.log(`   ⚠️ ${screenshotsContent.length - pngIdx} PNG(s) não mapeados — mantendo scenarioIndex original`);
        }
    }

    // Agrupar screenshots por linha CSV (agora com scenarioIndex corrigido)
    const screenshotsByScenario = {};
    screenshotsContent.forEach(s => {
        const key = s.scenarioIndex !== undefined ? s.scenarioIndex : 0;
        if (!screenshotsByScenario[key]) screenshotsByScenario[key] = [];
        screenshotsByScenario[key].push(s);
    });
    const scenarioKeys = Object.keys(screenshotsByScenario).sort((a, b) => Number(a) - Number(b));
    const numScenarios = scenarioKeys.length;

    // Extrair labels do CSV via rowEvents para headers mais descritivos
    const rowLabels = {};
    if (rowEvents && rowEvents.byRow) {
        Object.keys(rowEvents.byRow).forEach(key => {
            const startEvt = rowEvents.byRow[key].find(e => e.event === 'ROW_START' && e.label);
            if (startEvt) rowLabels[key] = startEvt.label;
        });
    }

    // Construir resumo por linha a partir dos eventos do stdout (usado por renderSteps e galeria)
    const rowExecSummaries = {};
    if (stdoutRowEvents && stdoutRowEvents.length > 0) {
        stdoutRowEvents.forEach(evt => {
            const idx = evt.rowIndex;
            if (idx === undefined || idx === null) return;
            if (!rowExecSummaries[idx]) {
                rowExecSummaries[idx] = { index: idx, label: '', status: null, steps: [], errorMessage: null, endMessage: null, startTs: null, endTs: null, screenshots: 0, csvData: null, retries: [] };
            }
            const row = rowExecSummaries[idx];
            switch (evt.type) {
                case 'ROW_START':
                    row.label = evt.label || `Linha ${idx + 1}`;
                    row.startTs = Date.now();
                    break;
                case 'ROW_END':
                    row.status = evt.status;
                    row.endTs = Date.now();
                    break;
                case 'ROW_END_MSG':
                    row.endMessage = evt.message;
                    break;
                case 'ROW_FAIL_REASON':
                    row.errorMessage = evt.error;
                    break;
                case 'STEP':
                    row.steps.push(evt.step);
                    break;
                case 'ROW_DATA':
                    if (evt.csvData) row.csvData = evt.csvData;
                    break;
                case 'SCREENSHOT':
                case 'SCREENSHOT_FAIL':
                    row.screenshots++;
                    if (evt.type === 'SCREENSHOT_FAIL' && evt.error) {
                        row.errorMessage = row.errorMessage || evt.error;
                    }
                    break;
                case 'RETRY':
                case 'RETRY_FAIL':
                case 'RETRY_OK':
                    row.retries.push({ type: evt.type, message: evt.message });
                    break;
            }
        });
    }
    // Enriquecer rowLabels com labels dos stdout events
    Object.keys(rowExecSummaries).forEach(k => {
        if (rowExecSummaries[k].label && !rowLabels[k]) {
            rowLabels[k] = rowExecSummaries[k].label;
        }
    });

    // Contador de posição do screenshot dentro de uma iteração
    let screenshotPositionCounter = 0;

    // ═══ Detecção de execução multi-linha CSV ═══
    // Quando há múltiplas linhas CSV, o status dos steps na visão geral deve ser contextual:
    // um step que falhou em apenas 1 de N linhas não deve aparecer como "Falhou" de forma absoluta.
    const rowExecKeys = Object.keys(rowExecSummaries).sort((a, b) => Number(a) - Number(b));
    const isMultiRowExec = rowExecKeys.length > 1;
    const totalRowsExec = rowExecKeys.length;
    const failedRowsCount = rowExecKeys.filter(k => rowExecSummaries[k].status === 'FAILED').length;
    const passedRowsCount = rowExecKeys.filter(k => rowExecSummaries[k].status === 'PASSED').length;

    // Função recursiva principal para iterar calls aninhadas, agora com agrupamento por etapas estilo Power Automate Desktop
    function renderSteps(scenarioList, depth = 0) {
        let html = '';
        const pl = depth * 20; // padding left
        let globalLineNumber = 0;
        let failScreenshotRendered = false; // Flag para exibir screenshot de falha apenas no PRIMEIRO step que falhou

        // Helper local para renderizar uma única ação como linha PA
        function renderActionRow(stepResult) {
            let rowHtml = '';
            const stepStatus = stepResult.result.status;
            const isPassed = stepStatus === 'passed';
            const isFailed = stepStatus === 'failed';
            const stepText = stepResult.step.text;
            const log = stepResult.stepLog;

            let actionIcon = '⚡';
            let actionTitle = stepText;
            let actionDesc = '';

            if (stepText.match(/driver\.waitFor/)) {
                actionIcon = '⏳';
                actionTitle = 'Aguardar elemento da página';
                const selMatch = stepText.match(/driver\.waitFor\(["'](.+?)["']\)/);
                actionDesc = selMatch ? `Aguardar o elemento <code class="pa-var">${selMatch[1]}</code> aparecer na página` : 'Aguardar elemento aparecer na página da Web';
            } else if (stepText.match(/driver\.switchFrame\(null\)/)) {
                actionIcon = '🔄';
                actionTitle = 'Voltar ao frame principal';
                actionDesc = 'Retornar o contexto para o frame principal da página';
            } else if (stepText.match(/driver\.switchFrame/)) {
                actionIcon = '🔄';
                actionTitle = 'Navegar para frame';
                const selMatch = stepText.match(/driver\.switchFrame\(["'](.+?)["']\)/);
                actionDesc = selMatch ? `Alternar contexto para o frame <code class="pa-var">${selMatch[1]}</code>` : 'Alternar contexto para um frame da página';
            } else if (stepText.match(/driver\.click/)) {
                actionIcon = '🖱️';
                actionTitle = 'Clicar em elemento';
                const selMatch = stepText.match(/driver\.click\(["'](.+?)["']\)/);
                actionDesc = selMatch ? `Clicar no elemento <code class="pa-var">${selMatch[1]}</code>` : 'Clicar em um elemento da página';
            } else if (stepText.match(/driver\.input/)) {
                actionIcon = '⌨️';
                actionTitle = 'Digitar texto em campo';
                const valMatch = stepText.match(/driver\.input\(["'](.+?)["']\s*,\s*(.+)\)/);
                if (valMatch) {
                    actionDesc = `Digitar o valor <code class="pa-var-green">${valMatch[2].trim()}</code> no campo <code class="pa-var">${valMatch[1]}</code>`;
                } else {
                    actionDesc = 'Digitar valor em um campo da página';
                }
            } else if (stepText.match(/driver\.delay/)) {
                actionIcon = '⏱️';
                const delayMatch = stepText.match(/driver\.delay\((\d+)\)/);
                const ms = delayMatch ? delayMatch[1] : '?';
                actionTitle = 'Aguardar';
                actionDesc = `Aguardar <code class="pa-var">${ms}</code> ms antes de continuar`;
            } else if (stepText.match(/(?:driver\.)?screenshot\s*\(/)) {
                actionIcon = '📸';
                actionTitle = 'Capturar screenshot';
                actionDesc = `Capturar uma imagem da tela atual para evidência${numScenarios > 1 ? ` (📊 ${numScenarios} iterações de dados)` : ''}`;
                // Marca que este step tem screenshot para embutir abaixo — somente se executou de fato
                if (isPassed) {
                    stepResult._hasScreenshot = true;
                    stepResult._screenshotPos = screenshotPositionCounter;
                    screenshotPositionCounter++;
                }
            } else if (stepText.match(/driver\.highlight/)) {
                actionIcon = '🔦';
                actionTitle = 'Destacar elemento';
                const selMatch = stepText.match(/driver\.highlight\(["'](.+?)["']\)/);
                actionDesc = selMatch ? `Destacar visualmente o elemento <code class="pa-var">${selMatch[1]}</code>` : 'Destacar visualmente um elemento na página';
            } else if (log) {
                actionTitle = String(log).trim();
                actionDesc = stepText;
            } else if (stepText.match(/^call /)) {
                actionIcon = '↗️';
                actionTitle = 'Executar subfluxo';
                actionDesc = stepText;
            }

            let statusDot = '';
            if (isFailed) {
                if (isMultiRowExec && failedRowsCount < totalRowsExec) {
                    // Falha parcial: o step falhou em execução(ões) específica(s), não em todas
                    statusDot = `<span style="color: #d97706; margin-left: auto; font-size: 12px;">⚠️ Falhou em ${failedRowsCount} de ${totalRowsExec} execuções</span>`;
                } else {
                    statusDot = '<span style="color: #dc2626; margin-left: auto; font-size: 12px;">❌ Falhou</span>';
                }
            }

            const failBgColor = isFailed ? (isMultiRowExec && failedRowsCount < totalRowsExec ? 'background: #fffbeb;' : 'background: #fef2f2;') : '';
            rowHtml += `<div class="pa-action-row" style="${failBgColor}">`;
            rowHtml += `<span class="pa-line-num">${globalLineNumber}</span>`;
            rowHtml += `<span class="pa-action-icon">${actionIcon}</span>`;
            rowHtml += `<div class="pa-action-content">`;
            rowHtml += `<div class="pa-action-title">${actionTitle}</div>`;
            if (actionDesc) {
                rowHtml += `<div class="pa-action-desc">${actionDesc}</div>`;
            }
            rowHtml += `</div>`;
            if (statusDot) rowHtml += statusDot;
            if (stepResult.result.millis) {
                rowHtml += `<span class="pa-action-time">${stepResult.result.millis.toFixed(0)}ms</span>`;
            }
            rowHtml += `</div>`;

            // Se o step FALHOU, embutir o screenshot de falha automaticamente capturado pelo Karate
            // Apenas no PRIMEIRO step que falhou (os subsequentes herdam 'failed' mas não executaram)
            if (isFailed && !failScreenshotRendered) {
                // Coletar TODOS os screenshots de falha (isFail: true) de todas as linhas CSV
                const failScreenshots = [];
                scenarioKeys.forEach(key => {
                    const group = screenshotsByScenario[key];
                    if (group) {
                        group.forEach(ss => {
                            if (ss.isFail && ss.base64) {
                                failScreenshots.push({ ...ss, scenarioKey: key });
                            }
                        });
                    }
                });

                if (failScreenshots.length > 0) {
                    const failPreviewId = `ss_fail_${globalLineNumber}_${Math.random().toString(36).substr(2, 6)}`;
                    rowHtml += `<div class="pa-fail-screenshot-inline">`;
                    rowHtml += `<div class="pa-fail-screenshot-header" onclick="var el=document.getElementById('${failPreviewId}'); el.classList.toggle('pa-hidden'); this.querySelector('.pa-ss-chevron').classList.toggle('pa-open')">`;
                    rowHtml += `<span class="pa-ss-chevron pa-open">▾</span> 📸 Screenshot no momento da falha${failScreenshots.length > 1 ? ` (${failScreenshots.length} linhas)` : ''}`;
                    rowHtml += `</div>`;
                    rowHtml += `<div id="${failPreviewId}" class="pa-fail-screenshot-body">`;

                    if (failScreenshots.length > 1) {
                        // Múltiplas linhas falharam — tabs para cada uma
                        const failTabGroupId = `ss_fail_tabs_${globalLineNumber}_${Math.random().toString(36).substr(2, 6)}`;
                        rowHtml += `<div class="pa-ss-tabs-container">`;
                        rowHtml += `<div class="pa-ss-tabs-header">`;
                        rowHtml += `<select class="pa-ss-tab-select" onchange="switchScreenshotTab('${failTabGroupId}', this.value)">`;
                        failScreenshots.forEach((ss, i) => {
                            const ssLabel = rowLabels[String(ss.scenarioKey)] || '';
                            const ssLabelSuffix = ssLabel ? ` \u2014 ${ssLabel}` : '';
                            rowHtml += `<option value="${i}">Linha ${Number(ss.scenarioKey) + 1} do CSV${ssLabelSuffix}</option>`;
                        });
                        rowHtml += `</select>`;
                        rowHtml += `</div>`;
                        failScreenshots.forEach((ss, i) => {
                            const display = i === 0 ? '' : 'display:none;';
                            rowHtml += `<div class="pa-ss-tab-panel" data-tab-group="${failTabGroupId}" data-tab-index="${i}" style="${display}">`;
                            rowHtml += `<img src="${ss.base64}" class="pa-screenshot-thumb" onclick="openScreenshotInNewTab(this.src)" title="Clique para ampliar — Screenshot de falha da Linha ${Number(ss.scenarioKey) + 1}"/>`;
                            rowHtml += `</div>`;
                        });
                        rowHtml += `</div>`;
                    } else {
                        // Uma única falha
                        const ss = failScreenshots[0];
                        rowHtml += `<img src="${ss.base64}" class="pa-screenshot-thumb" onclick="openScreenshotInNewTab(this.src)" title="Clique para ampliar — Screenshot no momento da falha"/>`;
                    }

                    rowHtml += `</div></div>`;
                    failScreenshotRendered = true; // Não repetir em steps subsequentes
                }
            }

            // Se é um step de screenshot, embutir as imagens de TODAS as iterações
            if (stepResult._hasScreenshot) {
                const pos = stepResult._screenshotPos;
                // Coletar screenshots de todas as iterações nesta posição
                // IMPORTANTE: filtrar screenshots de falha (isFail) — esses só aparecem na seção dedicada
                const allScreenshotsForPos = [];
                scenarioKeys.forEach(key => {
                    const group = screenshotsByScenario[key];
                    if (group && group[pos] && !group[pos].isFail) {
                        allScreenshotsForPos.push({ ...group[pos], scenarioKey: key });
                    }
                });

                if (allScreenshotsForPos.length > 0) {
                    const previewId = `ss_preview_${pos}_${Math.random().toString(36).substr(2, 6)}`;
                    const totalCount = allScreenshotsForPos.length;
                    rowHtml += `<div class="pa-screenshot-preview">`;
                    rowHtml += `<div class="pa-screenshot-toggle" onclick="var el=document.getElementById('${previewId}'); el.classList.toggle('pa-hidden'); this.querySelector('.pa-ss-chevron').classList.toggle('pa-open')">`;
                    rowHtml += `<span class="pa-ss-chevron pa-open">▾</span> 🖼️ Ver screenshot${totalCount > 1 ? `s (${totalCount} iterações)` : ' capturado'}`;
                    rowHtml += `</div>`;
                    rowHtml += `<div id="${previewId}" class="pa-screenshot-img-container">`;

                    if (totalCount > 1) {
                        // Tabs para cada iteração de dados
                        const tabGroupId = `ss_tabs_${pos}_${Math.random().toString(36).substr(2, 6)}`;
                        rowHtml += `<div class="pa-ss-tabs-container">`;
                        rowHtml += `<div class="pa-ss-tabs-header">`;
                        rowHtml += `<select class="pa-ss-tab-select" onchange="switchScreenshotTab('${tabGroupId}', this.value)">`;
                        allScreenshotsForPos.forEach((ss, i) => {
                            const ssLabel = rowLabels[String(ss.scenarioKey)] || '';
                            const ssLabelSuffix = ssLabel ? ` \u2014 ${ssLabel}` : '';
                            // Status da linha a partir dos eventos acumulados
                            const ssExec = rowExecSummaries[ss.scenarioKey];
                            const ssStatusEmoji = ssExec ? (ssExec.status === 'PASSED' ? '\u2705 ' : ssExec.status === 'FAILED' ? '\u274C ' : '') : '';
                            rowHtml += `<option value="${i}">${ssStatusEmoji}Linha ${Number(ss.scenarioKey) + 1} do CSV${ssLabelSuffix}</option>`;
                        });
                        rowHtml += `</select>`;
                        rowHtml += `<span class="pa-ss-tab-count">${totalCount} iterações</span>`;
                        rowHtml += `</div>`;

                        allScreenshotsForPos.forEach((ss, i) => {
                            const display = i === 0 ? '' : 'display:none;';
                            rowHtml += `<div class="pa-ss-tab-panel" data-tab-group="${tabGroupId}" data-tab-index="${i}" style="${display}">`;
                            rowHtml += `<img src="${ss.base64}" class="pa-screenshot-thumb" onclick="openScreenshotInNewTab(this.src)" title="Clique para ampliar em nova aba \u2014 \u00cdndice ${ss.scenarioKey}"/>`;
                            rowHtml += `</div>`;
                        });
                        rowHtml += `</div>`;
                    } else {
                        // Somente uma iteração — mostra direto
                        const ss = allScreenshotsForPos[0];
                        rowHtml += `<img src="${ss.base64}" class="pa-screenshot-thumb" onclick="openScreenshotInNewTab(this.src)" title="Clique para ampliar em nova aba"/>`;
                    }

                    rowHtml += `</div></div>`;
                }
            }

            // Recursive Calls se houver
            if (stepResult.callResults && stepResult.callResults.length > 0) {
                rowHtml += `<div style="margin-left: 50px; margin-bottom: 4px;">`;
                rowHtml += `<div class="pa-call-toggle" onclick="this.nextElementSibling.classList.toggle('pa-hidden')">↳ Ver detalhes da chamada (${stepResult.callResults.length})</div>`;
                rowHtml += `<div class="pa-hidden" style="padding: 8px; border-left: 2px solid #93c5fd;">`;
                rowHtml += renderSteps(stepResult.callResults[0].scenarioResults || [], depth + 1);
                rowHtml += `</div></div>`;
            }

            return rowHtml;
        }

        scenarioList.forEach(scenario => {
            html += `<div class="mb-4 bg-white shadow rounded-lg p-0 border border-gray-200" style="margin-left: ${pl}px">`;
            html += `<div class="p-4 border-b border-gray-200"><h4 class="font-bold text-lg text-gray-800">${scenario.name || 'Scenario'}</h4></div>`;

            if (scenario.stepResults && scenario.stepResults.length > 0) {
                const groups = groupStepsByEtapa(scenario.stepResults);

                html += `<div class="pa-steps-list">`; // container da lista de passos

                groups.forEach(group => {
                    if (group.label) {
                        globalLineNumber++;
                        const etapaId = `etapa_${depth}_${globalLineNumber}_${Math.random().toString(36).substr(2, 9)}`;
                        const stepCount = group.steps.length;
                        const hasError = group.hasError;
                        const colorIdx = hashLabelToColorIndex(group.label);
                        const palette = REGION_COLORS[colorIdx];
                        // Em execução multi-linha com falha parcial, usar cor de aviso (amarelo) em vez de erro total (vermelho)
                        const isPartialError = hasError && isMultiRowExec && failedRowsCount < totalRowsExec;
                        const regionColor = hasError ? (isPartialError ? '#d97706' : '#dc2626') : palette.border;
                        const regionBg = hasError ? (isPartialError ? '#fffbeb' : '#fef2f2') : palette.bg;

                        // ═══ LINHA: Região [Nome] (header) ═══
                        html += `<div class="pa-region-block" style="border-left: 3px solid ${regionColor};">`;

                        // Header row
                        html += `<div class="pa-region-header" style="background: ${regionBg}; cursor: pointer; padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e5e7eb;" onclick="var c=document.getElementById('${etapaId}'); c.classList.toggle('pa-hidden'); this.querySelector('.pa-chevron').classList.toggle('pa-open')">`;
                        html += `<span class="pa-line-num">${globalLineNumber}</span>`;
                        html += `<span class="pa-chevron pa-open">▾</span>`;
                        html += `<span style="margin-right: 6px; font-size: 16px;">⊞</span>`;
                        html += `<span style="color: #374151; font-size: 14px;">Região</span>`;
                        html += `<span class="pa-label-tag" style="background: ${regionColor}; color: white;">${group.label}</span>`;
                        if (hasError) {
                            if (isPartialError) {
                                html += `<span style="margin-left: auto; color: #d97706; font-weight: bold; font-size: 13px;">⚠️ Falhou em ${failedRowsCount} de ${totalRowsExec}</span>`;
                            } else {
                                html += `<span style="margin-left: auto; color: #dc2626; font-weight: bold; font-size: 13px;">❌ Erro</span>`;
                            }
                        }
                        html += `</div>`;

                        // ═══ Conteúdo colapsável ═══
                        html += `<div id="${etapaId}" class="pa-region-content">`;
                        group.steps.forEach(stepResult => {
                            globalLineNumber++;
                            html += renderActionRow(stepResult);
                        });
                        html += `</div>`;

                        // ═══ LINHA: Região final (footer) ═══
                        globalLineNumber++;
                        html += `<div class="pa-region-footer" style="background: ${regionBg}; border-top: 1px solid #e5e7eb;">`;
                        html += `<span class="pa-line-num">${globalLineNumber}</span>`;
                        html += `<span style="margin-right: 6px; font-size: 16px;">⊞</span>`;
                        html += `<span style="color: #374151; font-size: 14px; font-weight: 500;">Região final</span>`;
                        html += `</div>`;

                        html += `</div>`; // fecha pa-region-block

                    } else {
                        // Steps soltos (sem etapa) — renderiza como linhas numeradas simples
                        group.steps.forEach(stepResult => {
                            globalLineNumber++;
                            html += renderActionRow(stepResult);
                        });
                    }
                });

                html += `</div>`; // fecha pa-steps-list
            }
            html += `</div>`;
        });
        return html;
    }

    if (featureDetails && featureDetails.scenarioResults) {
        stepsHtml = renderSteps(featureDetails.scenarioResults);
    } else {
        stepsHtml = '<p class="text-gray-500">Nenhum detalhe de step encontrado.</p>';
    }

    // ═══ Painel de Execução por Linha do CSV ═══
    let rowDataHtml = '';
    // rowExecKeys já foi declarado acima para detecção multi-linha
    const hasRowExecData = rowExecKeys.length > 0;

    // Extrair CSV data dos stdoutRowEvents (@@ROW_DATA) ou fallback para JSONL
    let csvRowSummaries = [];
    // Primeiro: tentar dos rowExecSummaries (vindos do stdout via @@ROW_DATA)
    const rowsWithCsvData = rowExecKeys.filter(k => rowExecSummaries[k].csvData);
    if (rowsWithCsvData.length > 0) {
        csvRowSummaries = rowsWithCsvData.map(key => ({
            rowId: key, csvData: rowExecSummaries[key].csvData
        }));
    }
    // Fallback: tentar dos rowEvents (JSONL) se não veio do stdout
    if (csvRowSummaries.length === 0 && rowEvents && rowEvents.byRow && Object.keys(rowEvents.byRow).length > 0) {
        const rowKeys = Object.keys(rowEvents.byRow).sort((a, b) => Number(a) - Number(b));
        csvRowSummaries = rowKeys.map(key => {
            const startEvt = rowEvents.byRow[key].find(e => e.event === 'ROW_START' && e.csvData);
            return { rowId: key, csvData: startEvt ? startEvt.csvData : null, events: rowEvents.byRow[key] };
        }).filter(r => r.csvData);
    }

    if (hasRowExecData || csvRowSummaries.length > 0) {
        const totalExec = rowExecKeys.length;
        const passedExec = rowExecKeys.filter(k => rowExecSummaries[k].status === 'PASSED').length;
        const failedExec = rowExecKeys.filter(k => rowExecSummaries[k].status === 'FAILED').length;

        rowDataHtml += `<div class="bg-white rounded-lg shadow border border-gray-100 p-5 mb-8">`;
        rowDataHtml += `<h3 class="text-lg font-bold text-gray-800 mb-3">📊 Execução por Linha do CSV</h3>`;

        // KPIs de execução por linha
        if (hasRowExecData) {
            rowDataHtml += `<div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">`;
            rowDataHtml += `<div style="padding: 10px 20px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; text-align: center;">`;
            rowDataHtml += `<div style="font-size: 24px; font-weight: 700; color: #16a34a;">${passedExec}</div>`;
            rowDataHtml += `<div style="font-size: 12px; color: #15803d; text-transform: uppercase; font-weight: 600;">Sucesso</div></div>`;
            rowDataHtml += `<div style="padding: 10px 20px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; text-align: center;">`;
            rowDataHtml += `<div style="font-size: 24px; font-weight: 700; color: #dc2626;">${failedExec}</div>`;
            rowDataHtml += `<div style="font-size: 12px; color: #b91c1c; text-transform: uppercase; font-weight: 600;">Falha</div></div>`;
            rowDataHtml += `<div style="padding: 10px 20px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">`;
            rowDataHtml += `<div style="font-size: 24px; font-weight: 700; color: #475569;">${totalExec}</div>`;
            rowDataHtml += `<div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Total</div></div>`;
            rowDataHtml += `</div>`;

            // Resumo textual
            if (failedExec === 0 && passedExec > 0) {
                rowDataHtml += `<div style="padding: 10px 16px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; margin-bottom: 16px; font-size: 14px; color: #15803d; font-weight: 600;">`;
                rowDataHtml += `✅ ${passedExec} de ${totalExec} NFs criadas com sucesso.</div>`;
            } else if (failedExec > 0) {
                const failedIndices = rowExecKeys.filter(k => rowExecSummaries[k].status === 'FAILED').map(k => Number(k) + 1);
                rowDataHtml += `<div style="padding: 10px 16px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; margin-bottom: 16px; font-size: 14px; color: #b91c1c; font-weight: 600;">`;
                rowDataHtml += `⚠️ ${passedExec} de ${totalExec} NFs criadas com sucesso. Falhas nas linhas ${failedIndices.join(', ')}.</div>`;
            }
        }

        // Tabela detalhada por linha
        rowDataHtml += `<div style="overflow-x: auto;">`;
        rowDataHtml += `<table class="w-full border-collapse text-sm">`;
        rowDataHtml += `<thead><tr style="background: #f1f5f9;">`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">#</th>`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Label</th>`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Status</th>`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Mensagem</th>`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Último Step</th>`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Retries</th>`;
        rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Screenshots</th>`;

        // Se temos dados CSV, adicionar colunas
        const hasCsvData = csvRowSummaries.length > 0;
        let csvColumns = [];
        if (hasCsvData) {
            csvColumns = Object.keys(csvRowSummaries[0].csvData);
            csvColumns.forEach(col => {
                rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">${col}</th>`;
            });
        }

        rowDataHtml += `</tr></thead><tbody>`;

        // Combinar dados de ambas as fontes
        const allRowKeys = [...new Set([...rowExecKeys, ...csvRowSummaries.map(r => r.rowId)])].sort((a, b) => Number(a) - Number(b));

        allRowKeys.forEach((key, idx) => {
            const exec = rowExecSummaries[key] || {};
            const csvRow = csvRowSummaries.find(r => r.rowId === key);
            const isPassed = exec.status === 'PASSED';
            const isFailed = exec.status === 'FAILED';
            const bgColor = isFailed ? '#fef2f2' : isPassed ? '#f0fdf4' : (idx % 2 === 0 ? 'white' : '#f9fafb');

            rowDataHtml += `<tr style="background: ${bgColor};">`;
            rowDataHtml += `<td class="border border-gray-200 px-3 py-2 font-mono font-bold text-blue-600">${Number(key) + 1}</td>`;
            rowDataHtml += `<td class="border border-gray-200 px-3 py-2">${exec.label || rowLabels[key] || '-'}</td>`;

            // Status badge
            if (isPassed) {
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2"><span style="background: #dcfce7; color: #16a34a; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">✅ Passou</span></td>`;
            } else if (isFailed) {
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2"><span style="background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">❌ Falhou</span></td>`;
            } else {
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-gray-400">-</td>`;
            }

            // Mensagem (endMessage ou errorMessage)
            const msg = isFailed
                ? (exec.errorMessage || 'Erro durante execução')
                : (exec.endMessage || '-');
            const msgColor = isFailed ? 'color: #dc2626;' : '';
            rowDataHtml += `<td class="border border-gray-200 px-3 py-2" style="${msgColor} max-width: 300px; word-break: break-word;">${msg}</td>`;

            // Último step
            const lastStep = exec.steps && exec.steps.length > 0 ? exec.steps[exec.steps.length - 1] : '-';
            rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-gray-500" style="max-width: 250px; word-break: break-word;">${lastStep}</td>`;

            // Retries
            const retries = exec.retries || [];
            if (retries.length > 0) {
                const retryFails = retries.filter(r => r.type === 'RETRY_FAIL').length;
                const retryOks = retries.filter(r => r.type === 'RETRY_OK').length;
                let retryBadge = '';
                if (retryFails > 0 && retryOks === 0) {
                    // Todas as tentativas falharam
                    retryBadge = `<span style="background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔄 ${retryFails} falha${retryFails > 1 ? 's' : ''}</span>`;
                } else if (retryOks > 0) {
                    // Recuperou após retry
                    retryBadge = `<span style="background: #fffbeb; color: #d97706; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔄 OK após ${retryFails + 1} tentativa${retryFails > 0 ? 's' : ''}</span>`;
                } else {
                    retryBadge = `<span style="background: #f0fdf4; color: #16a34a; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔄 ${retries.length}</span>`;
                }
                // Tooltip com detalhes
                const retryDetails = retries.map(r => {
                    const icon = r.type === 'RETRY_FAIL' ? '❌' : r.type === 'RETRY_OK' ? '✅' : '🔄';
                    return `${icon} ${r.message}`;
                }).join('&#10;');
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-center" title="${retryDetails}">${retryBadge}</td>`;
            } else {
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-center text-gray-300">-</td>`;
            }

            // Screenshots — usar contagem real de PNGs atribuídos a esta linha (inclui failure screenshots)
            const actualScreenshotCount = screenshotsByScenario[key] ? screenshotsByScenario[key].length : (exec.screenshots || 0);
            rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-center">${actualScreenshotCount}</td>`;

            // Dados CSV se disponíveis
            if (hasCsvData && csvRow) {
                csvColumns.forEach(col => {
                    rowDataHtml += `<td class="border border-gray-200 px-3 py-2">${csvRow.csvData[col] || '-'}</td>`;
                });
            } else if (hasCsvData) {
                csvColumns.forEach(() => {
                    rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-gray-300">-</td>`;
                });
            }

            rowDataHtml += `</tr>`;
        });

        rowDataHtml += `</tbody></table></div></div>`;
    }

    // Galeria de Screenshots — agrupada por Linha do CSV com select para navegação
    let screenshotsHtml = '';
    if (screenshotsContent.length > 0) {
        const uniqueIndices = [...new Set(screenshotsContent.map(s => s.scenarioIndex))].sort((a, b) => a - b);

        // Obter status de cada linha (do stdoutRowEvents)
        const rowStatusMap = {};
        if (stdoutRowEvents && stdoutRowEvents.length > 0) {
            stdoutRowEvents.forEach(evt => {
                if (evt.type === 'ROW_END' && evt.rowIndex !== undefined) {
                    rowStatusMap[evt.rowIndex] = evt.status; // PASSED ou FAILED
                }
            });
        }

        // Select para navegar até a seção de uma linha específica
        screenshotsHtml += `<div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">`;
        screenshotsHtml += `<label for="ss-row-select" style="font-size: 14px; font-weight: 600; color: #374151;">Ir para linha:</label>`;
        screenshotsHtml += `<select id="ss-row-select" onchange="jumpToRowScreenshots(this.value)" style="padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white; cursor: pointer; min-width: 280px;">`;
        screenshotsHtml += `<option value="">Selecione uma linha do CSV...</option>`;
        uniqueIndices.forEach(idx => {
            const count = screenshotsContent.filter(s => s.scenarioIndex === idx).length;
            const label = rowLabels[String(idx)] || '';
            const status = rowStatusMap[idx];
            const statusEmoji = status === 'PASSED' ? '✅' : status === 'FAILED' ? '❌' : '⏳';
            const labelSuffix = label ? ` — ${label}` : '';
            screenshotsHtml += `<option value="ss-row-group-${idx}">${statusEmoji} Linha ${Number(idx) + 1}${labelSuffix} (${count} screenshot${count > 1 ? 's' : ''})</option>`;
        });
        screenshotsHtml += `</select>`;
        screenshotsHtml += `<span style="font-size: 13px; color: #6b7280;">${screenshotsContent.length} screenshots em ${uniqueIndices.length} linha${uniqueIndices.length > 1 ? 's' : ''}</span>`;
        screenshotsHtml += `</div>`;

        // Seções colapsáveis por linha
        uniqueIndices.forEach(idx => {
            const rowScreenshots = screenshotsContent.filter(s => s.scenarioIndex === idx);
            const label = rowLabels[String(idx)] || '';
            const status = rowStatusMap[idx];
            const isFailed = status === 'FAILED';
            const statusEmoji = status === 'PASSED' ? '✅' : isFailed ? '❌' : '⏳';
            const statusText = status === 'PASSED' ? 'Passou' : isFailed ? 'Falhou' : 'Pendente';
            const sectionBorder = isFailed ? '#fecaca' : '#d1d5db';
            const sectionBg = isFailed ? '#fef2f2' : '#f8fafc';
            const contentId = `ss-row-content-${idx}`;
            const groupId = `ss-row-group-${idx}`;

            screenshotsHtml += `<div id="${groupId}" class="ss-row-group" style="border: 1px solid ${sectionBorder}; border-radius: 10px; margin-bottom: 16px; overflow: hidden;">`;

            // Header colapsável
            screenshotsHtml += `<div class="ss-row-header" style="background: ${sectionBg}; padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; user-select: none;" onclick="var c=document.getElementById('${contentId}'); c.classList.toggle('pa-hidden'); this.querySelector('.ss-chevron').classList.toggle('pa-open')">`;
            screenshotsHtml += `<span class="ss-chevron pa-open" style="font-size: 14px; color: #6b7280; transition: transform 0.2s; display: inline-block;">▾</span>`;
            screenshotsHtml += `<span style="font-size: 15px;">${statusEmoji}</span>`;
            screenshotsHtml += `<span style="font-weight: 700; font-size: 14px; color: #1f2937;">Execução Linha ${Number(idx) + 1}</span>`;
            if (label) {
                screenshotsHtml += `<span style="font-size: 13px; color: #6b7280;">— ${label}</span>`;
            }
            screenshotsHtml += `<span style="margin-left: auto; font-size: 12px; padding: 2px 10px; border-radius: 4px; font-weight: 600; background: ${isFailed ? '#fef2f2; color: #dc2626; border: 1px solid #fecaca' : status === 'PASSED' ? '#f0fdf4; color: #16a34a; border: 1px solid #bbf7d0' : '#f8fafc; color: #64748b; border: 1px solid #e2e8f0'};">${statusText}</span>`;
            screenshotsHtml += `<span style="font-size: 12px; color: #9ca3af;">${rowScreenshots.length} screenshot${rowScreenshots.length > 1 ? 's' : ''}</span>`;
            screenshotsHtml += `</div>`;

            // Conteúdo: grid de screenshots desta linha
            screenshotsHtml += `<div id="${contentId}" style="padding: 12px;">`;
            screenshotsHtml += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
            rowScreenshots.forEach((img, i) => {
                const timeStr = new Date(img.timestamp).toLocaleTimeString();
                const imgIsFail = img.isFail || false;
                const borderStyle = imgIsFail ? 'border: 2px solid #dc2626;' : '';
                const failBadge = imgIsFail ? '<span style="background: #fef2f2; color: #dc2626; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">FALHA</span> ' : '';
                const ssName = img.screenshotName ? `<span style="background: #e0e7ff; color: #3730a3; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${img.screenshotName}</span> ` : '';
                screenshotsHtml += `
                    <div class="screenshot-card border border-gray-200 rounded p-2 bg-white shadow-sm hover:shadow-md transition" style="${borderStyle}">
                        <p class="text-xs text-gray-500 mb-1">${failBadge}${ssName}📸 Screenshot ${i + 1} — ⏰ ${timeStr}</p>
                        ${imgIsFail && img.errorMsg ? `<p class="text-xs text-red-600 mb-1">${img.errorMsg}</p>` : ''}
                        <img src="${img.base64}" class="w-full h-auto cursor-pointer rounded border border-gray-100" title="Clique para ampliar — Linha ${Number(idx) + 1}${label ? ' — ' + label : ''}" onclick="openScreenshotInNewTab(this.src)" style="cursor: zoom-in;"/>
                    </div>
                `;
            });
            screenshotsHtml += `</div></div>`;
            screenshotsHtml += `</div>`;
        });
    } else {
        screenshotsHtml = '<p class="text-gray-500">Nenhum screenshot capturado nesta execução.</p>';
    }

    // HTML Boilerplate com Tailwind via CDN
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Karate Rich Test Report</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            .gradient-bg { background: linear-gradient(135deg, #f6f8fb 0%, #e5ebf4 100%); }

            /* ═══ Power Automate Desktop — Região styles ═══ */

            /* Numeração de linha lateral */
            .pa-line-num {
                display: inline-flex; align-items: center; justify-content: center;
                min-width: 32px; height: 24px; font-size: 12px; color: #9ca3af;
                font-weight: 500; flex-shrink: 0; font-variant-numeric: tabular-nums;
            }

            /* Bloco de região */
            .pa-region-block { margin-bottom: 2px; }

            /* Header e Footer da região */
            .pa-region-header, .pa-region-footer {
                display: flex; align-items: center; gap: 8px;
                padding: 10px 14px; font-size: 14px; user-select: none;
            }
            .pa-region-header:hover { filter: brightness(0.97); }

            /* Chevron toggle */
            .pa-chevron {
                font-size: 14px; color: #6b7280; transition: transform 0.2s ease;
                display: inline-block; flex-shrink: 0;
            }
            .pa-chevron.pa-open { transform: rotate(0deg); }
            .pa-chevron:not(.pa-open) { transform: rotate(-90deg); }

            /* Tag colorida do nome da região */
            .pa-label-tag {
                display: inline-block; padding: 2px 10px; border-radius: 4px;
                font-size: 13px; font-weight: 600; letter-spacing: 0.01em;
            }

            /* Conteúdo colapsável */
            .pa-region-content { /* visível por padrão */ }
            .pa-hidden { display: none !important; }

            /* Linha de ação (step dentro da região) */
            .pa-action-row {
                display: flex; align-items: flex-start; gap: 10px;
                padding: 8px 14px 8px 14px; border-bottom: 1px solid #f3f4f6;
                transition: background 0.15s;
            }
            .pa-action-row:hover { background: #f9fafb; }
            .pa-action-row:last-child { border-bottom: none; }

            /* Ícone da ação */
            .pa-action-icon { font-size: 16px; margin-top: 2px; flex-shrink: 0; }

            /* Conteúdo da ação */
            .pa-action-content { flex: 1; min-width: 0; }
            .pa-action-title { font-size: 14px; font-weight: 600; color: #1f2937; line-height: 1.4; }
            .pa-action-desc { font-size: 13px; color: #6b7280; line-height: 1.4; margin-top: 1px; }

            /* Tempo da ação */
            .pa-action-time {
                font-size: 11px; color: #9ca3af; white-space: nowrap;
                margin-left: auto; flex-shrink: 0; margin-top: 3px;
            }

            /* Variáveis como pills coloridas (estilo Power Automate) */
            code.pa-var {
                background: #fff7ed; color: #c2410c; border: 1px solid #fdba74;
                padding: 1px 6px; border-radius: 4px; font-size: 12px;
                font-family: 'Cascadia Code', 'Fira Code', monospace; font-weight: 500;
            }
            code.pa-var-green {
                background: #f0fdf4; color: #15803d; border: 1px solid #86efac;
                padding: 1px 6px; border-radius: 4px; font-size: 12px;
                font-family: 'Cascadia Code', 'Fira Code', monospace; font-weight: 500;
            }

            /* Toggle de chamada recursiva */
            .pa-call-toggle {
                cursor: pointer; padding: 6px 10px; border: 1px solid #bfdbfe;
                border-radius: 4px; color: #1d4ed8; font-size: 13px;
                font-weight: 600; transition: background 0.15s;
            }
            .pa-call-toggle:hover { background: #eff6ff; }

            /* Steps list container */
            .pa-steps-list { padding: 0; }

            /* Screenshot cards */
            .screenshot-card img { transition: transform 0.2s ease, box-shadow 0.2s ease; }
            .screenshot-card img:hover { transform: scale(1.02); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

            /* Screenshot row select */
            #ss-row-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }

            /* Screenshot row group sections */
            .ss-row-group { transition: box-shadow 0.3s; }
            .ss-row-header:hover { filter: brightness(0.97); }
            .ss-chevron { transition: transform 0.2s ease; display: inline-block; }
            .ss-chevron.pa-open { transform: rotate(0deg); }
            .ss-chevron:not(.pa-open) { transform: rotate(-90deg); }

            /* Screenshot inline preview in step rows */
            .pa-screenshot-preview {
                margin: 4px 14px 8px 56px;
                border: 1px solid #e5e7eb; border-radius: 8px;
                overflow: hidden; background: #f9fafb;
            }
            .pa-screenshot-toggle {
                padding: 8px 12px; font-size: 13px; font-weight: 600;
                color: #2563eb; cursor: pointer; user-select: none;
                display: flex; align-items: center; gap: 6px;
                transition: background 0.15s;
            }
            .pa-screenshot-toggle:hover { background: #eff6ff; }
            .pa-ss-chevron {
                font-size: 12px; color: #6b7280; transition: transform 0.2s ease;
                display: inline-block;
            }
            .pa-ss-chevron.pa-open { transform: rotate(0deg); }
            .pa-ss-chevron:not(.pa-open) { transform: rotate(-90deg); }
            .pa-screenshot-img-container {
                padding: 8px; border-top: 1px solid #e5e7eb;
            }
            .pa-screenshot-thumb {
                max-width: 100%; max-height: 400px; border-radius: 6px;
                cursor: zoom-in; border: 1px solid #d1d5db;
                transition: box-shadow 0.2s ease;
            }
            .pa-screenshot-thumb:hover {
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            }

            /* Failure screenshot inline (below failed step) */
            .pa-fail-screenshot-inline {
                margin: 4px 14px 8px 56px;
                border: 2px solid #fca5a5; border-radius: 8px;
                overflow: hidden; background: #fef2f2;
            }
            .pa-fail-screenshot-header {
                padding: 8px 12px; font-size: 13px; font-weight: 600;
                color: #dc2626; cursor: pointer; user-select: none;
                display: flex; align-items: center; gap: 6px;
                transition: background 0.15s;
            }
            .pa-fail-screenshot-header:hover { background: #fee2e2; }
            .pa-fail-screenshot-body {
                padding: 8px; border-top: 1px solid #fca5a5;
            }

            /* Screenshot iteration tabs */
            .pa-ss-tabs-container { width: 100%; }
            .pa-ss-tabs-header {
                display: flex; align-items: center; gap: 10px;
                padding: 8px 0 8px 0; flex-wrap: wrap;
            }
            .pa-ss-tab-select {
                padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 6px;
                font-size: 13px; background: white; cursor: pointer;
                color: #374151; font-weight: 500;
            }
            .pa-ss-tab-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
            .pa-ss-tab-count {
                font-size: 12px; color: #9ca3af; font-weight: 500;
            }
        </style>
    </head>
    <body class="gradient-bg min-h-screen p-8 text-gray-800">
        <div class="max-w-6xl mx-auto">
            
            <header class="bg-white rounded-lg shadow-md border-t-4 border-blue-500 p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800">Karate Test Output</h1>
                    <p class="text-gray-500 mt-1">${summary.relativePath || summary.name}</p>
                </div>
                <div class="mt-4 md:mt-0 text-right">
                    <div class="border rounded px-4 py-2 font-bold ${statusClass}">
                        ${statusIcon}
                    </div>
                </div>
            </header>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <!-- Summary KPI Cards -->
                <div class="bg-white p-4 rounded-lg shadow border border-gray-100">
                    <p class="text-sm text-gray-500 uppercase tracking-wide">Cenários Passados</p>
                    <p class="text-3xl font-bold text-green-600 mt-2">${summary.passedCount || 0}</p>
                </div>
                <div class="bg-white p-4 rounded-lg shadow border border-gray-100">
                    <p class="text-sm text-gray-500 uppercase tracking-wide">Cenários Falhados</p>
                    <p class="text-3xl font-bold text-red-600 mt-2">${summary.failedCount || 0}</p>
                </div>
                <div class="bg-white p-4 rounded-lg shadow border border-gray-100">
                    <p class="text-sm text-gray-500 uppercase tracking-wide">Tempo Total</p>
                    <p class="text-3xl font-bold text-blue-600 mt-2">${summary.durationMillis ? (summary.durationMillis/1000).toFixed(2) + 's' : '-'}</p>
                </div>
                <div class="bg-white p-4 rounded-lg shadow border border-gray-100">
                    <p class="text-sm text-gray-500 uppercase tracking-wide">Data/Hora</p>
                    <p class="text-md font-bold text-gray-700 mt-2">${summary.resultDate || new Date().toLocaleString()}</p>
                </div>
            </div>

            ${rowDataHtml}

            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Passo a Passo (Steps)</h2>
                ${stepsHtml}
            </div>

            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Screenshots Gerados (${screenshotsContent.length})</h2>
                ${screenshotsHtml}
            </div>

            <footer class="bg-white rounded-lg shadow p-6 mt-12 text-center text-sm text-gray-500">
                <p>Relatório gerado automaticamente pelo Orchestrator - Karate Engine</p>
                ${envInfo ? `<p class="mt-2 text-xs">Environment Info: OS: ${envInfo.os || '-'} | User: ${envInfo.user || '-'}</p>` : ''}
            </footer>
        </div>

        <script>
        // Abre screenshot numa nova aba usando Blob (evita problema com data-URI longa no href)
        function openScreenshotInNewTab(base64Src) {
            try {
                var parts = base64Src.split(',');
                var mime = parts[0].match(/:(.*?);/)[1];
                var bstr = atob(parts[1]);
                var n = bstr.length;
                var u8arr = new Uint8Array(n);
                for (var i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
                var blob = new Blob([u8arr], { type: mime });
                var url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } catch(e) {
                console.error('Erro ao abrir screenshot:', e);
                // Fallback: tenta abrir direto (pode não funcionar para imagens grandes)
                var w = window.open('', '_blank');
                if (w) { w.document.write('<img src="' + base64Src + '" style="max-width:100%;height:auto;"/>'); w.document.close(); }
            }
        }

        // Navega até a seção de screenshots de uma linha específica
        function jumpToRowScreenshots(groupId) {
            if (!groupId) return;
            var el = document.getElementById(groupId);
            if (!el) return;
            // Expande a seção se estiver colapsada
            var content = el.querySelector('[id^="ss-row-content-"]');
            if (content && content.classList.contains('pa-hidden')) {
                content.classList.remove('pa-hidden');
                var chevron = el.querySelector('.ss-chevron');
                if (chevron) chevron.classList.add('pa-open');
            }
            // Scroll suave até a seção
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Flash visual para chamar atenção
            el.style.transition = 'box-shadow 0.3s';
            el.style.boxShadow = '0 0 0 3px #3b82f6';
            setTimeout(function() { el.style.boxShadow = ''; }, 1500);
        }

        // Alterna entre screenshots de diferentes iterações de dados (CSV rows)
        function switchScreenshotTab(tabGroupId, selectedIndex) {
            var panels = document.querySelectorAll('.pa-ss-tab-panel[data-tab-group="' + tabGroupId + '"]');
            panels.forEach(function(panel) {
                if (panel.getAttribute('data-tab-index') === selectedIndex) {
                    panel.style.display = '';
                } else {
                    panel.style.display = 'none';
                }
            });
        }
        </script>
    </body>
    </html>
    `;
}

/**
 * Gera um novo report HTML rico contendo os logs detalhados e as screenshots base64 inline.
 * @param {string} projectRoot Caminho base do projeto com a pasta target/ do Karate.
 * @returns {string|null} Caminho absoluto do HTML report gerado ou null em caso de erro.
 */
async function generateRichReport(projectRoot, stdoutRowEvents) {
    try {
        const karateReportsDir = path.join(projectRoot, 'target', 'karate-reports');
        const summaryJsonPath = path.join(karateReportsDir, 'karate-summary-json.txt');

        if (!fs.existsSync(summaryJsonPath)) {
            console.log('⚠️ karate-summary-json.txt não encontrado. Não é possível gerar relatório rich.');
            return null;
        }

        const summaryData = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8'));
        
        // Pega a primeira/única feature reportada (ou no mínimo passa a raiz)
        let primaryFeature = summaryData.featureSummary && summaryData.featureSummary.length > 0 
            ? summaryData.featureSummary[0] 
            : summaryData;

        // Fallback global fields se não tiver detalhes
        primaryFeature.resultDate = summaryData.resultDate || primaryFeature.resultDate;

        const packageQualName = primaryFeature.packageQualifiedName;
        if (!packageQualName) {
            console.log('⚠️ Nome de pacote não encontrado no resumo.');
            return null;
        }

        const featureDetailJsonPath = path.join(karateReportsDir, `${packageQualName}.karate-json.txt`);
        let featureDetails = null;

        if (fs.existsSync(featureDetailJsonPath)) {
            featureDetails = JSON.parse(fs.readFileSync(featureDetailJsonPath, 'utf8'));
        }

        // Parse Screenshots
        console.log('📸 Processando screenshots do reporte...');
        const screenshotsFiles = mapScreenshots(karateReportsDir);
        
        const screenshotsContent = screenshotsFiles.map(s => {
            return {
                timestamp: s.timestamp,
                scenarioIndex: s.scenarioIndex,
                base64: getImageBase64(s.filepath)
            };
        }).filter(s => s.base64);

        // Ler eventos de log por linha CSV
        console.log('📊 Lendo eventos por linha CSV...');
        const rowEvents = readRowEvents(projectRoot);
        console.log(`📊 Total de eventos: ${rowEvents.allEvents.length}, Linhas CSV: ${Object.keys(rowEvents.byRow).length}`);

        // Build HTML
        const finalHtml = buildHtmlReport(primaryFeature, featureDetails, screenshotsContent, {}, rowEvents, stdoutRowEvents || []);

        // Save
        const timestampToken = Date.now();
        const reportFileName = `rich-test-report-${timestampToken}.html`;
        const outPath = path.join(projectRoot, 'target', reportFileName);
        
        fs.writeFileSync(outPath, finalHtml, 'utf8');
        console.log(`✅ Rich Report gerado em: ${outPath}`);
        return outPath;

    } catch (e) {
        console.error('❌ Erro na geração do Rich Report:', e);
        return null;
    }
}

module.exports = {
    generateRichReport,
    readRowEvents
};
