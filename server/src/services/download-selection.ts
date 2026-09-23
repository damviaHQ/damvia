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
import { TRPCError } from "@trpc/server"
import { Brackets, EntityManager, In } from "typeorm"
import { User } from "../entity/user"
import { EnrichmentSettings } from "../entity/enrichment-settings"
import { RecordAttribute } from "../entity/record-attribute"
import { userCollectionsQuery, userCollectionFilesQuery } from "./collection"
import { scopeCondition } from "./catalogue"
import { catalogueKeyColumnName, EXPORT_MAX } from "./records"

export type DownloadSelection = { id: string, type: 'collection' | 'file' | 'record' }[]

export async function resolveDownloadSelection(em: EntityManager, user: User, items: DownloadSelection, includeFiles = true) {
  const settings = await em.getRepository(EnrichmentSettings).findOneByOrFail({ id: 1 })
  const roots = items.filter(item => item.type === 'collection').map(item => item.id)
  const collections = roots.length ? await userCollectionsQuery(user, em)
    .andWhere(new Brackets(q => {
      roots.forEach((id, index) => q.orWhere(`collection.mpath LIKE :downloadPath${index}`, { [`downloadPath${index}`]: `%${id}.%` }))
    })).getMany() : []
  // A hidden parent is not an entry point into its descendants.
  const accessibleRoots = roots.length ? await userCollectionsQuery(user, em).andWhere({ id: In(roots) }).getMany() : []
  const selectedCollections = collections.filter(collection => accessibleRoots.some(root => collection.path?.startsWith(root.path!)))
  const parameters: unknown[] = []
  const scopes: string[] = []
  for (const collection of accessibleRoots) {
    scopes.push(`(${await scopeCondition(em, user, collection.id, parameters, settings.hideRecordsWithoutMedia)})`)
  }
  const recordIds = items.filter(item => item.type === 'record').map(item => item.id)
  if (recordIds.length) {
    const visible = await scopeCondition(em, user, undefined, parameters, settings.hideRecordsWithoutMedia)
    parameters.push(recordIds)
    scopes.push(`(${visible} AND r.id = ANY($${parameters.length}::uuid[]))`)
  }
  const records: { id: string, recordKey: string, metaData: Record<string, string> }[] = scopes.length ? await em.query(`
    SELECT r.id, r.record_key AS "recordKey", hstore_to_json(r.meta_data) AS "metaData"
    FROM records r WHERE ${scopes.join(' OR ')} ORDER BY r.record_key, r.id LIMIT ${EXPORT_MAX + 1}
  `, parameters) : []
  if (records.length > EXPORT_MAX) throw new TRPCError({ code: 'BAD_REQUEST', message: `Select up to ${EXPORT_MAX.toLocaleString('en-US')} records at a time.` })
  const keyName = await catalogueKeyColumnName(em)
  const fields = await em.getRepository(RecordAttribute).find({ where: { viewable: true }, order: { position: 'ASC', name: 'ASC' } })
  const columns = [{ id: 'recordKey', label: keyName ?? 'Reference' }, ...fields.filter(field => field.name !== keyName).map(field => ({ id: field.id, label: field.displayName || field.name }))]
  const rows = records.map(record => [record.recordKey, ...fields.filter(field => field.name !== keyName).map(field => {
    const value = record.metaData?.[field.name] ?? ''
    return field.valueType === 'multi_select' ? value.split('|').filter(Boolean).join(', ') : value
  })])
  const files = includeFiles ? await userCollectionFilesQuery(user, em)
    .andWhere(new Brackets(q => {
      q.where({ id: In(items.filter(item => item.type === 'file').map(item => item.id)) })
        .orWhere({ collectionId: In(selectedCollections.map(collection => collection.id)) })
      if (records.length) q.orWhere(`asset_file.id IN (
        SELECT a.id FROM asset_files a
        LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
        WHERE coalesce(l.record_id, a.record_id) IN (:...downloadRecordIds)
      )`, { downloadRecordIds: records.map(record => record.id) })
    })).orderBy('asset_file.name', 'ASC').addOrderBy('collection_file.id', 'ASC').getMany() : []
  return { files: [...new Map(files.map(file => [file.assetFileId, file])).values()], fields, columns, rows, viewsEnabled: settings.viewsEnabled }
}
