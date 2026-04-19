# Fluxo de Dados

## Resumo
Fluxo detalhado dos quatro principais processos operacionais do Hamburgueria Dispatch.

## Fonte
- `.planning/codebase/ARCHITECTURE.md`
- `hamburgueria-dispatch/src/App.tsx`
- `hamburgueria-dispatch/src/components/`

## 1. Ingestão de Pedido iFood

```
iFood Merchant API
  → Edge Function Supabase (ifood-sync)
    → Normaliza payload para formato interno de Pedido
    → INSERT na tabela orders (platform='ifood')
      → Supabase Realtime dispara evento INSERT
        → ClassifierService.onInsert()
          → classifyOrder(order)
            → UPDATE orders SET route_eligibility, status
              → Se eligible:
                → RouteEngineService dispara
                → runRouteEngine(storeId)
                  → SELECT pedidos elegíveis
                  → Chama API de rotas (pareia 2 pedidos)
                  → INSERT dispatch_suggestion + dispatch_suggestion_orders
                    → Realtime da página Operacional dispara
                      → fetchAll() rebusca sugestões
```

## 2. Login do Usuário

```
Usuário digita username + senha
  → Página Login: SELECT users WHERE username = ?
    → Extrai auth_id
    → supabase.auth.signInWithPassword({email: username@dispatch.internal, password})
      → Supabase Auth valida
        → App.tsx onAuthStateChange dispara (SIGNED_IN)
          → fetchUserRole(): SELECT role, permissions FROM users WHERE auth_id = ?
            → Estado do App: session, userRole, userPermissions definidos
              → Sidebar renderiza com navegação filtrada por papel
              → Página ativa renderiza (Operacional por padrão)
              → localStorage.setItem('dispatch_login_at', Date.now())
```

## 3. Fluxo de Alertas

```
AlertSystem (setInterval a cada 20s)
  → SELECT orders WHERE status NOT IN (dispatched, cancelled)
    → Para cada pedido:
      → Calcula idade = (agora - created_at) em minutos
      → Se idade >= 10 E !firedRef.has(orderId-overdue) → playAlert('critical') + toast
      → Se idade >= 9 E !firedRef.has(orderId-1min) → playAlert('1min') + toast
      → Se idade >= 5 E !firedRef.has(orderId-5min) → playAlert('5min') + toast
      → firedRef.add(chave) para evitar duplicatas
```

## 4. Aceitar Sugestão de Despacho

```
Operador na página Operacional:
  → Seleciona motoboy no dropdown
  → Clica em "Aceitar" no bloco de sugestão
    → UPDATE dispatch_suggestions SET status='dispatched', driver_id=?
      → UPDATE orders SET status='dispatched' WHERE id IN suggestion.order_ids
        → Se platform=ifood: chama endpoint de confirmação de despacho do iFood
        → Mapa operacional: pedidos despachados somem gradualmente (animação ghost 60s)
```

## Padrão de Gerenciamento de Estado

Todo estado é local React. Sem store global. Locais principais:

| Estado | Localização | Escopo |
|--------|-------------|--------|
| session, userRole, userPermissions | `App.tsx` | App inteiro (passado como props) |
| activePage | `App.tsx` | Navegação |
| suggestions, orders, drivers | `Operational/index.tsx` | Nível de página |
| driverSelections | `Operational/index.tsx` | Escolha de motoboy por sugestão |
| alertCards | `AlertSystem/index.tsx` | Toasts de alerta |
| lastSync, lastError | `IfoodPoller/index.tsx` | Indicador de status da integração |
| dados da loja | `Settings/index.tsx` | Estado do formulário |

## Notas Relacionadas
- [[Arquitetura do Sistema]]
- [[Classificador]]
- [[Motor de Rotas]]
- [[Sistema de Alertas]]
- [[Integração iFood]]
