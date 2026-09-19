<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.
You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, ChevronRight, Copy, Download, LoaderCircle, CircleAlert, CheckCircle2, Info, MoreHorizontal, X } from '@lucide/vue'
import DvButton from './components/DvButton.vue'
import DvBadge from './components/DvBadge.vue'
import tokens from '../../../packages/design-system/src/tokens.json'
import monogramUrl from '../../../packages/design-system/src/logo-monogram.svg'
const emit = defineEmits<{ notify: [message: string] }>()
const selected = ref('Foundations')
const busy = ref(false)
const sampleInput = ref('')
const showError = ref(false)
const colourGroups = [
 { name: 'Brand', swatches: [
 { name: 'Damvia blue', hex: '#0044F4', token: 'action-primary', use: 'Actions & recognition', class: 'swatch-blue' },
 { name: 'Midnight', hex: '#00052F', token: 'color-midnight', use: 'Structure & contrast', class: 'swatch-midnight' },
 ] },
 { name: 'Surfaces', swatches: [
 { name: 'Sky', hex: '#DFE9FF', token: 'color-sky', use: 'Selection & emphasis', class: 'swatch-sky' },
 { name: 'Canvas', hex: '#F6F8FC', token: 'surface-canvas', use: 'A quiet working surface', class: 'swatch-canvas' },
 ] },
 { name: 'Text', swatches: [
 { name: 'Ink', hex: '#172343', token: 'text-primary', use: 'Content comes first', class: 'swatch-ink' },
 { name: 'Blue-grey', hex: '#64718A', token: 'text-secondary', use: 'Secondary text, metadata & breadcrumbs', class: 'swatch-blue-grey' },
 ] },
]
async function copyToken(token: string) { try { await navigator.clipboard.writeText(`var(--dv-${token})`); emit('notify', 'CSS token copied.') } catch { emit('notify', `Copy manually: var(--dv-${token})`) } }
function downloadTokens() { const url = URL.createObjectURL(new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'damvia.tokens.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
async function loadingExample() { busy.value = true; await new Promise(resolve => setTimeout(resolve, 1200)); busy.value = false; emit('notify', 'Example changes saved.') }
</script>
<template>
 <div class="page foundations-page">
  <div class="page-heading"><div><h1>Damvia design system</h1><p>The reference for Damvia colours, typography, spacing, components and interaction rules.</p></div><DvButton @click="downloadTokens"><Download />Download tokens</DvButton></div>
  <div class="foundation-intro"><img :src="monogramUrl" class="foundation-monogram" alt="" /><div><h2>When to use it</h2><p>Use this system when building or updating the Damvia admin, website and brand materials.<br />For client portals, reuse the interaction and accessibility patterns while keeping neutral surfaces and the customer’s branding.</p></div><DvBadge tone="blue">Proposal · v0.1</DvBadge></div>
  <nav class="reference-tabs" aria-label="Design system reference"><button v-for="item in ['Foundations', 'Components', 'Usage & accessibility']" :key="item" :class="{ active: selected === item }" :aria-pressed="selected === item" @click="selected = item">{{ item }}</button></nav>
  <div v-if="selected === 'Foundations'" class="reference-content">
   <section><div class="reference-heading"><h2>Colour with a purpose</h2><p>Our original blues, supported by a quieter, more usable palette.</p></div><div class="colour-groups"><section v-for="group in colourGroups" :key="group.name" class="colour-group"><h3>{{ group.name }}</h3><div class="swatch-grid"><button v-for="swatch in group.swatches" :key="swatch.name" class="swatch-item" :aria-label="`Copy ${swatch.name} token`" @click="copyToken(swatch.token)"><span class="swatch-colour" :class="swatch.class"><Copy /></span><strong>{{ swatch.name }}</strong><span class="swatch-value">{{ swatch.hex }}</span><small>{{ swatch.use }}</small></button></div></section></div></section>
   <section class="status-reference">
    <div class="reference-heading"><h2>Status colours and labels</h2><p>Use these status colour pairs for badges and inline feedback. Toast icons use the same foreground colours directly on midnight. Always include a written label; colour alone must not carry the meaning. Badges have square corners.</p></div>
    <div class="dv-table-wrap"><table class="dv-table status-table"><caption class="dv-sr-only">Status meanings, example labels and colour tokens</caption><thead><tr><th scope="col">Meaning</th><th scope="col">Example label</th><th scope="col">Text colour</th><th scope="col">Background colour</th><th scope="col">When to use</th></tr></thead><tbody>
     <tr><th scope="row">Success · green</th><td><DvBadge tone="success">Approved</DvBadge></td><td>#187454<code>color.success</code></td><td>#EAF5EF<code>color.success-soft</code></td><td>Successful completion or confirmed approval.</td></tr>
     <tr><th scope="row">Attention · amber</th><td><DvBadge tone="warning">Needs approval</DvBadge></td><td>#94621A<code>color.warning</code></td><td>#FFF5E5<code>color.warning-soft</code></td><td>Pending work or a condition that needs attention.</td></tr>
     <tr><th scope="row">Error · red</th><td><DvBadge tone="danger">Sync failed</DvBadge></td><td>#BD3545<code>color.danger</code></td><td>#FFF0F2<code>color.danger-soft</code></td><td>Failures or destructive consequences. Do not use for routine pending work.</td></tr>
     <tr><th scope="row">Neutral · blue-grey</th><td><DvBadge>Unverified</DvBadge></td><td>#64718A<code>text.secondary</code></td><td>#F6F8FC<code>surface.canvas</code></td><td>Informational states that do not require immediate action.</td></tr>
     <tr><th scope="row">Role or category · blue</th><td><DvBadge tone="blue">Admin</DvBadge></td><td>#0044F4<code>action.primary</code></td><td>#DFE9FF<code>action.soft</code></td><td>Roles and categories. “Admin” identifies a role, not a success state.</td></tr>
    </tbody></table></div>
   </section>
   <section class="type-section"><div class="reference-heading"><h2>Familiar, with a little character</h2><p>Mona Sans brings the brand and product together. A restrained scale keeps information clear.</p></div><div class="type-specimen"><div class="type-specimen-large">Aa<span>Mona Sans<br />Variable · 400–700</span></div><div class="type-scale"><div><span>Display / 56</span><strong class="type-display">Space for your brand.</strong></div><div><span>Heading / 32</span><strong class="type-heading">Everything in its place.</strong></div><div><span>Section / 17</span><strong class="type-section-label">A clear view of your workspace</strong></div><div><span>Body / 14</span><p>Find, organise and share the assets that move your brand forward.</p></div><div><span>Utility / 12</span><small>Last synced 2 minutes ago · 124 assets updated</small></div></div></div></section>
   <section class="geometry-section"><div><h2>Spacing and corner radius</h2><p>Spacing uses a 4 px rhythm. Corner radius depends on the element’s role.</p><dl class="geometry-rules"><div><dt>0 px radius · controls and data</dt><dd>Buttons, inputs, navigation items, interactive cards, badges, charts, progress bars, tables and toasts.</dd></div><div><dt>8 px radius · graphics</dt><dd>Colour samples, asset artwork, decorative icon backgrounds and brand imagery.</dd></div><div><dt>12 px radius · layout surfaces</dt><dd>Passive content panels and modal shells that group information or frame a task.</dd></div></dl></div><div><div class="spacing-label">4 px spacing scale</div><div class="spacing-examples" aria-label="4 pixel spacing scale"><div v-for="value in [4,8,12,16,24,32,48]" :key="value"><span :style="{ height: `${value}px` }"></span><small>{{ value }}</small></div></div></div></section>
  </div>
  <div v-else-if="selected === 'Components'" class="reference-content component-reference">
   <section class="component-row"><div><h2>Actions</h2><p>Square buttons. White text on strong blue.<br />Disabled actions stay neutral and readable.</p></div><div class="component-samples"><DvButton variant="primary" @click="emit('notify', 'Primary action example selected.')">Save changes<ArrowRight /></DvButton><DvButton @click="emit('notify', 'Secondary action example selected.')"><Download />Export users</DvButton><DvButton variant="quiet" @click="emit('notify', 'Quiet action example selected.')">Cancel</DvButton><DvButton variant="primary" disabled>Unavailable</DvButton><DvButton :disabled="busy" @click="loadingExample"><LoaderCircle v-if="busy" class="spinning" />{{ busy ? 'Saving…' : 'Try loading state' }}</DvButton></div></section>
   <section class="component-row"><div><h2>Forms</h2><p>Persistent labels.<br />Helpful errors. Visible keyboard focus.</p></div><form class="sample-form" @submit.prevent="showError = !sampleInput.includes('@'); !showError && emit('notify', 'Example email validated. Nothing was sent.')" novalidate><label class="dv-label" for="example-email">Work email</label><input id="example-email" v-model="sampleInput" class="dv-input" placeholder="you@company.com" type="email" :aria-invalid="showError" :aria-describedby="showError ? 'example-error' : 'example-help'" /><p v-if="showError" id="example-error" class="form-error" role="alert">Enter an email address that includes @.</p><p v-else id="example-help" class="small-note">A form example. No emails are sent.</p><DvButton type="submit">Validate example</DvButton></form></section>
   <section class="component-row"><div><h2>Breadcrumbs</h2><p>One path pattern across client and admin.<br />Ancestors are links; the current page is plain text. Long paths collapse into a menu, and only visually truncated names receive tooltips.</p></div><nav class="dv-breadcrumb" aria-label="Breadcrumb example"><ol class="dv-breadcrumb__list"><li class="dv-breadcrumb__item"><button class="dv-breadcrumb__link" @click="emit('notify', 'Assets breadcrumb selected.')"><span class="dv-breadcrumb__label">Assets</span></button></li><li class="dv-breadcrumb__separator" aria-hidden="true"><ChevronRight /></li><li class="dv-breadcrumb__item"><button class="dv-breadcrumb__ellipsis" aria-label="Show 3 hidden path items" @click="emit('notify', 'The ellipsis opens every hidden path item.')"><MoreHorizontal /></button></li><li class="dv-breadcrumb__separator" aria-hidden="true"><ChevronRight /></li><li class="dv-breadcrumb__item"><button class="dv-breadcrumb__link" @click="emit('notify', 'Product launches breadcrumb selected.')"><span class="dv-breadcrumb__label">Product launches</span></button></li><li class="dv-breadcrumb__separator" aria-hidden="true"><ChevronRight /></li><li class="dv-breadcrumb__item"><span class="dv-breadcrumb__current" aria-current="page"><span class="dv-breadcrumb__label">Autumn campaign photography</span></span></li></ol></nav></section>
   <section class="component-row"><div><h2>Feedback</h2><p>Say what happened.<br />Give the next useful action.</p></div><div class="feedback-examples"><div class="inline-feedback"><CheckCircle2 /><div><strong>Changes saved.</strong><p>Your workspace settings are up to date.</p></div></div><div class="inline-feedback error"><CircleAlert /><div><strong>Cloud sync couldn’t finish.</strong><p>Check your connection, then try syncing again.</p></div></div></div></section>
   <section class="component-row"><div><h2>Toasts</h2><p>Short, compact feedback on midnight.<br />Status icons have no background. Actions follow the standard square primary button.</p></div><div class="toast-examples"><div class="dv-toast dv-toast--success"><CheckCircle2 class="dv-toast__icon" /><div><strong class="dv-toast__title">John approved</strong><p class="dv-toast__description">He can now access the workspace.</p></div><button class="dv-toast__close" aria-label="Close success toast example" @click="emit('notify', 'Close control selected.')"><X /></button></div><div class="dv-toast dv-toast--danger"><CircleAlert class="dv-toast__icon" /><div><strong class="dv-toast__title">Upload failed</strong><p class="dv-toast__description">The file was not added.</p></div><button class="dv-toast__action" @click="emit('notify', 'Retry action selected.')">Retry</button></div><div class="dv-toast dv-toast--info"><Info class="dv-toast__icon" /><div><strong class="dv-toast__title">Storage measurement started</strong><p class="dv-toast__description">Figures will update automatically.</p></div></div></div></section>
  </div>
  <div v-else class="reference-content usage-reference">
   <section class="usage-grid"><div><h2>Three surfaces, one language</h2><dl><div><dt>Admin · focused</dt><dd>Midnight navigation, light working surfaces, clear tables and blue actions. Optimised for repeated work.</dd></div><div><dt>Website · expressive</dt><dd>The same colours and typography, with larger scale, stronger composition and space for the brand story.</dd></div><div><dt>Client portal · neutral</dt><dd>Adopt structural and accessibility patterns selectively. Customer logos, colours and assets remain the focus.</dd></div></dl></div><div class="accessibility-rules"><h2>Built for everyone</h2><ul><li>Light surfaces use primary ink and one secondary grey for text hierarchy.</li><li>Dark surfaces use white, secondary and muted navigation text roles.</li><li>4.5:1 minimum contrast for body text.</li><li>Visible keyboard focus and labelled controls.</li><li>Every clickable element uses the pointer cursor; disabled controls use not-allowed.</li><li>Prefer 44 px touch targets on small screens.</li><li>Respect reduced-motion preferences.</li><li>Use text and icons alongside status colours.</li><li>Support search, empty, error and loading states.</li><li>Keep wide tables scrollable without clipping the page.</li></ul></div></section>
   <section class="adoption-note"><h2>Shared at the foundation. Flexible at the surface.</h2><p>Versioned design tokens and plain CSS work in both Vue and Astro. Product components stay in Vue; marketing layouts stay in Astro. Each uses the same colour, type and spacing decisions.</p><pre><code>import '@damvia/design-system/tokens.css'
import '@damvia/design-system/components.css'

&lt;main class="dv-theme"&gt;
  &lt;button class="dv-button dv-button--primary"&gt;
    Save changes
  &lt;/button&gt;
&lt;/main&gt;</code></pre><p class="small-note">Proposed package API, implemented locally. Package publication and live documentation are future release steps.</p></section>
  </div>
 </div>
</template>
