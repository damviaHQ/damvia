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
import { Region } from "../../entity/region"
import { dataSource, passwordLessAuth } from "../../env"
import { publicProcedure, router } from "../index"
import assetRouter from "./asset"
import assetTypeRouter from "./asset-type"
import authorizedDomainRouter from "./authorized-domain"
import collectionRouter from "./collection"
import downloadRouter from "./download"
import favoriteRouter from "./favorite"
import groupRouter from "./group"
import licenseRouter from "./license"
import menuItemRouter from "./menu-item"
import pageRouter from "./page"
import pimRouter from "./pim"
import productAttributeRouter from "./product-attributes"
import regionRouter from "./region"
import settingsRouter from "./settings"
import userRouter from "./user"

const appRouter = router({
	user: userRouter,
	group: groupRouter,
	authorizedDomain: authorizedDomainRouter,
	region: regionRouter,
	collection: collectionRouter,
	asset: assetRouter,
	assetType: assetTypeRouter,
	favorite: favoriteRouter,
	license: licenseRouter,
	download: downloadRouter,
	pim: pimRouter,
	productAttribute: productAttributeRouter,
	menuItem: menuItemRouter,
	page: pageRouter,
	settings: settingsRouter,
	env: publicProcedure.query(async () => {
		const regions = await dataSource.getRepository(Region).find()
		return {
			passwordLessAuthentication: passwordLessAuth(),
			appName: process.env.APP_NAME ?? 'Damvia - Open Source Digital Asset Management',
			regions: regions.map((region) => ({ id: region.id, name: region.name }))
		}
	})
})

export type AppRouter = typeof appRouter

export default appRouter
