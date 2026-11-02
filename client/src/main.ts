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
import { startMonitoring } from './services/monitoring'
import { queryClient } from './services/queryClient'
import './style.css'

const interStylesheet = document.createElement('link')
interStylesheet.rel = 'stylesheet'
interStylesheet.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
document.head.append(interStylesheet)

// After a deploy, an open tab can ask for files the new build no longer has.
// Loading the new build once fixes it; a second failure is a real one.
window.addEventListener('vite:preloadError', (event) => {
	try {
		if (Date.now() - Number(sessionStorage.getItem('damvia_reloaded_at') ?? 0) < 60_000) return
		sessionStorage.setItem('damvia_reloaded_at', String(Date.now()))
	} catch {
		return
	}
	event.preventDefault()
	window.location.reload()
})

const app = createApp(App)
startMonitoring(app, router)
app.use(vueQuery, { queryClient })
app.use(lazyLoad, {})
app.use(router)
app.use(createPinia())
app.mount('#app')
