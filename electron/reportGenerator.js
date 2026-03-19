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

function buildHtmlReport(summary, featureDetails, screenshotsContent, envInfo, rowEvents) {
    // Calculo de cor base no status
    let statusClass = summary.failed ? 'text-red-500 bg-red-100 border-red-500' : 'text-green-500 bg-green-100 border-green-500';
    let statusIcon = summary.failed ? '❌ Falhou' : '✅ Sucesso';

    // Construção dos Steps HTML
    let stepsHtml = '';

    // Regex para detectar marcadores de etapa nos stepLogs
    const ETAPA_INICIO_RE = /➡️\s*Etapa\s*Inicio\s*:\s*(.*)/i;
    const ETAPA_FIM_RE    = /➡️\s*Etapa\s*Fim\s*:/i;
    const ETAPA_SIMPLES_RE = /➡️\s*Etapa\s*:\s*(.*)/i;

    /**
     * Classifica um stepResult como marcador de etapa ou step técnico.
     * Retorna: { type: 'etapa_inicio'|'etapa_fim'|'etapa'|'step', label?: string, stepResult }
     */
    function classifyStep(stepResult) {
        const log = stepResult.stepLog ? String(stepResult.stepLog).trim() : null;
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



    // Agrupar screenshots por scenarioIndex para suportar testes data-driven (N linhas CSV)
    const screenshotsByScenario = {};
    screenshotsContent.forEach(s => {
        const key = s.scenarioIndex !== undefined ? s.scenarioIndex : 0;
        if (!screenshotsByScenario[key]) screenshotsByScenario[key] = [];
        screenshotsByScenario[key].push(s);
    });
    const scenarioKeys = Object.keys(screenshotsByScenario).sort((a, b) => Number(a) - Number(b));
    const numScenarios = scenarioKeys.length;

    // Contador de posição do screenshot dentro de uma iteração
    let screenshotPositionCounter = 0;

    // Função recursiva principal para iterar calls aninhadas, agora com agrupamento por etapas estilo Power Automate Desktop
    function renderSteps(scenarioList, depth = 0) {
        let html = '';
        const pl = depth * 20; // padding left
        let globalLineNumber = 0;

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
            } else if (stepText.match(/driver\.screenshot/)) {
                actionIcon = '📸';
                actionTitle = 'Capturar screenshot';
                actionDesc = `Capturar uma imagem da tela atual para evidência${numScenarios > 1 ? ` (📊 ${numScenarios} iterações de dados)` : ''}`;
                // Marca que este step tem screenshot para embutir abaixo
                stepResult._hasScreenshot = true;
                stepResult._screenshotPos = screenshotPositionCounter;
                screenshotPositionCounter++;
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
                statusDot = '<span style="color: #dc2626; margin-left: auto; font-size: 12px;">❌ Falhou</span>';
            }

            rowHtml += `<div class="pa-action-row" style="${isFailed ? 'background: #fef2f2;' : ''}">`;
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

            // Se é um step de screenshot, embutir as imagens de TODAS as iterações
            if (stepResult._hasScreenshot) {
                const pos = stepResult._screenshotPos;
                // Coletar screenshots de todas as iterações nesta posição
                const allScreenshotsForPos = [];
                scenarioKeys.forEach(key => {
                    const group = screenshotsByScenario[key];
                    if (group && group[pos]) {
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
                            rowHtml += `<option value="${i}">\u00cdndice ${ss.scenarioKey} (Linha ${Number(ss.scenarioKey) + 1} do CSV)</option>`;
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
                        const regionColor = hasError ? '#dc2626' : palette.border;
                        const regionBg = hasError ? '#fef2f2' : palette.bg;

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
                            html += `<span style="margin-left: auto; color: #dc2626; font-weight: bold; font-size: 13px;">❌ Erro</span>`;
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

    // ═══ Painel de Dados CSV por Iteração ═══
    let rowDataHtml = '';
    if (rowEvents && rowEvents.byRow && Object.keys(rowEvents.byRow).length > 0) {
        const rowKeys = Object.keys(rowEvents.byRow).sort((a, b) => Number(a) - Number(b));
        // Extrair csvData do primeiro evento ROW_START de cada row
        const rowSummaries = rowKeys.map(key => {
            const startEvt = rowEvents.byRow[key].find(e => e.event === 'ROW_START' && e.csvData);
            return { rowId: key, csvData: startEvt ? startEvt.csvData : null, events: rowEvents.byRow[key] };
        }).filter(r => r.csvData);

        if (rowSummaries.length > 0) {
            // Obter colunas do CSV
            const csvColumns = Object.keys(rowSummaries[0].csvData);
            
            rowDataHtml += `<div class="bg-white rounded-lg shadow border border-gray-100 p-5 mb-8">`;
            rowDataHtml += `<h3 class="text-lg font-bold text-gray-800 mb-3">📊 Dados CSV por Iteração (${rowSummaries.length} linhas)</h3>`;
            rowDataHtml += `<div style="overflow-x: auto;">`;
            rowDataHtml += `<table class="w-full border-collapse text-sm">`;
            rowDataHtml += `<thead><tr style="background: #f1f5f9;">`;
            rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">#</th>`;
            csvColumns.forEach(col => {
                rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">${col}</th>`;
            });
            rowDataHtml += `<th class="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Eventos</th>`;
            rowDataHtml += `</tr></thead><tbody>`;
            rowSummaries.forEach((row, idx) => {
                const bgColor = idx % 2 === 0 ? 'white' : '#f9fafb';
                rowDataHtml += `<tr style="background: ${bgColor};">`;
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2 font-mono font-bold text-blue-600">${row.rowId}</td>`;
                csvColumns.forEach(col => {
                    rowDataHtml += `<td class="border border-gray-200 px-3 py-2">${row.csvData[col] || '-'}</td>`;
                });
                rowDataHtml += `<td class="border border-gray-200 px-3 py-2 text-gray-500">${row.events.length} eventos</td>`;
                rowDataHtml += `</tr>`;
            });
            rowDataHtml += `</tbody></table></div></div>`;
        }
    }

    // Galeria de Screenshots HTML com selector de índice
    let screenshotsHtml = '';
    if (screenshotsContent.length > 0) {
        // Obter índices únicos disponíveis
        const uniqueIndices = [...new Set(screenshotsContent.map(s => s.scenarioIndex))].sort((a, b) => a - b);

        // Selector dropdown
        screenshotsHtml += `<div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">`;
        screenshotsHtml += `<label for="screenshot-index-select" style="font-size: 14px; font-weight: 600; color: #374151;">Filtrar por índice de dados:</label>`;
        screenshotsHtml += `<select id="screenshot-index-select" onchange="filterScreenshots(this.value)" style="padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white; cursor: pointer; min-width: 200px;">`;
        screenshotsHtml += `<option value="all">Todos (${screenshotsContent.length} screenshots)</option>`;
        uniqueIndices.forEach(idx => {
            const count = screenshotsContent.filter(s => s.scenarioIndex === idx).length;
            screenshotsHtml += `<option value="${idx}">Índice ${idx} (${count} screenshot${count > 1 ? 's' : ''})</option>`;
        });
        screenshotsHtml += `</select>`;
        screenshotsHtml += `<span id="screenshot-count-label" style="font-size: 13px; color: #6b7280;">Exibindo ${screenshotsContent.length} de ${screenshotsContent.length}</span>`;
        screenshotsHtml += `</div>`;

        // Grid de screenshots
        screenshotsHtml += '<div id="screenshot-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
        screenshotsContent.forEach((img, i) => {
            const timeStr = new Date(img.timestamp).toLocaleTimeString();
            screenshotsHtml += `
                <div class="screenshot-card border border-gray-200 rounded p-2 bg-white shadow-sm hover:shadow-md transition" data-scenario-index="${img.scenarioIndex}">
                    <p class="text-xs text-gray-500 mb-1">⏰ ${timeStr} (Cenário ${img.scenarioIndex || '1'})</p>
                    <img src="${img.base64}" class="w-full h-auto cursor-pointer rounded border border-gray-100" title="Clique para ampliar" onclick="openScreenshotInNewTab(this.src)" style="cursor: zoom-in;"/>
                </div>
            `;
        });
        screenshotsHtml += '</div>';
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

            /* Screenshot index selector */
            #screenshot-index-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }

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

        // Filtra screenshots pelo índice selecionado
        function filterScreenshots(value) {
            var cards = document.querySelectorAll('.screenshot-card');
            var shown = 0;
            var total = cards.length;
            cards.forEach(function(card) {
                if (value === 'all' || card.getAttribute('data-scenario-index') === value) {
                    card.style.display = '';
                    shown++;
                } else {
                    card.style.display = 'none';
                }
            });
            var label = document.getElementById('screenshot-count-label');
            if (label) label.textContent = 'Exibindo ' + shown + ' de ' + total;
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
async function generateRichReport(projectRoot) {
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
        const finalHtml = buildHtmlReport(primaryFeature, featureDetails, screenshotsContent, {}, rowEvents);

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
