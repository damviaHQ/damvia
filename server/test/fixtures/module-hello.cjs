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
// A module as a private package would ship it, compiled to CommonJS, for
// test/modules.cjs: a table, a migration, a router, a queue and two hooks.
const { EntitySchema } = require('typeorm')
const { z } = require('zod')

const HelloNote = new EntitySchema({
    name: 'HelloNote',
    tableName: 'hello_notes',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        text: { type: 'varchar' },
        authorId: { type: 'uuid' },
    },
})

class HelloNotes1893456000000 {
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE hello_notes (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), text varchar NOT NULL, author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE)`)
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE hello_notes`)
    }
}

const received = []

module.exports = {
    name: 'hello',
    received,
    setup(damvia) {
        const notes = () => damvia.dataSource.getRepository(HelloNote)
        const digestQueue = damvia.createQueue({ name: 'digest', processor: async (data) => { received.push({ digest: data }) } })
        return {
            entities: [HelloNote],
            migrations: [HelloNotes1893456000000],
            router: damvia.router({
                add: damvia.publicProcedure
                    .use(damvia.authMiddleware(damvia.userMember))
                    .input(z.object({ text: z.string().min(1) }))
                    .mutation(({ ctx, input }) => notes().save({ text: input.text, authorId: ctx.user.id })),
                list: damvia.publicProcedure
                    .use(damvia.authMiddleware(damvia.userAdmin))
                    .query(() => notes().find()),
            }),
            hooks: {
                'records.changed': (payload) => { received.push({ records: payload }) },
                'assets.synced': () => digestQueue.push({ reason: 'sync' }),
            },
        }
    },
}
