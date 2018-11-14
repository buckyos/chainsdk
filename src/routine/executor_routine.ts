import * as process from 'process';
import { ErrorCode, initChainCreator, BlockExecutorWorkerRoutine, BlockExecutorWorkerRoutineParams, BlockExecutorWorkerRoutineResult, initLogger } from '../core';
import { init as initUnhandledRejection } from '../client/lib/unhandled_rejection';

async function main() {
    const logger = initLogger({loggerOptions: {console: true, level: 'debug'}});
    initUnhandledRejection(logger);
    const routine = new BlockExecutorWorkerRoutine();
    let creator = initChainCreator({logger});
    let pr = await new Promise<{err: ErrorCode, params?: BlockExecutorWorkerRoutineParams}>((resolve) => {
        let command = process.argv[2];
        if (command) {
            // for debug from command line
            let raw;
            try {
                raw = JSON.parse(command);
            } catch (e) {
                resolve({err: ErrorCode.RESULT_INVALID_PARAM});
            }
            const _pr = BlockExecutorWorkerRoutine.decodeParams(creator, raw);
            resolve(_pr);
        } else {
            process.on('message', async (raw: any) => {
                const _pr = BlockExecutorWorkerRoutine.decodeParams(creator, raw);
                resolve(_pr);
            });    
        }
    });
    let result: BlockExecutorWorkerRoutineResult = Object.create(null);
    do {    
        if (pr.err) {
            result.err = pr.err;
            break;
        }
        result = await routine.run(pr.params!);
    } while (false);
    const rr = BlockExecutorWorkerRoutine.encodeResult(result);
    let message: any;
    if (rr.err) {
        message = rr;
    } else {
        message = rr.message!;
    }
    await new Promise((resolve) => {
        // node 10以上send才有callback参数；send不是同步的，这里需要一个ack；直接加一个timer算求
        process.send!(message);
        setTimeout(() => {
            resolve();
        }, 1000);
    });
    process.exit(0);
}

if (require.main === module) {
    main();
}