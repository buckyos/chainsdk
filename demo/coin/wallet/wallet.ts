import * as readline from 'readline';
import * as process from 'process';
import {ChainClient, BigNumber, ErrorCode, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection, initLogger } from '../../../src/client';

initUnhandledRejection(initLogger({loggerOptions: {console: true}}));

function main() {
    let command = parseCommand(process.argv);
    if (!command) {
        console.error('invalid command');
        process.exit();
        return ;
    }
    let secret = command.options.get('secret');
    if (!secret) {
        console.error('no scret');
        process.exit();
        return ;
    }
    let address = addressFromSecretKey(secret)!;
    let host = command.options.get('host');
    let port = command.options.get('port');
    if (!host || !port) {
        console.error('no host');
        process.exit();
        return ;
    }

    let chainClient = new ChainClient({
        host,
        port,
        logger: initLogger({loggerOptions: {console: true}})
    });

    let watchingTx: string[] = [];
    chainClient.on('tipBlock', async (tipBlock) => {
        for (let tx of watchingTx.slice()) {
            let {err, block, receipt} = await chainClient.getTransactionReceipt({tx});
            if (!err) {
                if (receipt.returnCode !== 0) {
                    console.error(`tx:${tx} failed for ${receipt.returnCode}`);
                    watchingTx.splice(watchingTx.indexOf(tx), 1);
                } else {
                    let confirm = block.number - tipBlock.number + 1;
                    if (confirm < 6) {
                        console.log(`tx:${tx} ${confirm} confirm`);
                    } else {
                        console.log(`tx:${tx} confirmed`);
                        watchingTx.splice(watchingTx.indexOf(tx), 1);
                    }
                }
            }
        }
    });

    let runEnv = {
        getAddress: () => {
            console.log(address);
        }, 
        getBalance: async (_address: string) => {
            if (!_address) {
                _address = address;
            }
            let ret = await chainClient.view({
                method: 'getBalance',
                params: {address: _address}
            });
            if (ret.err) {
                console.error(`get balance failed for ${ret.err};`);
                return ;
            }
            console.log(`${ret.value!}`);
        },
        transferTo: async (to: string, amount: string, fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'transferTo',
            tx.value = new BigNumber(amount);
            tx.fee = new BigNumber(fee);
            tx.input = {to};
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`transferTo failed for ${err}`);
                return ;
            }
            tx.nonce = nonce! + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({tx});
            if (sendRet.err) {
                console.error(`transferTo failed for ${err}`);
                return ;
            }
            watchingTx.push(tx.hash);
            console.log(`send transferTo tx: ${tx.hash}`);
        },
    };

    function runCmd(cmd: string) {
        let chain = runEnv;
        try {
            eval(cmd);
        } catch (e) {
            console.error(e.message);
        }
    }
    
    let c = command.options.get('run');
    if (c) {
        runCmd(c);
    }

    let rl = readline.createInterface(process.stdin, process.stdout);
    rl.on('line', (cmd: string) => {
        runCmd(cmd);
    });
}

main();