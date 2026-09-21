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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import Loader from "@/components/Loader.vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server.ts"
import { useMutation } from "@tanstack/vue-query"
import { Pencil, Upload } from "@lucide/vue"
import { parse } from "papaparse"
import { computed, ref, watchEffect } from "vue"
import { useRouter } from "vue-router"

const toast = useGlobalToast()
const parsedData = ref<Record<string, any>[]>([])
const columns = ref<string[]>([])
const selectedColumns = ref<{ [key: string]: boolean }>({})
const keyColumnName = ref<string>("_placeholder")
const existingColumns = ref<string[]>([])
const comparisonResults = ref<
  {
    existing: Record<string, any>
    new: Record<string, any>
    differences: Record<string, any>
    status: string
  }[]
>([])
const overrideAll = ref(false)
const selectedOverrides = ref<{ [key: string]: boolean }>({})
const isComparing = ref(false)
const isImporting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const primaryKeyError = ref("")

const router = useRouter()

const handleFileUpload = async (e: Event) => {
  const fileInput = e.target as HTMLInputElement
  const file = fileInput?.files?.[0]
  if (file) {
    parsedData.value = []
    comparisonResults.value = []
    selectedOverrides.value = {}
    keyColumnName.value = "_placeholder"
    primaryKeyError.value = ""

    const parseConfig = {
      header: true,
      complete: function (results: any) {
        columns.value = results.meta.fields
        results.meta.fields.forEach((field: string) => {
          selectedColumns.value[field] = true
        })
        parsedData.value = results.data
      },
    }
    await parse(file, parseConfig)
  }
}

const filteredColumnsForPrimaryKey = computed(() => {
  return columns.value.filter(
    (column) => selectedColumns.value[column] && column !== "_placeholder"
  )
})

watchEffect(() => {
  if (keyColumnName.value && !selectedColumns.value[keyColumnName.value]) {
    keyColumnName.value = ""
  }
})

const previewData = computed(() => {
  return parsedData.value
    .map((row) => {
      const filteredRow: Record<string, string> = {}
      for (const key in row) {
        if (selectedColumns.value[key]) {
          filteredRow[key] = row[key]
        }
      }
      return filteredRow
    })
    .slice(0, 2)
})

const compareCsvMutation = useMutation({
  mutationFn: (csvData: { keyColumnName: string; data: Record<string, string>[] }) => {
    return trpc.record.compareCsv.mutate(csvData)
  },
  onSuccess: (response) => {
    comparisonResults.value = response
  },
  onError: (error) => {
    toast.error(`Comparison failed: ${(error as Error).message}`)
  },
})

const showComparisonDialog = ref(false)

const handleCsvCompare = async () => {
  if (!keyColumnName.value || keyColumnName.value === "_placeholder") {
    primaryKeyError.value = "Please select a valid primary key column."
    toast.error(primaryKeyError.value)
    return
  }
  primaryKeyError.value = ""

  const filteredData = parsedData.value.map((row) => {
    const filteredRow: Record<string, string> = {}
    for (const key in row) {
      if (selectedColumns.value[key]) {
        filteredRow[key] = row[key]
      }
    }
    return filteredRow
  })

  isComparing.value = true
  showComparisonDialog.value = true

  try {
    await compareCsvMutation.mutateAsync({
      keyColumnName: keyColumnName.value,
      data: filteredData,
    })
  } finally {
    isComparing.value = false
  }
}

const closeComparisonDialog = () => {
  showComparisonDialog.value = false
}

const importCsvMutation = useMutation({
  mutationFn: (csvData: { keyColumnName: string; data: Record<string, string>[] }) => {
    return trpc.record.importCsv.mutate(csvData)
  },
  onSuccess: () => {
    toast.success("Records successfully imported")
    router.push({ name: 'admin-records' })
  },
  onError: (error) => {
    toast.error(`Import failed: ${(error as Error).message}`)
  },
})

const handleCsvImport = () => {
  if (!keyColumnName.value) {
    primaryKeyError.value = "Please select a primary key column."
    toast.error(primaryKeyError.value)
    return
  }

  isImporting.value = true

  const dataToImport = comparisonResults.value
    .filter(
      (result) =>
        result.status === "new" ||
        (result.status === "changed" &&
          (overrideAll.value || selectedOverrides.value[result.new[keyColumnName.value]]))
    )
    .map((result) => {
      const filteredRow: Record<string, string> = {}
      for (const key in result.new) {
        if (
          result.status === "new" ||
          overrideAll.value ||
          (result.status === "changed" &&
            (result.differences[key] ||
              selectedOverrides.value[result.new[keyColumnName.value]]))
        ) {
          filteredRow[key] = result.new[key]
        } else {
          filteredRow[key] = result.existing[key]
        }
      }
      return filteredRow
    })

  importCsvMutation.mutate(
    { keyColumnName: keyColumnName.value, data: dataToImport },
    {
      onSettled: () => {
        isImporting.value = false
      },
    }
  )
}

watchEffect(() => {
  if (comparisonResults.value.length > 0) {
    existingColumns.value = Object.keys(comparisonResults.value[0].existing)
  }
})

const isNewColumn = (column: string) => {
  return !existingColumns.value.includes(column)
}

</script>

<template>
  <div class="admin-page admin-resource-page">
    <div class="flex flex-col gap-5 mb-6">
      <AdminPageHeader />
    </div>

    <div class="dv-panel p-6">
      <h2 class="text-lg font-medium mb-6">Upload a CSV file</h2>

      <div class="mb-8">
        <div class="flex items-center gap-4">
          <input ref="fileInput" type="file" @change="handleFileUpload" class="hidden" accept=".csv"
            aria-label="Choose CSV file" />
          <Button type="button" variant="outline" class="flex items-center gap-2" @click="fileInput?.click()">
            <Upload />
            Choose CSV file
          </Button>
          <span role="status" class="text-body text-[var(--dv-color-success)]">
            {{ parsedData.length > 0 ? "CSV ready for review" : "" }}
          </span>
        </div>
        <Alert v-if="parsedData.length === 0" variant="default" class="mt-2">
          <AlertTitle>Make sure your CSV has a valid header</AlertTitle>
          <AlertDescription>
            <ul class="list-disc pl-4">
              <li>The first row of the CSV are the column names.</li>
              <li>Data starts from the second row.</li>
              <li>Do not use Excel files. Do not import files styled with empty rows.</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>

      <div v-if="previewData.length > 0 && !comparisonResults.length" class="mt-8 mb-8">
        <div class="text-md font-semibold">Preview CSV Data:</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead v-for="column in filteredColumnsForPrimaryKey" :key="column">
                {{ column }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="row in previewData" :key="row[keyColumnName]">
              <TableCell v-for="column in filteredColumnsForPrimaryKey" :key="column">
                {{ row[column] }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div v-if="columns.length > 0" class="flex flex-col gap-8">
        <div class="flex flex-col space-y-2">
          <h3 id="primary-key-heading" class="text-lg font-semibold mb-2">1. Select Primary Key Column</h3>
          <p class="text-body admin-text-secondary">
            This column will be used to identify your record reference.
          </p>

          <div class="w-full max-w-xs">
            <Select v-model="keyColumnName" @update:model-value="primaryKeyError = ''">
              <SelectTrigger aria-labelledby="primary-key-heading" :aria-invalid="!!primaryKeyError || undefined"
                :aria-describedby="primaryKeyError ? 'primary-key-error' : undefined">
                <SelectValue placeholder="Select the Primary Key column" />
              </SelectTrigger>
              <SelectContent class="max-h-[300px] overflow-y-auto">
                <SelectItem value="_placeholder" disabled>Select the Primary Key column</SelectItem>
                <SelectItem v-for="column in filteredColumnsForPrimaryKey" :key="column" :value="column">
                  {{ column }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p v-if="primaryKeyError" id="primary-key-error" class="admin-form-error" role="alert">
            {{ primaryKeyError }}
          </p>
          <p class="text-body admin-text-secondary">
            The primary key is a unique identifier for each row in your data.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-semibold mb-2">2. Select Columns to Import:</h3>
          <div class="grid grid-cols-3 gap-4">
            <div v-for="column in columns" :key="column" class="flex items-center space-x-2">
              <Checkbox :id="column" v-model="selectedColumns[column]" />
              <Label :for="column">{{ column }}</Label>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-semibold">3. Compare with existing data:</h3>
          <p class="text-body admin-text-secondary">
            Before saving compare your data with the existing record database.
          </p>
          <Button v-if="columns.length > 0 && parsedData.length > 0" :disabled="keyColumnName === ''" type="button"
            @click="handleCsvCompare" class="mt-4 w-fit">
            Compare now
          </Button>
        </div>

        <Dialog v-model:open="showComparisonDialog">
          <DialogContent class="admin-dialog--large flex flex-col">
            <DialogHeader>
              <DialogTitle>Review record changes</DialogTitle>
              <DialogDescription>Choose which changed values to replace before importing.</DialogDescription>
            </DialogHeader>
            <div v-if="isComparing" class="flex-grow flex items-center justify-center">
              <Loader :text="true" />
            </div>
            <div v-else class="flex-grow overflow-auto">
              <Alert variant="default" class="mb-4">
                <AlertTitle>Review the comparison results and select the records you want to
                  override.</AlertTitle>
                <AlertDescription>
                  Light Greyed values are already present in the database and unchanged.
                  <br />
                  Green values are new and will be added to the database.
                  <br />
                  Red are duplicated Primary Keys and will be ignored.
                  <br />
                  Yellow values marked with a pencil icon have differences. Check the override box to update the
                  database with the new values.
                </AlertDescription>
              </Alert>
              <div v-if="comparisonResults.some((result) => result.status === 'changed')"
                class="ml-4 mb-2 flex items-center">
                <Checkbox id="override-all" v-model="overrideAll" />
                <Label for="override-all" class="ml-2"> Override all changes </Label>
              </div>
              <Table class="bg-white" :class="{ 'opacity-50': isImporting }">
                <TableHeader>
                  <TableRow>
                    <TableHead v-if="
                      comparisonResults.some((result) => result.status === 'changed')
                    ">
                      <span class="sr-only">Override</span>
                    </TableHead>
                    <TableHead v-for="column in filteredColumnsForPrimaryKey" :key="column"
                      :class="{ 'new-column': isNewColumn(column) }">
                      {{ column }}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="result in comparisonResults" :key="result.new[keyColumnName]" :class="{
                    'new-entry': result.status === 'new',
                    'duplicate-entry': result.status === 'duplicate',
                  }">
                    <TableCell v-if="
                      comparisonResults.some((result) => result.status === 'changed')
                    ">
                      <Checkbox v-if="result.status === 'changed'"
                        v-model="selectedOverrides[result.new[keyColumnName]]" :disabled="overrideAll"
                        :aria-label="`Override ${result.new[keyColumnName]}`" />
                    </TableCell>
                    <TableCell v-for="column in filteredColumnsForPrimaryKey" :key="column">
                      <div v-if="result.status !== 'new' && column !== keyColumnName" class="existing-value">
                        {{ result.existing[column] }}
                      </div>
                      <div class="new-value" :class="{
                        highlight: result.differences[column],
                        'new-entry': result.status === 'new',
                      }">
                        <Pencil v-if="result.differences[column]" class="inline size-[var(--dv-icon-compact)] mr-1" aria-hidden="true" />
                        {{ result.new[column] }}
                        <span v-if="result.differences[column]" class="sr-only">(changed)</span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <DialogFooter class="mt-4">
              <Button variant="outline" :disabled="isImporting" @click="closeComparisonDialog">Cancel</Button>
              <Button @click="handleCsvImport" variant="default" :disabled="isImporting">
                <Loader v-if="isImporting" />
                {{ isImporting ? "Importing..." : "Import" }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../../../style.css";

.new-column {
  @apply bg-green-100;
}

.new-entry .new-value {
  @apply bg-green-100;
}

.duplicate-entry {
  @apply bg-red-100;
}

.existing-value {
  color: var(--dv-text-secondary);
}

.new-value {
  color: var(--dv-text-primary);
}

.highlight {
  @apply bg-yellow-100;
}

.dialog-content {
  display: flex;
  flex-direction: column;
}

.dialog-body {
  flex-grow: 1;
  overflow-y: auto;
}

.max-w-xs {
  max-width: 20rem;
}

:deep(.select-content) {
  max-height: 200px;
  overflow-y: auto;
}
</style>
