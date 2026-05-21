# Tasks V1 — Hamburgueria Dispatch

> **Observação importante:** algumas partes do projeto já foram desenvolvidas em sessões anteriores. Se ao iniciar uma task você identificar que ela já foi implementada, não a marque como concluída automaticamente — revise o código existente, verifique se está de acordo com o escopo descrito, corrija o que estiver fora do esperado, e só então marque como concluída.

## Bloco 1 — Segurança base

- [ ] Criar `.gitignore` na raiz do projeto com as entradas: `.env`, `node_modules`, `target`, `.DS_Store`
- [ ] Corrigir a política RLS da tabela `users` no Supabase: remover a política `using (true)` e substituir por uma política que restringe leitura apenas ao `store_id` do usuário logado
- [ ] Adicionar listener de sessão expirada no `App.tsx`: quando o Supabase Auth retornar sessão inválida ou evento `SIGNED_OUT`, redirecionar automaticamente para a tela de login sem precisar de ação do usuário
- [ ] Remover a coluna `password_hash` da tabela `users` via SQL no Supabase, pois o gerenciamento de senha é feito pelo Supabase Auth e a coluna é enganosa

## Bloco 2 — Configurações da loja

- [ ] Criar a página `src/pages/Settings/index.tsx` com proteção de rota — se o usuário logado tiver `role !== 'owner'`, redirecionar para o painel operacional
- [ ] Adicionar botão de engrenagem na sidebar (`src/components/layout/Sidebar.tsx`) que navega para a página de configurações, visível apenas para usuários com `role = 'owner'`
- [ ] Criar formulário na página de configurações com os campos: nome da loja, endereço, telefone, latitude e longitude — todos conectados ao registro da loja na tabela `stores`
- [ ] Adicionar mapa Leaflet interativo na página de configurações: ao clicar no mapa, posicionar o pin e preencher automaticamente os campos de latitude e longitude com as coordenadas do clique
- [ ] Implementar função de salvar: ao submeter o formulário, atualizar o registro na tabela `stores` via Supabase e exibir feedback visual de sucesso ou erro
- [ ] Adicionar banner de aviso no painel operacional quando `latitude` ou `longitude` da loja estiverem nulos no banco, orientando o dono a preencher as configurações

## Bloco 3 — Classificador logístico

- [ ] Criar o arquivo `src/lib/classifier.ts` com a função principal `classifyOrder(order: Order): ClassificationResult` que retorna `route_eligibility` e `route_block_reason`
- [ ] Implementar regra 1 no classificador: se `delivery_type === 'pickup'` → retornar `route_eligibility: 'blocked'` com `route_block_reason: 'pickup_order'`
- [ ] Implementar regra 2 no classificador: se `logistics_type === 'platform'` → retornar `route_eligibility: 'external_monitoring'`
- [ ] Implementar regra 3 no classificador: se `latitude` ou `longitude` do pedido forem nulos → retornar `route_eligibility: 'awaiting'` com `route_block_reason: 'missing_coordinates'`
- [ ] Implementar regra 4 no classificador: se `address_street` estiver vazio ou nulo → retornar `route_eligibility: 'blocked'` com `route_block_reason: 'invalid_address'`
- [ ] Implementar regra 5 no classificador: se `estimated_delivery_at` for mais de 30 minutos no futuro → retornar `route_eligibility: 'awaiting'` com `route_block_reason: 'scheduled'`
- [ ] Implementar regra padrão no classificador: se nenhuma regra anterior for acionada → retornar `route_eligibility: 'eligible'`
- [ ] Conectar o classificador ao Supabase Realtime: assinar inserções na tabela `orders`, rodar `classifyOrder` para cada novo pedido e atualizar os campos `route_eligibility`, `route_block_reason` e `status` no banco

## Bloco 4 — Motor de rotas

- [ ] Escolher a API de rotas (recomendado: Mapbox ou Google Maps) e adicionar as variáveis no `.env`: `VITE_ROUTES_API_KEY` e `VITE_ROUTES_API_URL`
- [ ] Criar o arquivo `src/lib/routeEngine.ts` com a função principal `runRouteEngine(storeId: string)` que coordena todo o fluxo de geração de sugestões
- [ ] Implementar a busca de pedidos elegíveis: selecionar pedidos com `route_eligibility = 'eligible'` e `status = 'awaiting_route'` do `store_id` correto, ordenados por `rejection_count` decrescente e `created_at` crescente
- [ ] Implementar a consulta à API de rotas: dado origem (coordenadas da loja) e dois destinos (coordenadas dos pedidos), retornar tempo e distância reais com perfil de deslocamento de moto
- [ ] Implementar comparação de sequências: calcular tempo de loja → pedido1 → pedido2 e loja → pedido2 → pedido1, escolher a sequência de menor tempo total
- [ ] Implementar criação da sugestão: inserir registro em `dispatch_suggestions` com `status = 'pending_review'` e vincular os pedidos em `dispatch_suggestion_orders` com suas posições
- [ ] Implementar lógica de pedido único: se houver apenas 1 pedido elegível na fila há mais de 10 minutos, criar sugestão com pedido único em vez de aguardar par
- [ ] Implementar contador de timeout: incrementar `rejection_count` ao recusar, e após 3 rejeições sem agrupamento marcar o pedido como `dispatch_timeout` e emitir alerta no painel
- [ ] Conectar o motor ao Supabase Realtime: disparar `runRouteEngine` automaticamente sempre que um pedido for atualizado para `status = 'awaiting_route'`

## Bloco 5 — Integração iFood

- [ ] Adicionar variáveis do iFood no `.env`: `VITE_IFOOD_CLIENT_ID` e `VITE_IFOOD_CLIENT_SECRET`
- [ ] Criar `src/lib/integrations/ifood.ts` com a função de autenticação OAuth 2.0: gerar bearer token via `client_credentials`, cachear o token e renová-lo automaticamente 5 minutos antes de expirar
- [ ] Implementar polling de eventos: a cada 30 segundos, buscar novos eventos no endpoint de eventos do iFood usando o token em cache
- [ ] Implementar processamento do evento `PLACED` (novo pedido): extrair dados do payload, normalizar para o formato interno da tabela `orders` com `platform = 'ifood'`, e inserir no Supabase
- [ ] Implementar processamento do evento `CANCELLED`: localizar o pedido pelo `platform_order_id` e atualizar seu `status` para `'cancelled'` no banco
- [ ] Implementar confirmação de recebimento: após processar cada evento, chamar o endpoint de acknowledge do iFood para remover o evento da fila
- [ ] Implementar função de despacho: quando uma sugestão com pedido iFood for aceita no painel, chamar o endpoint de confirmação de despacho da plataforma com o ID do pedido
- [ ] Adicionar tratamento de erro com retry: em caso de falha HTTP 5xx ou timeout, tentar novamente até 3 vezes com intervalo exponencial antes de registrar o erro

## Bloco 6 — Integração Open Delivery (99Food, Keeta)

- [ ] Adicionar variáveis no `.env`: `VITE_99FOOD_CLIENT_ID`, `VITE_99FOOD_CLIENT_SECRET`, `VITE_KEETA_CLIENT_ID`, `VITE_KEETA_CLIENT_SECRET`
- [ ] Criar `src/lib/integrations/openDelivery.ts` com função de autenticação OAuth 2.0 do padrão Open Delivery: instanciar um cliente autenticado por plataforma, com cache e renovação automática de token
- [ ] Criar handler de webhook em `src/api/webhook/openDelivery.ts`: receber HTTP POST, identificar a plataforma de origem pelo header ou endpoint, e validar a assinatura com o secret correspondente
- [ ] Implementar normalização de payload Open Delivery: converter o formato padrão para o formato interno da tabela `orders`, mapeando `platform` para `'99food'` ou `'keeta'` conforme a origem
- [ ] Forçar para pedidos da Keeta: `logistics_type = 'platform'` e `route_eligibility = 'external_monitoring'` — a Keeta usa motoboy próprio e nunca deve entrar na fila de roteirização
- [ ] Implementar função de despacho Open Delivery: quando uma sugestão com pedido de plataforma Open Delivery for aceita, chamar o endpoint de atualização de status do padrão para confirmar o despacho
- [ ] Adicionar tratamento de erro com retry para chamadas Open Delivery, seguindo o mesmo padrão da integração iFood

## Bloco 7 — Sons dos alertas

- [ ] Criar a pasta `public/sounds/` e adicionar três arquivos de áudio: `alert-5min.mp3` (tom leve), `alert-1min.mp3` (tom médio urgente) e `alert-critical.mp3` (tom forte crítico)
- [ ] Criar utilitário `src/lib/alertSound.ts` com função `playAlert(level: '5min' | '1min' | 'critical')` que toca o arquivo correspondente sem sobrepor sons simultâneos, usando fila de reprodução
- [ ] Adicionar botão de mute no canto do painel operacional que silencia os sons sem desativar os alertas visuais, com estado persistido no localStorage
- [ ] Conectar `playAlert` ao sistema de alertas visuais existente: disparar o som correspondente junto com cada popup de alerta nos momentos corretos (5min, 1min, atrasado)

## Bloco 8 — Testes e validação

- [ ] Criar um pedido de teste manualmente no banco com `logistics_type = 'own'`, `delivery_type = 'delivery'` e coordenadas válidas, e verificar se o classificador o marca como `eligible`
- [ ] Criar dois pedidos elegíveis com coordenadas reais próximas à loja e verificar se o motor de rotas gera uma `dispatch_suggestion` correta no banco
- [ ] Testar o fluxo completo de aceitar uma sugestão no painel: selecionar motoboy, aceitar, e verificar se o status muda para `dispatched` e se a chamada de despacho é enviada para a plataforma correta
- [ ] Testar o fluxo de recusa: recusar uma sugestão, verificar se `rejection_count` incrementa e se os pedidos voltam para `awaiting_route` com prioridade
- [ ] Verificar que pedidos da Keeta não aparecem na fila do motor de rotas e ficam apenas como `external_monitoring` no painel de pedidos
- [ ] Testar os alertas de atraso: criar um pedido com `estimated_delivery_at` próximo do vencimento e verificar se o popup e o som disparam nos momentos corretos (5min, 1min, atrasado)
