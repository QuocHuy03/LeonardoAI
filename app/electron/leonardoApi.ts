// Leonardo AI API — called from Electron main process

const GRAPHQL_URL = 'https://api.leonardo.ai/v1/graphql'
const AUTH_URL = 'https://app.leonardo.ai/api/auth'
const SENTRY_REL = '6a0bd1b5b7ef23a4f22608a2ed90c5e753cbc669'

function makeId() { return Math.random().toString(36).slice(2) }

function sentryHeaders(token: string) {
  const tid = makeId() + makeId()
  return {
    authorization: `Bearer ${token}`,
    'sentry-trace': `${tid}-${makeId().slice(0, 16)}-0`,
    baggage: `sentry-environment=vercel-production,sentry-release=${SENTRY_REL},sentry-public_key=a851bd902378477eae99cf74c62e142a,sentry-trace_id=${tid},sentry-org_id=4504767521292288,sentry-sampled=false`
  }
}

const BASE_HEADERS = {
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  origin: 'https://app.leonardo.ai',
  referer: 'https://app.leonardo.ai/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
  'x-leo-schema-version': 'latest',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
}

// ── Helper: fetch via node (works in main process) ───────────────────────────
async function fetchJson(url: string, method: string, headers: Record<string, string>, body?: string) {
  const resp = await fetch(url, { method, headers: { ...BASE_HEADERS, ...headers } as any, body })
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`)
  }
  if (resp.status === 204) return {}
  return resp.json()
}

async function gql(token: string, payload: object) {
  const rj = await fetchJson(GRAPHQL_URL, 'POST', {
    ...sentryHeaders(token)
  }, JSON.stringify(payload))
  return rj
}

// ── Session from cookie string ───────────────────────────────────────────────
export async function getTokenFromCookie(cookieStr: string): Promise<string | null> {
  // Extract CSRF token
  let csrf: string | undefined
  if (cookieStr.includes('__Host-next-auth.csrf-token=')) {
    try {
      const raw = cookieStr.split('__Host-next-auth.csrf-token=')[1].split(';')[0]
      csrf = decodeURIComponent(raw).split('|')[0]
    } catch { }
  }

  const cookieHeader = cookieStr.split(';')
    .map(s => s.trim())
    .filter(s => s.includes('='))
    .join('; ')

  const headers = {
    ...BASE_HEADERS,
    cookie: cookieHeader,
  }

  // Try with CSRF first, then GET
  if (csrf) {
    try {
      const r = await fetchJson(`${AUTH_URL}/session`, 'POST', headers as any, JSON.stringify({ csrfToken: csrf }))
      const token = r?.idToken || r?.accessToken
      if (token) return token
    } catch { }
  }
  try {
    const r = await fetchJson(`${AUTH_URL}/session`, 'GET', headers as any)
    return r?.idToken || r?.accessToken || null
  } catch { }
  return null
}

// ── Token Balance ────────────────────────────────────────────────────────────
export async function getUserInfo(token: string): Promise<{ tokens: number; email: string; userId: string }> {
  // Decode sub from JWT
  let cognitoSub = ''
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    cognitoSub = payload.sub || ''
  } catch { }

  const q = {
    operationName: 'GetUserDetails',
    variables: { userSub: cognitoSub },
    query: `query GetUserDetails($userSub: String) {
  users(where: {user_details: {cognitoId: {_eq: $userSub}}}) {
    id
    user_details {
      subscriptionTokens paidTokens rolloverTokens auth0Email __typename
    }
    __typename
  }
}`
  }

  try {
    const rj = await gql(token, q)
    const users = rj?.data?.users || []
    if (users.length) {
      const u = users[0]
      const d = u.user_details?.[0] || {}
      return {
        userId: u.id,
        email: d.auth0Email || '',
        tokens: (d.subscriptionTokens || 0) + (d.paidTokens || 0) + (d.rolloverTokens || 0)
      }
    }
  } catch { }

  // Fallback
  const q2 = {
    operationName: 'GetTokenBalance',
    variables: {},
    query: 'query GetTokenBalance {\n  user_details {\n    subscriptionTokens paidTokens rolloverTokens __typename\n  }\n}'
  }
  try {
    const rj = await gql(token, q2)
    const d = rj?.data?.user_details?.[0] || {}
    return { userId: '', email: '', tokens: (d.subscriptionTokens || 0) + (d.paidTokens || 0) + (d.rolloverTokens || 0) }
  } catch { }
  return { userId: '', email: '', tokens: 0 }
}

// ── Upload Image ─────────────────────────────────────────────────────────────
export async function uploadImagePath(token: string, filePath: string): Promise<string> {
  const fs = await import('fs')
  const path = await import('path')
  const ext = path.extname(filePath).slice(1).toLowerCase() || 'jpg'
  const gqlExt = ['jpg', 'jpeg'].includes(ext) ? 'jpg' : ext
  const ctMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  const ct = ctMap[ext] || 'image/jpeg'

  // Step 1: get presigned URL
  const q = {
    operationName: 'UploadImage',
    variables: { uploadImageInput: { uploadType: 'INIT', extension: gqlExt } },
    query: 'mutation UploadImage($uploadImageInput: UploadImageInput!) {\n  uploadImage(arg1: $uploadImageInput) {\n    uploadId url fields __typename\n  }\n}'
  }
  const rj = await gql(token, q)
  const ud = rj?.data?.uploadImage
  if (!ud) throw new Error('UploadImage mutation failed')

  const uploadId: string = ud.uploadId
  const s3Url: string = ud.url
  const fields = JSON.parse(ud.fields)

  // Step 2: multipart POST to S3 — build manually (FormData unavailable in Node.js main process)
  const fileBytes = fs.readFileSync(filePath)
  const boundary = `----LeoUpload${Date.now()}`
  const parts: Buffer[] = []

  // Add string fields from S3 presigned fields
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    ))
  }

  // Add file part
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: ${ct}\r\n\r\n`
  ))
  parts.push(Buffer.from(fileBytes))
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  const s3Resp = await fetch(s3Url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })
  if (![200, 204].includes(s3Resp.status)) throw new Error(`S3 upload failed: ${s3Resp.status}`)

  // Step 3: poll moderation
  const modQ = {
    operationName: 'GetInitImageModeration',
    variables: { akUUID: uploadId },
    query: 'query GetInitImageModeration($akUUID: uuid!) {\n  init_image_moderation(where: {akUUID: {_eq: $akUUID}}) {\n    akUUID initImageId checkStatus __typename\n  }\n}'
  }
  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const r = await gql(token, modQ)
    const records = r?.data?.init_image_moderation || []
    if (records.length) {
      const { checkStatus, initImageId } = records[0]
      if (checkStatus === 'Accepted' && initImageId) return initImageId as string
      if (checkStatus === 'Rejected') throw new Error('Image rejected by moderation')
    }
  }
  throw new Error('Moderation timeout')
}

// ── Generate ─────────────────────────────────────────────────────────────────
export async function createGeneration(
  token: string,
  prompt: string,
  modelId: string,
  apiType: string,   // 'NEW' | 'LEGACY'
  width: number,
  height: number,
  quantity: number,
  initImageIds?: string[]
): Promise<string> {
  if (apiType === 'NEW') {
    const params: any = {
      width, height, prompt: prompt.trim(), quantity,
      style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      prompt_enhance: 'OFF', dimensions: '1:1', modelId
    }
    if (initImageIds?.length) {
      params.guidances = { image_reference: initImageIds.map(id => ({ image: { id, type: 'UPLOADED' }, strength: 'MID' })) }
    }
    const q = {
      operationName: 'Generate',
      variables: { request: { model: 'nano-banana-2', parameters: params, public: true } },
      query: 'mutation Generate($request: CreateGenerationRequest!) {\n  generate(request: $request) {\n    apiCreditCost generationId __typename\n  }\n}'
    }
    console.log('[createGeneration][NEW] params:', JSON.stringify(params, null, 2))
    const rj = await gql(token, q)
    const genId = rj?.data?.generate?.generationId
    if (genId) return genId
    const errs = rj?.errors?.map((e: any) => e.message).join(', ')
    throw new Error(errs || `Generate failed: ${JSON.stringify(rj)}`)
  } else {
    const q = {
      operationName: 'CreateSDGenerationJob',
      variables: {
        arg1: {
          prompt: prompt.trim(), negative_prompt: '', nsfw: true, num_images: quantity,
          width, height, num_inference_steps: 10, contrast: 3.5, guidance_scale: 7,
          modelId, presetStyle: 'LEONARDO', scheduler: 'LEONARDO', public: true,
          tiling: false, leonardoMagic: false, poseToImage: false, poseToImageType: 'POSE',
          weighting: 0.75, highContrast: false, elements: [], userElements: [],
          controlnets: [], photoReal: false, transparency: 'disabled',
          styleUUID: '111dc692-d470-4eec-b791-3475abac4c46', enhancePrompt: true,
          collectionIds: [], ultra: false, contextImages: []
        }
      },
      query: 'mutation CreateSDGenerationJob($arg1: SDGenerationInput!) {\n  sdGenerationJob(arg1: $arg1) {\n    generationId __typename\n  }\n}'
    }
    // The provided instruction seems to be for a call site of createGeneration, not its definition.
    // Assuming the user intended to add a log before the gql call within this else block.
    // The provided log statement uses 'job' which is not defined here.
    // I will add a log statement relevant to the parameters available in this function.
    console.log(`[createGeneration][LEGACY] prompt="${prompt.slice(0, 40)}" qty=${quantity} modelId=${modelId} initImageIds=${JSON.stringify(initImageIds)}`)
    const rj = await gql(token, q)
    const genId = rj?.data?.sdGenerationJob?.generationId
    if (genId) return genId
    const errs = rj?.errors?.map((e: any) => e.message).join(', ')
    throw new Error(errs || `Legacy generate failed: ${JSON.stringify(rj)}`)
  }
}

// ── Poll status ───────────────────────────────────────────────────────────────
export async function pollStatus(token: string, genId: string): Promise<string> {
  const q = {
    operationName: 'GetAIGenerationFeedStatuses',
    variables: { where: { id: { _eq: genId } } },
    query: 'query GetAIGenerationFeedStatuses($where: generations_bool_exp = {}) {\n  generations(where: $where) {\n    id status __typename\n  }\n}'
  }
  const rj = await gql(token, q)
  return rj?.data?.generations?.[0]?.status || 'PENDING'
}

export async function getImageUrls(token: string, genId: string): Promise<string[]> {
  const q = {
    operationName: 'GetAIGenerationFeed',
    variables: { where: { id: { _eq: genId } }, limit: 1 },
    query: 'query GetAIGenerationFeed($where: generations_bool_exp = {}, $limit: Int) {\n  generations(where: $where, limit: $limit) {\n    generated_images(order_by: [{url: desc}]) { url id __typename }\n    __typename\n  }\n}'
  }
  const rj = await gql(token, q)
  const imgs = rj?.data?.generations?.[0]?.generated_images || []
  if (!imgs.length) throw new Error('No image URLs in response')
  return imgs.map((img: any) => img.url as string)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
