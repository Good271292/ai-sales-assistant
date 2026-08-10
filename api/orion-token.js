import { createHmac } from 'node:crypto'

const TOKEN_TTL_SECONDS = 120
const BITRIX_REQUEST_TIMEOUT_MS = 7000

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).json(body)
}

function parseRequestBody(req) {
  if (
    req.body &&
    typeof req.body === 'object'
  ) {
    return req.body
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }

  return null
}

function normalizeDomain(value) {
  const domain = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')

  if (
    !domain ||
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      domain
    )
  ) {
    return ''
  }

  return domain
}

function normalizePhoneTail(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')

  if (digits.length < 10) {
    return ''
  }

  return digits.slice(-10)
}

function isValidCallId(value) {
  const callId = String(value || '').trim()

  return (
    callId.length <= 220 &&
    /^[^.]{1,100}\.\d{10,}\.[^.]{1,100}$/.test(
      callId
    )
  )
}

async function verifyBitrixAccessToken({
  domain,
  accessToken,
}) {
  const controller = new AbortController()

  const timeout = setTimeout(() => {
    controller.abort()
  }, BITRIX_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://${domain}/rest/user.current.json`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth: accessToken,
        }),
        signal: controller.signal,
      }
    )

    const data = await response.json()

    if (
      !response.ok ||
      data?.error ||
      !data?.result?.ID
    ) {
      return {
        ok: false,
        error:
          data?.error ||
          'bitrix_auth_failed',
      }
    }

    return {
      ok: true,
      userId: String(data.result.ID),
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error?.name === 'AbortError'
          ? 'bitrix_timeout'
          : 'bitrix_request_failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function createOrionToken({
  secret,
  callId,
  phone,
  bitrixUserId,
  memberId,
  domain,
}) {
  const nowSeconds =
    Math.floor(Date.now() / 1000)

  const payload = {
    v: 1,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
    callId,
    phone,
    bitrixUserId,
    memberId,
    domain,
  }

  const encodedPayload = Buffer.from(
    JSON.stringify(payload)
  ).toString('base64url')

  const encodedSignature = createHmac(
    'sha256',
    secret
  )
    .update(encodedPayload)
    .digest('base64url')

  return {
    authToken:
      `${encodedPayload}.${encodedSignature}`,
    expiresAt:
      new Date(
        payload.exp * 1000
      ).toISOString(),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')

    sendJson(res, 405, {
      error: 'method_not_allowed',
    })

    return
  }

  const secret =
    process.env.CARD_WS_AUTH_SECRET

  const allowedDomain = normalizeDomain(
    process.env.BITRIX_ALLOWED_DOMAIN
  )

  const allowedMemberId = String(
    process.env.BITRIX_MEMBER_ID || ''
  ).trim()

  if (
    !secret ||
    secret.length < 32 ||
    !allowedDomain ||
    !allowedMemberId
  ) {
    sendJson(res, 500, {
      error: 'server_not_configured',
    })

    return
  }

  const body = parseRequestBody(req)

  if (!body) {
    sendJson(res, 400, {
      error: 'invalid_json',
    })

    return
  }

  const callId =
    String(body.callId || '').trim()

  const phoneTail =
    normalizePhoneTail(body.phone)

  const accessToken =
    String(
      body.auth?.access_token || ''
    ).trim()

  const requestDomain =
    normalizeDomain(body.auth?.domain)

  const requestMemberId =
    String(
      body.auth?.member_id || ''
    ).trim()

  if (
    !isValidCallId(callId) ||
    !phoneTail ||
    accessToken.length < 20 ||
    accessToken.length > 512
  ) {
    sendJson(res, 400, {
      error: 'invalid_request',
    })

    return
  }

  if (
    requestDomain !== allowedDomain ||
    requestMemberId !== allowedMemberId
  ) {
    sendJson(res, 403, {
      error: 'portal_not_allowed',
    })

    return
  }

  const verification =
    await verifyBitrixAccessToken({
      domain: allowedDomain,
      accessToken,
    })

  if (!verification.ok) {
    sendJson(res, 401, {
      error: 'bitrix_unauthorized',
      reason: verification.error,
    })

    return
  }

  const token = createOrionToken({
    secret,
    callId,
    phone: phoneTail,
    bitrixUserId:
      verification.userId,
    memberId: allowedMemberId,
    domain: allowedDomain,
  })

  sendJson(res, 200, token)
}
