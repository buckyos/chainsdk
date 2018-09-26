import * as readline from 'readline';
import * as process from 'process';
import {initLogger, ChainClient, BigNumber, ErrorCode, md5, sign, verify, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection} from '../../../src/client';

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
        console.log(`client onTipBlock, height ${tipBlock.number}`);
        for (let tx of watchingTx.slice()) {
            let {err, block, receipt} = await chainClient.getTransactionReceipt({tx});
            if (!err) {
                if (receipt.returnCode !== 0) {
                    console.error(`tx:${tx} failed for ${receipt.returnCode}`);
                    watchingTx.splice(watchingTx.indexOf(tx), 1);
                } else {
                    let confirm = tipBlock.number - block.number + 1;
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
            console.log(`${_address}\`s Balance: ${ret.value!}`);
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
                console.error(`transferTo failed for ${sendRet.err}`);
                return ;
            }
            console.log(`send transferTo tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },

        register: async (_address: string, fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'register';
            tx.fee = new BigNumber(fee);
            let signstr = sign(Buffer.from(md5(Buffer.from(_address, 'hex')).toString('hex')), secret).toString('hex');
            tx.input = {address: _address, sign: signstr};
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`register failed for ${err}`);
                return ;
            }
            console.log(`=================${nonce}`);
            tx.nonce = nonce! + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({tx});
            if (sendRet.err) {
                console.error(`register failed for ${sendRet.err}`);
                return ;
            }
            console.log(`send register tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },

        unregister: async (_address: string, fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'unregister';
            tx.fee = new BigNumber(fee);
            let signstr = sign(Buffer.from(md5(Buffer.from(_address, 'hex')).toString('hex')), secret).toString('hex');
            tx.input = {address: _address, sign: signstr};
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`unregister failed for ${err}`);
                return ;
            }
            tx.nonce = nonce! + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({tx});
            if (sendRet.err) {
                console.error(`unregister failed for ${sendRet.err}`);
                return ;
            }
            console.log(`send unregister tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },

        getMiners: async () => {
            let ret = await chainClient.view({
                method: 'getMiners',
                params: {}
            });
            if (ret.err) {
                console.error(`getMiners failed for ${ret.err};`);
                return ;
            }
            console.log(`${JSON.stringify(ret.value!)}`);
        },

        isMiner: async (_address: string) => {
            let ret = await chainClient.view({
                method: 'isMiner',
                params: {address: _address}
            });
            if (ret.err) {
                console.error(`isMiner failed for ${ret.err};`);
                return ;
            }
            console.log(`${ret.value!}`);
        },
    };

    function runCmd(_cmd: string) {
        let chain = runEnv;
        try {
            eval(_cmd);
        } catch (e) {
            console.error('e=' + e.message);
        }
    }
    
    let cmd = command.options.get('run');
    if (cmd) {
        runCmd(cmd);
    }

    let rl = readline.createInterface(process.stdin, process.stdout);
    rl.on('line', (_cmd: string) => {
        runCmd(_cmd);
    });
}

main();