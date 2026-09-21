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
import { EnrichmentSettings } from "../../entity/enrichment-settings"
import { Region } from "../../entity/region"
import { dataSource, passwordLessAuth } from "../../env"
import { publicProcedure, router } from "../index"
import analyticsRouter from "./analytics"
import assetRouter from "./asset"
import assetTypeRouter from "./asset-type"
import assetTypeRuleRouter from "./asset-type-rule"
import authorizedDomainRouter from "./authorized-domain"
import collectionRouter from "./collection"
import dashboardRouter from "./dashboard"
import downloadRouter from "./download"
import entityCsvRouter from "./entity-csv"
import entityResolutionRouter from "./entity-resolution"
import favoriteRouter from "./favorite"
import groupRouter from "./group"
import licenseRouter from "./license"
import menuItemRouter from "./menu-item"
import metadataFieldRouter from "./metadata-field"
import pageRouter from "./page"
import recordRouter from "./record"
import recordAttributeRouter from "./record-attribute"
import regionRouter from "./region"
import resolverStepRouter from "./resolver-step"
import settingsRouter from "./settings"
import userRouter from "./user"
import variantAxisRouter from "./variant-axis"
import variantGroupRouter from "./variant-group"

const appRouter = router({
	user: userRouter,
	analytics: analyticsRouter,
	group: groupRouter,
	authorizedDomain: authorizedDomainRouter,
	region: regionRouter,
	collection: collectionRouter,
	asset: assetRouter,
	assetType: assetTypeRouter,
	assetTypeRule: assetTypeRuleRouter,
	resolverStep: resolverStepRouter,
	entityResolution: entityResolutionRouter,
	entityCsv: entityCsvRouter,
	metadataField: metadataFieldRouter,
	variantGroup: variantGroupRouter,
	variantAxis: variantAxisRouter,
	favorite: favoriteRouter,
	license: licenseRouter,
	download: downloadRouter,
	record: recordRouter,
	recordAttribute: recordAttributeRouter,
	menuItem: menuItemRouter,
	page: pageRouter,
	settings: settingsRouter,
	dashboard: dashboardRouter,
	env: publicProcedure.query(async () => {
		const regions = await dataSource.getRepository(Region).find()
		const enrichment = await dataSource.getRepository(EnrichmentSettings).findOneByOrFail({ id: 1 })
		return {
			passwordLessAuthentication: passwordLessAuth(),
			appName: process.env.APP_NAME ?? 'Damvia - Open Source Digital Asset Management',
			regions: regions.map((region) => ({ id: region.id, name: region.name })),
			recordLabel: { singular: enrichment.recordLabelSingular, plural: enrichment.recordLabelPlural },
			viewsEnabled: enrichment.viewsEnabled,
		}
	})
})

export type AppRouter = typeof appRouter

export default appRouter
