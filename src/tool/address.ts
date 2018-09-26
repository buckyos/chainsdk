#!/usr/bin/env node
import * as process from 'process';
import {createKeyPair, addressFromSecretKey, publicKeyFromSecretKey, addressFromPublicKey, initUnhandledRejection, parseCommand, initLogger} from '../client';

initUnhandledRejection(initLogger({loggerOptions: {console: true}}));

function main() {
    let command = parseCommand(process.argv);
    if (!command || !command.command) {
        console.log(`Usage: node address.js <create | convert> {--secret {secret} | --pubkey {pubkey}}`);
        process.exit();
    }

    if (command!.command === 'create') {
        let [key, secret] = createKeyPair();
        let addr = addressFromSecretKey(secret);
        console.log(`address:${addr} secret:${secret.toString('hex')}`);
        process.exit();
    } else {
        if (command!.options.has('secret')) {
            let pub = publicKeyFromSecretKey(command!.options.get('secret'));
            let addr = addressFromPublicKey(pub!);
            console.log(`address:${addr}\npubkey:${pub!.toString('hex')}`);
            process.exit();
        } else if (command!.options.has('pubkey')) {
            let addr = addressFromPublicKey(command!.options.get('pubkey'));
            console.log(`address:${addr}`);
            process.exit();
        } else {
            console.log(`Usage: node address.js <create | convert> {--secret {secret} | --pubkey {pubkey}}`);
            process.exit();
        }
    }
}

main();