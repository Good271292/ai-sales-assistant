import { useEffect, useMemo, useRef, useState } from 'react'
import scripts from './data/scripts.json'
import { getBitrixContext, saveCallResult } from './services/bitrixAdapter'
import './App.css'

const APP_VERSION = 'call-card-vercel-v18'
const CALL_CARD_HANDLER_URL =
  'https://ai-sales-assistant-tau-ten.vercel.app/api/placement?v=3'

/**
 * Пока backend WebSocket ещё не поднят.
 * Когда поднимем backend, сюда поставим wss://...
 *
 * Пример будущего значения:
const LIVE_TRANSCRIPT_WS_URL =
  'wss://handled-attacked-fit-exercise.trycloudflare.com/ws'
 */
const LIVE_TRANSCRIPT_WS_URL =
  'wss://ai-sales-assistant-live-server.onrender.com/ws'

/**
 * Демо-поток нужен только чтобы проверить UI live-подсказок в CALL_CARD.
 * Потом выключим и заменим на реальный WebSocket от backend/STT.
 */
const ENABLE_DEMO_LIVE_STREAM = false

const DEMO_LIVE_PHRASES = [
  'Клиент сказал: сейчас заявки ведём в Excel.',
  'Клиент сказал: иногда обращения теряются, особенно из мессенджеров.',
  'Клиент сказал: менеджеров сложно контролировать.',
  'Клиент сказал: в отделе продаж работает 5 сотрудников.',
  'Клиент сказал: готовы обсудить аудит CRM на следующей неделе.',
]

function callBitrixMethod(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!window.BX24) {
      reject(new Error('BX24 SDK недоступен'))
      return
    }

    window.BX24.callMethod(method, params, function (result) {
      if (result.error()) {
        reject(new Error(result.error_description() || result.error()))
        return
      }

      resolve(result.data())
    })
  })
}

function normalizePlacementHandlers(data) {
  if (!data) {
    return []
  }

  if (Array.isArray(data)) {
    return data
  }

  if (typeof data === 'object') {
    return Object.values(data).flat()
  }

  return []
}

async function getCallCardHandlers() {
  const data = await callBitrixMethod('placement.get', {
    PLACEMENT: 'CALL_CARD',
  })

  return normalizePlacementHandlers(data)
}

async function registerCallCardPlacement() {
  const handlerUrl = CALL_CARD_HANDLER_URL
  const existingHandlers = await getCallCardHandlers()

  const unbindResults = []

  try {
    await callBitrixMethod('placement.unbind', {
      PLACEMENT: 'CALL_CARD',
      HANDLER: '*',
    })

    unbindResults.push({
      handler: '*',
      status: 'placement_unbound',
    })
  } catch (error) {
    unbindResults.push({
      handler: '*',
      status: 'placement_unbind_error',
      error: error.message,
    })
  }

  for (const handler of existingHandlers) {
    const handlerValue = handler.handler || handler.HANDLER

    if (!handlerValue) {
      continue
    }

    try {
      await callBitrixMethod('placement.unbind', {
        PLACEMENT: 'CALL_CARD',
        HANDLER: handlerValue,
      })

      unbindResults.push({
        handler: handlerValue,
        status: 'unbound',
      })
    } catch (error) {
      unbindResults.push({
        handler: handlerValue,
        status: 'unbind_error',
        error: error.message,
      })
    }
  }

  const bindData = await callBitrixMethod('placement.bind', {
    PLACEMENT: 'CALL_CARD',
    HANDLER: handlerUrl,
    TITLE: 'AI Sales Assistant',
  })

  return {
    success: true,
    handlerUrl,
    existingHandlers,
    unbindResults,
    bindData,
  }
}

function getFirstScript() {
  if (Array.isArray(scripts)) {
    return scripts[0] || null
  }

  if (Array.isArray(scripts?.scripts)) {
    return scripts.scripts[0] || null
  }

  return scripts || null
}

function normalizeQuestions(script) {
  const directQuestions = script?.questions

  if (Array.isArray(directQuestions)) {
    return directQuestions.map((question, index) => ({
      id: question.id || question.key || `q-${index}`,
      text: question.text || question.title || String(question),
      required: question.required !== false,
    }))
  }

  const blocks = script?.blocks || script?.sections || []

  if (Array.isArray(blocks)) {
    return blocks
      .flatMap((block) => block.questions || [])
      .map((question, index) => ({
        id: question.id || question.key || `q-${index}`,
        text: question.text || question.title || String(question),
        required: question.required !== false,
      }))
  }

  return [
    {
      id: 'q-1',
      text: 'Подскажите, актуальна ли для вас тема CRM или Битрикс24?',
      required: true,
    },
    {
      id: 'q-2',
      text: 'Как сейчас у вас фиксируются заявки и обращения клиентов?',
      required: true,
    },
    {
      id: 'q-3',
      text: 'Есть ли сейчас проблема с потерей заявок или контролем менеджеров?',
      required: true,
    },
    {
      id: 'q-4',
      text: 'Сколько сотрудников работает с клиентами?',
      required: true,
    },
    {
      id: 'q-5',
      text: 'Когда вам было бы удобно обсудить внедрение подробнее?',
      required: true,
    },
  ]
}

function normalizeObjections(script) {
  const objections = script?.objections

  if (Array.isArray(objections)) {
    return objections.map((objection, index) => ({
      id: objection.id || objection.key || `o-${index}`,
      title: objection.title || objection.text || String(objection),
    }))
  }

  return []
}

function formatEntity(entityType, entityId) {
  if (!entityType || !entityId) {
    return 'не найдена'
  }

  return `${entityType} #${entityId}`
}

function normalizeText(text) {
  return String(text || '').toLowerCase()
}

function findQuestionId(questions, type) {
  const matchers = {
    relevance: ['актуальна', 'актуально', 'тема crm', 'тема срм', 'битрикс24'],
    process: ['фиксируются', 'фиксируете', 'заявки', 'обращения', 'ведёте', 'ведете'],
    pain: ['потер', 'теряются', 'контроль', 'контролировать', 'проблема'],
    team: ['сколько', 'сотрудников', 'менеджеров', 'отдел'],
    nextStep: ['удобно', 'обсудить', 'встреч', 'созвон', 'когда'],
  }

  const keywords = matchers[type] || []

  const found = questions.find((question) => {
    const text = normalizeText(question.text)

    return keywords.some((keyword) => text.includes(keyword))
  })

  return found?.id || null
}

function analyzeTranscriptText(text, questions) {
  const normalized = normalizeText(text)
  const detectedQuestionIds = []
  const insights = []
  const objections = []

  function addQuestion(type, title) {
    const questionId = findQuestionId(questions, type)

    if (questionId && !detectedQuestionIds.includes(questionId)) {
      detectedQuestionIds.push(questionId)
    }

    if (!insights.includes(title)) {
      insights.push(title)
    }
  }

  if (
    normalized.includes('актуаль') ||
    normalized.includes('интересно') ||
    normalized.includes('битрикс') ||
    normalized.includes('crm') ||
    normalized.includes('срм')
  ) {
    addQuestion('relevance', 'Тема CRM / Битрикс24 подтверждена как актуальная.')
  }

  if (
    normalized.includes('excel') ||
    normalized.includes('эксел') ||
    normalized.includes('таблиц') ||
    normalized.includes('заявк') ||
    normalized.includes('обращен') ||
    normalized.includes('мессендж')
  ) {
    addQuestion('process', 'Клиент рассказал, как сейчас фиксируются заявки.')
  }

  if (
    normalized.includes('теря') ||
    normalized.includes('потер') ||
    normalized.includes('пропуска') ||
    normalized.includes('забыва') ||
    normalized.includes('контрол') ||
    normalized.includes('хаос')
  ) {
    addQuestion('pain', 'Выявлена боль: потери заявок / контроль менеджеров.')
  }

  if (
    normalized.includes('сотрудник') ||
    normalized.includes('менеджер') ||
    normalized.includes('отдел продаж') ||
    /\b[2-9]\s*(менеджер|сотрудник)/i.test(text) ||
    /\b[1-9][0-9]\s*(менеджер|сотрудник)/i.test(text)
  ) {
    addQuestion('team', 'Клиент обозначил масштаб отдела / количество сотрудников.')
  }

  if (
    normalized.includes('следующей неделе') ||
    normalized.includes('созвон') ||
    normalized.includes('встреч') ||
    normalized.includes('обсудить') ||
    normalized.includes('аудит') ||
    normalized.includes('готов')
  ) {
    addQuestion('nextStep', 'Есть сигнал к следующему шагу: аудит / встреча / обсуждение.')
  }

  if (
    normalized.includes('дорого') ||
    normalized.includes('цена') ||
    normalized.includes('бюджет') ||
    normalized.includes('нет денег')
  ) {
    objections.push('Цена / бюджет')
  }

  if (
    normalized.includes('подумаем') ||
    normalized.includes('надо подумать') ||
    normalized.includes('вернусь') ||
    normalized.includes('позже')
  ) {
    objections.push('Подумаем / не сейчас')
  }

  if (
    normalized.includes('уже есть') ||
    normalized.includes('у нас есть crm') ||
    normalized.includes('у нас уже') ||
    normalized.includes('другая crm')
  ) {
    objections.push('Уже есть CRM / другой инструмент')
  }

  return {
    detectedQuestionIds,
    insights,
    objections,
  }
}

function buildRecommendation(questions, coveredQuestionIds, detectedObjections) {
  const nextQuestion = questions.find((question) => {
    return !coveredQuestionIds.includes(question.id)
  })

  if (detectedObjections.length > 0) {
    return `Сначала обработай возражение: ${detectedObjections[0]}. Потом вернись к следующему вопросу.`
  }

  if (nextQuestion) {
    return `Задай следующий вопрос: ${nextQuestion.text}`
  }

  return 'Все ключевые вопросы закрыты. Фиксируй следующий шаг: аудит, встреча или КП.'
}

function App() {
  const [bitrixContext, setBitrixContext] = useState(null)
  const [contextError, setContextError] = useState(null)

  const [callCardData, setCallCardData] = useState(null)
  const [callCardError, setCallCardError] = useState(null)

  const [placementResult, setPlacementResult] = useState(null)
  const [placementError, setPlacementError] = useState(null)

  const [transcriptText, setTranscriptText] = useState('')
  const [liveMessages, setLiveMessages] = useState([])
  const [liveStatus, setLiveStatus] = useState('idle')
  const [liveError, setLiveError] = useState(null)

  const [askedQuestionIds, setAskedQuestionIds] = useState([])
  const [saveResult, setSaveResult] = useState(null)

  const wsRef = useRef(null)
  const demoTimerRef = useRef(null)

  const activeScript = useMemo(() => getFirstScript(), [])
  const questions = useMemo(() => normalizeQuestions(activeScript), [activeScript])
  const scriptObjections = useMemo(
    () => normalizeObjections(activeScript),
    [activeScript]
  )

  const isCallCard = bitrixContext?.placement === 'CALL_CARD'
  const isBx24 = bitrixContext?.runtimeMode === 'bx24'
  const showTechnicalPanel = isBx24 && !isCallCard

  const liveTranscriptText = useMemo(() => {
    return liveMessages.map((message) => message.text).join('\n')
  }, [liveMessages])

  const combinedTranscriptText = useMemo(() => {
    return [liveTranscriptText, transcriptText].filter(Boolean).join('\n')
  }, [liveTranscriptText, transcriptText])

  const transcriptAnalysis = useMemo(() => {
    return analyzeTranscriptText(combinedTranscriptText, questions)
  }, [combinedTranscriptText, questions])

  const coveredQuestionIds = useMemo(() => {
    return Array.from(
      new Set([...askedQuestionIds, ...transcriptAnalysis.detectedQuestionIds])
    )
  }, [askedQuestionIds, transcriptAnalysis.detectedQuestionIds])

  const nextQuestion = questions.find((question) => {
    return !coveredQuestionIds.includes(question.id)
  })

  const recommendation = buildRecommendation(
    questions,
    coveredQuestionIds,
    transcriptAnalysis.objections
  )

  const progressText = `${coveredQuestionIds.length} из ${questions.length}`

  useEffect(() => {
    let isMounted = true

    async function loadContext() {
      try {
        const context = await getBitrixContext()

        if (!isMounted) {
          return
        }

        setBitrixContext(context)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setContextError(error.message || 'Не удалось загрузить контекст Bitrix24')
      }
    }

    loadContext()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!bitrixContext) {
      return
    }

    if (bitrixContext.runtimeMode !== 'bx24') {
      return
    }

    const timer = setTimeout(() => {
      handleLoadCallCardData()
    }, 1000)

    return () => {
      clearTimeout(timer)
    }
  }, [bitrixContext])

  useEffect(() => {
    if (!bitrixContext) {
      return
    }

    if (!isCallCard) {
      return
    }

    startLiveTranscriptClient()

    return () => {
      stopLiveTranscriptClient()
    }
  }, [bitrixContext, isCallCard])

  function addLiveMessage(text, source = 'live') {
    const cleanText = String(text || '').trim()

    if (!cleanText) {
      return
    }

    setLiveMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text: cleanText,
        source,
        createdAt: new Date().toISOString(),
      },
    ])
  }

  function startDemoLiveStream() {
    setLiveStatus('demo')
    setLiveError(null)

    let index = 0

    demoTimerRef.current = setInterval(() => {
      const phrase = DEMO_LIVE_PHRASES[index]

      if (!phrase) {
        clearInterval(demoTimerRef.current)
        demoTimerRef.current = null
        setLiveStatus('demo-finished')
        return
      }

      addLiveMessage(phrase, 'demo')
      index += 1
    }, 3000)
  }

  function startLiveTranscriptClient() {
    stopLiveTranscriptClient()

    if (!LIVE_TRANSCRIPT_WS_URL) {
      if (ENABLE_DEMO_LIVE_STREAM) {
        startDemoLiveStream()
      } else {
        setLiveStatus('not-configured')
      }

      return
    }

    try {
      const url = new URL(LIVE_TRANSCRIPT_WS_URL)

      if (bitrixContext.callId) {
        url.searchParams.set('callId', bitrixContext.callId)
      }

      if (bitrixContext.responsible?.id) {
        url.searchParams.set('userId', bitrixContext.responsible.id)
      }

      url.searchParams.set('source', 'call-card')

      setLiveStatus('connecting')
      setLiveError(null)

      const ws = new WebSocket(url.toString())
      wsRef.current = ws

      ws.onopen = () => {
        setLiveStatus('connected')
        setLiveError(null)

        ws.send(
          JSON.stringify({
            type: 'join_call',
            callId: bitrixContext.callId,
            userId: bitrixContext.responsible?.id || '',
            crmEntityType: bitrixContext.entityType,
            crmEntityId: bitrixContext.entityId,
          })
        )
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'transcript' && data.text) {
            addLiveMessage(data.text, data.source || 'ws')
            return
          }

          if (data.type === 'assistant_hint' && data.text) {
            addLiveMessage(`Подсказка AI: ${data.text}`, 'assistant')
            return
          }

          if (data.text) {
            addLiveMessage(data.text, 'ws')
          }
        } catch {
          addLiveMessage(event.data, 'ws')
        }
      }

      ws.onerror = () => {
        setLiveStatus('error')
        setLiveError('Ошибка WebSocket-подключения')
      }

      ws.onclose = () => {
        setLiveStatus((currentStatus) => {
          if (currentStatus === 'error') {
            return currentStatus
          }

          return 'closed'
        })
      }
    } catch (error) {
      setLiveStatus('error')
      setLiveError(error.message || 'Не удалось подключить live-транскрипцию')
    }
  }

  function stopLiveTranscriptClient() {
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current)
      demoTimerRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  async function handleRegisterCallCardPlacement() {
    setPlacementError(null)
    setPlacementResult(null)

    try {
      const result = await registerCallCardPlacement()
      setPlacementResult(result)
    } catch (error) {
      setPlacementError(error.message || 'Не удалось перепривязать CALL_CARD')
    }
  }

  async function handleShowCallCardHandlers() {
    setPlacementError(null)
    setPlacementResult(null)

    try {
      const handlers = await getCallCardHandlers()

      setPlacementResult({
        currentHandlerUrl: CALL_CARD_HANDLER_URL,
        handlers,
      })
    } catch (error) {
      setPlacementError(error.message || 'Не удалось получить handlers CALL_CARD')
    }
  }

  async function handleLoadCallCardData() {
    setCallCardError(null)

    if (!window.BX24) {
      setCallCardError('BX24 SDK недоступен')
      return
    }

    if (!window.BX24.placement) {
      setCallCardError('BX24.placement недоступен')
      return
    }

    try {
      const placementInfo = window.BX24.placement.info()

      let callStatus = null
      let callStatusError = null

      try {
        callStatus = await new Promise((resolve, reject) => {
          let resolved = false

          window.BX24.placement.call('getStatus', {}, function (data) {
            resolved = true
            resolve(data)
          })

          setTimeout(() => {
            if (!resolved) {
              reject(new Error('getStatus не ответил за 5 секунд'))
            }
          }, 5000)
        })
      } catch (error) {
        callStatusError = error.message
      }

      setCallCardData({
        loadedAt: new Date().toISOString(),
        placementInfo,
        callStatus,
        callStatusError,
        bx24PlacementAvailable: Boolean(window.BX24.placement),
      })
    } catch (error) {
      setCallCardError(error.message || 'Не удалось получить данные CALL_CARD')
    }
  }

  function handleMarkQuestionAsked(questionId) {
    setAskedQuestionIds((currentIds) => {
      if (currentIds.includes(questionId)) {
        return currentIds
      }

      return [...currentIds, questionId]
    })
  }

  async function handleSaveCallResult() {
    if (!bitrixContext) {
      return
    }

    const summaryText = [
      'Итог звонка AI Sales Assistant.',
      '',
      `Клиент: ${bitrixContext.client?.name || 'Неизвестный клиент'}`,
      `Телефон: ${bitrixContext.client?.phone || ''}`,
      `Закрыто вопросов: ${coveredQuestionIds.length} из ${questions.length}`,
      '',
      liveTranscriptText ? `Live-транскрипция:\n${liveTranscriptText}` : '',
      transcriptText ? `Ручная заметка:\n${transcriptText}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const result = await saveCallResult({
      entityType: bitrixContext.entityType,
      entityId: bitrixContext.entityId,
      callId: bitrixContext.callId,
      phone: bitrixContext.client?.phone || '',
      summaryText,
    })

    setSaveResult(result)
  }

  function getLiveStatusText() {
    const map = {
      idle: 'ожидание',
      demo: 'демо-поток',
      'demo-finished': 'демо завершено',
      'not-configured': 'WebSocket не настроен',
      connecting: 'подключение',
      connected: 'подключено',
      closed: 'соединение закрыто',
      error: 'ошибка',
    }

    return map[liveStatus] || liveStatus
  }

  if (!bitrixContext && !contextError) {
    return (
      <main className="app">
        <section className="assistant-panel">
          <h1>AI Sales Assistant</h1>
          <p>Загрузка контекста Bitrix24...</p>
        </section>
      </main>
    )
  }

  if (contextError) {
    return (
      <main className="app">
        <section className="assistant-panel">
          <h1>AI Sales Assistant</h1>
          <p>{contextError}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="assistant-panel">
        <div className="header">
          <h1>AI Sales Assistant</h1>
        </div>

        <p>
          <strong>Клиент:</strong>{' '}
          {bitrixContext.client?.name || 'Неизвестный клиент'}
          {bitrixContext.client?.company ? ` · ${bitrixContext.client.company}` : ''}
        </p>

        <p>
          <strong>Телефон:</strong> {bitrixContext.client?.phone || ''}
        </p>

        <p>
          <strong>CRM:</strong>{' '}
          {formatEntity(bitrixContext.entityType, bitrixContext.entityId)}
        </p>

        <p>
          <strong>Ответственный:</strong>{' '}
          {bitrixContext.responsible?.name || 'Ответственный не определён'}
        </p>

        {showTechnicalPanel && (
          <>
            <hr />

            <p>
              <strong>ID звонка:</strong> {bitrixContext.callId || ''}
            </p>
            <p>
              <strong>Режим:</strong> {bitrixContext.runtimeMode}
            </p>
            <p>
              <strong>Версия:</strong> {APP_VERSION}
            </p>
            <p>
              <strong>CALL_CARD handler:</strong> {CALL_CARD_HANDLER_URL}
            </p>

            <div className="placement-actions">
              <button type="button" onClick={handleRegisterCallCardPlacement}>
                Перепривязать CALL_CARD на Vercel
              </button>

              <button type="button" onClick={handleShowCallCardHandlers}>
                Проверить handlers CALL_CARD
              </button>

              <button type="button" onClick={handleLoadCallCardData}>
                Показать данные CALL_CARD
              </button>
            </div>

            {placementError && <p className="error-text">{placementError}</p>}

            {placementResult && (
              <pre>{JSON.stringify(placementResult, null, 2)}</pre>
            )}

            {callCardError && <p className="error-text">{callCardError}</p>}

            {callCardData && <pre>{JSON.stringify(callCardData, null, 2)}</pre>}
          </>
        )}
      </section>

      <section className="script-block">
        <h2>{activeScript?.title || 'Холодный звонок — Битрикс24'}</h2>
        <p>Сегмент: {activeScript?.segment || 'cold'}</p>
        <p>Прогресс: {progressText}</p>

        <button type="button" onClick={handleSaveCallResult}>
          Завершить и сохранить итог звонка
        </button>

        {saveResult && (
          <p>{saveResult.message || saveResult.error || 'Результат обработан'}</p>
        )}
      </section>

      <section className="live-transcript-block">
        <h2>Live-транскрипция</h2>
        <p>
          <strong>Статус:</strong> {getLiveStatusText()}
        </p>

        {liveError && <p className="error-text">{liveError}</p>}

        {liveMessages.length === 0 ? (
          <p>Пока нет live-фраз.</p>
        ) : (
          <ul>
            {liveMessages.slice(-6).map((message) => (
              <li key={message.id}>
                <span>{message.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="recommendation-block">
        <h2>Рекомендация помощника</h2>
        <p>{recommendation}</p>
      </section>

      <section className="detected-block">
        <h2>Найдено в разговоре: {transcriptAnalysis.insights.length}</h2>

        {transcriptAnalysis.insights.length === 0 ? (
          <p>Пока в разговоре не найдено закрытых смысловых блоков.</p>
        ) : (
          <ul>
            {transcriptAnalysis.insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        )}

        {transcriptAnalysis.objections.length > 0 && (
          <>
            <h3>Возражения</h3>
            <ul>
              {transcriptAnalysis.objections.map((objection) => (
                <li key={objection}>{objection}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="next-question-block">
        <h2>Следующий вопрос</h2>

        {nextQuestion ? (
          <>
            <p>{nextQuestion.text}</p>
            <button
              type="button"
              onClick={() => handleMarkQuestionAsked(nextQuestion.id)}
            >
              Задан вручную
            </button>
          </>
        ) : (
          <p>Все вопросы закрыты.</p>
        )}
      </section>

      <section className="questions-block">
        <h2>
          Обязательные не закрыты:{' '}
          {questions.filter((question) => {
            return question.required && !coveredQuestionIds.includes(question.id)
          }).length}
        </h2>

        <ul>
          {questions.map((question) => {
            const isCovered = coveredQuestionIds.includes(question.id)
            const isManual = askedQuestionIds.includes(question.id)
            const isAuto = transcriptAnalysis.detectedQuestionIds.includes(question.id)

            return (
              <li key={question.id}>
                <span>{question.text}</span>{' '}
                {isCovered && (
                  <strong>{isManual ? '✓ вручную' : isAuto ? '✓ по разговору' : '✓'}</strong>
                )}{' '}
                {!isCovered && (
                  <button
                    type="button"
                    onClick={() => handleMarkQuestionAsked(question.id)}
                  >
                    Отметить
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="transcript-block">
        <h2>Ручная заметка / резерв</h2>
        <textarea
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          placeholder="Резервное поле. Основной сценарий — live-текст через WebSocket."
        />
      </section>

      {scriptObjections.length > 0 && (
        <section className="objections-block">
          <h2>Справочник возражений</h2>

          <ul>
            {scriptObjections.map((objection) => (
              <li key={objection.id}>{objection.title}</li>
            ))}
          </ul>
        </section>
      )}

      {showTechnicalPanel && bitrixContext.raw && (
        <section className="debug-block">
          <h2>Диагностика</h2>
          <pre>{JSON.stringify(bitrixContext.raw, null, 2)}</pre>
        </section>
      )}
    </main>
  )
}

export default App