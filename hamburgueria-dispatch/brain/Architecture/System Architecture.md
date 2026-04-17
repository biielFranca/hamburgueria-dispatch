# Arquitetura do Sistema

## Resumo
Aplicativo desktop Tauri 2 com frontend React 19, TypeScript e Supabase como backend (auth + banco + edge functions). Roda no Windows via WebView2. Sem servidor backend separado — toda a lógica de negócio fica no frontend, com Supabase Functions para operações sensíveis.

## Fonte
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/INTEGRATIONS.md`
- `hamburgueria-dispatch/src/`

## Estrutura do Repositório

```
hamburgueria-dispatch/
├─ src/
│  ├─ App.tsx              # Componente raiz — auth, roteamento, sessão
│  ├─ main.tsx             # Ponto de entrada do React
│  ├─ types/index.ts       # Todos os tipos de domínio e enums
│  ├─ lib/
│  │  ├─ supabase.ts       # Fábrica de clientes Supabase (regular + admin)
│  │  ├─ classifier.ts     # Lógica de classificação de pedidos
│  │  ├─ routeEngine.ts    # Geração de rotas de despacho
│  │  ├─ alertSound.ts     # Sons de alerta via Web Audio API
│  │  ├─ cep.ts            # Consulta de endereço via ViaCEP
│  │  ├─ geocoder.ts       # Geocodificação de endereços
│  │  └─ integrations/
│  │     ├─ ifood.ts       # Chamadas à API do iFood
│  │     └─ openDelivery.ts # Open Delivery (99Food, Keeta, Cardápio Web)
│  ├─ components/
│  │  ├─ AlertSystem/      # Polling em background + toasts de alerta
│  │  ├─ ClassifierService/ # Assinatura Realtime em background
│  │  ├─ RouteEngineService/ # Geração de rotas em background
│  │  ├─ IfoodPoller/      # Polling de sincronização do iFood em background
│  │  ├─ OrderForm/        # Formulário de criação manual de pedido
│  │  └─ layout/Sidebar.tsx
│  └─ pages/
│     ├─ Login/            # Login por usuário/senha
│     ├─ Operational/      # Painel de despacho principal + mapa
│     ├─ Orders/           # Lista de pedidos em tempo real
│     ├─ Drivers/          # Gestão de motoboys
│     ├─ Users/            # Gestão de usuários (owner/admin)
│     ├─ Settings/         # Configurações da loja (3 abas)
│     └─ Dev/              # Ferramentas internas de desenvolvimento
├─ src-tauri/
│  ├─ src/main.rs          # Ponto de entrada do Tauri
│  └─ src/lib.rs           # Configuração de plugins (http, opener)
```

## Padrões Arquiteturais

- **Sem biblioteca de roteamento** — `App.tsx` usa estado `activePage` + renderização condicional para navegar entre páginas
- **Sem biblioteca de estado global** — tudo via React `useState` / `useRef` / `useEffect`
- **Componentes de polling em background** — AlertSystem, IfoodPoller, ClassifierService, RouteEngineService renderizam de forma invisível e executam loops de setInterval/assinatura
- **Camada de serviço** — `src/lib/` contém todas as chamadas a APIs externas, sem fetch direto nas páginas
- **Bridge HTTP do Tauri** — requisições HTTP usam `@tauri-apps/plugin-http` com fallback para fetch nativo

## Responsabilidades dos Módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| `App.tsx` | Estado de auth, expiração de sessão, roteamento de páginas, controle de acesso por papel |
| `types/index.ts` | Todas as interfaces de domínio e enums (sem dependências) |
| `lib/supabase.ts` | Fábrica de clientes Supabase — regular + admin (service key) |
| `lib/classifier.ts` | Função pura: `classifyOrder(order) → ClassificationResult` |
| `lib/routeEngine.ts` | `runRouteEngine(storeId)` — busca pedidos elegíveis, chama API de rotas, cria sugestões |
| `ClassifierService` | Background: INSERT Realtime em `orders` → executa classificador → atualiza banco |
| `RouteEngineService` | Background: Realtime em `awaiting_route` → dispara motor de rotas |
| `AlertSystem` | Background: polling a cada 20s → dispara áudio + toast por idade do pedido |
| `IfoodPoller` | Background: polling a cada 30s via Supabase Edge Function |

## Fluxo de Ingestão de Pedidos
1. iFood Merchant API → Edge Function `ifood-sync` no Supabase
2. Edge Function normaliza o payload → insere na tabela `orders`
3. Supabase Realtime dispara evento INSERT
4. `ClassifierService` recebe o evento → `classifyOrder()` → atualiza `route_eligibility` + `status`
5. Se `eligible` → `RouteEngineService` dispara → pareia com outros pedidos elegíveis → cria `dispatch_suggestion`
6. Página Operacional recebe atualização Realtime → rebusca sugestões
7. Operador seleciona motoboy + aceita → status vira `dispatched`

## Fluxo de Navegação entre Páginas
- Sem roteamento por URL. `App.tsx` mantém estado `activePage: number`
- `Sidebar.tsx` chama `onNavigate(pageIndex)` ao clicar no botão
- `App.tsx` renderiza `activePage === 0 ? <Operational/> : activePage === 1 ? <Orders/> : ...`
- Guards de acesso verificam `userRole` e `userPermissions` antes de renderizar

## Fluxo de Configuração
- `.env` em `hamburgueria-dispatch/` → `import.meta.env.VITE_*` → `lib/supabase.ts`
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — sempre obrigatórios
- `VITE_SUPABASE_SERVICE_KEY` — opcional, habilita gestão de usuários (operações admin)

## Pontos de Integração
- **Supabase PostgreSQL** — banco principal, auth, assinaturas Realtime
- **Supabase Auth** — email/senha com esquema sintético `username@dispatch.internal`
- **Supabase Edge Functions** — `ifood-sync` para processamento de pedidos iFood
- **iFood Merchant API** — eventos de pedido, OAuth2 com client credentials
- **Protocolo Open Delivery** — 99Food, Keeta, Cardápio Web (parcial)
- **API ViaCEP** — consulta de endereço por CEP
- **API de rotas externa** (Mapbox ou Google Maps) — configurada via env vars, usada pelo Motor de Rotas
- **Leaflet / react-leaflet** — exibição de mapa no Painel Operacional e Configurações

## Filosofia de Design (inferida)
- Minimizar dependências externas: sem Redux, sem lib de roteamento, sem lib de formulários
- Desktop em primeiro lugar: janela Tauri é o único alvo de execução
- Tempo real via assinaturas Supabase em vez de websockets
- Manter lógica de negócio em funções puras em `lib/`, efeitos colaterais em componentes background

## Notas Relacionadas
- [[Fluxo de Dados]]
- [[Schema do Banco de Dados]]
- [[Integração iFood]]
- [[Integração Open Delivery]]
- [[Classificador]]
- [[Motor de Rotas]]
- [[Visão Geral do Projeto]]
