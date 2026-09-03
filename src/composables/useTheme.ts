import { computed } from 'vue'
import { useSettingStore } from '@/stores/setting'
import { storeToRefs } from 'pinia'

export function useTheme() {
  const store = useSettingStore()
  const { theme } = storeToRefs(store)

  return {
    theme,
    toggleTheme: store.toggleTheme,
    isDark: computed(() => theme.value === 'dark')
  }
}