# BFF

Implements the Backend for Frontend (BFF) for this project.

Features:

- Clean functional core / imperative shell split
- Full test coverage across unit and integration layers
- Security-conscious - header stripping tested, session validation tested
- Environment injection makes everything mockable
- Zod validation on startup with clear error messages
- Proper PKCE + state cookie CSRF protection on the auth flow

Major outstanding items for BFF follow.

## Security

- Token refresh - access tokens expire, BFF needs to use the refresh token to get a new one transparently. Currently sessions just expire and trigger reauth.
- Session cookie rotation after successful reauth. The old cookie should be invalidated
- Rate limiting on `/auth/login` and `/auth/callback`
- Error details shouldn't leak to the client - `oidc-error` currently returns `'Authentication failed'` which is good, but make sure stack traces never reach responses

## Operational

- Structured logging - currently just hono/logger which is console output. For OpenShift you want JSON logs with request IDs
- Request ID propagation - generate a request ID at the BFF and forward it to the API as `x-request-id` so you can correlate logs across services
- The oidc-error case in handleCallback swallows the error - log it server-side before returning the generic response

## Missing tests

- `index.ts` static file serving in production mode
- Token refresh flow when implemented

## Architecture

- Refresh token storage - currently there's nowhere to store refresh tokens. They'd need to go in a server-side store (Redis, database) keyed by session.

  This is the biggest missing piece for a production BFF. Without it, users get logged out every 8 hours (or whenever the access token expires if shorter than the session). With it, sessions can be truly long-lived.
