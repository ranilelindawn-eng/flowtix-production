import { createCipheriv,createHash,randomBytes } from 'node:crypto'
function key(){const value=process.env.FLOWTIX_SECRET_ENCRYPTION_KEY?.trim();if(!value)throw new Error('FLOWTIX_SECRET_ENCRYPTION_KEY is not configured.');return createHash('sha256').update(value).digest()}
export function encryptSecret(value:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`}
