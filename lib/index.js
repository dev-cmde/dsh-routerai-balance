/**
 * RouterAI balance, host half.
 *
 * Serves GET /routerai-balance on the local web server: resolves the RouterAI
 * API key through the credential store and asks RouterAI for the current
 * credit balance. The browser half polls this route on its own timer.
 *
 * The refresh interval is a setting, not a constant. This half reads it from
 * the profile entry, clamps it to sane bounds, and reports the effective value
 * back to the browser half with every answer, so the panel and the Host always
 * agree on one number. POST /routerai-balance/interval writes a new value
 * through the configuration editor, which persists it to the profile patch and
 * applies it without a restart.
 */

export const name = 'routerai-balance'

export const inject = ['webServer', 'credentials']

const ROUTE = '/routerai-balance'
const ROUTE_INTERVAL = '/routerai-balance/interval'

/** Bounds and fallback for the polling interval, in seconds. */
const MIN_SECONDS = 5
const MAX_SECONDS = 300
const DEFAULT_SECONDS = 10

/** Clamp the configured interval so a typo can never make the panel hammer the API. */
function intervalSeconds(config) {
  const raw = config && typeof config.intervalSeconds !== 'undefined' ? config.intervalSeconds : DEFAULT_SECONDS
  const value = typeof raw === 'number' && isFinite(raw) ? raw : Number(raw)
  if (!isFinite(value)) return DEFAULT_SECONDS
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(value)))
}

function send(res, body, status) {
  res.writeHead(status || 200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** Read the whole request body; the setting arrives as a tiny JSON object. */
function readBody(req) {
  return new Promise((resolve) => {
    let text = ''
    req.on('data', (chunk) => {
      text += chunk
      if (text.length > 4096) req.destroy()
    })
    req.on('end', () => resolve(text))
    req.on('error', () => resolve(''))
  })
}

export function apply(ctx, config) {
  const baseURL = (config && config.baseURL) || 'https://routerai.ru/api/v1'
  const apiKeyEnv = (config && config.apiKeyEnv) || 'ROUTERAI_API_KEY'
  const seconds = intervalSeconds(config)

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            const hit = await ctx.credentials.resolve(apiKeyEnv)
            if (!hit || !hit.value) return send(res, { ok: false, error: 'no-key', intervalMs: seconds * 1000 })

            const response = await fetch(baseURL + '/credits', {
              headers: { authorization: 'Bearer ' + hit.value },
              signal: AbortSignal.timeout(8000),
            })
            if (!response.ok) return send(res, { ok: false, error: 'http-' + response.status, intervalMs: seconds * 1000 })

            const payload = await response.json()
            const credits = payload && payload.data ? payload.data.credits : undefined
            send(res, {
              ok: true,
              credits: typeof credits === 'number' ? credits : null,
              intervalMs: seconds * 1000,
            })
          } catch (error) {
            send(res, {
              ok: false,
              error: String((error && error.message) || error),
              intervalMs: seconds * 1000,
            })
          }
        },
      }),
    'routerai-balance: route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_INTERVAL,
        handler: async (req, res) => {
          // A deployment without the configuration editor still answers reads.
          const editor = ctx.get('configEditor')
          if (req.method !== 'POST') {
            return send(res, { ok: true, intervalSeconds: seconds, writable: editor !== undefined, min: MIN_SECONDS, max: MAX_SECONDS })
          }

          if (editor === undefined) {
            return send(res, { ok: false, error: 'read-only', writable: false }, 200)
          }

          const raw = await readBody(req)
          let parsed
          try {
            parsed = JSON.parse(raw)
          } catch (error) {
            return send(res, { ok: false, error: 'bad-json' }, 400)
          }

          const next = parsed && typeof parsed.intervalSeconds !== 'undefined' ? Number(parsed.intervalSeconds) : NaN
          if (!isFinite(next)) return send(res, { ok: false, error: 'bad-number' }, 400)

          const bounded = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(next)))
          const entry = ctx.fiber && ctx.fiber.entry
          if (entry === undefined) return send(res, { ok: false, error: 'no-entry' }, 200)

          try {
            await editor.edit(entry, (current) => Object.assign({}, current, { intervalSeconds: bounded }))
          } catch (error) {
            return send(res, { ok: false, error: String((error && error.message) || error) }, 200)
          }

          // The loader re-runs this plugin with the new config; report the accepted value.
          send(res, { ok: true, intervalSeconds: bounded, intervalMs: bounded * 1000, writable: true })
        },
      }),
    'routerai-balance: interval route',
  )
}
