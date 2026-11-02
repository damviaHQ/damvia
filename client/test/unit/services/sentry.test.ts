/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { TRPCClientError } from '@trpc/client'
import { describe, expect, test } from 'vitest'
import { apiBase } from '@/services/server'
import { reportable, scrubBreadcrumb, scrubEvent, sentryOptions } from '@/services/sentry'

const DSN = 'https://browserkey@glitchtip.example.com/8'
const integrationNames = (options: ReturnType<typeof sentryOptions>) =>
  (options.integrations as (defaults: { name: string }[]) => { name: string }[])([{ name: 'BrowserSession' }, { name: 'GlobalHandlers' }]).map((integration) => integration.name)

describe('error report options', () => {
  test('reports go through the API by default, straight to the tracker when the tunnel is off', () => {
    expect(sentryOptions({ VITE_SENTRY_DSN: DSN }).tunnel).toBe(`${apiBase}/v1/monitoring`)
    expect(sentryOptions({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_TUNNEL: 'false' }).tunnel).toBeUndefined()
  })

  test('nothing personal is collected and transactions are sent whole, as GlitchTip reads them', () => {
    const options = sentryOptions({ VITE_SENTRY_DSN: DSN, MODE: 'production' })
    expect(options.attachProps).toBe(false)
    expect(options.dataCollection).toEqual({ userInfo: false, cookies: false, httpHeaders: { request: { allow: ['User-Agent'] }, response: false }, httpBodies: [], urlQueryParams: false })
    expect(options.traceLifecycle).toBe('static')
    expect(options.environment).toBe('production')
    expect(integrationNames(options)).toEqual(['GlobalHandlers'])
  })

  test('tracing needs both a valid rate and the tracing integration', () => {
    const tracing = { name: 'BrowserTracing' } as never
    expect(sentryOptions({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_TRACES_SAMPLE_RATE: '0.2' }, undefined, tracing).tracesSampleRate).toBe(0.2)
    expect(integrationNames(sentryOptions({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_TRACES_SAMPLE_RATE: '0.2' }, undefined, tracing))).toContain('BrowserTracing')
    expect(sentryOptions({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_TRACES_SAMPLE_RATE: '0.2' }).tracesSampleRate).toBeUndefined()
    expect(sentryOptions({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_TRACES_SAMPLE_RATE: '5' }, undefined, tracing).tracesSampleRate).toBeUndefined()
    expect(sentryOptions({ VITE_SENTRY_DSN: DSN }, undefined, tracing).tracePropagationTargets).toEqual([])
  })
})

describe('error report filtering', () => {
  test('errors the API answered, or that never reached it, are left to the server', () => {
    const answered = new TRPCClientError('Something went wrong', { result: { error: { code: -32603, message: 'Something went wrong', data: { code: 'INTERNAL_SERVER_ERROR' } } } })
    expect(reportable(answered)).toBe(false)
    expect(reportable(new TRPCClientError('Failed to fetch'))).toBe(false)
    expect(reportable(new TypeError('x is undefined'))).toBe(true)
  })

  test('events keep the page path, the account id and the user agent only', () => {
    const event = scrubEvent({
      request: { url: 'https://dam.example.com/login?verificationCode=123456#top', headers: { 'User-Agent': 'Firefox', Referer: 'https://dam.example.com/?token=abc' }, cookies: { damvia_session: 'secret' } },
      user: { id: 'user-1', email: 'jane@example.com', ip_address: '203.0.113.9' },
      message: 'Upload of https://s3.example.com/a.jpg?X-Amz-Signature=sig failed for jane@example.com',
      exception: { values: [{ type: 'Error', value: 'No access for jane.doe@example.co.uk' }] },
      breadcrumbs: [{ category: 'navigation', data: { from: '/login?verificationCode=1', to: '/collections/42?invitation=tok' } }],
    })
    expect(event.request).toEqual({ url: 'https://dam.example.com/login', headers: { 'User-Agent': 'Firefox' } })
    expect(event.user).toEqual({ id: 'user-1' })
    expect(event.message).toBe('Upload of https://s3.example.com/a.jpg failed for [email]')
    expect(event.exception?.values?.[0].value).toBe('No access for [email]')
    expect(event.breadcrumbs?.[0].data).toEqual({ from: '/login', to: '/collections/42' })
  })

  test('request breadcrumbs lose the signature of presigned uploads, console ones what was logged', () => {
    const breadcrumb = scrubBreadcrumb({ category: 'fetch', data: { method: 'PUT', url: 'https://s3.example.com/bucket/key?X-Amz-Signature=sig', 'http.query': '?X-Amz-Signature=sig', status_code: 200 } })
    expect(breadcrumb.data).toEqual({ method: 'PUT', url: 'https://s3.example.com/bucket/key', status_code: 200 })
    const logged = scrubBreadcrumb({ category: 'console', message: 'Saved for jane@example.com', data: { arguments: [{ email: 'jane@example.com' }] } })
    expect(logged).toEqual({ category: 'console', message: 'Saved for [email]' })
  })
})
