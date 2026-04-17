# Ideias

Ideias de produto, oportunidades técnicas, experimentos, melhorias futuras e conceitos ainda não finalizados.

## Regras
- Uma ideia principal por arquivo sempre que possível.
- Linkar para planos, tarefas e decisões relacionadas.
- Promover ideias maduras para notas de projeto ou plano.

## Ideias Atuais

### App Mobile Companion para Motoboys
Permitir que motoboys recebam notificações de despacho e atualizem o status da entrega pelo celular. Enviaria a localização GPS de volta para o mapa de despacho. Exige build separado em React Native ou PWA.

### Suporte Multi-Loja
Atualmente cada instalação serve uma loja. Um modelo SaaS permitiria que um único projeto Supabase atendesse múltiplas lojas com isolamento total. Mudança principal: todas as políticas RLS já usam `store_id` — o schema do banco já suporta isso.

### Despacho Automático (Sem Aprovação do Operador)
Para lojas simples com poucos pedidos, o sistema poderia auto-aceitar sugestões sem revisão do operador. Adicionar toggle nas configurações da loja para "modo auto-despacho" com regras configuráveis (confiança mínima do motoboy, idade máxima do pedido, etc.).

### Rastreamento de ETA de Entrega
Exibir ao cliente o tempo estimado de entrega baseado em dados reais de roteamento. Atualmente os ETAs vêm das plataformas — poderia ser complementado com dados do Motor de Rotas para pedidos com logística própria.
