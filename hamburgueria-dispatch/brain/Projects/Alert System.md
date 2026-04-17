# Sistema de Alertas

## Resumo
Componente em background que consulta pedidos atrasados a cada 20 segundos e dispara alertas sonoros + visuais baseados na idade do pedido. Evita alertas duplicados por combinação de pedido/nível dentro de uma sessão.

## Fonte
- `hamburgueria-dispatch/src/components/AlertSystem/index.tsx`
- `hamburgueria-dispatch/src/lib/alertSound.ts`
- `tasks_v1.md` — Blocos 7 + 8

## Limites de Alerta

| Nível | Gatilho | Som | Descrição |
|-------|---------|-----|-----------|
| `5min` | idade >= 5 min | 6 pulsos em pares, ~3,6s | Aviso antecipado |
| `1min` | idade >= 9 min | 8 pulsos urgentes, ~4,2s | Próximo do atraso |
| `critical` | idade >= 10 min | 12 pulsos alternados intensos, ~5,4s | Atrasado |

## Como Funciona

### Componente AlertSystem
- Executa `setInterval` a cada 20 segundos
- Consulta Supabase: todos os pedidos ativos (não despachados/cancelados) da loja
- Para cada pedido: calcula idade a partir de `created_at`
- Verifica `firedRef: Set<string>` com chave `${orderId}-${level}` para deduplicação
- Se limiar atingido e não disparado: toca som, exibe toast, adiciona ao firedRef
- Toast se fecha automaticamente após 7 segundos

### alertSound.ts
Sons via Web Audio API. Sem arquivos de áudio externos.
- Instância única de AudioContext (reutilizada entre alertas)
- Usa OscillatorNode com envelope (attack/release) para som limpo
- `playAlert(level: '5min' | '1min' | 'critical')` — API pública

### Botão de Mudo
Estado de mudo persistido no `localStorage`. Silencia o áudio sem desativar os toasts visuais.

## Problemas Conhecidos
- `firedRef` existe apenas em memória — reinicia ao recarregar a página
- A tabela `dispatch_alerts` existe no banco mas pode não estar sendo usada pelo AlertSystem ainda (ver [[Registro de Pendências]])
- Ver [[Registro de Pendências]] para o bug de múltiplos AudioContext em alertas rápidos

## Notas Relacionadas
- [[Fluxo de Dados]]
- [[Registro de Pendências]]
