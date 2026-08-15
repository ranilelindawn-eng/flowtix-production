export function externalRequestUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  const url = new URL(request.url)
  return configured ? `${configured}${url.pathname}${url.search}` : request.url
}
