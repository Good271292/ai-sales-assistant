import http from 'http'
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 8787

const demoPhrases = [
  'Клиент сказал: сейчас заявки ведём в Excel.',
  'Клиент сказал: иногда обращения теряются, особенно из мессенджеров.',
  'Клиент сказал: менеджеров сложно контролировать.',
  'Клиент сказал: в отделе продаж работает 5 сотрудников.',
  'Клиент сказал: готовы обсудить аудит CRM на следующей неделе.',
]

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })

  res.end('AI Sales live-server is running. WebSocket path: /ws')
})

const wss = new WebSocketServer({
  noServer: true,
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`)

  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`)
  const callId = url.searchParams.get('callId')
  const userId = url.searchParams.get('userId')
  const source = url.searchParams.get('source')

  console.log('CALL_CARD подключился:', {
    callId,
    userId,
    source,
  })

  ws.send(
    JSON.stringify({
      type: 'server_status',
      text: 'live-server connected',
      callId,
      userId,
    })
  )

  let index = 0

  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      clearInterval(timer)
      return
    }

    const phrase = demoPhrases[index]

    if (!phrase) {
      ws.send(
        JSON.stringify({
          type: 'assistant_hint',
          text: 'Все тестовые фразы отправлены. Следующий шаг — подключить STT.',
        })
      )

      clearInterval(timer)
      return
    }

    ws.send(
      JSON.stringify({
        type: 'transcript',
        text: phrase,
        source: 'local-live-server',
        createdAt: new Date().toISOString(),
      })
    )

    console.log('Отправлена фраза:', phrase)

    index += 1
  }, 3000)

  ws.on('message', (message) => {
    console.log('Сообщение от CALL_CARD:', message.toString())
  })

  ws.on('close', () => {
    clearInterval(timer)
    console.log('CALL_CARD отключился')
  })

  ws.on('error', (error) => {
    clearInterval(timer)
    console.log('Ошибка WebSocket:', error.message)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Sales live-server запущен: http://127.0.0.1:${PORT}`)
  console.log(`WebSocket endpoint: ws://127.0.0.1:${PORT}/ws`)
})