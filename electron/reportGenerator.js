const fs = require('fs');
const path = require('path');

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
function buildHtmlReport(summary, featureDetails, screenshotsContent, envInfo) {
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
                actionDesc = 'Capturar uma imagem da tela atual para evidência';
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
                        const regionColor = hasError ? '#dc2626' : '#2563eb';
                        const regionBg = hasError ? '#fef2f2' : '#eff6ff';

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

    // Galeria de Screenshots HTML
    let screenshotsHtml = '';
    if (screenshotsContent.length > 0) {
        screenshotsHtml += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
        screenshotsContent.forEach((img, i) => {
            const timeStr = new Date(img.timestamp).toLocaleTimeString();
            screenshotsHtml += `
                <div class="border border-gray-200 rounded p-2 bg-white shadow-sm hover:shadow-md transition">
                    <p class="text-xs text-gray-500 mb-1">⏰ ${timeStr} (Cenário ${img.scenarioIndex || '1'})</p>
                    <a href="${img.base64}" target="_blank">
                        <img src="${img.base64}" class="w-full h-auto cursor-pointer rounded border border-gray-100" title="Clique para ampliar"/>
                    </a>
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

        // Env info - opcional do surefire - omitido por enquanto para simplicidade ou lido aqui de env se fosse necessário

        // Build HTML
        const finalHtml = buildHtmlReport(primaryFeature, featureDetails, screenshotsContent, {});

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
    generateRichReport
};
