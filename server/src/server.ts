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
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import fastify from 'fastify'
import { appRouter, createContext } from './trpc'
import { logger } from "./env"

const server = fastify({ maxParamLength: 5000, logger: false, bodyLimit: 5242880 })

server.register(cors)
server.register(fastifyTRPCPlugin, {
	prefix: '/trpc',
	trpcOptions: {
		router: appRouter,
		createContext,
		onError(opts) {
			const { error, type, path, input, ctx, req } = opts
			logger.error('http.request', { error, path, input, userId: ctx.user?.id })
		},
	},
})

export default server
