import { Readable }  from 'node:stream'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import querystring  from 'node:querystring'
import os from 'node:os'

// get home directory
const HOME_DIR = os.homedir()

// load package meta data
const pkg = JSON.parse(readFileSync(path.join(import.meta.dirname, 'package.json'), { encoding: 'utf8' }))

// constants
const CACHE_DIR = '.ccurl'
const CACHE_FILE = 'keycache.json'

// the cache itself
let cache = {}

// sha256 a string
const sha256 = (str) => {
  return crypto.createHash('sha256').update(str).digest('hex')
}

// initialise the IAM key cache
export function  init() {
  const p1 = path.join(HOME_DIR, CACHE_DIR)
  try {
    mkdirSync(p1, { mode: 0o700 })
  } catch (e) {
  }

  try {
    const p2 = path.join(HOME_DIR, CACHE_DIR, CACHE_FILE)
    const str = readFileSync(p2, { encoding: 'utf8' })
    if (str) {
      cache = JSON.parse(str)
    }
  } catch (e) {
    // console.error(e)
  }
}

// write cache to disk, minus any invalid entries
export function write () {
  const ts = new Date().getTime() / 1000
  // remove invalid items from cache
  for (const i in cache) {
    const val = cache[i]
    if (val && val.expiration < ts) {
      delete cache[i]
    }
  }
  const p = path.join(HOME_DIR, CACHE_DIR, CACHE_FILE)
  writeFileSync(p, JSON.stringify(cache))
}

// get a key from cache, if it's there, or null
export function get(key) {
  key = sha256(key)
  const val = cache[key]
  const ts = new Date().getTime() / 1000
  if (val && val.expiration < ts - 5) {
    delete cache[key]
    write()
    return null
  } else if (val) {
    return val
  } else {
    return null
  }
}

// set cache key
export function set(key, value) {
  key = sha256(key)
  cache[key] = value
  write()
}

/*
  Makes an HTTPS API request to a JSON API service
  e.g.
    const opts = {
      url: 'https://myapi.myserver.com/my/path',
      qs: {
        a:1,
        b:2
      },
      headers: {
        myheader: 'x'
      },
      qs: {
        include_docs: true
      },
      method: 'get'
    }
    if "body" is supplied, it's used as a post body. If "data" is supplied,
    it's JSON stringified and put in "body".
    request(opts).then(console.log)
*/
async function requestGeneral(opts) {
  const iamKey = process.env.IAM_API_KEY
  if (iamKey && !opts.ignoreIAM) {
    let obj
    obj = get(iamKey)
    if (!obj) {
      try {
        obj = await getBearerToken(iamKey)
        if (obj) {
          set(iamKey, obj)
        }
      } catch (e) {
        throw new Error('IAM Auth failed')
      }
    }
    if (!opts.headers) {
      opts.headers = {}
    }
    opts.headers.Authorization = 'Bearer ' + obj.access_token
  }
  const parsedUrl = new URL(opts.url)
  delete opts.url
  let u = parsedUrl.origin + parsedUrl.pathname
  if (opts.qs) {
    u += `?${querystring.stringify(opts.qs)}`
    delete opts.qs
  }
  if (opts.data) {
    opts.body = JSON.stringify(opts.data)
    delete opts.data
  }
  opts.headers = opts.headers || {}
  if (!opts.headers || !opts.headers['content-type']) {
    Object.assign(opts.headers, {
      'content-type': 'application/json',
      'user-agent': `${pkg.name}/${pkg.version}`
    })
  }
  if (parsedUrl.username && parsedUrl.password) {
    opts.headers.authorization = `Basic ${btoa(parsedUrl.username + ':' + parsedUrl.password)}`
  }
  const response = await fetch(u, opts)
  return response
}

export async function request(opts) {
  const response = await requestGeneral(opts)
  return {
    status: response.status,
    result: await response.json()
  }
}

export async function requestStream (opts) {
  const response = await requestGeneral(opts)
  return Readable.fromWeb(response.body)
}

// const exchange API key for bearer token
export async function  getBearerToken(apiKey) {
  let url = 'https://iam.cloud.ibm.com/identity/token'
  if (process.env.IAM_STAGING) {
    url = 'https://iam.stage1.ng.bluemix.net/identity/token'
  }
  const data = {
    grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
    apikey: apiKey
  }
  const req = {
    url,
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(data).toString(),
    method: 'post',
    ignoreIAM: true
  }
  const response = await request(req)
  return response.result
}

init()
