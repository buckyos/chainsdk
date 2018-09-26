
import * as process from 'process';
import { LoggerInstance } from 'winston';

export function init(logger: LoggerInstance) {
    process.on('unhandledRejection', (reason, p) => {
        logger.error('Unhandled Rejection at: Promise ', p, ' reason: ', reason.stack);
        process.exit(-1);
    });
    
    process.on('uncaughtException', (err) => {
        logger.error('uncaught exception at: ', err.stack);
        process.exit(-1);
    });    
}
