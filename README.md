# ccurllib

Utilities for the ccurl utility to provide:

- simple HTTPS request utility.
- api key cache persisted on user's disk

## Usage

```js
const cc = require('ccurllib')
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
const response = await cc.request(opts)
```

or for a Node.js stream:

```js
const responseStream = await cc.requestStream(opts)
```

or if doing IAM requests, simply add an environment variable `IAM_API_KEY`. The library will only exchange the IAM key for an access token if we don't have one cached or the cached one has expired.

Cached tokens are stored in `.ccurl/keycache.json`. Simply remove this file to invalidate all cache keys.
