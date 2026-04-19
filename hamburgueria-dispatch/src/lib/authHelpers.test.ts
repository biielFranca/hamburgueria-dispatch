import { describe, it, expect } from 'vitest'
import { isEmail, isInternalEmail, resolveLoginEmail } from './authHelpers'

describe('isEmail', () => {
  it('returns true for valid emails', () => {
    expect(isEmail('user@example.com')).toBe(true)
    expect(isEmail('a.b+c@sub.example.co')).toBe(true)
  })
  it('returns false for bad emails', () => {
    expect(isEmail('user')).toBe(false)
    expect(isEmail('user@')).toBe(false)
    expect(isEmail('@example.com')).toBe(false)
    expect(isEmail('user @example.com')).toBe(false)
  })
})

describe('isInternalEmail', () => {
  it('detects synthesized legacy accounts', () => {
    expect(isInternalEmail('joao@dispatch.internal')).toBe(true)
    expect(isInternalEmail('joao@gmail.com')).toBe(false)
  })
})

describe('resolveLoginEmail', () => {
  it('returns real email as-is (lowercased/trimmed)', () => {
    expect(resolveLoginEmail('  User@Example.COM ')).toBe('user@example.com')
  })
  it('synthesizes legacy username', () => {
    expect(resolveLoginEmail('joao')).toBe('joao@dispatch.internal')
    expect(resolveLoginEmail('user.01-x_y')).toBe('user.01-x_y@dispatch.internal')
  })
  it('returns null for invalid inputs', () => {
    expect(resolveLoginEmail('')).toBeNull()
    expect(resolveLoginEmail('  ')).toBeNull()
    expect(resolveLoginEmail('ab')).toBeNull() // too short
    expect(resolveLoginEmail('user name')).toBeNull() // space
    expect(resolveLoginEmail('user@bad')).toBeNull() // bad email
  })
})
