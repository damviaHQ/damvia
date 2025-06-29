import {Command, program} from "commander";
import {dataSource} from "./env"
import * as systemService from "./services/system";
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
