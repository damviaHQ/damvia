import { ref, type Ref } from "vue"

export function useIsTruncated() {
  const isTruncated = ref(false)
  const check = (el?: HTMLElement | null) => {
    if (!el) return
    isTruncated.value = el.scrollWidth > el.clientWidth
  }
  return { isTruncated, check } as { isTruncated: Ref<boolean>; check: (el?: HTMLElement | null) => void }
}
