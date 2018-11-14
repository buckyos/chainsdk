import * as readline from 'readline';
import * as process from 'process';
import {ChainClient, BigNumber, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection, initLogger, MapFromObject} from '../../../src/client';

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
                console.error(`transferTo getNonce failed for ${err}`);
                return ;
            }
            console.log(`transferTo chain nonce=${nonce}`);
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

        vote: async (candidates: string[], fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'vote';
            tx.fee = new BigNumber(fee);
            tx.input = candidates;
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`vote failed for ${err}`);
                return ;
            }
            tx.nonce = nonce! + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({tx});
            if (sendRet.err) {
                console.error(`vote failed for ${sendRet.err}`);
                return ;
            }
            console.log(`send vote tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },

        mortgage: async (amount: string, fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'mortgage';
            tx.fee = new BigNumber(fee);
            tx.value = new BigNumber(amount);
            tx.input = amount;
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`mortgage failed for ${err}`);
                return ;
            }
            tx.nonce = nonce! + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({tx});
            if (sendRet.err) {
                console.error(`mortgage failed for ${sendRet.err}`);
                return ;
            }
            console.log(`send mortgage tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },

        unmortgage: async (amount: string, fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'unmortgage';
            tx.fee = new BigNumber(fee);
            tx.input = amount;
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`unmortgage failed for ${err}`);
                return ;
            }
            tx.nonce = nonce! + 1;
            tx.sign(secret);
            let sendRet = await chainClient.sendTransaction({tx});
            if (sendRet.err) {
                console.error(`unmortgage failed for ${sendRet.err}`);
                return ;
            }
            console.log(`send unmortgage tx: ${tx.hash}`);
            watchingTx.push(tx.hash);
        },

        register: async (fee: string) => {
            let tx = new ValueTransaction();
            tx.method = 'register';
            tx.fee = new BigNumber(fee);
            tx.input = '';
            let {err, nonce} = await chainClient.getNonce({address});
            if (err) {
                console.error(`register failed for ${err}`);
                return ;
            }
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

        getVote: async () => {
            let ret = await chainClient.view({
                method: 'getVote',
                params: {}
            });
            if (ret.err) {
                console.error(`getVote failed for ${ret.err};`);
                return ;
            }
            let vote: Map<string, BigNumber> = MapFromObject(ret.value!);
            for (let [k, v] of vote) {
                console.log(`${k}:${v.toString()}`);
            }
        },

        getStake: async (_address: string) => {
            let ret = await chainClient.view({
                method: 'getStake',
                params: {address: _address}
            });
            if (ret.err) {
                console.error(`getStake failed for ${ret.err};`);
                return ;
            }
            console.log(`${ret.value!}`);
        },

        getCandidates: async () => {
            let ret = await chainClient.view({
                method: 'getCandidates',
                params: {}
            });
            if (ret.err) {
                console.error(`getCandidates failed for ${ret.err};`);
                return ;
            }
            console.log(`${ret.value!}`);
        },

        getPeers: async () => {
            let ret = await chainClient.getPeers();
            console.log(`get ${ret.length} peers:`);
            ret.forEach((value) => {
                console.log(value);
            });
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