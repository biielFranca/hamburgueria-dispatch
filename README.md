# Hamburgueria Dispatch

Central de operações para hamburguerias que vendem em vários aplicativos ao
mesmo tempo. Recebe os pedidos do iFood, Keeta e 99Food numa tela só, despacha
os motoboys e mostra o que está acontecendo na loja em tempo real.

Aplicativo de desktop nativo para Windows, feito com Tauri 2 — sem depender de
navegador aberto e sem o peso do Electron.

## Por que existe

Uma loja que vende em três plataformas tem três painéis abertos, cada um com
som, layout e fluxo diferentes. Pedido atrasa porque ninguém viu a aba certa.
Aqui tudo chega no mesmo lugar, classificado automaticamente, com alerta sonoro
e o mapa das entregas.

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicativo | Tauri 2 (WebView2, executável nativo) |
| Interface | React 19 + TypeScript 5.8 |
| Build | Vite 7 |
| Nuvem | Supabase — Postgres, Auth, Realtime e Edge Functions |
| Mapa | Leaflet + react-leaflet |
| Testes | Vitest |

## Organização do repositório

```
hamburgueria-dispatch/   o aplicativo (é aqui que se trabalha)
  src/                   telas, serviços de fundo e camada de dados
  src-tauri/             o lado Rust: janela, empacotamento, permissões
  supabase/              migrações, políticas de acesso e edge functions
backend/                 reservado para o backend em Bun (V3+, ainda não existe)
brain/                   notas de arquitetura, decisões e roadmap
tasks.md, task-log.md    registro do que foi feito e do que falta
```

A pasta `backend/` está vazia de propósito: o aplicativo fala direto com o
Supabase e isso atende V1 e V2. O raciocínio está em
[ARCHITECTURE.md](hamburgueria-dispatch/ARCHITECTURE.md).

## Rodar

```bash
cd hamburgueria-dispatch
npm install
npm run dev          # interface no navegador, recarga automática
npm run tauri dev    # aplicativo de verdade, janela nativa
npm test             # Vitest
```

Gerar o executável do Windows:

```bash
npm run tauri build
```

Precisa de Node 20+, Rust estável e as ferramentas de build do Visual Studio
(requisito do Tauri no Windows).

## Segurança

As tabelas usam regras por linha (RLS) com 45 políticas escopadas por loja, e há
uma checagem em tempo de execução que avisa se alguém colocar uma chave
`service_role` onde deveria estar a chave publicável.

Os webhooks das plataformas rodam com `verify_jwt = false` — é obrigatório,
porque iFood e Open Delivery não têm como enviar um JWT do Supabase. Por isso a
**assinatura HMAC é a única prova de origem** desses pedidos, e a verificação
falha fechado: requisição sem assinatura é recusada, e a loja precisa ter
`webhook_secret` configurado na integração.

Auditorias anteriores estão em [RELATORIO_AUDITORIA.md](RELATORIO_AUDITORIA.md)
e [AUDITORIA_SEGURANCA_DETALHADA.md](AUDITORIA_SEGURANCA_DETALHADA.md).

## Documentação

- [README do aplicativo](hamburgueria-dispatch/README.md) — estrutura de pastas e decisões de stack, em inglês
- [ARCHITECTURE.md](hamburgueria-dispatch/ARCHITECTURE.md) — diagramas e o plano de evolução
- [brain/](brain/) — decisões, glossário e roadmap

## Estado

Em desenvolvimento. O projeto Supabase está pausado; ao religar, aplique as
migrações pendentes e publique novamente as edge functions.
