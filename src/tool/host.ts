#!/usr/bin/env node
import * as process from 'process';
import * as path from 'path';
import {initUnhandledRejection, parseCommand, host as chainhost, initLogger} from '../client';

Error.stackTraceLimit = 1000;

export async function run(argv: string[]) {
    let command = parseCommand(argv);
    if (!command) {
        console.error(`parse command error, exit.`);
        process.exit();
        return ;
    }
    if (command.options.has('dataDir')) {
        initUnhandledRejection(initLogger({
            loggerOptions: {console: true, file: {root: path.join(process.cwd(), command.options.get('dataDir')), filename: 'exception.log'}}
        }));
    }
    let exit: boolean = false;
    if (command.command === 'peer') {
        exit = !await chainhost.initPeer(command.options);
    } else if (command.command === 'miner') {
        exit = !await chainhost.initMiner(command.options);
    } else if (command.command === 'create') {
        await chainhost.createGenesis(command.options);
        exit = true;
    } else {
        console.error(`invalid action command ${command.command}`);
        exit = true;
    }
    if (exit) {
        process.exit();
    }
}

if (require.main === module) {
    run(process.argv);
}