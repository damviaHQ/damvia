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
import { analyticsRetentionDays, analyticsSearchMode, auditLogIp, auditRetentionDays, dataSource, oidcSettings, passwordBreachCheck, passwordLessAuth, sessionIdleHours, sessionMaxHours } from "../../env"
import { brandName } from "../../services/branding"
import { moduleRouters } from "../../modules"
import { publicProcedure, router } from "../index"
import analyticsRouter from "./analytics"
import assetRouter from "./asset"
import assetTypeRouter from "./asset-type"
import assetTypeRuleRouter from "./asset-type-rule"
import auditRouter from "./audit"
import authRouter from "./auth"
import authorizedDomainRouter from "./authorized-domain"
import catalogueRouter from "./catalogue"
import collectionRouter from "./collection"
import dashboardRouter from "./dashboard"
import downloadRouter from "./download"
import emailTemplateRouter from "./email-template"
import enrichmentRouter from "./enrichment"
import entityCsvRouter from "./entity-csv"
import entityResolutionRouter from "./entity-resolution"
import favoriteRouter from "./favorite"
import groupRouter from "./group"
import licenseRouter from "./license"
import menuItemRouter from "./menu-item"
import newsletterRouter from "./newsletter"
import organisationRouter from "./organisation"
import metadataFieldRouter from "./metadata-field"
import pageRouter from "./page"
import recordRouter from "./record"
import recordAttributeRouter from "./record-attribute"
import recordTableRouter from "./record-table"
import regionRouter from "./region"
import resolverStepRouter from "./resolver-step"
import settingsRouter from "./settings"
import userRouter from "./user"
import variantAxisRouter from "./variant-axis"
import variantGroupRouter from "./variant-group"

const appRouter = router({
	audit: auditRouter,
	auth: authRouter,
	user: userRouter,
	analytics: analyticsRouter,
	group: groupRouter,
	authorizedDomain: authorizedDomainRouter,
	region: regionRouter,
	organisation: organisationRouter,
	catalogue: catalogueRouter,
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
	enrichment: enrichmentRouter,
	favorite: favoriteRouter,
	license: licenseRouter,
	download: downloadRouter,
	record: recordRouter,
	recordAttribute: recordAttributeRouter,
	recordTable: recordTableRouter,
	menuItem: menuItemRouter,
	page: pageRouter,
	settings: settingsRouter,
	emailTemplate: emailTemplateRouter,
	newsletter: newsletterRouter,
	dashboard: dashboardRouter,
	modules: router(moduleRouters),
	env: publicProcedure.query(async () => {
		const regions = await dataSource.getRepository(Region).find()
		const enrichment = await dataSource.getRepository(EnrichmentSettings).findOneByOrFail({ id: 1 })
		return {
			passwordLessAuthentication: passwordLessAuth(),
			appName: await brandName('Damvia - Open Source Digital Asset Management'),
			regions: regions.map((region) => ({ id: region.id, name: region.name })),
			recordLabel: { singular: enrichment.recordLabelSingular, plural: enrichment.recordLabelPlural },
			viewsEnabled: enrichment.viewsEnabled,
			sso: oidcSettings() ? { label: oidcSettings()!.label, only: oidcSettings()!.only } : null,
			// What the privacy page states, so it matches this instance's configuration.
			privacy: {
				controller: process.env.PRIVACY_CONTROLLER?.trim() || null,
				contact: process.env.PRIVACY_CONTACT?.trim() || null,
				analyticsRetentionDays: analyticsRetentionDays(),
				auditRetentionDays: auditRetentionDays(),
				auditLogsAddress: auditLogIp(),
				searchMode: analyticsSearchMode(),
				sessionIdleHours: sessionIdleHours(),
				sessionMaxHours: sessionMaxHours(),
				passwordBreachCheck: passwordBreachCheck(),
			},
		}
	})
})

export type AppRouter = typeof appRouter

export default appRouter
