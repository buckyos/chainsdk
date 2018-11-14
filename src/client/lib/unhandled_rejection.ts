
import * as process from 'process';
import { LoggerInstance } from 'winston';

export function init(logger: LoggerInstance) {
    process.on('unhandledRejection', (reason, p) => {
        console.log('Unhandled Rejection at: Promise ', p, ' reason: ', reason.stack);
        logger.error('Unhandled Rejection at: Promise ', p, ' reason: ', reason.stack);
        process.exit(-1);
    });
    
    process.on('uncaughtException', (err) => {
        console.log('uncaught exception at: ', err.stack);
        logger.error('uncaught exception at: ', err.stack);
        process.exit(-1);
    });    
}
