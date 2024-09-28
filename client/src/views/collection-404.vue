<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024 Arnaud DE SAINT JEAN
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
import { ArrowLeft } from "lucide-vue-next"
</script>

<template>
  <div class="flex flex-col items-center mt-[10vh] h-screen">
    <svg class="w-[15rem] h-[15rem] fill-neutral-600" clip-rule="evenodd" fill-rule="evenodd" stroke-linejoin="round"
      stroke-miterlimit="2" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" id="fi_8452928">
      <g id="OUTLINE">
        <path
          d="m31 6.2c0-.583-.232-1.143-.644-1.556-.413-.412-.973-.644-1.556-.644-4.591 0-21.009 0-25.6 0-.583 0-1.143.232-1.556.644-.412.413-.644.973-.644 1.556v19.6c0 .583.232 1.143.644 1.556.413.412.973.644 1.556.644h25.6c.583 0 1.143-.232 1.556-.644.412-.413.644-.973.644-1.556zm-28 3.8v15.8c0 .053.021.104.059.141.037.038.088.059.141.059h25.6c.053 0 .104-.021.141-.059.038-.037.059-.088.059-.141v-14.8h-6.717c-.341 0-.678-.08-.984-.232l-1.493-.747c-.028-.014-.058-.021-.089-.021zm26-1v-2.8c0-.053-.021-.104-.059-.141-.037-.038-.088-.059-.141-.059h-25.6c-.053 0-.104.021-.141.059-.038.037-.059.088-.059.141v1.8h16.717c.341 0 .678.08.984.232l1.493.747c.028.014.058.021.089.021z">
        </path>
        <path
          d="m9.086 16.5-.793.793c-.39.39-.39 1.024 0 1.414s1.024.39 1.414 0l.793-.793.793.793c.39.39 1.024.39 1.414 0s.39-1.024 0-1.414l-.793-.793.793-.793c.39-.39.39-1.024 0-1.414s-1.024-.39-1.414 0l-.793.793-.793-.793c-.39-.39-1.024-.39-1.414 0s-.39 1.024 0 1.414z">
        </path>
        <path
          d="m20.086 16.5-.793.793c-.39.39-.39 1.024 0 1.414s1.024.39 1.414 0l.793-.793.793.793c.39.39 1.024.39 1.414 0s.39-1.024 0-1.414l-.793-.793.793-.793c.39-.39.39-1.024 0-1.414s-1.024-.39-1.414 0l-.793.793-.793-.793c-.39-.39-1.024-.39-1.414 0s-.39 1.024 0 1.414z">
        </path>
        <g transform="matrix(1 0 0 -1 0 44)">
          <path
            d="m11.553 21.106s.871-.436 1.463-.732c.619-.31 1.349-.31 1.968 0l.927.463c.056.028.122.028.178 0l.927-.463c.619-.31 1.349-.31 1.968 0 .592.296 1.463.732 1.463.732.494.246.694.848.447 1.341-.246.494-.848.694-1.341.447l-1.464-.731c-.056-.028-.122-.028-.178 0l-.927.463c-.619.31-1.349.31-1.968 0l-.927-.463c-.056-.028-.122-.028-.178 0l-1.464.731c-.493.247-1.095.047-1.341-.447-.247-.493-.047-1.095.447-1.341z">
          </path>
        </g>
      </g>
    </svg>
    <h1 class="text-2xl font-medium text-neutral-600">The collection you are looking for does not exist.</h1>

    <router-link to="/" class="flex items-center mt-5">
      <ArrowLeft class="w-4 h-4 mr-2" />
      <span>
        Go back to the home page
      </span>
    </router-link>
  </div>
</template>