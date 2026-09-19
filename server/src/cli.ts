import {Command, program} from "commander";
import {dataSource} from "./env"
import * as systemService from "./services/system";
import { listAssetSourceKeys, removeAssetSource, renameAssetSource, summarizeAssetSources } from "./services/asset"
import { assetUpdaters } from "./env"
import { SOURCE_KEY_PATTERN } from "./asset-updater/sources"
import {boss} from "./worker";

async function run() {
	await dataSource.initialize()
	await boss.start()

	const checkIntegrityCmd = new Command('check-integrity')
	checkIntegrityCmd.action(async () => {
		console.log('Running integrity check...')
		await systemService.integrityCheck()
		process.exit(0)
	})

	const listSourcesCmd = new Command('list-sources')
		.description('Show every source key found in the database, with its row counts, its top-level folders and whether ASSET_SOURCES still configures it')
	listSourcesCmd.action(async () => {
		const configured = assetUpdaters().map((updater) => updater.key)
		const summaries = await summarizeAssetSources()
		if (summaries.length === 0) console.log('No asset folder or file yet')
		for (const summary of summaries) {
			const key = summary.sourceKey === '' ? '"" (unassigned)' : summary.sourceKey
			const status = configured.includes(summary.sourceKey) ? 'configured' : summary.pendingDeletion > 0 && summary.pendingDeletion === summary.folders + summary.files ? 'being deleted' : 'NOT CONFIGURED: rename-source or remove-source'
			console.log(`${key}: ${summary.folders} folder(s), ${summary.files} file(s), top-level ${summary.topLevel.map((name) => JSON.stringify(name)).join(', ') || 'none'}, ${status}`)
		}
		for (const key of configured) {
			if (!summaries.some((summary) => summary.sourceKey === key)) console.log(`${key}: no row yet, configured`)
		}
		process.exit(0)
	})

	const renameSourceCmd = new Command('rename-source')
		.description('Move every folder and file stamped with one source key to another key')
		.argument('<from>', 'the key the assets currently carry (use "" for assets from before sources existed)')
		.argument('<to>', 'the key of the configured source that owns them now')
	renameSourceCmd.action(async (from: string, to: string) => {
		if (!SOURCE_KEY_PATTERN.test(to)) {
			console.error(`"${to}" is not a valid source key`)
			process.exit(1)
		}
		const stored = await listAssetSourceKeys()
		if (!stored.includes(from)) {
			console.error(`No asset carries the source key "${from}". Stored keys: ${stored.map((key) => key || '(unassigned)').join(', ') || 'none'}`)
			process.exit(1)
		}
		if (stored.includes(to)) {
			console.error(`Assets already carry the source key "${to}", merging two sources is not supported`)
			process.exit(1)
		}
		const moved = await renameAssetSource(from, to)
		console.log(`Moved ${moved.folders} folder(s) and ${moved.files} file(s) from "${from}" to "${to}"`)
		process.exit(0)
	})

	const removeSourceCmd = new Command('remove-source')
		.description('Mark every folder and file of a source key for deletion; the deletion job then removes them with their storage objects and mirrored collections')
		.argument('<key>', 'a source key that is no longer configured in ASSET_SOURCES')
	removeSourceCmd.action(async (key: string) => {
		if (assetUpdaters().some((updater) => updater.key === key)) {
			console.error(`"${key}" is still configured; remove it from ASSET_SOURCES first, or its next run would recreate everything`)
			process.exit(1)
		}
		const stored = await listAssetSourceKeys()
		if (!stored.includes(key)) {
			console.error(`No asset carries the source key "${key}". Stored keys: ${stored.map((stored) => stored || '(unassigned)').join(', ') || 'none'}`)
			process.exit(1)
		}
		const marked = await removeAssetSource(key)
		console.log(`Marked ${marked.folders} folder(s) and ${marked.files} file(s) of "${key}" for deletion; the worker removes them within minutes`)
		process.exit(0)
	})

	program
		.version("1.0.0")
		.description("Damvia CLI")
		.addCommand(checkIntegrityCmd)
		.addCommand(listSourcesCmd)
		.addCommand(renameSourceCmd)
		.addCommand(removeSourceCmd)
		.parse(process.argv);
}

run().catch((error) => {
	console.error(error)
	process.exit(1)
})
