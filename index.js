const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const querystring = require('querystring')
const homedir = require('os').homedir()
const pkg = require('./package.json')
const cachedir = '.ccurl'
const cachefile = 'keycache.json'

let cache = {}

const sha256 = (str) => {
  return crypto.createHash('sha256').update(str).digest('hex')
}

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
      method: 'get'
    }
    if "body" is supplied, it's used as a post body. If "data" is supplied,
    it's JSON stringified and put in "body".
    request(opts).then(console.log)
*/
const request = async (opts) => {
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
  if (!opts.headers || !opts.headers['content-type']) {
    Object.assign(opts.headers, {
      'content-type': 'application/json',
      'user-agent': `${pkg.name}/${pkg.version}`
    })
  }
  if (parsedUrl.username && parsedUrl.password) {
    opts.headers.authorization = `Basic ${btoa(parsedUrl.username + ':' + parsedUrl.password)}`
  }
  console.log(u, opts)
  const response = await fetch(u, opts)
  return await response.json()
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
const iamRequest = async (opts, iamKey) => {
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
  return request(opts)
}

init()

module.exports = {
  init,
  write,
  get,
  set,
  request,
  iamRequest,
  getBearerToken
}
