# ccurllib

Utilities for the ccurl utility to provide:

- simple HTTPS request utility.
- api key cache persisted on user's disk

## Usage

```js
import * as ccurllib from 'ccurllib'
const opts = {
  url: 'https://myapi.myserver.com/_all_docs',
  qs: {
    limit: 4
  },
  headers: {
    myheader: 'x'
  },
  method: 'get'
}
const response = await ccurllib.request(opts)
// {
//   status: 200,
//   result: [ '_replicator', 'aaa', 'aardvark', 'alerts1' ]
// }
```

or for a Node.js stream:

```js
const responseStream = await ccurllib.requestStream(opts)
```

or if doing IAM requests, simply add an environment variable `IAM_API_KEY`. The library will only exchange the IAM key for an access token if we don't have one cached or the cached one has expired.

Cached tokens are stored in `.ccurl/keycache.json`. Simply remove this file to invalidate all cache keys.
