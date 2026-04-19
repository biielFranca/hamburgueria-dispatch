# Tasks Sequenciais — Reestruturação do Hamburgueria Dispatch

## Fase 1 — Tirar o cérebro do frontend

- [x] Mapear toda a lógica crítica que ainda roda no cliente (Classifier, RouteEngine, AlertSystem, polling loops, timers, effects que mudam estado de domínio, gravação de auditoria feita no cliente, decisões de timeout/requeue, chamadas diretas a geocoding/routing). Saída: documento com arquivo atual, responsabilidade, gatilho, efeitos no banco e destino futuro no backend.
- [x] Definir arquitetura backend-first do domínio: formalizar blocos de Ingestão, Domínio, Orquestração e Exposição para frontend. Decidir o que roda em Edge Function, o que roda como worker/job, o que permanece no frontend e o que vira comando manual do operador. Saída: markdown com evento de entrada, processo backend, persistência, evento de saída e consumo no frontend.
- [x] Modelar máquina de estados do pedido: definir estados válidos (received, normalized, awaiting_route, in_suggestion, dispatched, delivered, cancelled, dispatch_timeout, external_monitoring, awaiting, blocked, eligible), transições válidas, origem, quem pode disparar, efeitos colaterais e regras de idempotência. Saída: tabela de transição de estados.
- [x] Migrar o Classifier para backend: implementar processamento por lote por loja, geocoding integrado, atualização de status/elegibilidade no banco, idempotência e logs mínimos por execução. Remover ou desativar o componente frontend de classifier. Critério: pedido novo é classificado sem abrir a interface.
- [x] Criar abstração de providers externos: interfaces GeocodingProvider e RoutingProvider com timeout padronizado, tratamento uniforme de erro, logs por provider, cache básico de geocoding e rota. Critério: troca futura de provider não exige reescrever regra de negócio.
- [x] Migrar o RouteEngine para backend: execução por store_id com lock, prevenção de sugestão duplicada, seleção de grupo, otimização de sequência, fallback controlado, persistência das sugestões e trilha de execução. Critério: nenhuma sugestão depende de polling do cliente.
- [x] Migrar AlertState para backend: mover cálculo de warning, urgent, overdue, timeout operacional e possível requeue. Frontend fica só com renderização, som, mute e leitura do estado. Critério: alerta funciona mesmo sem tela aberta.

## Fase 2 — Endurecer a plataforma

- [x] Fortalecer auditoria de domínio: parar de depender de gravação pelo cliente, registrar eventos de domínio no backend com ator, origem, timestamp, entidade e antes/depois. Critério: operações críticas deixam rastro mesmo sem frontend.
- [x] Revisar multi-tenant e RLS: revisar tabelas principais, políticas RLS, acesso por store_id para leitura, escrita, update e delete, incluindo tabelas de sugestões, alertas, integrações, catálogo e estoque futuros. Saída: matriz de tabelas x políticas.
- [x] Implementar idempotência e deduplicação: chaves de idempotência, deduplicação de pedido externo, proteção contra sugestão duplicada e confirmação duplicada. Critério: repetir o mesmo evento não gera efeito inconsistente.
- [x] Implementar retry e reconciliação: retry para sync/dispatch confirm, fila de erro ou tabela de falhas, reconciliação periódica de divergências e visibilidade mínima dos erros. Critério: erro externo não some em silêncio.
- [x] Criar observabilidade mínima: logs por fluxo e provider, métricas de tempo de classificação, tempo até sugestão, tempo até dispatch e contagem de erros de geocoding/routing/integration. Critério: dá para identificar gargalo e falha sem adivinhar.
- [x] Diluir App.tsx: separar em AppShell, AuthBootstrap, AccessControl, Navigation e FeatureModules. Remover boot de automação de domínio e lógica concentrada de sessão misturada com renderização. Critério: App.tsx vira composição simples.
- [x] Separar domínio de UI no frontend: organizar services, hooks, feature modules, stores/client state e componentes puros de UI. Criar padrão claro para comando, leitura, estado de interface e estado de domínio vindo do backend. Critério: páginas não executam processo de domínio crítico.

## Fase 3 — Fundar Cardápio + Estoque corretamente

- [x] Modelar domínio de Cardápio: entidades catalog_items, catalog_item_aliases, platform_item_mapping, catalog_categories e item_availability_state. Definir item canônico, aliases, externalCode, vínculo por plataforma, preço, ativo/inativo e disponibilidade. Critério: item de pedido consegue ser mapeado ao catálogo.
- [x] Modelar domínio de Estoque: entidades inventory_items, stock_movements, item_components/recipes, availability_rules e inventory_thresholds. Definir saldo, movimento, mínimo, consumo por item vendido, ruptura e sugestão de pausa. Critério: existe caminho claro para baixa automática e ruptura.
- [x] Modelar fluxo pedido → catálogo → insumo: documentar o fluxo completo (pedido entra → item identificado → mapeado ao catálogo → catálogo aponta composição → estoque sofre baixa → disponibilidade recalculada → possível ruptura) com entidades e eventos. Critério: Cardápio e Estoque deixam de ser módulos isolados.
- [x] Implementar baixa de estoque e disponibilidade: baixa automática no evento de pedido recebido, atualização de saldo, cálculo de ruptura e mudança de disponibilidade. Deixar preparado para pausa automática em plataforma, aprovação humana e substituição de item. Critério: um pedido afeta disponibilidade de forma rastreável.
- [x] Evoluir UI de Cardápio somente após a espinha dorsal: interface deve refletir catálogo real, aliases, disponibilidade, vínculos de plataforma e estado operacional do item. Critério: tela não é só CRUD decorativo.
- [x] Evoluir UI de Estoque somente após a espinha dorsal: interface deve refletir saldo, movimentos, consumo, ruptura, itens críticos e impacto no cardápio. Critério: tela mostra domínio vivo, não só cadastro simples.

## Fase 4 — Consolidação final

- [x] Revisar ponta a ponta o core operacional: ingestão, classificação, sugestão, dispatch, alerta, auditoria, retry, reconciliação e impacto em catálogo/estoque. Saída: checklist de operação real aprovado.
- [x] Testar cenários reais e de falha: 2 operadores simultâneos, frontend fechado, provider externo falhando, webhook duplicado, retry de confirmação, pedido sem coordenada, sugestão rejeitada repetidas vezes, estoque zerando item ativo. Saída: lista de falhas encontradas e correções.
- [x] Congelar arquitetura base antes de abrir novos módulos: só depois dessa task considerar mobile, social media, backend V3 maior ou outras expansões. Critério: core operacional + plataforma + cardápio/estoque base estão coerentes.
