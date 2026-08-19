import 'server-only'

type GoogleTokenInfo = {
  aud?: string
  email?: string
  email_verified?: string
  exp?: string
  iss?: string
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

export async function verifyGooglePubSubOidc(request: Request): Promise<boolean> {
  const expectedAudience = process.env.GMAIL_PUBSUB_OIDC_AUDIENCE?.trim()
  const expectedEmail = process.env.GMAIL_PUBSUB_OIDC_SERVICE_ACCOUNT_EMAIL
    ?.trim()
    .toLowerCase()

  if (!expectedAudience || !expectedEmail) return false

  const token = bearerToken(request)
  if (!token) return false

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    )

    if (!response.ok) return false

    const claims = (await response.json()) as GoogleTokenInfo
    const expiration = Number(claims.exp ?? 0)
    const issuer = claims.iss ?? ''

    return (
      claims.aud === expectedAudience &&
      claims.email?.toLowerCase() === expectedEmail &&
      claims.email_verified === 'true' &&
      (issuer === 'accounts.google.com' || issuer === 'https://accounts.google.com') &&
      Number.isFinite(expiration) &&
      expiration * 1000 > Date.now()
    )
  } catch (error) {
    console.error('Unable to verify Gmail Pub/Sub OIDC token.', error)
    return false
  }
}
