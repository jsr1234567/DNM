import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { Spectrum } from 'spectrum-ts'
import { imessage } from '@spectrum-ts/imessage'

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 30 * 1000
const pendingVerifications = new Map()
const lastRequestByPhone = new Map()

let spectrumPromise = null

function projectCredentials() {
  return {
    projectId: process.env.SPECTRUM_PROJECT_ID?.trim() || process.env.PROJECT_ID?.trim(),
    projectSecret: process.env.SPECTRUM_PROJECT_SECRET?.trim() || process.env.PROJECT_SECRET?.trim(),
  }
}

export function photonConfiguration() {
  const credentials = projectCredentials()
  const missing = []
  if (!credentials.projectId) missing.push('SPECTRUM_PROJECT_ID (or PROJECT_ID)')
  if (!credentials.projectSecret) missing.push('SPECTRUM_PROJECT_SECRET (or PROJECT_SECRET)')
  return {
    configured: missing.length === 0,
    missing,
    projectUserSync: process.env.FROGGIE_SYNC_PHOTON_USERS === '1',
  }
}

async function getSpectrum() {
  const status = photonConfiguration()
  if (!status.configured) {
    const error = new Error(`Photon is missing ${status.missing.join(' and ')}`)
    error.code = 'PHOTON_NOT_CONFIGURED'
    error.status = 503
    throw error
  }

  if (!spectrumPromise) {
    const credentials = projectCredentials()
    spectrumPromise = Spectrum({
      projectId: credentials.projectId,
      projectSecret: credentials.projectSecret,
      providers: [imessage.config()],
      options: { logLevel: 'warn' },
    }).catch((error) => {
      spectrumPromise = null
      throw error
    })
  }
  return spectrumPromise
}

function normalizeE164(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

function hashCode(requestId, code) {
  return createHash('sha256').update(`${requestId}:${code}`).digest()
}

function friendlyRole(role) {
  return role === 'helper' ? 'lend a hand' : 'ask your community for help'
}

export async function requestPhotonVerification({
  name, email, phone, role, consent, community, mode, availability, identity, skills,
}) {
  const normalizedPhone = normalizeE164(phone)
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  if (!normalizedPhone) {
    const error = new Error('Enter a valid phone number with country code.')
    error.code = 'INVALID_PHONE'
    error.status = 400
    throw error
  }
  if (!['requester', 'helper'].includes(role)) {
    const error = new Error('Choose whether you are requesting help or helping.')
    error.code = 'INVALID_ROLE'
    error.status = 400
    throw error
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error('Enter a valid email address.')
    error.code = 'INVALID_EMAIL'
    error.status = 400
    throw error
  }
  if (role === 'requester' && consent !== true) {
    const error = new Error('Confirm that every request requires your approval.')
    error.code = 'CONSENT_REQUIRED'
    error.status = 400
    throw error
  }

  const lastRequestAt = lastRequestByPhone.get(normalizedPhone) ?? 0
  if (Date.now() - lastRequestAt < RESEND_COOLDOWN_MS) {
    const error = new Error('Wait a few seconds before asking for another code.')
    error.code = 'TOO_MANY_REQUESTS'
    error.status = 429
    throw error
  }

  const app = await getSpectrum()
  if (process.env.FROGGIE_SYNC_PHOTON_USERS === '1') {
    await ensurePhotonProjectUser({ name, email: normalizedEmail, phone: normalizedPhone })
  }
  const photon = imessage(app)
  const user = await photon.user(normalizedPhone)
  const conversation = await photon.space.create(user)
  const requestId = randomUUID()
  const code = String(randomInt(100000, 1000000))
  const displayName = String(name ?? '').trim() || 'neighbor'

  await conversation.send(
    `Hi ${displayName}, it is Froggie. Your private setup code is ${code}. Use it to connect iMessage so you can ${friendlyRole(role)}. This code expires in 10 minutes.`,
  )

  pendingVerifications.set(requestId, {
    codeHash: hashCode(requestId, code),
    expiresAt: Date.now() + CODE_TTL_MS,
    phoneLast4: normalizedPhone.slice(-4),
    attempts: 0,
    onboarding: {
      name: displayName, email: normalizedEmail, phone: normalizedPhone, role,
      consent: consent === true,
      community: String(community ?? '').trim(), mode: String(mode ?? '').trim(),
      availability: String(availability ?? '').trim(), identity: String(identity ?? '').trim(),
      skills: Array.isArray(skills) ? skills.map(String) : [],
    },
  })
  lastRequestByPhone.set(normalizedPhone, Date.now())

  return {
    requestId,
    phoneLast4: normalizedPhone.slice(-4),
    expiresInSeconds: CODE_TTL_MS / 1000,
    provider: 'photon',
  }
}

export function verifyPhotonCode({ requestId, code }) {
  const verification = pendingVerifications.get(requestId)
  if (!verification || verification.expiresAt < Date.now()) {
    if (verification) pendingVerifications.delete(requestId)
    const error = new Error('That code expired. Send a fresh one.')
    error.code = 'CODE_EXPIRED'
    error.status = 410
    throw error
  }

  const candidate = hashCode(requestId, String(code ?? '').trim())
  if (!timingSafeEqual(candidate, verification.codeHash)) {
    verification.attempts += 1
    if (verification.attempts >= 5) pendingVerifications.delete(requestId)
    const error = new Error('That code does not match the one sent through iMessage.')
    error.code = 'INVALID_CODE'
    error.status = verification.attempts >= 5 ? 429 : 400
    throw error
  }

  pendingVerifications.delete(requestId)
  return {
    verified: true,
    phoneLast4: verification.phoneLast4,
    role: verification.onboarding.role,
    provider: 'photon',
    verifiedAt: new Date().toISOString(),
    onboarding: verification.onboarding,
  }
}

async function ensurePhotonProjectUser({ name, email, phone }) {
  const { projectId } = projectCredentials()
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  const firstName = parts.shift() || 'Froggie'
  const lastName = parts.join(' ') || 'Member'
  const child = Bun.spawn([
    'photon', 'spectrum', 'users', 'add', '--project', projectId,
    '--first-name', firstName, '--last-name', lastName, '--email', email,
    '--phone', phone, '--json',
  ], { stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ])
  if (exitCode === 0) return
  const message = `${stdout}\n${stderr}`
  if (/already|exists|duplicate/i.test(message)) return
  const error = new Error('Photon could not register this number for verification. Check CLI authentication and project access.')
  error.code = 'PHOTON_USER_REGISTRATION_FAILED'
  error.status = 502
  throw error
}
