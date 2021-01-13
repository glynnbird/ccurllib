const fs = require('fs')
const path = require('path')
const homedir = require('os').homedir()
const cachedir = '.ccurl'
const cachefile = 'keycache.json'
const querystring = require('querystring')
const https = require('https')
const http = require('http')
const url = require('url')
const crypto = require('crypto')
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

const jsonParse = (str) => {
  try {
    return JSON.parse(str)
  } catch (e) {
    return str
  }
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
    request(opts).then(console.log)
*/
const request = async (opts) => {
  return new Promise((resolve, reject) => {
    let h
    // Build the post string from an object
    opts.method = opts.method ? opts.method : 'get'
    const allMethods = ['get', 'head', 'post', 'put', 'delete']
    if (!allMethods.includes(opts.method)) {
      throw new Error('invalid method')
    }
    const methods = ['post', 'put']
    let postData
    if (methods.includes(opts.method)) {
      postData = querystring.stringify(opts.data)
    }

    // parse
    if (!opts.url) {
      throw new Error('invalid url')
    }
    const parsed = new url.URL(opts.url)
    if (parsed.protocol === 'https:') {
      h = https
    } else if (parsed.protocol === 'http:') {
      h = http
    } else {
      throw new Error('invalid protocol')
    }
    opts.qs = opts.qs ? opts.qs : {}
    for (const key in opts.qs) {
      parsed.searchParams.append(key, opts.qs[key])
    }

    // pathname
    if (opts.dbname && opts.path) {
      parsed.pathname = '/' + opts.dbname + '/' + opts.path
    }

    // headers
    opts.headers = opts.headers || {}
    if (methods.includes(opts.method)) {
      opts.headers['Content-Length'] = Buffer.byteLength(postData)
    }

    // An object of options to indicate where to post to
    const req = {
      host: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: opts.method,
      headers: opts.headers
    }

    // Set up the request
    let response = ''
    const request = h.request(req, function (res) {
      res.setEncoding('utf8')
      res.on('data', function (chunk) {
        response += chunk
      })
      res.on('close', function () {
        if (res.statusCode >= 400) {
          return reject(jsonParse(response))
        }
        resolve(jsonParse(response))
      })
      res.on('error', function (e) {
        reject(e)
      })
    })

    // post the data
    if (methods.includes(opts.method)) {
      request.write(postData)
    }
    request.end()
  })
}

// const exchange API key for bearer token
const getBearerToken = async (apiKey) => {
  let url = 'https://iam.cloud.ibm.com/identity/token'
  if (process.env.IAM_STAGING) {
    url = 'https://iam.stage1.ng.bluemix.net/identity/token'
  }
  const req = {
    url: url,
    data: {
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey
    },
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
