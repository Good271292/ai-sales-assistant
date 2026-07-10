export default function handler(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  
    res.statusCode = 200
    res.end(`<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <title>CALL_CARD TEST</title>
    </head>
    <body style="font-family: Arial; padding: 24px;">
      <h1>CALL_CARD TEST OK</h1>
      <p>Если ты видишь этот текст внутри карточки звонка — Vercel handler открывается.</p>
      <p>Время: ${new Date().toISOString()}</p>
    </body>
  </html>`)
  }