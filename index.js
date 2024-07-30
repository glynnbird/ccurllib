const stream = require('stream')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const querystring = require('querystring')
const homedir = require('os').homedir()
const pkg = require('./package.json')
const Readable = stream.Readable
const cachedir = '.ccurl'
const cachefile = 'keycache.json'
let cache = {}

// sha256 a string
const sha256 = (str) => {
  return crypto.createHash('sha256').update(str).digest('hex')
}

// initialise the IAM key cache
const init = () => {
  const p1 = path.join(homedir, cachedir)
  try {
    fs.mkdirSync(p1, { mode: 0o700 })
  } catch (e) {
  }

  try {
    const p2 = path.join(homedir, cachedir, cachefile)
    const str = fs.readFileSync(p2, { encoding: 'utf8' })
    if (str) {
      cache = JSON.parse(str)
    }
  } catch (e) {
    // console.error(e)
  }
}

// write cache to disk, minus any invalid entries
const write = () => {
  const ts = new Date().getTime() / 1000
  // remove invalid items from cache
  for (const i in cache) {
    const val = cache[i]
    if (val && val.expiration < ts) {
      delete cache[i]
    }
  }
  const p = path.join(homedir, cachedir, cachefile)
  fs.writeFileSync(p, JSON.stringify(cache))
}

// get a key from cache, if it's there, or null
const get = (key) => {
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
const set = (key, value) => {
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
const requestGeneral = async (opts) => {
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

const request = async (opts) => {
  const response = await requestGeneral(opts)
  return await response.json()
}

const requestStream = async (opts) => {
  const response = await requestGeneral(opts)
  return Readable.fromWeb(response.body)
}

// const exchange API key for bearer token
const getBearerToken = async (apiKey) => {
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
    method: 'post'
  }
  const response = await request(req)
  return response
}

/* Makes an HTTPS API request to a JSON API service but does IAM key exchange first
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
    method: 'get'
  }
  request(opts).then(console.log)
*/
const iamRequestGeneral = async (opts, iamKey) => {
  if (iamKey) {
    let obj
    obj = get(iamKey)
    if (!obj) {
      try {
        obj = await getBearerToken(iamKey)
        if (obj) {
          set(iamKey, obj)
        }
      } catch (e) {
        console.error('IAM Auth failed')
        process.exit(1)
      }
    }
    if (!opts.headers) {
      opts.headers = {}
    }
    opts.headers.Authorization = 'Bearer ' + obj.access_token
  }
  return await requestGeneral(opts)
}

const iamRequest = async (opts, iamKey) => {
  const response = await iamRequestGeneral(opts, iamKey)
  return await response.json()
}

const iamRequestStream = async (opts, iamKey) => {
  const response = await iamRequestGeneral(opts, iamKey)
  return Readable.fromWeb(response.body)
}

init()

module.exports = {
  init,
  write,
  get,
  set,
  request,
  requestStream,
  iamRequest,
  iamRequestStream,
  getBearerToken
}
