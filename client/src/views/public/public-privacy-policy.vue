<!-- Damvia - Open Source Digital Asset Manager
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { useGlobalStore } from "@/stores/globalStore"
import { computed } from "vue"

const globalStore = useGlobalStore()
const privacy = computed(() => globalStore.env?.privacy)
const days = (value: number | null | undefined) => value ? `${value} days` : "until an administrator removes them"
const hours = (value: number | undefined) => value && value % 24 === 0 ? `${value / 24} days` : `${value} hours`
</script>

<template>
  <div>
    <h1>Privacy and cookie policy</h1>
    <p>This page describes what this library stores about you, why, for how long, and how to exercise your rights. It reflects this library's current settings.</p>

    <section>
      <h2>Who is responsible</h2>
      <p v-if="privacy?.controller">
        {{ privacy.controller }} runs this library and decides how your data is used.
        <template v-if="privacy.contact">Contact: <a :href="privacy.contact.includes('@') ? `mailto:${privacy.contact}` : privacy.contact">{{ privacy.contact }}</a>.</template>
      </p>
      <p v-else>The organisation that gave you access to this library runs it and decides how your data is used. Ask your contact there for their privacy details.</p>
    </section>

    <section>
      <h2>What is stored</h2>
      <ul>
        <li><strong>Your account:</strong> name, email address, company, region, role, groups, approval status and, if you use one, your password. The password is stored only as a salted scrypt hash.</li>
        <li><strong>Sign-in:</strong> for each browser where you are signed in, the time and the browser type; failed sign-in attempts; if you turn on two-step verification, an encrypted key and hashed recovery codes.</li>
        <li><strong>Activity:</strong> which files you view and download, the collections you share and your favourites<template v-if="privacy?.searchMode === 'named'">, and what you search for</template>. Administrators see it in usage statistics.<template v-if="privacy?.searchMode === 'anonymous'"> Searches are stored without your name.</template><template v-if="privacy?.searchMode === 'off'"> Searches are not stored.</template></li>
        <li><strong>Audit log:</strong> sign-ins, changes you make as an administrator or manager, and refused requests<template v-if="privacy?.auditLogsAddress">, with your network address and browser</template>. It exists to keep the library secure.</li>
        <li><strong>Downloads:</strong> the files you asked for, and your acceptance of their usage terms.</li>
        <li><strong>Content you create:</strong> your collections, the invitations you send (with the invited address) and your changes to product records.</li>
      </ul>
    </section>

    <section>
      <h2>Why</h2>
      <ul>
        <li>To give you access to the files you are allowed to see, and to run your account (the service you use).</li>
        <li>To protect the library and its users: sessions, sign-in limits, two-step verification and the audit log (legitimate interest in security).</li>
        <li>To show administrators how the library is used, so they can improve it (legitimate interest).</li>
      </ul>
      <p>Nothing is used for advertising or sold.</p>
    </section>

    <section>
      <h2>Cookies and browser storage</h2>
      <p>This library uses only what it needs to work. There are no statistics or advertising cookies, and nothing is shared with advertising or analytics companies.</p>
      <ul>
        <li><code>damvia_session</code>: keeps you signed in. It cannot be read by scripts on the page. It ends when you sign out, after {{ hours(privacy?.sessionIdleHours) }} without use, or {{ hours(privacy?.sessionMaxHours) }} after you signed in.</li>
        <li><code>damvia_oidc</code>: set for 10 minutes while you sign in through your organisation's single sign-on, if it is offered.</li>
        <li>Browser storage (not sent anywhere): your display preferences, filters and recent searches, on this device only. Signing out clears the recent searches.</li>
      </ul>
    </section>

    <section>
      <h2>Who receives it</h2>
      <ul>
        <li>The library's administrators, and managers for users of their region.</li>
        <li>The companies that host the library, its files and its email, acting on behalf of the organisation that runs it.</li>
        <li v-if="privacy?.passwordBreachCheck">When you choose a password, the first five characters of a fingerprint of it are sent to the Have I Been Pwned service to check it against known data breaches. The password itself never leaves the library.</li>
        <li>Your organisation's identity provider, if you sign in with single sign-on.</li>
      </ul>
    </section>

    <section>
      <h2>How long</h2>
      <ul>
        <li>Your account and content: until your account is deleted.</li>
        <li>Activity: {{ days(privacy?.analyticsRetentionDays) }}.</li>
        <li>Audit log: {{ days(privacy?.auditRetentionDays) }}. When an account is deleted, its entries no longer name the person.</li>
        <li>Prepared downloads: 7 days.</li>
      </ul>
    </section>

    <section>
      <h2>Your rights</h2>
      <ul>
        <li><strong>See and take your data:</strong> Account &gt; Profile &gt; Download my data.</li>
        <li><strong>Correct it:</strong> Account &gt; Profile, or ask an administrator for fields you cannot change.</li>
        <li><strong>Delete it:</strong> Account &gt; Profile &gt; Delete account. Your personal collections are deleted; statistics and the audit log keep what happened without your name.</li>
        <li><strong>Object or restrict:</strong> contact the organisation responsible<template v-if="privacy?.contact"> at {{ privacy.contact }}</template>.</li>
        <li>You can also complain to your data protection authority.</li>
      </ul>
    </section>

    <section>
      <h2>Security</h2>
      <p>Access is limited by role, region and group. Passwords are hashed, sessions can be ended from Account &gt; Security, and you can turn on two-step verification there.</p>
    </section>

    <section>
      <h2>Legal information</h2>
      <p>See the <router-link to="/legal-information">legal information page</router-link>.</p>
    </section>
    <div class="legal-layout__back-btn">
      <router-link to="/">Back to the library</router-link>
    </div>
  </div>
</template>
