# Handoff: Integração com Firebase — Site Rodovia MG-259 (Serro–Trinta Reis)

## Overview
Site interativo de acompanhamento de projeto de infraestrutura rodoviária, hoje implementado como um protótipo HTML autocontido (estado em memória, sem backend). O objetivo desta entrega é que um desenvolvedor recrie a aplicação em um stack real (ex.: React/Next.js, ou o framework já usado no time) conectado ao **Firebase** (Firestore como banco de dados, Firebase Storage para PDFs, Firebase Auth se houver login) para que os dados persistam entre sessões e usuários.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML** — protótipos que mostram a aparência e o comportamento pretendidos, não código de produção para copiar diretamente. A tarefa é **recriar este design no ambiente de desenvolvimento real do time** (framework de front-end + Firebase como camada de dados), usando os padrões e bibliotecas já estabelecidos no projeto, ou escolhendo um stack adequado caso ainda não exista um.

## Fidelity
**Alta fidelidade (hifi)**: o protótipo já reflete cores finais, tipografia, espaçamento e a maior parte das interações (accordions, filtros, gráficos, formulários). O desenvolvedor deve recriar a UI fielmente, usando os valores de design listados abaixo.

## Estrutura da Aplicação (Screens / Views)

A navegação é por sidebar fixa à esquerda (264px), com troca de conteúdo sem reload. Views:

1. **Visão Geral** — home. Cards de KPI do projeto, cronograma ilustrativo, grid de cards das 7 matérias.
2. **Análise** — accordion hierárquico: Disciplina → Análise → Detalhes. Só "Geometria" tem dados reais hoje (5 análises cadastradas); as outras 6 disciplinas mostram placeholder "Nenhuma análise cadastrada". Dentro de Geometria: Dashboard (KPIs, gráficos, comparativo sequencial, itens repetidos) + card "Observações" com filtros.
3. **Geometria** (e potencialmente as outras 6 disciplinas, hoje só Geometria e Terraplenagem têm conteúdo modelado) — página técnica com stats, esquema de traçado (SVG + zoom/pan + slot de imagem do usuário), cards expansíveis de tópicos.
4. **Terraplenagem** — stats, perfil longitudinal interativo (slider "scrub" mostrando corte/aterro numa estaca), cards expansíveis.
5. **Avisos** — linha do tempo de reuniões/comunicados: formulário (data, autor, texto) + lista cronológica.
6. **Consultas** — repositório de PDFs: upload, lista de arquivos com link "Abrir" e "remover".

### Layout geral
- Sidebar: `width: 264px`, fixa, fundo azul escuro (`primaryColor`, padrão `#1f3a5f`), item ativo com `background: rgba(255,255,255,0.14)`.
- Conteúdo principal: `margin-left: 264px`, `padding: 38px 48px 64px`, fundo `#eef1f4`.
- Cards padrão: fundo `#fff`, `border: 1px solid #dde3ea`, `border-radius: 10px`.
- Dashboard da disciplina: fundo azul escuro `#0f2942`, cards internos `rgba(255,255,255,0.06)` com borda `rgba(255,255,255,0.1)`.

## Modelo de Dados (para migrar para Firestore)

### Coleção `disciplinas`
Documento por disciplina, chave estável (`geometria`, `terraplenagem`, `sinalizacao`, `obras`, `desapropriacao`, `intersecao`, `seguranca`):
```
{ key, code, label, desc, modeled: boolean }
```

### Subcoleção `disciplinas/{key}/analises`
Cada análise é **imutável** depois de criada (regra de negócio crítica — ver abaixo):
```
{
  numero: number,
  recebido: string (data),
  concluido: string (data),
  prazo: string,
  analista: string,
  docs: [
    {
      key: string,        // ex: 'texto', 'planta', 'perfil', 'intersec'
      label: string,       // ex: 'Volume 1 – Texto (Estudo de Traçado)'
      items: [
        { text: string, status: 'atendido' | 'parcial' | 'nao' | 'novo' | 'pendente' | null, n: number }
      ]
    }
  ]
}
```
**Regra fundamental (não violar na migração)**: análises antigas nunca são recalculadas a partir de análises novas. Cada análise é uma "fotografia" congelada — os totais e status de uma análise N nunca mudam quando a análise N+1 é criada. O dashboard e os comparativos são sempre *derivados* (calculados em cima dos documentos congelados), nunca eles alteram os documentos.

### Subcoleção `disciplinas/{key}/avisos` (linha do tempo — hoje só em memória)
```
{ id, data: string (date), autor: string, texto: string, criadoEm: timestamp }
```

### Coleção `consultas` (arquivos PDF)
```
{ id, nome: string, storageUrl: string (Firebase Storage), dataUpload: timestamp }
```
Hoje os PDFs são guardados como `URL.createObjectURL()` (memória do navegador, perdido ao recarregar) — **precisa migrar para Firebase Storage** com upload real e URL de download persistente.

## Lógica derivada (recalculada em runtime, não armazenada)
- `buildGeoDashboard()`: agrega os documentos de todas as análises de uma disciplina — total de análises, total de questionamentos, média, última análise, gráfico "questionamentos por análise" (barras verticais), gráfico "assuntos questionados" (barras horizontais, ordenado desc, valor na ponta), "comparativo sequencial" (pizza conic-gradient: % atendidos / novos / reiterados / parcial / não-atendidos, sempre análise N vs. N-1), e "itens repetidos" (itens com texto idêntico em ≥3 análises e status ≠ atendido).
- Esses cálculos devem ser portados como funções puras no novo stack, lendo os documentos do Firestore (nunca escrevendo de volta neles).

## Interações & Comportamento
- Accordions: clique no cabeçalho abre/fecha (chevron `+`/`−`), estado local (`useState`/equivalente), tudo fechado por padrão.
- Dashboard: botões de filtro "Geral / Análise 1-5" trocam entre visão agregada e KPIs de uma análise específica.
- Card "Observações": filtros "Todos / 3 Repetições / 4 Repetições / 5+ Repetições / Não Atendidos / Atendido Parcialmente / Críticos".
- Traçado em planta (Geometria): SVG com zoom (`<input type="range">`) e pan por arraste (pointer events), mais um `<image-slot>` (componente próprio do protótipo) para o usuário soltar uma imagem real do traçado — no app final, substituir por upload de imagem para Storage.
- Terraplenagem: slider "scrub" interpola linearmente entre pontos do perfil terreno×projeto e mostra cota/estaca ao vivo.
- Avisos: formulário controlado (data, autor, texto) → adiciona ao array, ordenado por data desc.
- Consultas: input file (accept `application/pdf`, multiple) → hoje gera object URL local; portar para upload real.

## Design Tokens
- Cor primária (sidebar, botões, destaques): `#1f3a5f` (variações usadas: `#14304f`, `#2f6690`, `#0f2942`).
- Azul secundário (barras, links): `#2f6690`, `#4f8fc0`.
- Vermelho de alerta / "não atendido": `#c0392b`, `#e05a4e`.
- Laranja "atendido parcialmente": `#b5541f`, `#f0a35a`.
- Verde "atendido": `#2f8f4f`.
- Cinza neutro (texto secundário): `#8a94a3`, `#5b6774`.
- Fundo de página: `#eef1f4`. Bordas de card: `#dde3ea`.
- Tipografia: `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Títulos de página 28-30px/700; rótulos de seção 11-12px/700 uppercase letter-spacing 0.1em; corpo 12-14px.
- Border-radius padrão de card: 10-12px. Botões/pills: `border-radius: 20px`.

## Assets
Nenhum asset de marca (logo) foi fornecido — cores escolhidas para tom corporativo sério (azul/cinza). Ícones dos cards de disciplina são iniciais em caixas coloridas (ex. "GE", "TE"), não ícones de biblioteca.

## Screenshots
Ver pasta `screenshots/`: Visão Geral, Geometria, Análise (Geometria expandida com dashboard), Avisos e Consultas.

## Files
- `Apresentacao Infraestrutura.dc.html` — arquivo principal do protótipo (todo o app).
- `image-slot.js` — componente de placeholder de imagem drag-and-drop usado no card de traçado.
- `CLAUDE.md` — notas de contexto do projeto (dados reais extraídos de PDFs da DER-MG, convenções de status, pendências conhecidas).
