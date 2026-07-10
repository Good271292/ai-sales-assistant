const mockBitrixContext = {
  callId: 'mock-call-001',
  entityType: 'lead',
  entityId: '12345',
  runtimeMode: 'mock',
  placement: null,
  client: {
    name: 'Иван Петров',
    company: 'ООО Ромашка',
    phone: '+7 963 947-63-18',
  },
  responsible: {
    id: 1,
    name: 'Владимир Трубыцын',
  },
  raw: null,
}

let bx24InitPromise = null

function hasBX24() {
  return typeof window !== 'undefined' && Boolean(window.BX24)
}

function initBX24() {
  if (!hasBX24()) {
    return Promise.reject(new Error('BX24 SDK недоступен'))
  }

  if (bx24InitPromise) {
    return bx24InitPromise
  }

  bx24InitPromise = new Promise((resolve) => {
    if (typeof window.BX24.init === 'function') {
      window.BX24.init(() => {
        resolve()
      })

      return
    }

    resolve()
  })

  return bx24InitPromise
}

function callBitrixMethod(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!hasBX24()) {
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

function callPlacementCommand(command, params = {}) {
  return new Promise((resolve, reject) => {
    if (!hasBX24() || !window.BX24.placement) {
      reject(new Error('BX24.placement недоступен'))
      return
    }

    let isResolved = false

    window.BX24.placement.call(command, params, function (data) {
      isResolved = true
      resolve(data)
    })

    setTimeout(() => {
      if (!isResolved) {
        reject(new Error(`${command} не ответил за 5 секунд`))
      }
    }, 5000)
  })
}

function getPlacementInfo() {
  if (!hasBX24() || !window.BX24.placement) {
    return null
  }

  try {
    return window.BX24.placement.info()
  } catch {
    return null
  }
}

function normalizeFalse(value) {
  if (value === false || value === null || value === undefined) {
    return ''
  }

  if (String(value).toLowerCase() === 'false') {
    return ''
  }

  return String(value)
}

function normalizeCrmType(value) {
  const normalized = normalizeFalse(value).toLowerCase()

  if (normalized === 'lead') return 'lead'
  if (normalized === 'deal') return 'deal'
  if (normalized === 'contact') return 'contact'
  if (normalized === 'company') return 'company'

  return ''
}

function getPhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function getPhoneTail(phone) {
  const digits = getPhoneDigits(phone)

  if (digits.length >= 10) {
    return digits.slice(-10)
  }

  return digits
}

function normalizePhoneForDisplay(phone) {
  const digits = getPhoneDigits(phone)

  if (!digits) {
    return ''
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`
  }

  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`
  }

  if (digits.length === 10) {
    return `+7${digits}`
  }

  return `+${digits}`
}

function isSamePhone(phoneA, phoneB) {
  const tailA = getPhoneTail(phoneA)
  const tailB = getPhoneTail(phoneB)

  if (!tailA || !tailB) {
    return false
  }

  return tailA === tailB
}

function buildPhoneVariants(phone) {
  const digits = getPhoneDigits(phone)
  const tail = getPhoneTail(phone)
  const displayPhone = normalizePhoneForDisplay(phone)

  return Array.from(
    new Set(
      [
        phone,
        displayPhone,
        digits,
        digits ? `+${digits}` : '',
        tail,
        tail ? `+7${tail}` : '',
        tail ? `7${tail}` : '',
        tail ? `8${tail}` : '',
      ].filter(Boolean)
    )
  )
}

function getFullName(user) {
  if (!user) {
    return ''
  }

  return [user.NAME, user.LAST_NAME].filter(Boolean).join(' ').trim()
}

function getEntityTitle(entityType, entity) {
  if (!entity) {
    return ''
  }

  if (entityType === 'lead') {
    return entity.TITLE || getFullName(entity) || `Лид #${entity.ID}`
  }

  if (entityType === 'contact') {
    return getFullName(entity) || `Контакт #${entity.ID}`
  }

  if (entityType === 'company') {
    return entity.TITLE || `Компания #${entity.ID}`
  }

  if (entityType === 'deal') {
    return entity.TITLE || `Сделка #${entity.ID}`
  }

  return entity.TITLE || entity.NAME || ''
}

function getEntityCompany(entityType, entity) {
  if (!entity) {
    return ''
  }

  if (entityType === 'lead') {
    return entity.COMPANY_TITLE || ''
  }

  if (entityType === 'company') {
    return entity.TITLE || ''
  }

  return entity.COMPANY_TITLE || ''
}

function extractPhonesFromEntity(entity) {
  if (!entity) {
    return []
  }

  if (Array.isArray(entity.PHONE)) {
    return entity.PHONE
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        return item.VALUE || item.value || ''
      })
      .filter(Boolean)
  }

  if (typeof entity.PHONE === 'string') {
    return [entity.PHONE]
  }

  return []
}

function extractPhoneFromEntity(entity) {
  const phones = extractPhonesFromEntity(entity)
  return phones[0] || ''
}

function entityHasPhone(entity, targetPhone) {
  const phones = extractPhonesFromEntity(entity)

  return phones.some((phone) => {
    return isSamePhone(phone, targetPhone)
  })
}

function extractOptions(placementInfo, callStatus) {
  return {
    ...(placementInfo?.options || {}),
    ...(callStatus || {}),
  }
}

function extractEntityFromOptions(options) {
  const entityType = normalizeCrmType(options.CRM_ENTITY_TYPE)
  const entityId = normalizeFalse(options.CRM_ENTITY_ID)

  if (entityType && entityId) {
    return {
      entityType,
      entityId,
      source: 'CALL_CARD_OPTIONS',
    }
  }

  if (Array.isArray(options.CRM_BINDINGS) && options.CRM_BINDINGS.length > 0) {
    const binding = options.CRM_BINDINGS[0]

    const bindingType = normalizeCrmType(
      binding.ENTITY_TYPE ||
        binding.ENTITY_TYPE_NAME ||
        binding.OWNER_TYPE ||
        binding.OWNER_TYPE_NAME
    )

    const bindingId = normalizeFalse(
      binding.ENTITY_ID || binding.OWNER_ID || binding.ID
    )

    if (bindingType && bindingId) {
      return {
        entityType: bindingType,
        entityId: bindingId,
        source: 'CRM_BINDINGS',
      }
    }
  }

  return {
    entityType: '',
    entityId: '',
    source: '',
  }
}

function extractDuplicateIds(data) {
  if (!data || typeof data !== 'object') {
    return []
  }

  const result = []

  const map = {
    LEAD: 'lead',
    CONTACT: 'contact',
    COMPANY: 'company',
    DEAL: 'deal',
  }

  Object.entries(map).forEach(([bitrixType, entityType]) => {
    const ids = data[bitrixType] || data[bitrixType.toLowerCase()]

    if (Array.isArray(ids)) {
      ids.forEach((id) => {
        result.push({
          entityType,
          entityId: String(id),
          source: 'PHONE_DUPLICATE',
        })
      })
    }
  })

  return result
}

async function loadEntity(entityType, entityId) {
  if (!entityType || !entityId) {
    return null
  }

  const methods = {
    lead: 'crm.lead.get',
    deal: 'crm.deal.get',
    contact: 'crm.contact.get',
    company: 'crm.company.get',
  }

  const method = methods[entityType]

  if (!method) {
    return null
  }

  try {
    return await callBitrixMethod(method, {
      id: entityId,
    })
  } catch {
    return null
  }
}

async function findEntityByPhone(phone) {
  const phoneVariants = buildPhoneVariants(phone)

  if (phoneVariants.length === 0) {
    return {
      entityType: '',
      entityId: '',
      source: '',
      raw: null,
      checkedCandidates: [],
      rejectedCandidates: [],
      error: null,
    }
  }

  try {
    const duplicateData = await callBitrixMethod('crm.duplicate.findbycomm', {
      type: 'PHONE',
      values: phoneVariants,
    })

    const found = extractDuplicateIds(duplicateData)

    const sorted = [
      ...found.filter((item) => item.entityType === 'lead'),
      ...found.filter((item) => item.entityType === 'contact'),
      ...found.filter((item) => item.entityType === 'company'),
      ...found.filter((item) => item.entityType === 'deal'),
    ]

    const checkedCandidates = []
    const rejectedCandidates = []

    for (const candidate of sorted) {
      const entity = await loadEntity(candidate.entityType, candidate.entityId)
      const phones = extractPhonesFromEntity(entity)
      const title = getEntityTitle(candidate.entityType, entity)
      const matched = entityHasPhone(entity, phone)

      const checkedCandidate = {
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        title,
        phones,
        matched,
      }

      checkedCandidates.push(checkedCandidate)

      if (matched) {
        return {
          ...candidate,
          source: 'PHONE_DUPLICATE_VERIFIED',
          raw: duplicateData,
          entity,
          phones,
          checkedCandidates,
          rejectedCandidates,
          error: null,
        }
      }

      rejectedCandidates.push({
        ...checkedCandidate,
        reason: `В сущности нет номера текущего звонка ${normalizePhoneForDisplay(phone)}`,
      })
    }

    return {
      entityType: '',
      entityId: '',
      source: '',
      raw: duplicateData,
      checkedCandidates,
      rejectedCandidates,
      error: null,
    }
  } catch (error) {
    return {
      entityType: '',
      entityId: '',
      source: '',
      raw: null,
      checkedCandidates: [],
      rejectedCandidates: [],
      error: error.message,
    }
  }
}

async function loadCurrentUser() {
  try {
    const user = await callBitrixMethod('user.current')

    return {
      id: user.ID || user.id || '',
      name: getFullName(user) || user.LOGIN || 'Ответственный не определён',
      raw: user,
    }
  } catch {
    return {
      id: '',
      name: 'Ответственный не определён',
    }
  }
}

async function loadUserById(userId) {
  if (!userId) {
    return null
  }

  try {
    const users = await callBitrixMethod('user.get', {
      FILTER: {
        ID: userId,
      },
    })

    const user = Array.isArray(users) ? users[0] : null

    if (!user) {
      return null
    }

    return {
      id: user.ID || user.id || userId,
      name: getFullName(user) || user.LOGIN || `Пользователь #${userId}`,
      raw: user,
    }
  } catch {
    return null
  }
}

async function resolveResponsible(entity) {
  const assignedById = entity?.ASSIGNED_BY_ID || entity?.ASSIGNED_BY

  if (assignedById) {
    const assignedUser = await loadUserById(assignedById)

    if (assignedUser) {
      return assignedUser
    }
  }

  return loadCurrentUser()
}

function buildUnknownClient(phone) {
  return {
    name: 'Неизвестный клиент',
    company: '',
    phone: normalizePhoneForDisplay(phone),
  }
}

export async function getBitrixContext() {
  if (!hasBX24()) {
    return mockBitrixContext
  }

  try {
    await initBX24()

    const placementInfo = getPlacementInfo()

    let callStatus = null
    let callStatusError = null

    try {
      callStatus = await callPlacementCommand('getStatus')
    } catch (error) {
      callStatusError = error.message
    }

    const options = extractOptions(placementInfo, callStatus)

    const callId = options.CALL_ID || ''
    const rawCallPhone = options.PHONE_NUMBER || options.PHONE || ''
    const callPhone = normalizePhoneForDisplay(rawCallPhone)

    let crmBinding = extractEntityFromOptions(options)
    let entity = null
    let rejectedCurrentBinding = null
    let phoneSearchResult = null

    if (crmBinding.entityType && crmBinding.entityId) {
      entity = await loadEntity(crmBinding.entityType, crmBinding.entityId)

      if (callPhone && entity && !entityHasPhone(entity, callPhone)) {
        rejectedCurrentBinding = {
          ...crmBinding,
          title: getEntityTitle(crmBinding.entityType, entity),
          phones: extractPhonesFromEntity(entity),
          reason: `Привязанная CRM-сущность не содержит номер звонка ${callPhone}`,
        }

        crmBinding = {
          entityType: '',
          entityId: '',
          source: '',
        }

        entity = null
      }
    }

    if (!crmBinding.entityType || !crmBinding.entityId) {
      phoneSearchResult = await findEntityByPhone(callPhone)

      if (phoneSearchResult.entityType && phoneSearchResult.entityId) {
        crmBinding = {
          entityType: phoneSearchResult.entityType,
          entityId: phoneSearchResult.entityId,
          source: phoneSearchResult.source,
        }

        entity = phoneSearchResult.entity || null
      }
    }

    if (!entity) {
      entity = await loadEntity(crmBinding.entityType, crmBinding.entityId)
    }

    if (
      callPhone &&
      entity &&
      !entityHasPhone(entity, callPhone)
    ) {
      rejectedCurrentBinding = rejectedCurrentBinding || {
        ...crmBinding,
        title: getEntityTitle(crmBinding.entityType, entity),
        phones: extractPhonesFromEntity(entity),
        reason: `Итоговая CRM-сущность не содержит номер звонка ${callPhone}`,
      }

      crmBinding = {
        entityType: '',
        entityId: '',
        source: '',
      }

      entity = null
    }

    const responsible = await resolveResponsible(entity)

    const entityPhone = extractPhoneFromEntity(entity)
    const finalPhone = normalizePhoneForDisplay(entityPhone || callPhone)

    let client = buildUnknownClient(finalPhone || callPhone)

    if (entity && crmBinding.entityType && crmBinding.entityId) {
      client = {
        name:
          getEntityTitle(crmBinding.entityType, entity) ||
          `${crmBinding.entityType} #${crmBinding.entityId}`,
        company: getEntityCompany(crmBinding.entityType, entity),
        phone: finalPhone || callPhone,
      }
    }

    return {
      callId,
      entityType: crmBinding.entityType || '',
      entityId: crmBinding.entityId || '',
      runtimeMode: 'bx24',
      placement: placementInfo?.placement || 'CALL_CARD',
      client,
      responsible,
      raw: {
        placementInfo,
        callStatus,
        callStatusError,
        options,
        crmBinding,
        rejectedCurrentBinding,
        phoneSearchResult,
        entity,
        phoneVariants: buildPhoneVariants(callPhone),
        rawCallPhone,
        normalizedCallPhone: callPhone,
        compareCallPhone: getPhoneTail(callPhone),
      },
    }
  } catch (error) {
    return {
      callId: '',
      entityType: '',
      entityId: '',
      runtimeMode: 'bx24-error',
      placement: 'CALL_CARD',
      client: {
        name: 'Неизвестный клиент',
        company: '',
        phone: '',
      },
      responsible: {
        id: '',
        name: 'Ответственный не определён',
      },
      error: error.message,
      raw: {
        error: error.message,
      },
    }
  }
}

export async function saveCallResult(callResult) {
  if (!hasBX24()) {
    return {
      success: true,
      activityId: 'mock-activity-001',
      message: 'Результат звонка подготовлен для записи в Bitrix24',
    }
  }

  try {
    await initBX24()

    if (!callResult?.entityType || !callResult?.entityId) {
      return {
        success: false,
        activityId: null,
        message: 'Нет CRM-сущности для записи результата звонка',
      }
    }

    const commentText =
      callResult.summaryText ||
      callResult.summary ||
      callResult.text ||
      'Итоги звонка подготовлены AI Sales Assistant'

    const result = await callBitrixMethod('crm.timeline.comment.add', {
      fields: {
        ENTITY_TYPE: String(callResult.entityType).toUpperCase(),
        ENTITY_ID: callResult.entityId,
        COMMENT: commentText,
      },
    })

    return {
      success: true,
      activityId: result,
      message: 'Результат звонка записан в таймлайн Bitrix24',
    }
  } catch (error) {
    return {
      success: false,
      activityId: null,
      message: `Не удалось записать результат в Bitrix24: ${error.message}`,
    }
  }
}