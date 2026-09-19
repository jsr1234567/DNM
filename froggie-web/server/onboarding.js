import { createHash } from 'node:crypto'
import { createMemory } from '../../src/memory/index.ts'

function userIdForPhone(phone) {
  return `web:${createHash('sha256').update(phone).digest('hex').slice(0, 20)}`
}

function cleanList(values, limit = 12) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter(Boolean))].slice(0, limit)
}

export function completeOnboarding(db, input, options = {}) {
  const now = new Date().toISOString()
  const name = String(input.name ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 120)
  const phone = String(input.phone ?? '').trim()
  const email = String(input.email ?? '').trim().toLowerCase()
  const role = input.role
  if (!name || !/^\+[1-9]\d{7,14}$/.test(phone) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['requester', 'helper'].includes(role)) {
    throw new Error('Verified onboarding details are invalid')
  }
  if (role === 'requester' && input.consent !== true) {
    throw new Error('Requester approval consent is required')
  }

  const bound = db.query(`SELECT user_id FROM demo_profile_bindings WHERE sender_id = ?`)
    .get(phone)
  const contactUser = db.query(`SELECT id, status FROM users WHERE spectrum_sender_id = ? OR phone = ?`)
    .get(phone, phone)
  const boundUser = bound ? db.query(`SELECT id, status FROM users WHERE id = ?`).get(bound.user_id) : null
  if (bound && !boundUser) throw new Error('Verified sender binding has no local user')
  if (bound && contactUser && bound.user_id !== contactUser.id) {
    throw new Error('Verified sender is already assigned to a different local user')
  }
  const existing = boundUser ?? contactUser
  const userId = existing?.id ?? userIdForPhone(phone)
  const trustedCircleId = options.trustedCircleId?.trim() || undefined
  const circle = trustedCircleId ? db.query(`SELECT id FROM circles WHERE id = ? AND status = 'active'`)
    .get(trustedCircleId) : null
  const status = existing?.status === 'active' || circle ? 'active' : 'paused'

  db.transaction(() => {
    db.query(`INSERT INTO users(
      id, display_name, spectrum_sender_id, phone, status,
      bounty_discovery_enabled, helper_matching_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
      spectrum_sender_id = excluded.spectrum_sender_id, phone = excluded.phone,
      status = CASE WHEN users.status = 'active' THEN 'active' ELSE excluded.status END,
      helper_matching_enabled = max(users.helper_matching_enabled, excluded.helper_matching_enabled),
      updated_at = excluded.updated_at`
    ).run(userId, name, phone, phone, status, role === 'helper' ? 1 : 0, now, now)

    if (circle) {
      db.query(`INSERT INTO circle_members(circle_id, user_id, status, joined_at)
        VALUES (?, ?, 'active', ?)
        ON CONFLICT(circle_id, user_id) DO UPDATE SET status = 'active'`
      ).run(circle.id, userId, now)
    }

    const profile = role === 'helper' ? {
      role, email, consent: { helperMatching: true, recordedAt: now },
      community: String(input.community ?? '').trim().slice(0, 120),
      mode: String(input.mode ?? '').trim().slice(0, 40),
      availability: String(input.availability ?? '').trim().slice(0, 80),
      identity: String(input.identity ?? '').trim().slice(0, 40),
      skills: cleanList(input.skills),
    } : {
      role, email,
      consent: { findHelp: true, approvalRequired: true, recordedAt: now },
      gmail: { status: 'connection-requested', scope: 'gmail.readonly' },
    }
    db.query(`INSERT INTO user_settings(user_id, key, value_json, updated_at)
      VALUES (?, 'web_onboarding', ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json,
        updated_at = excluded.updated_at`
    ).run(userId, JSON.stringify(profile), now)
  })()

  if (role === 'helper') {
    const facts = [
      input.community ? `Wants to help in ${String(input.community).trim()}.` : '',
      input.mode ? `Prefers ${String(input.mode).trim().toLowerCase()} projects.` : '',
      input.availability ? `Availability: ${String(input.availability).trim()}.` : '',
      cleanList(input.skills).length ? `Can help with: ${cleanList(input.skills).join(', ')}.` : '',
    ].filter(Boolean)
    for (const claim of facts) {
      createMemory(db, userId, { kind: 'preference', claim, origin: 'user-stated' })
    }
  }

  const gmail = role === 'requester' ? db.query(`SELECT 1 FROM mailboxes
    WHERE user_id = ? AND lower(email) = lower(?) AND source = 'gmail' AND status = 'active' LIMIT 1`
  ).get(userId, email) : null
  if (gmail && input.consent === true) {
    db.query(`UPDATE users SET bounty_discovery_enabled = 1, updated_at = ? WHERE id = ?`)
      .run(now, userId)
  }

  return {
    userId,
    approvalStatus: status === 'active' ? 'active' : 'pending-circle-approval',
    gmailStatus: role === 'requester' ? (gmail ? 'connected' : 'connection-requested') : undefined,
    bountyDiscoveryEnabled: Boolean(gmail && input.consent === true),
    helperMatchingEnabled: role === 'helper',
  }
}
