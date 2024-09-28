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
import Loader from "@/components/Loader.vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
import { Upload } from "lucide-vue-next"
import { parse } from "papaparse"
import { computed, ref, watchEffect } from "vue"
import { useRouter } from "vue-router"

const toast = useGlobalToast()
const parsedData = ref<Record<string, any>[]>([])
const columns = ref<string[]>([])
const selectedColumns = ref<{ [key: string]: boolean }>({})
const primaryKeyName = ref<string>("_placeholder")
const existingColumns = ref<string[]>([])
const comparisonResults = ref<
  {
    existing: Record<string, any>
    new: Record<string, any>
    differences: Record<string, any>
    status: string
  }[]
>([])
const allChecked = ref(false)
const overrideAll = ref(false)
const selectedOverrides = ref<{ [key: string]: boolean }>({})
const isComparing = ref(false)
const isImporting = ref(false)

const router = useRouter()

const handleFileUpload = async (e: Event) => {
  const fileInput = e.target as HTMLInputElement
  const file = fileInput?.files?.[0]
  if (file) {
    parsedData.value = []
    comparisonResults.value = []
    selectedOverrides.value = {}
    primaryKeyName.value = "_placeholder"

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
  if (primaryKeyName.value && !selectedColumns.value[primaryKeyName.value]) {
    primaryKeyName.value = ""
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
  mutationFn: (csvData: { primaryKeyName: string; data: Record<string, string>[] }) => {
    return trpc.pim.compareCsv.mutate(csvData)
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
  if (!primaryKeyName.value || primaryKeyName.value === "_placeholder") {
    toast.error("Please select a valid primary key column.")
    return
  }

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
      primaryKeyName: primaryKeyName.value,
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
  mutationFn: (csvData: { primaryKeyName: string; data: Record<string, string>[] }) => {
    return trpc.pim.importCsv.mutate(csvData)
  },
  onSuccess: () => {
    toast.success("Products successfully imported")
    router.push("/admin/products")
  },
  onError: (error) => {
    toast.error(`Import failed: ${(error as Error).message}`)
  },
})

const handleCsvImport = () => {
  if (!primaryKeyName.value) {
    toast.error("Please select a primary key column.")
    return
  }

  isImporting.value = true

  const dataToImport = comparisonResults.value
    .filter(
      (result) =>
        result.status === "new" ||
        (result.status === "changed" &&
          result.status !== "duplicate" &&
          (overrideAll.value || selectedOverrides.value[result.new[primaryKeyName]]))
    )
    .map((result) => {
      const filteredRow: Record<string, string> = {}
      for (const key in result.new) {
        if (
          result.status === "new" ||
          overrideAll.value ||
          (result.status === "changed" &&
            (result.differences[key] ||
              selectedOverrides.value[result.new[primaryKeyName]]))
        ) {
          filteredRow[key] = result.new[key]
        } else {
          filteredRow[key] = result.existing[key]
        }
      }
      return filteredRow
    })

  importCsvMutation.mutate(
    { primaryKeyName: primaryKeyName.value, data: dataToImport },
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

function handleOverrideAll(value: boolean) {
  overrideAll.value = value
  // We don't modify selectedOverrides here
}
</script>

<template>
  <div class="flex flex-col p-8 mx-auto">
    <div class="flex flex-col gap-5 mb-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/products"> Products </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage> Import Data </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm">
      <h1 class="text-2xl font-bold mb-6">Import Products from CSV file</h1>

      <div class="mb-8">
        <div class="flex items-center gap-4">
          <Button as="label" for="file-upload" variant="outline" class="flex items-center gap-2 cursor-pointer">
            <Upload />
            Select a CSV File
            <input id="file-upload" type="file" @change="handleFileUpload" class="hidden" accept=".csv" />
          </Button>
          <span v-if="parsedData.length > 0" class="text-sm text-green-600">
            File uploaded successfully
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
            <TableRow v-for="row in previewData" :key="row[primaryKeyName]">
              <TableCell v-for="column in filteredColumnsForPrimaryKey" :key="column">
                {{ row[column] }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div v-if="columns.length > 0" class="flex flex-col gap-8">
        <div class="flex flex-col space-y-2">
          <h3 class="text-lg font-semibold mb-2">1. Select Primary Key Column</h3>
          <p class="text-sm text-gray-600">
            This column will be used to identify your product reference.
          </p>

          <div class="w-full max-w-xs">
            <Select v-model="primaryKeyName">
              <SelectTrigger>
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
          <p class="text-sm text-gray-600">
            The primary key is a unique identifier for each row in your data.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-semibold mb-2">2. Select Columns to Import:</h3>
          <div class="grid grid-cols-3 gap-4">
            <div v-for="column in columns" :key="column" class="flex items-center space-x-2">
              <Checkbox :id="column" v-model:checked="selectedColumns[column]" />
              <Label :for="column">{{ column }}</Label>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-semibold">3. Compare with existing data:</h3>
          <p class="text-sm text-gray-600">
            Before saving compare your data with the existing product database.
          </p>
          <Button v-if="columns.length > 0 && parsedData.length > 0" :disabled="primaryKeyName === ''" type="button"
            @click="handleCsvCompare" class="mt-4 w-fit">
            Compare now
          </Button>
        </div>

        <Dialog v-model:open="showComparisonDialog">
          <DialogContent class="w-[95%] h-[95%] max-w-none flex flex-col bg-neutral-100">
            <DialogHeader>
              <DialogTitle>Comparison Results</DialogTitle>
            </DialogHeader>
            <div v-if="isComparing" class="flex-grow flex items-center justify-center">
              <Loader :text="true" />
            </div>
            <div v-else class="flex-grow overflow-auto">
              <Alert variant="default" class="mb-4">
                <AlertTitle>Review the comparison results and select the products you want to
                  override.</AlertTitle>
                <AlertDescription>
                  Light Greyed values are already present in the database and unchanged.
                  <br />
                  Green values are new and will be added to the database.
                  <br />
                  Red are duplicated Primary Keys and will be ignored.
                  <br />
                  Yellow values have differences. Check the override box to update the
                  database with the new values.
                </AlertDescription>
              </Alert>
              <div v-if="comparisonResults.some((result) => result.status === 'changed')"
                class="ml-4 mb-2 flex items-center">
                <Checkbox id="override-all" v-model:checked="overrideAll" />
                <Label for="override-all" class="ml-2"> Override all changes </Label>
              </div>
              <Table class="bg-white" :class="{ 'opacity-50': isImporting }">
                <TableHeader>
                  <TableRow>
                    <TableHead v-if="
                      comparisonResults.some((result) => result.status === 'changed')
                    ">
                    </TableHead>
                    <TableHead v-for="column in filteredColumnsForPrimaryKey" :key="column"
                      :class="{ 'new-column': isNewColumn(column) }">
                      {{ column }}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="result in comparisonResults" :key="result.new[primaryKeyName]" :class="{
                    'new-entry': result.status === 'new',
                    'duplicate-entry': result.status === 'duplicate',
                  }">
                    <TableCell v-if="
                      comparisonResults.some((result) => result.status === 'changed')
                    ">
                      <Checkbox v-if="result.status === 'changed'"
                        v-model:checked="selectedOverrides[result.new[primaryKeyName]]" :disabled="overrideAll" />
                    </TableCell>
                    <TableCell v-for="column in filteredColumnsForPrimaryKey" :key="column">
                      <div v-if="result.status !== 'new' && column !== primaryKeyName" class="existing-value">
                        {{ result.existing[column] }}
                      </div>
                      <div class="new-value" :class="{
                        highlight: result.differences[column],
                        'new-entry': result.status === 'new',
                      }">
                        {{ result.new[column] }}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <DialogFooter class="mt-4">
              <Button @click="closeComparisonDialog">Cancel</Button>
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
  @apply text-gray-500;
}

.new-value {
  @apply text-black;
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
