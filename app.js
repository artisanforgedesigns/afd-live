import 'dotenv/config'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import Router from 'koa-router'
import eWeLink from 'ewelink-api-next'
import * as fs from 'fs'
import * as crypto from 'crypto'
import open from 'open'

// Load configuration from environment
const PORT = process.env.PORT || 4001
const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
const REGION = process.env.REGION || 'us'
const REDIRECT_URL = `http://127.0.0.1:${PORT}/redirectUrl`

if (!APP_ID || !APP_SECRET) {
  throw new Error('Please configure APP_ID and APP_SECRET in .env file')
}

// Initialize eWeLink client
const client = new eWeLink.WebAPI({
  appId: APP_ID,
  appSecret: APP_SECRET,
  region: REGION,
  requestRecord: true,
})

// Generate random string helper
const randomString = (length) => {
  return [...Array(length)].map(_=>(Math.random()*36|0).toString(36)).join('')
}

const app = new Koa()

app.use(bodyParser())

const router = new Router()

// Serve static HTML file
router.get('/', async (ctx) => {
  ctx.type = 'html'
  ctx.body = fs.readFileSync('./index.html')
})

router.get('/login', async (ctx) => {
  // Get login URL
  const loginUrl = client.oauth.createLoginUrl({
    redirectUrl: REDIRECT_URL,
    grantType: 'authorization_code',
    state: randomString(10),
  })
  // Automatically redirect to Log in URL
  ctx.redirect(loginUrl)
})

router.get('/redirectUrl', async (ctx) => {
  const { code, region } = ctx.request.query
  console.log(code, region)
  const res = await client.oauth.getToken({
    region,
    redirectUrl: REDIRECT_URL,
    code,
  })
  res['region'] = region
  // Save token
  fs.writeFileSync('./token.json', JSON.stringify(res))
  console.log(res)
  // Redirect to home page after successful authentication
  ctx.redirect('/')
})

// Control device endpoint
router.post('/control', async (ctx) => {
  try {
    const { deviceId, switch: switchState } = ctx.request.body

    if (!deviceId || !switchState) {
      ctx.body = { error: 1, msg: 'Missing deviceId or switch state' }
      return
    }

    // Check if token exists
    if (!fs.existsSync('./token.json')) {
      ctx.body = { error: 1, msg: 'Not authenticated' }
      return
    }

    // Get token
    const LoggedInfo = JSON.parse(fs.readFileSync('./token.json', 'utf-8'))
    client.at = LoggedInfo.data?.accessToken
    client.region = LoggedInfo?.region || 'us'
    client.setUrl(LoggedInfo?.region || 'us')

    // Control the device
    const result = await client.device.setThingStatus({
      type: 1,
      id: deviceId,
      params: {
        switch: switchState
      }
    })

    ctx.body = result
  } catch (e) {
    console.error(e)
    ctx.body = { error: 1, msg: e.message }
  }
})

// Set timer endpoint
router.post('/set-timer', async (ctx) => {
  try {
    const { deviceId, minutes, outlet } = ctx.request.body

    if (!deviceId || !minutes) {
      ctx.body = { error: 1, msg: 'Missing deviceId or minutes' }
      return
    }

    // Check if token exists
    if (!fs.existsSync('./token.json')) {
      ctx.body = { error: 1, msg: 'Not authenticated' }
      return
    }

    // Get token
    const LoggedInfo = JSON.parse(fs.readFileSync('./token.json', 'utf-8'))
    const accessToken = LoggedInfo.data?.accessToken
    const region = LoggedInfo?.region || 'us'

    client.at = accessToken
    client.region = region
    client.setUrl(region)

    // Generate timer ID
    const timerId = crypto.randomUUID()

    // Calculate UTC execution time
    const atTime = new Date(Date.now() + minutes * 60000).toISOString()

    // Prepare timer action based on device type
    let timerAction
    if (outlet !== undefined && outlet !== null) {
      // Multi-channel device
      timerAction = {
        switches: [{
          switch: 'off',
          outlet: outlet
        }]
      }
    } else {
      // Single-channel device
      timerAction = { switch: 'off' }
    }

    // Prepare timer object
    const timer = {
      mId: timerId,
      type: 'once',
      coolkit_timer_type: 'delay',
      at: atTime,
      enabled: 1,
      do: timerAction,
      period: minutes.toString()
    }

    // Make direct API call to /v2/device/thing/status
    const apiUrl = `https://${region}-apia.coolkit.cc/v2/device/thing/status`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 1,
        id: deviceId,
        params: {
          timers: [timer]
        }
      })
    })

    const result = await response.json()
    ctx.body = result
  } catch (e) {
    console.error(e)
    ctx.body = { error: 1, msg: e.message }
  }
})

// Get devices endpoint
router.get('/devices', async (ctx) => {
  try {
    // Check if token exists
    if (!fs.existsSync('./token.json')) {
      ctx.body = { error: 1, msg: 'Not authenticated' }
      return
    }

    // Get token
    let LoggedInfo = JSON.parse(fs.readFileSync('./token.json', 'utf-8'))
    client.at = LoggedInfo.data?.accessToken
    client.region = LoggedInfo?.region || 'us'
    client.setUrl(LoggedInfo?.region || 'us')

    // Check if the token has expired, and refresh the token if it has expired
    if (
      LoggedInfo.data?.atExpiredTime < Date.now() &&
      LoggedInfo.data?.rtExpiredTime > Date.now()
    ) {
      console.log('Token expired, refreshing token')
      const refreshStatus = await client.user.refreshToken({
        rt: LoggedInfo.data?.refreshToken,
      })
      if (refreshStatus.error === 0) {
        fs.writeFileSync(
          './token.json',
          JSON.stringify({
            status: 200,
            responseTime: 0,
            error: 0,
            msg: '',
            data: {
              accessToken: refreshStatus?.data?.at,
              atExpiredTime: Date.now() + 2592000000,
              refreshToken: refreshStatus?.data?.rt,
              rtExpiredTime: Date.now() + 5184000000,
            },
            region: client.region,
          })
        )
        LoggedInfo = JSON.parse(fs.readFileSync('./token.json', 'utf-8'))
      }
    }

    if (LoggedInfo.data?.rtExpiredTime < Date.now()) {
      ctx.body = { error: 1, msg: 'Token expired, please login again' }
      return
    }

    // Get device list
    const thingList = await client.device.getAllThingsAllPages({})

    if (thingList?.error === 0) {
      ctx.body = { error: 0, devices: thingList.data.thingList }
    } else {
      ctx.body = { error: 1, msg: 'Failed to fetch devices' }
    }
  } catch (e) {
    console.error(e)
    ctx.body = { error: 1, msg: e.message }
  }
})

app.use(router.routes())

app.listen(PORT)

console.info(`Server is running at http://127.0.0.1:${PORT}/`)
console.info(`Login URL: http://127.0.0.1:${PORT}/login`)
console.info('Opening browser in 3 seconds...')

setTimeout(async () => {
  await open(`http://127.0.0.1:${PORT}/`)
}, 3000)