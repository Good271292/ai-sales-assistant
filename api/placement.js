export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  res.status(200).send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Sales Assistant</title>

  <style>
    html,
    body {
      margin: 0;
      padding: 0;
      background: #f3f6fb;
      font-family: Arial, sans-serif;
    }

    #root {
      min-height: 100vh;
    }

    .app-loader {
      padding: 24px;
      font-size: 16px;
      color: #334155;
    }
  </style>
</head>

<body>
  <div id="root">
    <div class="app-loader">Загрузка AI Sales Assistant...</div>
  </div>

  <script src="https://api.bitrix24.com/api/v1/"></script>

  <link rel="stylesheet" href="/assets/app.css?v=19" />

  <script type="module" src="/assets/app.js?v=19"></script>
</body>
</html>`)
}