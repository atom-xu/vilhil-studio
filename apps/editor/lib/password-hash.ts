/**
 * 密码哈希工具（分享访问密码专用）
 *
 * 使用 Node.js 内置 crypto.pbkdf2，异步非阻塞。
 * 注意：此方案适用于分享访问密码（低频次验证），
 * 用户登录密码仍由 Better Auth 内部管理。
 */

import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const pbkdf2Async = promisify(pbkdf2)

/** 当前哈希版本，用于迭代次数升级兼容 */
const CURRENT_VERSION = 'v2'
const V1_ITERATIONS = 1000
const V2_ITERATIONS = 600000
const KEYLEN = 64
const DIGEST = 'sha512'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await pbkdf2Async(password, salt, V2_ITERATIONS, KEYLEN, DIGEST)).toString('hex')
  return `${CURRENT_VERSION}:${salt}:${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')

  let version: string
  let salt: string | undefined
  let hash: string | undefined

  if (parts.length === 3) {
    version = parts[0]!
    salt = parts[1]
    hash = parts[2]
  } else if (parts.length === 2) {
    // 兼容旧格式（无版本号）
    version = 'v1'
    salt = parts[0]
    hash = parts[1]
  } else {
    return false
  }

  if (!salt || !hash) return false

  const iterations = version === 'v2' ? V2_ITERATIONS : V1_ITERATIONS
  const inputHash = await pbkdf2Async(password, salt, iterations, KEYLEN, DIGEST)
  const storedHashBuf = Buffer.from(hash, 'hex')

  if (inputHash.length !== storedHashBuf.length) return false
  return timingSafeEqual(inputHash, storedHashBuf)
}
