# Biblioteca de Prompts

## Resumo
Prompts reutilizáveis e instruções de fluxo de IA para o desenvolvimento do Hamburgueria Dispatch.

## Categorias
- Hardening de segurança
- Desenvolvimento de funcionalidades
- Geração de testes
- Revisão de código
- Migrations de banco de dados

## Índice de Prompts

### Segurança: Remover Service Key do Frontend
```
O arquivo hamburgueria-dispatch/src/lib/supabase.ts contém um cliente `supabaseAdmin`
inicializado com VITE_SUPABASE_SERVICE_KEY.

Crie uma Supabase Edge Function que trate estas operações admin:
1. Criar usuário (POST /admin/users)
2. Atualizar senha do usuário (PATCH /admin/users/:id)
3. Deletar usuário (DELETE /admin/users/:id)

A Edge Function deve:
- Autenticar via JWT padrão do Supabase (operador deve ser owner/admin)
- Usar a service key apenas no lado servidor
- Retornar mensagens de erro apropriadas

Em seguida, atualize src/pages/Users/index.tsx para chamar esta Edge Function
em vez do supabaseAdmin.
```

### Gerar Testes do Classificador
```
O arquivo hamburgueria-dispatch/src/lib/classifier.ts exporta
classifyOrder(order: Order): ClassificationResult.

Ele tem 5 regras + um caso padrão. Gere uma suite completa de testes Vitest cobrindo:
1. Regra 1: pickup → blocked/pickup_order
2. Regra 2: logistics_type=platform → external_monitoring
3. Regra 3: lat/lng nulos → awaiting/missing_coordinates
4. Regra 4: address_street vazio → blocked/invalid_address
5. Regra 5: ETA > 30min no futuro → awaiting/scheduled
6. Padrão: nenhuma das anteriores → eligible + status=awaiting_route
7. Edge: todos os campos vazios/nulos
8. Edge: ETA exatamente 30min a partir de agora (limite)

Leia o tipo Order em src/types/index.ts primeiro.
```

### Criar Hook useStoreId
```
Em hamburgueria-dispatch/src/, múltiplos componentes buscam store_id
da tabela users de forma independente a cada mount:
- src/pages/Orders/index.tsx
- src/pages/Operational/index.tsx
- src/components/IfoodPoller/index.tsx
- src/components/AlertSystem/index.tsx
- src/pages/Drivers/index.tsx
- src/pages/Users/index.tsx

Crie src/lib/hooks/useStoreId.ts que:
1. Busca store_id uma única vez via supabase.auth.getUser() → tabela users
2. Cacheia o resultado (React Context ou cache em nível de módulo)
3. Retorna { storeId: string | null, loading: boolean, error: string | null }
4. Funciona com segurança para múltiplos chamadores simultâneos (deduplica a query)

Em seguida, substitua um dos padrões existentes de busca de store_id como prova de conceito.
```

### Corrigir Bug do Toggle do iFood Poller
```
O arquivo hamburgueria-dispatch/src/components/IfoodPoller/index.tsx lê o
status ativo da integração iFood uma única vez no mount (da tabela store_integrations).

Quando o usuário ativa/desativa em Configurações → aba Conexões, o poller
não reage até o reload da página.

Corrija isso:
1. Adicionando uma assinatura Realtime do Supabase à tabela store_integrations
2. Quando o registro do storeId atual mudar, atualizar o activeRef
3. Se active virar false: parar o polling (clearInterval)
4. Se active virar true: iniciar o polling (setInterval)
5. Limpar a assinatura ao desmontar o componente

Leia a implementação atual completamente antes de fazer alterações.
```

## Regras de Uso
- Sempre leia os arquivos fonte relevantes antes de executar um prompt
- Especifique caminhos de arquivo explicitamente no prompt
- Prefira prompts idempotentes (seguros de re-executar)
- Armazene apenas prompts que valem a pena reutilizar entre sessões

## Notas Relacionadas
- [[Registro de Pendências]]
- [[Mapa de Conhecimento Principal]]
