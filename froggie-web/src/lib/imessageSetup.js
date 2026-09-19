const SETUP_STORAGE_PREFIX = 'froggie.imessage-setup'

export function normalizePhone(value) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

export function formatPhone(value) {
  const digits = normalizePhone(value).slice(0, 10)
  if (digits.length < 4) return digits
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function validateIMessageIdentity({ name, email, phone }) {
  const errors = {}
  if (!name.trim()) errors.name = 'Add the name Froggie should use.'
  if (normalizePhone(phone).length !== 10) errors.phone = 'Enter a 10-digit iMessage phone number.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
  return errors
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || 'Photon could not complete that request.')
    error.code = body.error
    error.status = response.status
    throw error
  }
  return body
}

export async function getPhotonStatus() {
  const response = await fetch('/api/imessage/status')
  return readJson(response)
}

export async function requestPhotonVerification(details) {
  const response = await fetch('/api/imessage/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...details, name: details.name.trim(), email: details.email.trim().toLowerCase(), phone: normalizePhone(details.phone) }),
  })
  return readJson(response)
}

export async function verifyPhotonCode(session, code) {
  const response = await fetch('/api/imessage/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: session.requestId, code: code.trim() }),
  })
  return readJson(response)
}

function storageKey(role) {
  return `${SETUP_STORAGE_PREFIX}.${role}.v2`
}

export function saveIMessageSetup({ session, verification, role, gmailConnected }) {
  const setup = {
    version: 2,
    role,
    userId: verification.userId,
    approvalStatus: verification.approvalStatus,
    provider: 'photon',
    imessage: {
      connected: true,
      phoneLast4: verification.phoneLast4 || session.phoneLast4,
      verifiedAt: verification.verifiedAt || new Date().toISOString(),
    },
    ...(role === 'requester' ? {
      gmail: { connected: false, connectionRequested: gmailConnected, scope: 'gmail.readonly' },
    } : {}),
  }
  localStorage.setItem(storageKey(role), JSON.stringify(setup))
  return setup
}

export function loadIMessageSetup(role) {
  try {
    localStorage.removeItem(`${SETUP_STORAGE_PREFIX}.${role}.v1`)
    const raw = localStorage.getItem(storageKey(role))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearIMessageSetup(role) {
  localStorage.removeItem(storageKey(role))
  localStorage.removeItem(`${SETUP_STORAGE_PREFIX}.${role}.v1`)
}
