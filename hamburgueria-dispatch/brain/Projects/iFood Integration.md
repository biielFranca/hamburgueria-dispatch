# Integração iFood

## Resumo
Sincronização de pedidos da iFood Merchant API via Supabase Edge Function. Polling a cada 30 segundos. Credenciais armazenadas por loja na tabela `store_integrations`.

## Fonte
- `hamburgueria-dispatch/src/lib/integrations/ifood.ts`
- `hamburgueria-dispatch/src/components/IfoodPoller/index.tsx`
- `hamburgueria-dispatch/src/pages/Settings/` (TabConnections)
- `.planning/codebase/INTEGRATIONS.md`

## Como Funciona

### Componente IfoodPoller
Componente em background. Sem UI visível exceto o ponto de status (canto inferior esquerdo).
- No mount: resolve `store_id` do usuário autenticado → verifica `store_integrations` para integração iFood ativa
- Se ativa: chama `syncIfood(storeId)` a cada 30 segundos
- Exibe: ponto verde (última sync OK), ponto amarelo (nunca sincronizou), ponto vermelho (erro)

### ifood.ts — Funções Principais
```typescript
syncIfood(storeId: string): Promise<IfoodSyncResult>
  // Chama Edge Function 'ifood-sync' via HTTP Tauri (com fallback para fetch)
  // Retorna: { inserted, events, errors }

testIfoodCredentials(clientId: string, clientSecret: string): Promise<boolean>
  // Valida credenciais contra a API do iFood sem salvar
```

### Supabase Edge Function (ifood-sync)
- Hospedada no Supabase
- Busca eventos iFood da Merchant API usando credenciais armazenadas
- Normaliza pedidos para o formato interno
- Insere na tabela `orders` com `platform = 'ifood'`
- Confirma recebimento dos eventos processados (remove da fila do iFood)

### Gerenciamento de Token OAuth
- Fluxo OAuth 2.0 client_credentials
- Token cacheado em memória, renovado 5 minutos antes de expirar
- `client_id` + `client_secret` armazenados na tabela `store_integrations`

## Configuração
Na página Configurações → aba Conexões:
1. Inserir Client ID + Client Secret do iFood
2. Salvar → credenciais armazenadas em `store_integrations`
3. Ativar toggle → IfoodPoller inicia/para automaticamente no próximo reload da página

**Bug**: Ativar/desativar o toggle exige reload para ter efeito. O IfoodPoller não assina mudanças Realtime em `store_integrations`.

## Tratamento de Erros
- HTTP 5xx ou timeout: até 3 tentativas com backoff exponencial
- Erro armazenado em `store_integrations.last_error`
- Ponto de status fica vermelho com mensagem de erro

## Notas Relacionadas
- [[Integração Open Delivery]]
- [[Schema do Banco de Dados]]
- [[Arquitetura do Sistema]]
- [[Registro de Pendências]]
