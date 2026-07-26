export type TwilioConfiguration = {
  accountSid: string
  authToken: string
  apiKeySid: string
  apiKeySecret: string
  twimlAppSid: string
  callerId: string
  publicUrl: string
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function getTwilioConfiguration(): TwilioConfiguration {
  return {
    accountSid: required('TWILIO_ACCOUNT_SID'),
    authToken: required('TWILIO_AUTH_TOKEN'),
    apiKeySid: required('TWILIO_API_KEY_SID'),
    apiKeySecret: required('TWILIO_API_KEY_SECRET'),
    twimlAppSid: required('TWILIO_TWIML_APP_SID'),
    callerId: required('TWILIO_CALLER_ID'),
    publicUrl: required('NEXT_PUBLIC_SITE_URL').replace(/\/$/, ''),
  }
}

export function isTwilioConfigured(): boolean {
  return [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_API_KEY_SID',
    'TWILIO_API_KEY_SECRET',
    'TWILIO_TWIML_APP_SID',
    'TWILIO_CALLER_ID',
    'NEXT_PUBLIC_SITE_URL',
  ].every((name) => Boolean(process.env[name]?.trim()))
}
