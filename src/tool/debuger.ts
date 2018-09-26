#!/usr/bin/env node
import * as process from 'process';
import * as path from 'path';
import {initUnhandledRejection, parseCommand, initLogger} from '../client';
import {initChainCreator, createValueDebuger, ErrorCode} from '../core';

const logger = initLogger({loggerOptions: {console: true}});
initUnhandledRejection(logger);

async function main() {
    let command = parseCommand(process.argv);
    if (!command || !command.command) {
        console.log(`Usage: node address.js <create | convert> {--secret {secret} | --pubkey {pubkey}}`);
        process.exit();
    }

    const dataDir = command!.options.get('dataDir');
    const chainCreator = initChainCreator({logger});
    if (command!.command === 'independent') {
        let {err, debuger} = await createValueDebuger(chainCreator, dataDir);
        if (err) {
            process.exit();
        }
        const session = debuger!.createIndependSession();
        const height = parseInt(command!.options.get('height'));
        const accounts = parseInt(command!.options.get('accounts'));
        const coinbase = parseInt(command!.options.get('coinbase'));
        const interval = parseInt(command!.options.get('interval'));
        err = await session.init({height, accounts, coinbase, interval});
        if (err) {
            process.exit();
        }
        const scriptPath = command!.options.get('script');
        await runScript(session, scriptPath);
        process.exit();
    } else if (command!.command === 'chain') {
        const cvdr = await createValueDebuger(chainCreator, dataDir);
        if (cvdr.err) {
            process.exit();
        }
        const sessionDir = command!.options.get('sessionDir');
        const ccsr = await cvdr.debuger!.createChainSession(sessionDir);
        if (ccsr.err) {
            process.exit();
        }
        const scriptPath = command!.options.get('script');
        await runScript(ccsr.session, scriptPath);
        process.exit();
    }   
}

async function runScript(session: any, scriptPath: string): Promise<ErrorCode> {
    try {
        const run = require(path.join(process.cwd() , scriptPath)).run;
        await run(session);
        return ErrorCode.RESULT_OK;
    } catch (e) {
        logger.error(`${scriptPath} run throws exception `, e);
        return ErrorCode.RESULT_EXCEPTION;
    }
   
}

if (require.main === module) {
    main();
}