export function buildCallResult({
    callId,
    client,
    entityType,
    entityId,
    script,
    transcript,
    completedQuestionIds,
    missedRequiredQuestions,
    detectedObjections,
  }) {
    return {
      callId,
      entityType,
      entityId,
      clientName: client.name,
      clientCompany: client.company,
      clientPhone: client.phone,
      scriptId: script.id,
      scriptName: script.name,
      questionsTotal: script.questions.length,
      questionsCompleted: completedQuestionIds.length,
      missedRequiredQuestions: missedRequiredQuestions.map((question) => ({
        id: question.id,
        text: question.text,
      })),
      detectedObjections: detectedObjections.map((objection) => ({
        id: objection.id,
        title: objection.title,
      })),
      transcript,
      summaryText: buildSummaryText({
        client,
        script,
        completedQuestionIds,
        missedRequiredQuestions,
        detectedObjections,
        transcript,
      }),
    }
  }
  
  function buildSummaryText({
    client,
    script,
    completedQuestionIds,
    missedRequiredQuestions,
    detectedObjections,
    transcript,
  }) {
    const missedText =
      missedRequiredQuestions.length > 0
        ? missedRequiredQuestions.map((question) => `- ${question.text}`).join('\n')
        : 'Все обязательные вопросы закрыты.'
  
    const objectionsText =
      detectedObjections.length > 0
        ? detectedObjections.map((objection) => `- ${objection.title}`).join('\n')
        : 'Возражения не обнаружены.'
  
    return `
  Итог звонка
  
  Клиент: ${client.name}
  Компания: ${client.company}
  Телефон: ${client.phone}
  
  Скрипт: ${script.name}
  Задано / обнаружено вопросов: ${completedQuestionIds.length} из ${script.questions.length}
  
  Пропущенные обязательные вопросы:
  ${missedText}
  
  Обнаруженные возражения:
  ${objectionsText}
  
  Расшифровка:
  ${transcript || 'Расшифровка отсутствует.'}
  `.trim()
  }