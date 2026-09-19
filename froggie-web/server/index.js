import express from 'express'
import {
  photonConfiguration,
  requestPhotonVerification,
  verifyPhotonCode,
} from './photon.js'

const server = express()
const port = Number(process.env.FROGGIE_API_PORT ?? 8787)

server.disable('x-powered-by')
server.use(express.json({ limit: '32kb' }))

server.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

server.get('/api/imessage/status', (_request, response) => {
  response.json({ provider: 'photon', ...photonConfiguration() })
})

server.post('/api/imessage/register', async (request, response) => {
  try {
    const result = await requestPhotonVerification(request.body ?? {})
    response.status(201).json(result)
  } catch (error) {
    response.status(error.status ?? 502).json({
      error: error.code ?? 'PHOTON_REQUEST_FAILED',
      message: error.message ?? 'Photon could not send the verification message.',
    })
  }
})

server.post('/api/imessage/verify', (request, response) => {
  try {
    response.json(verifyPhotonCode(request.body ?? {}))
  } catch (error) {
    response.status(error.status ?? 500).json({
      error: error.code ?? 'VERIFICATION_FAILED',
      message: error.message ?? 'The verification code could not be checked.',
    })
  }
})

server.use('/api', (_request, response) => {
  response.status(404).json({ error: 'NOT_FOUND', message: 'That Froggie API route does not exist.' })
})

server.listen(port, '127.0.0.1', () => {
  const photon = photonConfiguration()
  console.log(`[froggie-api] listening on http://127.0.0.1:${port}`)
  console.log(`[froggie-api] Photon ${photon.configured ? 'configured' : `waiting for ${photon.missing.join(', ')}`}`)
})
