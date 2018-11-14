import 'mocha';
import * as fs from 'fs-extra';
import {run} from '../../src/tool/host';
process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

let dataDir = './data/dpos/test_signle_genesis';

describe('test on single miner', () => {
    before((done) => {
        async function __before() {
            // create genesis
            fs.removeSync(dataDir);
            let args = ['create', '--package', './dist/blockchain-sdk/demo/dpos/chain', '--externalHandler', '--dataDir', dataDir, '--loggerConsole'];
            run(args);
        }
        __before().then(done);
    });
});