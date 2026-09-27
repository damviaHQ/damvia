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
import { test as base, expect, type Page, type Request, type Route } from '@playwright/test'
import { defaults, user } from './fixtures'

// The client talks to the API through tRPC over plain HTTP: a query is a GET
// with its input in `?input=`, a mutation a POST with its input as the body.
// Every spec answers those requests here, from the shared defaults and its
// own overrides, so no real API is ever called. The session comes from the
// `user.me` answer: a member unless the spec picks a role or answers
// `unauthorized()`.

type Json = any

export class TrpcError {
  constructor(readonly status: number, readonly code: string, readonly message: string) {}
}

const rpcCodes: Record<string, number> = {
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  CONFLICT: -32009,
  INTERNAL_SERVER_ERROR: -32603,
}

export const trpcError = (status: number, code: string, message: string) => new TrpcError(status, code, message)
export const unauthorized = (message = 'UNAUTHORIZED') => trpcError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'FORBIDDEN') => trpcError(403, 'FORBIDDEN', message)
export const conflict = (message = 'CONFLICT') => trpcError(409, 'CONFLICT', message)
export const serverError = (message = 'Internal server error') => trpcError(500, 'INTERNAL_SERVER_ERROR', message)

// An answer is the data itself, an error, or a function of the input that
// returns either (and may wait, to hold a request open).
export type Answer = unknown | TrpcError | ((input: Json, request: Request) => unknown)
export type Answers = Record<string, Answer>
export type Call = { name: string, input: Json }
export type MockOptions = { role?: 'guest' | 'member' | 'manager' | 'admin' }

export type TrpcMock = {
  // Every procedure called, in order, with its parsed input.
  calls: Call[]
  // Procedures the page called that neither the defaults nor the spec answer.
  unmocked: string[]
  inputs(name: string): Json[]
  last(name: string): Json
  count(name: string): number
  // Changes answers while the page is open.
  set(answers: Answers): void
  // Waits until no request to the API is left unanswered.
  settled(): Promise<void>
}
export type MockTrpc = (overrides?: Answers, options?: MockOptions) => Promise<TrpcMock>

function parseInput(request: Request) {
  const raw = request.method() === 'POST' ? request.postData() : new URL(request.url()).searchParams.get('input')
  return raw ? JSON.parse(raw) : undefined
}

async function install(page: Page) {
  let answers: Answers = { ...defaults }
  let pending = 0
  const mock: TrpcMock = {
    calls: [],
    unmocked: [],
    inputs: name => mock.calls.filter(call => call.name === name).map(call => call.input),
    last: name => mock.inputs(name).at(-1),
    count: name => mock.inputs(name).length,
    set: next => { answers = { ...answers, ...next } },
    settled: () => expect.poll(() => pending, { message: 'requests to the API still open' }).toBe(0),
  }
  await page.route('**/trpc/**', async route => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/trpc/')[1]
    const input = parseInput(request)
    mock.calls.push({ name, input })
    pending++
    try {
      await answer(route, name, input)
    } finally {
      pending--
    }
  })
  async function answer(route: Route, name: string, input: Json) {
    const request = route.request()
    if (!(name in answers)) {
      mock.unmocked.push(name)
      const message = `No mock for the tRPC procedure "${name}": answer it in mockTrpc().`
      await route.fulfill({ status: 500, json: { error: { message, code: rpcCodes.INTERNAL_SERVER_ERROR, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } } })
      return
    }
    const handler = answers[name]
    const data = typeof handler === 'function' ? await handler(input, request) : handler
    if (data instanceof TrpcError) {
      await route.fulfill({ status: data.status, json: { error: { message: data.message, code: rpcCodes[data.code] ?? -32603, data: { code: data.code, httpStatus: data.status } } } })
      return
    }
    await route.fulfill({ json: { result: { data } } })
  }
  return {
    mock,
    reset(overrides: Answers, options: MockOptions) {
      answers = { ...defaults, ...(options.role ? { 'user.me': { ...user, role: options.role } } : {}), ...overrides }
    },
  }
}

// `mockTrpc` answers the API for the page, `shot` keeps a screenshot when
// UI_SHOTS=1. After each test, an uncaught error in the page or a call to an
// unmocked procedure fails it.
export const test = base.extend<{
  mockTrpc: MockTrpc
  shot: (name: string, options?: { fullPage?: boolean }) => Promise<void>
}>({
  mockTrpc: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const api = await install(page)
    await use(async (overrides = {}, options = {}) => {
      api.reset(overrides, options)
      return api.mock
    })
    expect(api.mock.unmocked, 'tRPC procedures called without a mock').toEqual([])
    expect(errors, 'uncaught errors in the page').toEqual([])
  }, { auto: true }],
  shot: async ({ page }, use, testInfo) => {
    await use(async (name, options = {}) => {
      if (process.env.UI_SHOTS !== '1') return
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), ...options })
    })
  },
})

export { expect }
