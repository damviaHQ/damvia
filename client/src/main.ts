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
import { VueQueryPlugin as vueQuery } from '@tanstack/vue-query'
import { createPinia } from "pinia"
import { createApp } from 'vue'
import lazyLoad from 'vue3-lazyload'
import App from './app.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(vueQuery, {
	queryClientConfig: {
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
			},
		},
	},
})
app.use(lazyLoad, {})
app.use(router)
app.use(createPinia())
app.mount('#app')
