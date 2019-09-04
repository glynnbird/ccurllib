const fs = require('fs')
const path = require('path')
const homedir = require('os').homedir()
const cachedir = '.ccurl'
const cachefile = 'keycache.json'
const debug = require('debug')('ccurl')
const querystring = require('querystring')
const https = require('https')
const url = require('url')
let cache = {}

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
    console.error(e)
  }
}

const write = () => {
  const p = path.join(homedir, cachedir, cachefile)
  fs.writeFileSync(p, JSON.stringify(cache))
}

const get = (key) => {
  const val = cache[key]
  const ts = new Date().getTime() / 1000
  if (val && val.expiration < ts - 5) {
    debug('cache expired')
    delete cache[key]
    write()
    return null
  } else if (val) {
    debug('cache hit')
    return val
  } else {
    debug('cache miss')
    return null
  }
}

const set = (key, value) => {
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
    var parsed = new url.URL(opts.url)
    opts.qs = opts.qs ? opts.qs : {}
    for (var key in opts.qs) {
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
    var req = {
      host: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: opts.method,
      headers: opts.headers
    }

    // Set up the request
    let response = ''
    var request = https.request(req, function (res) {
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
  const req = {
    url: 'https://iam.cloud.ibm.com/identity/token',
    data: {
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey
    },
    method: 'post'
  }
  const response = await request(req)
  return response
}

module.exports = {
  init,
  write,
  get,
  set,
  request,
  getBearerToken
}
