<template>
  <Treeselect
    :options="groupOptions"
    :multiple="true"
    placeholder="Select groups..."
  />
</template>

<script setup lang="ts">
import Treeselect from "vue3-treeselect-ts";
import {useQuery} from "@tanstack/vue-query";
import {trpc} from "@/services/server.ts";
import {computed} from "vue";

const groupsQuery = useQuery({
  queryKey: ["groups"],
  queryFn: () => trpc.group.list.query(),
});

const groupOptions = computed(() =>
  (groupsQuery.data.value ?? []).map((group) => ({
    id: group.id,
    label: group.name,
  })),
);
</script>
