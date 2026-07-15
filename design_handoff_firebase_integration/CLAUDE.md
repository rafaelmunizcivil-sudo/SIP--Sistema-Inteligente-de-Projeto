# Projeto: Site Interativo — Rodovia MG-259 (Serro–Trinta Reis)

Arquivo principal: `Apresentacao Infraestrutura.dc.html` (dashboard com sidebar + 7 matérias + Visão Geral + Análise).

## Estrutura do site
- Sidebar: Visão Geral, Análise, e 7 matérias (Geometria, Terraplenagem modeladas; Sinalização, Obras Complementares, Desapropriação, Interseção, Segurança Viária como placeholders "aguardando dados").
- Geometria: dados reais extraídos de `Volume 1_Trinta Reis.docx` (Serro–Trinta Reis, MG-259, 32,02 km locados, Classe 1B, 5 pontos críticos no esquema: Interseção 1/2/3/4, Ponte Rio do Peixe, Morro do Paiol, Rio Jequitinhonha).
- Terraplenagem: dados ilustrativos/exemplo (não há planilha real ainda).

## Aba "Análise" — estrutura hierárquica (Disciplina → Análise → Detalhes)
- Todas as 7 disciplinas aparecem como botão expansível de primeiro nível (`buildAnaliseDisciplinas()`), colapsadas por padrão. Dentro, lista de análises (só Geometria tem dados reais; as demais mostram "Nenhuma análise cadastrada ainda").
- Após a lista de análises de uma disciplina, há um bloco **Dashboard** (`buildGeoDashboard()`, só implementado p/ Geometria por enquanto): header (Projeto/Rodovia/Disciplina), botões de filtro (Geral / Análise 1-5, estado `state.geoDashFilter`), cards KPI (Total de Análises, Total de Question., Média, Última Análise), gráfico de barras "Questionamentos por Análise", gráfico de barras "Assuntos Questionados" (agregado por label de documento), e bloco "Comparativo Sequencial" (% atendidos/novos/reiterados/parcial/não, sempre N vs N-1). Filtro ≠ Geral mostra `focusTally` (KPIs só daquela análise) em vez dos gráficos agregados.
- PENDENTE: usuário pediu pra inserir gráficos visuais no dashboard (as barras horizontais já existem, mas ele quer mais visibilidade — avaliar gráfico de linha/evolução ou SVG mais rico). Ainda não implementado.
- Regra: replicar esse mesmo padrão (Análises + Dashboard) pras outras 6 disciplinas assim que tiverem dados reais.

## Aba "Análise" — regras importantes
- Cada análise (parecer da DER-MG) tem seu **próprio card fixo e independente**, colapsável (clica no cabeçalho "Análise nº N" pra abrir/fechar).
- **Regra de imutabilidade**: análises antigas NUNCA são recalculadas a partir de análises novas. Cada análise é uma "fotografia" congelada. Os dados ficam em arrays separados no código: `analise1DocsData`, `analise2DocsData`, (futuramente `analise3DocsData`...) — nunca derivar uma da outra por filtro.
- Análise 1 (09/06/2025): só mostra contagem de questionamentos por documento/volume, SEM indicadores de atendido/não atendido/reiterado (não existe análise anterior pra comparar). Total = 25 (Texto=3, Planta=11, Perfil=12, Interseções=1).
- Análise 2 (11/07/2025) em diante: mostra comparativo com a análise imediatamente anterior (nunca com uma mais antiga): Reiterando análise anterior / Questionamentos novos / Atendidos / Atendidos parcialmente / Não atendidos. Total Análise 2 = 36.
- Cada item de documento é numerado (1, 2, 3...) e o selo de status fica **abaixo** do texto (não ao lado).
- Estrutura de dados por documento: `{ key, label, items: [...] }`. Análise 1 = strings simples. Análise 2+ = `{ text, status }` onde status ∈ atendido | parcial | nao | novo.
- Documentos por disciplina Geometria: "Volume 1 – Texto (Estudo de Traçado)", "Volume 2 – Planta", "Projeto Geométrico – Perfil", "Projeto de Interseções".

## Cuidado com extração de PDF (lição aprendida)
Os pareceres da DER-MG chegam em PDF. A extração é feita via `run_script` (descompressão manual dos streams FlateDecode + parse de operadores Tj/TJ — **nunca usar `TextDecoder('latin1')`**, pois no browser esse label é alias de windows-1252 e corrompe caracteres acima de 0x7F; usar `String.fromCharCode` byte a byte).
- Alguns itens de lista do Word perdem a palavra inicial na extração (ex.: aparecem como fragmentos soltos "p ;", "v ;", "r ..."). **Nunca adivinhar o conteúdo desses fragmentos** — isso já causou erro (inventei um item que não existia). Sempre cruzar com a resposta do DER (que geralmente cita palavras-chave do pedido) e, se ainda ambíguo, perguntar ao usuário.
- Sempre copiar o PDF pra um nome ASCII-safe antes de `readFileBinary` (nomes com acentos/caracteres especiais dão erro "disallowed characters").
- Apagar os arquivos temporários (cópia ascii do PDF + pasta `data/`) depois de terminar a extração.

## Status atual (5 análises cadastradas)
- Análise 1 (09/06/2025): 25 questionamentos, sem indicadores comparativos.
- Análise 2 (11/07/2025): 36 questionamentos, comparado com Análise 1.
- Análise 3 (08/08/2025): 40 questionamentos. Nova fase "Projeto Geométrico" introduzida (documentos "Projeto Geométrico – Planta" e "Seções Transversais" além de Texto/Planta/Perfil/Interseções). Um trecho de texto não foi recuperado da extração do PDF (flagado explicitamente no item, não inventado).
- Análise 4 (10/12/2025): 42 questionamentos. Introduz **Interseção 3 (estaca 194+0,00)**, nova (próxima a aeroporto). Maioria das pendências antigas de Planta/Perfil/Interseções 1 e 2 finalmente atendida.
- Análise 5 (10/02/2026): 47 questionamentos. Introduz documento "Anexo 3D" (notas de serviço e planilhas de volume), novo. Grande leva de itens novos para Interseção 1 e 2 (agora com soluções geométricas detalhadas) e mais itens novos para Interseção 3. Interseção 3 tem seus 3 itens antigos finalmente atendidos.
- Documentos usados na disciplina Geometria (chaves no código): `texto`, `planta` (Volume 2 – Estudo de Traçado, vazio na Análise 5), `planta_pg` (Projeto Geométrico – Planta, a partir da Análise 3), `perfil`, `secoes` (Seções Transversais, a partir da Análise 3), `intersec`, `anexo3d` (a partir da Análise 5).
- Status possíveis: `atendido`, `parcial` (Atendido parcialmente), `nao` (Não atendido), `novo`, `pendente` (Aguardando resposta — reiterado mas sem novo veredito do DER nesta rodada).

## Pendências
1. Ainda não reconferi Perfil e Interseções da Análise 2 com o método token-a-token mais rigoroso (Texto e Planta já foram reconferidos e batem com o PDF). O PDF original não está mais em uploads/ — preciso que o usuário reenvie para concluir essa checagem.
2. Usuário está enviando as análises aos poucos — antecipar Análise 6, 7... no mesmo padrão (extrair PDF token-a-token, nunca adivinhar fragmentos garbled, mostrar contagem por documento, comparar só com a análise imediatamente anterior).
3. Nota técnica: quando um PDF tem muitas imagens grandes, a extração pode dar timeout — pular streams com /Length acima de ~20000 bytes antes de inflateToBytes (são imagens/fontes, não texto).

## Dashboard por disciplina (Geometria) — estado atual
- `buildGeoDashboard()`: fundo azul escuro (#0f2942), botões de filtro (Geral/Análise 1-5), KPIs, gráfico de barras VERTICAL para "Questionamentos por Análise", gráfico de barras HORIZONTAL para "Assuntos Questionados" (ordenado desc, valor na ponta), bloco "Comparativo Sequencial" (pizza conic-gradient azul/vermelho + legenda) lado a lado (grid 1fr/1fr) com o novo card "Itens Repetidos" (itens com ≥3 repetições e status ≠ atendido, numerados, com badges de análise).
- Card "Observações" (separado, abaixo do dashboard): lista de questionamentos recorrentes (≥3 análises) com filtros (Todos/3/4/5+ Repetições/Não Atendidos/Atendido Parcialmente/Críticos). Matching por texto normalizado (`buildGeoObservacoesRaw()`), dedupado por análise (não conta 2x se o mesmo texto aparece em 2 docs da mesma análise), exclui boilerplate genérico ("O item encontra-se em condições de aprovação.").
- Cards de Interseção em Geometria (`geoTopicsData`): Interseção 1 — Milho Verde-MG, Interseção 2 — Retorno alongado, Interseção 3 - Aeroporto (tipo Gota), Ponte sobre o Rio do Peixe, Morro do Paiol, Rio Jequitinhonha, Interseção 4 - Juscelino Kubitschek (tipo gota).
- Card "Traçado em planta — esquemático": tem um `<image-slot>` (image-slot.js) acima do SVG esquemático para o usuário inserir imagem real do traçado.
- Todas as 7 disciplinas usam a mesma estrutura hierárquica Disciplina → Análise → Detalhes (`buildAnaliseDisciplinas()`); só Geometria tem dashboard/observações reais por enquanto — replicar quando as demais tiverem dados.
