# Schema do Banco de Dados

## Resumo
Schema PostgreSQL do Supabase para o Hamburgueria Dispatch. Todas as tabelas usam políticas RLS (Row Level Security).

## Fonte
- `.planning/codebase/INTEGRATIONS.md`
- `task-log.md` (migrations listadas)
- `hamburgueria-dispatch/src/types/index.ts`

## Tabelas

### users
Contas de usuários vinculadas ao Supabase Auth.
```sql
id          uuid PRIMARY KEY
auth_id     uuid (FK → Supabase Auth)
username    text UNIQUE
role        text  -- 'owner' | 'admin' | 'operator'
store_id    uuid (FK → stores)
permissions jsonb DEFAULT '{"operational":true,"orders":true,"drivers":true}'
-- coluna password_hash REMOVIDA (migration: remove_password_hash_column)
```
**RLS:** `users_read_own_store` — usuário lê apenas seu próprio registro ou de outros do mesmo store_id.
Usa função `SECURITY DEFINER` `get_my_store_id()` para evitar recursão.

### stores
Dados e localização da loja.
```sql
id          uuid PRIMARY KEY
name        text
address     text
phone       text
latitude    float
longitude   float
```

### orders
Todos os pedidos recebidos de todas as plataformas.
```sql
id                    uuid PRIMARY KEY
platform              text  -- 'ifood' | '99food' | 'keeta'
platform_order_id     text  -- ID externo da plataforma
store_id              uuid (FK → stores)
status                text  -- enum OrderStatus
route_eligibility     text  -- enum RouteEligibility
route_block_reason    text
logistics_type        text  -- 'own' | 'platform'
delivery_type         text  -- 'delivery' | 'pickup'
customer_name         text
address_street        text
address_number        text
address_neighborhood  text
address_city          text
latitude              float
longitude             float
estimated_delivery_at timestamptz
rejection_count       int DEFAULT 0
items                 jsonb
created_at            timestamptz DEFAULT now()
```

### drivers
Cadastro de motoboys por loja.
```sql
id          uuid PRIMARY KEY
store_id    uuid (FK → stores)
name        text
phone       text
active      boolean DEFAULT true
```

### dispatch_suggestions
Sugestões de rota geradas pelo Motor de Rotas.
```sql
id                uuid PRIMARY KEY
store_id          uuid (FK → stores)
driver_id         uuid (FK → drivers) nullable
status            text  -- 'pending_review' | 'dispatched' | 'rejected'
suggested_sequence uuid[]  -- lista ordenada de IDs de pedidos
created_at        timestamptz DEFAULT now()
```

### dispatch_suggestion_orders
Tabela de junção: quais pedidos pertencem a qual sugestão (com posição na sequência).
```sql
id              uuid PRIMARY KEY
suggestion_id   uuid (FK → dispatch_suggestions)
order_id        uuid (FK → orders)
position        int  -- 1 ou 2
```

### store_integrations
Credenciais de plataformas por loja.
```sql
id            uuid PRIMARY KEY
store_id      uuid (FK → stores)
platform      text  -- 'ifood' | '99food' | 'keeta'
active        boolean
client_id     text
client_secret text  -- texto plano (problema de segurança — veja Registro de Decisões)
last_sync_at  timestamptz
last_error    text
```

### dispatch_alerts
Tabela de rastreamento de alertas (criada na migration: `create_dispatch_alerts_table`).
```sql
id         uuid PRIMARY KEY
store_id   uuid (FK → stores)
order_id   uuid (FK → orders)
level      text  -- '5min' | '1min' | 'critical'
fired_at   timestamptz DEFAULT now()
```

## Migrations Aplicadas (v1)
1. `fix_users_rls_restrict_by_store` — removeu `using (true)`, adicionou `get_my_store_id()` + política por loja
2. `remove_password_hash_column` — removeu coluna `password_hash` de users
3. `create_dispatch_alerts_table` — criou tabela `dispatch_alerts` com RLS
4. `add_permissions_to_users` — adicionou coluna `permissions jsonb` em users

## Enums (TypeScript — `src/types/index.ts`)

```typescript
Platform = 'ifood' | '99food' | 'keeta'
UserRole = 'owner' | 'admin' | 'operator'
OrderStatus = 'new' | 'awaiting_route' | 'in_suggestion' | 'dispatched' | 'cancelled'
RouteEligibility = 'eligible' | 'blocked' | 'awaiting' | 'external_monitoring'
```

## Notas Relacionadas
- [[Arquitetura do Sistema]]
- [[Sistema de Autenticação]]
- [[Visão Geral do Projeto]]
