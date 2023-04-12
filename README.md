

Dev keys for HTTPS are setup using mkcert:
https://www.sheshbabu.com/posts/running-express-over-https-in-localhost/

Generate keys as:
`brew install mkcert`
`mkcert -install`
`mkcert 0.0.0.0`

Run the server with:
`npm run start`