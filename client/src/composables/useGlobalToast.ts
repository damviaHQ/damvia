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
import { provide, inject, InjectionKey } from 'vue'
import { toast as sonnerToast } from 'vue-sonner'

interface GlobalToast {
  default: (message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const toastSymbol: InjectionKey<GlobalToast> = Symbol()

export function provideGlobalToast() {
  const toast: GlobalToast = {
    default: (message: string) => sonnerToast(message),
    success: (message: string) => sonnerToast.success(message),
    error: (message: string) => sonnerToast.error(message),
    info: (message: string) => sonnerToast.info(message),

  }

  provide(toastSymbol, toast)
}

export function useGlobalToast(): GlobalToast {
  const toast = inject(toastSymbol)
  if (!toast) {
    throw new Error('useGlobalToast must be used within a component that has called provideGlobalToast')
  }
  return toast
}