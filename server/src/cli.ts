import {Command, program} from "commander";
import {dataSource} from "./env"
import * as systemService from "./services/system";

async function run() {
	await dataSource.initialize()

	const checkIntegrityCmd = new Command('check-integrity')
	checkIntegrityCmd.action(async () => {
		console.log('Running integrity check...')
		await systemService.integrityCheck()
	})

	program
		.version("1.0.0")
		.description("Damvia CLI")
		.addCommand(checkIntegrityCmd)
		.parse(process.argv);
}

run().catch((error) => {
	console.error(error)
	process.exit(1)
})
